import Capacitor

// RestTimerManager(休憩タイマーのネイティブ処理)をJS側(window.Capacitor.Plugins.RestTimer)に
// 橋渡しするだけの薄い層。IapPluginと同じく、アプリターゲットに直接追加したプラグインは
// 自動登録されないので、BridgeViewController.capacitorDidLoad()で明示的に登録している。
// JS側は src/domain/restNotifications.js。
@objc(RestTimerPlugin)
public class RestTimerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestTimerPlugin"
    public let jsName = "RestTimer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scheduleNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncActivity", returnType: CAPPluginReturnPromise),
    ]

    // notifications: [{ id: "4201", title, body, threadIdentifier, at: エポックミリ秒 }]
    @objc func scheduleNotifications(_ call: CAPPluginCall) {
        guard let raw = call.getArray("notifications", JSObject.self) else {
            call.reject("notifications required")
            return
        }
        let items: [RestTimerManager.RestNotification] = raw.compactMap { o in
            guard let id = o["id"] as? String,
                  let title = o["title"] as? String,
                  let body = o["body"] as? String,
                  let at = (o["at"] as? NSNumber)?.doubleValue else { return nil }
            return .init(id: id, title: title, body: body,
                         threadIdentifier: o["threadIdentifier"] as? String,
                         at: Date(timeIntervalSince1970: at / 1000))
        }
        // 1件でも読めなければ失敗にする。黙って成功を返すと、JS側がLocalNotificationsへ
        // 切り戻さず、休憩の通知が1件も届かないのにエラーも出ない状態になる。
        guard items.count == raw.count else {
            call.reject("invalid notification payload")
            return
        }
        Task { @MainActor in
            do {
                try await RestTimerManager.shared.schedule(items)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // { startedAt: エポックミリ秒 | null, staleAt: エポックミリ秒, title }。startedAtがnullなら終了。
    // iOS 16.2未満では何もしない(supported: false)。
    @objc func syncActivity(_ call: CAPPluginCall) {
        let startedAt = call.getDouble("startedAt").map { Date(timeIntervalSince1970: $0 / 1000) }
        let staleAt = call.getDouble("staleAt").map { Date(timeIntervalSince1970: $0 / 1000) }
        let title = call.getString("title") ?? ""
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        Task { @MainActor in
            await RestTimerManager.shared.syncActivity(startedAt: startedAt, staleAt: staleAt, title: title)
            call.resolve(["supported": true])
        }
    }
}
