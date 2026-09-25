import Capacitor

// WatchSessionManager を JS 側(window.Capacitor.Plugins.Watch)に橋渡しするだけの薄い層。
// IapPlugin と同じく自動登録されないので、BridgeViewController.capacitorDidLoad() で登録している。
// JS 側は src/domain/watch.js。
@objc(WatchPlugin)
public class WatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchPlugin"
    public let jsName = "Watch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingOps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackOps", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        // retainUntilConsumed: JS がリスナーを付ける前に届いた op の知らせも落とさない
        WatchSessionManager.shared.onOpsReceived = { [weak self] in
            self?.notifyListeners("opsReceived", data: [:], retainUntilConsumed: true)
        }
    }

    // { snapshot: JSON文字列 }
    @objc func updateSnapshot(_ call: CAPPluginCall) {
        guard let json = call.getString("snapshot") else {
            call.reject("snapshot required")
            return
        }
        WatchSessionManager.shared.updateSnapshot(json)
        call.resolve()
    }

    // → { ops: [JSON文字列] }。キューからは消さない
    @objc func pendingOps(_ call: CAPPluginCall) {
        call.resolve(["ops": WatchSessionManager.shared.pendingOps()])
    }

    // { opIds: [String] }
    @objc func ackOps(_ call: CAPPluginCall) {
        let ids = (call.getArray("opIds", String.self) ?? [])
        WatchSessionManager.shared.ackOps(Set(ids))
        call.resolve()
    }
}
