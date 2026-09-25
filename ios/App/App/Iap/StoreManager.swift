import StoreKit

// StoreKit 2そのものを扱う純粋なロジック層。CAPPluginに依存しない
// (Capacitorのブリッジ層はIapPlugin.swift側に分離してある)。
//
// 設計判断の詳細はdocs/IAP実装方針.mdを参照。ここでは要点だけ:
// - 起動時はTransaction.currentEntitlementsのみを見る。AppStore.sync()は
//   restore()(ユーザーが「購入を復元」を押したとき)専用。起動時に自動でsyncを
//   呼ぶとApple IDパスワード確認が入りUXを損なうため
// - .verified/.unverifiedの判定は必ず行う。.unverifiedは改ざんの疑いがある
//   トランザクションなので、権利があるとはみなさない
@MainActor
final class StoreManager {
    static let shared = StoreManager()

    private(set) var purchasedProductIDs: Set<String> = []
    private var updatesTask: Task<Void, Never>?

    // Transaction.updatesで権利が変わったときに呼ぶ(IapPluginがJSへの通知に使う)。
    // 保護者の承認(Ask to Buy)や返金は、アプリを開いたままこの経路で届く。
    var onEntitlementsChanged: ((Set<String>) -> Void)?

    private init() {}

    // アプリ起動時、プラグインのload()から一度だけ呼ぶ。Transaction.updatesは
    // 購入完了・返金・Family Sharingでの権利付与などをバックグラウンドで拾い続ける
    // リスナーなので、アプリ生存中は常時稼働させておく必要がある。
    func startTransactionListener() {
        updatesTask?.cancel()
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                await self?.entitlementsDidChange()
            }
        }
    }

    // updatesのトランザクション1件から商品IDを出し入れせず、currentEntitlementsから
    // 全体を作り直す。返金・取り消しもupdatesに流れてくるが、1件だけ見て外すと、
    // 同じ商品の別の有効な権利(自分の購入とファミリー共有の両方がある場合など)まで
    // 打ち消してしまう。currentEntitlementsは取り消し済みを含まない。
    private func entitlementsDidChange() async {
        await refreshEntitlements()
        onEntitlementsChanged?(purchasedProductIDs)
    }

    // 起動時の権利再確認。AppStore.sync()は呼ばない。
    func refreshEntitlements() async {
        var ids: Set<String> = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                ids.insert(transaction.productID)
            }
        }
        purchasedProductIDs = ids
    }

    func fetchProducts(_ ids: [String]) async throws -> [Product] {
        try await Product.products(for: ids)
    }

    enum PurchaseOutcome: String {
        case purchased, cancelled, pending
    }

    func purchase(_ product: Product) async throws -> PurchaseOutcome {
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            guard case .verified(let transaction) = verification else {
                throw StoreError.unverifiedTransaction
            }
            purchasedProductIDs.insert(transaction.productID)
            await transaction.finish()
            return .purchased
        case .userCancelled:
            return .cancelled
        case .pending:
            // 保護者の承認待ち(Ask to Buy)や決済の追加認証待ち。完了するとTransaction.updatesに届き、
            // entitlementsDidChange → onEntitlementsChanged でJSへ通知される。
            return .pending
        @unknown default:
            return .cancelled
        }
    }

    // 「購入を復元」ボタン専用。AppStore.sync()を呼んでよいのはここだけ。
    //
    // sync()が失敗しても、端末の購入記録(currentEntitlements)に権利があれば復元は成功として扱う。
    // TestFlight(sandbox)で、再インストール後に権利は起動時に戻っているのにsync()だけがエラーを返し、
    // 「フル解除済み」と「復元できませんでした」が同時に出た(2026-09-25、実機)。審査も同じsandboxで
    // 行われるので、復元ボタンがエラーを出すとGuideline 3.1.1で差し戻されかねない。
    // 権利が無いときだけ元のエラーを投げる(キャンセルの判定はIapPlugin側)。
    func restore() async throws {
        do {
            try await AppStore.sync()
        } catch {
            await refreshEntitlements()
            guard purchasedProductIDs.isEmpty else { return }
            throw error
        }
        await refreshEntitlements()
    }

    func isPurchased(_ productID: String) -> Bool {
        purchasedProductIDs.contains(productID)
    }
}

enum StoreError: Error {
    case unverifiedTransaction
}
