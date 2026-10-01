import UIKit
import Capacitor

// 画面(ウィンドウ・BridgeViewController)は SceneDelegate.swift が作る。ここには window を持たない。
// scene 化後、UIKit は applicationDidBecomeActive 等のライフサイクルを AppDelegate に呼ばない
// (前面復帰の処理を足したくなったら SceneDelegate の sceneDidBecomeActive 側に。JS 側は visibilitychange で足りている)。
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Watch からの op を取りこぼさないよう、WebView を待たずに受信を始める(docs/Watchアプリ.md)
        WatchSessionManager.shared.activate()
        return true
    }

    // UIScene のライフサイクル(Info.plist の UIApplicationSceneManifest と対。"Default Configuration" はそちらの
    // UISceneConfigurationName と同じ文字列にしておく)。画面は SceneDelegate が作る。
    // iOS 27 SDK でビルドしたアプリは、これが無いと iOS 27 の端末で起動時に止められる。
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // URL と NSUserActivity は scene 化後は SceneDelegate 側に届き、以下は UIKit から呼ばれない。
    // Capacitor 標準のテンプレートの形を保つために残している(このアプリは URL スキームも Universal Links も使っていない)。
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
