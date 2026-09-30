import Capacitor
import StoreKit
import UIKit

// App Storeの評価ダイアログ(星をつけるシート)を依頼する。出すかどうかはiOSが決める
// (1年に3回まで、TestFlightでは出ない)ので、ここでは依頼するだけで結果は返さない。
// いつ依頼するかはJS側(src/domain/review.js の shouldRequestReview)で決める。
// RestTimerPluginと同じく、BridgeViewController.capacitorDidLoad()で明示的に登録している。
@objc(ReviewPlugin)
public class ReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReviewPlugin"
    public let jsName = "Review"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
    ]

    @objc func request(_ call: CAPPluginCall) {
        #if !DEBUG
        // TestFlightではiOSがシートを出さない。ここで成功を返すとJSが依頼日時を保存し、同じ端末をApp Store版に
        // 上書きしたとき(Preferencesは引き継がれる)から120日間、一度も依頼されなくなる。
        // 開発ビルドは毎回シートが出るので、動作確認のために通す。
        if Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt" {
            call.reject("testflight")
            return
        }
        #endif
        DispatchQueue.main.async { [weak self] in
            // デプロイ対象がiOS 15なので AppStore.requestReview(iOS 16+)ではなくこちらを使う
            guard let scene = self?.bridge?.viewController?.view.window?.windowScene else {
                call.reject("no window scene")
                return
            }
            SKStoreReviewController.requestReview(in: scene)
            call.resolve()
        }
    }
}
