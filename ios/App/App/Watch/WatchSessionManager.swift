import Foundation
import WatchConnectivity

// iPhone 側の WatchConnectivity。Capacitor に依存しない(WatchPlugin はこれを JS に橋渡しするだけ)。
//
// Watch から届いた op はここで UserDefaults のキューに積む。JS(WebView)は iPhone のアプリが
// 裏にいる間は止まっているので、op を受け取った瞬間に JS へ渡すことはできない。
// JS は動けるようになった時点で pendingOps() で読み、下書きに保存できてから ackOps() で消す。
// 設計は docs/Watchアプリ.md。
final class WatchSessionManager: NSObject {
    static let shared = WatchSessionManager()

    private let queueKey = "watch.ops.v1"
    private let lock = NSLock()
    private var lastSnapshot: String?
    private var unsentSnapshot: String?

    // op が届いたとき(JS に知らせる)。WatchPlugin.load() が設定する。
    // 書くのはメインスレッド、読むのは WCSession のキューなので lock の内側で扱う
    private var _onOpsReceived: (() -> Void)?
    var onOpsReceived: (() -> Void)? {
        get { lock.lock(); defer { lock.unlock() }; return _onOpsReceived }
        set { lock.lock(); _onOpsReceived = newValue; lock.unlock() }
    }

    // WCSession の受信は delegate が設定されていないと取りこぼすので、WebView の準備を待たず
    // AppDelegate の起動直後に呼ぶ(Watch からの転送でアプリが裏で起こされた場合も含めて)。
    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - iPhone → Watch

    func updateSnapshot(_ json: String) {
        lock.lock(); defer { lock.unlock() }
        guard json != lastSnapshot else { return }
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            unsentSnapshot = json
            return
        }
        send(json)
    }

    // lock を取った状態で呼ぶ
    private func send(_ json: String) {
        let session = WCSession.default
        guard session.isPaired, session.isWatchAppInstalled else {
            // Watch アプリが後から入ったときのために、最新だけは覚えておく
            unsentSnapshot = json
            return
        }
        do {
            try session.updateApplicationContext(["snapshot": json])
            lastSnapshot = json
            unsentSnapshot = nil
        } catch {
            unsentSnapshot = json
        }
    }

    private func flushUnsent() {
        lock.lock(); defer { lock.unlock() }
        if let json = unsentSnapshot { send(json) }
    }

    // MARK: - Watch → iPhone(op のキュー)

    func pendingOps() -> [String] {
        lock.lock(); defer { lock.unlock() }
        return UserDefaults.standard.stringArray(forKey: queueKey) ?? []
    }

    func ackOps(_ opIds: Set<String>) {
        lock.lock(); defer { lock.unlock() }
        let rest = (UserDefaults.standard.stringArray(forKey: queueKey) ?? []).filter { json in
            guard let id = Self.opId(of: json) else { return false } // 読めない行は残しても意味がない
            return !opIds.contains(id)
        }
        UserDefaults.standard.set(rest, forKey: queueKey)
    }

    private func enqueue(_ json: String, opId: String) {
        lock.lock()
        var queue = UserDefaults.standard.stringArray(forKey: queueKey) ?? []
        // Watch はセッションの再有効化時に未確認の op を送り直すので、同じ op が2回届くことがある
        let isNew = !queue.contains { Self.opId(of: $0) == opId }
        if isNew {
            queue.append(json)
            UserDefaults.standard.set(queue, forKey: queueKey)
        }
        let notify = isNew ? _onOpsReceived : nil // lock の内側なので getter(lock を取る)は使わない
        lock.unlock()
        notify?()
    }

    private static func opId(of json: String) -> String? {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["opId"] as? String
    }
}

extension WatchSessionManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { flushUnsent() }
    }

    // Watch アプリがインストールされた・ペアが変わったなど
    func sessionWatchStateDidChange(_ session: WCSession) {
        flushUnsent()
    }

    // Watch は届く状態なら sendMessage、届かなければ transferUserInfo で送ってくる(同じ中身)
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        receiveOp(userInfo)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        receiveOp(message)
    }

    private func receiveOp(_ payload: [String: Any]) {
        guard let json = payload["op"] as? String, let opId = payload["opId"] as? String else { return }
        enqueue(json, opId: opId)
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    // Watch を付け替えたときは、新しい Watch 向けに有効化し直す(Apple の定型)
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}
