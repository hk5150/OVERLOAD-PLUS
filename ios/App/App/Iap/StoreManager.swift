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

    private init() {}

    // アプリ起動時、プラグインのload()から一度だけ呼ぶ。Transaction.updatesは
    // 購入完了・返金・Family Sharingでの権利付与などをバックグラウンドで拾い続ける
    // リスナーなので、アプリ生存中は常時稼働させておく必要がある。
    func startTransactionListener() {
        updatesTask?.cancel()
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await self?.addPurchased(transaction.productID)
                await transaction.finish()
            }
        }
    }

    private func addPurchased(_ productID: String) {
        purchasedProductIDs.insert(productID)
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

    func purchase(_ product: Product) async throws -> Bool {
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            guard case .verified(let transaction) = verification else {
                throw StoreError.unverifiedTransaction
            }
            purchasedProductIDs.insert(transaction.productID)
            await transaction.finish()
            return true
        case .userCancelled:
            return false
        case .pending:
            // 保護者の承認待ち等。Transaction.updatesが後から拾うので、
            // ここでは「まだ完了していない」as falseを返すだけでよい。
            return false
        @unknown default:
            return false
        }
    }

    // 「購入を復元」ボタン専用。AppStore.sync()を呼んでよいのはここだけ。
    func restore() async throws {
        try await AppStore.sync()
        await refreshEntitlements()
    }

    func isPurchased(_ productID: String) -> Bool {
        purchasedProductIDs.contains(productID)
    }
}

enum StoreError: Error {
    case unverifiedTransaction
}
