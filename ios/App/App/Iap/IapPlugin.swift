import Capacitor
import StoreKit

// StoreManager(StoreKit 2ロジック本体)をJS側(window.Capacitor.Plugins.Iap)に
// 橋渡しするだけの薄い層。CAPBridgedPluginプロトコル(identifier/jsName/pluginMethods)
// を実装するだけでは、このファイルのようにアプリターゲットへ直接ソース追加した
// プラグインは自動登録されなかった(npm/CocoaPods経由のプラグインとは登録経路が異なる)。
// BridgeViewController.swiftのcapacitorDidLoad()でregisterPluginInstance()を
// 明示的に呼んで登録している。詳細はdocs/IAP実装方針.mdを参照。
//
// Xcodeプロジェクトへの追加(Compile Sources / StoreKit.frameworkのリンク)は
// npm run ios:sync / cap syncでは行われない。xcodeproj gem経由で完了済み
// (詳細はdocs/IAP実装方針.md)。
@objc(IapPlugin)
public class IapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IapPlugin"
    public let jsName = "Iap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPurchased", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshEntitlements", returnType: CAPPluginReturnPromise),
    ]

    // Transaction.updatesリスナーはアプリ生存中ずっと稼働させておく必要があるため、
    // プラグインのロード時に一度だけ起動する。
    public override func load() {
        Task { @MainActor in
            StoreManager.shared.startTransactionListener()
        }
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self) else {
            call.reject("productIds required")
            return
        }
        Task { @MainActor in
            do {
                let products = try await StoreManager.shared.fetchProducts(ids)
                call.resolve(["products": products.map {
                    ["id": $0.id, "displayName": $0.displayName,
                     "displayPrice": $0.displayPrice, "description": $0.description]
                }])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("productId") else {
            call.reject("productId required")
            return
        }
        Task { @MainActor in
            do {
                let products = try await StoreManager.shared.fetchProducts([id])
                guard let product = products.first else {
                    call.reject("product not found")
                    return
                }
                let purchased = try await StoreManager.shared.purchase(product)
                call.resolve(["purchased": purchased])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // AppStore.sync()を呼ぶのはこの経路(ユーザーがボタンを押したとき)のみ。
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                try await StoreManager.shared.restore()
                call.resolve(["purchasedProductIds": Array(StoreManager.shared.purchasedProductIDs)])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func isPurchased(_ call: CAPPluginCall) {
        guard let id = call.getString("productId") else {
            call.reject("productId required")
            return
        }
        Task { @MainActor in
            call.resolve(["purchased": StoreManager.shared.isPurchased(id)])
        }
    }

    // 起動時の権利再確認用。AppStore.sync()は呼ばない
    // (Transaction.currentEntitlementsのみ、StoreManager.refreshEntitlements()参照)。
    @objc func refreshEntitlements(_ call: CAPPluginCall) {
        Task { @MainActor in
            await StoreManager.shared.refreshEntitlements()
            call.resolve(["purchasedProductIds": Array(StoreManager.shared.purchasedProductIDs)])
        }
    }
}
