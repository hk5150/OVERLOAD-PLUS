import UIKit
import Capacitor

// UIScene のライフサイクル。iOS 27 SDK(Xcode 27)でビルドしたアプリは、これと Info.plist の
// UIApplicationSceneManifest が無いと、iOS 27 の端末で起動時に UIKit に止められる
// (1.1.1 (11) の実機で踏んだ: EXC_BREAKPOINT in
//  ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke)。
// Capacitor 8.5 の手順(capacitorjs.com/docs/updating/8-5)を 6 系に合わせたもの。
// 6 系には SceneDelegateProxy が無いので、URL と NSUserActivity は ApplicationDelegateProxy に渡す。
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        // Main.storyboard は使わない。プラグインの登録は BridgeViewController.capacitorDidLoad() で行う
        window.rootViewController = BridgeViewController()
        window.makeKeyAndVisible()
        self.window = window
        // 起動時に URL や NSUserActivity で開かれた場合も、ここでしか受け取れない
        for context in connectionOptions.urlContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
        for activity in connectionOptions.userActivities {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
