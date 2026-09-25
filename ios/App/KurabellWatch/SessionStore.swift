import Foundation
import SwiftUI
import UserNotifications
import WatchConnectivity

// Watch 側の状態のすべて。
// - base: iPhone から最後に届いたスナップショット(iPhone が正)
// - pending: Watch で入力して、まだ iPhone で合流が確認されていない op
// 画面に出すのは base に pending を重ねたもの。iPhone の JS が寝ていても入力を続けられるように、
// op は送った瞬間から楽観的に反映し、iPhone が適用済み(snapshot.applied)と返したものから外す。
@MainActor
final class SessionStore: NSObject, ObservableObject {
    static let shared = SessionStore()

    @Published private(set) var base: WatchSnapshot?
    @Published private(set) var pending: [WatchOp] = []

    private let defaults = UserDefaults.standard
    private let baseKey = "watch.snapshot.v1"
    private let pendingKey = "watch.pending.v1"
    // Watch で始めた休憩の通知ID。iPhone で始めた休憩は iPhone の通知(Watch に転送される)に任せる
    private static let restNotifyMinutes = [1, 2, 3]
    private static let restNotifyPrefix = "kurabell-watch-rest-"
    private let ownRestKey = "watch.ownRest.v1"
    // Watch で始めた休憩の開始時刻(ms)。iPhone 側で別の休憩が始まったら、こちらの通知を取り消す
    private var ownRestStartAt: Double? {
        get { defaults.object(forKey: ownRestKey) as? Double }
        set { defaults.set(newValue, forKey: ownRestKey) }
    }

    var snapshot: WatchSnapshot? {
        guard var s = base else { return nil }
        for op in pending { Self.apply(op, to: &s) }
        return s
    }

    override init() {
        super.init()
        if ProcessInfo.processInfo.arguments.contains("-KurabellSample") {
            base = SampleData.snapshot(now: Date())
            return
        }
        if let data = defaults.data(forKey: baseKey) {
            base = try? JSONDecoder().decode(WatchSnapshot.self, from: data)
        }
        if let data = defaults.data(forKey: pendingKey) {
            pending = (try? JSONDecoder().decode([WatchOp].self, from: data)) ?? []
        }
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
        UNUserNotificationCenter.current().delegate = self
    }

    // MARK: - 入力

    // セットを確定する。RIR が入り、種目が restAfter なら休憩を始める(始めたら true)。
    @discardableResult
    func commit(exId: String, setIndex: Int, weight: String, reps: String, rir: Int?) -> Bool {
        guard let ex = snapshot?.exercises.first(where: { $0.id == exId }) else { return false }
        let now = Date().timeIntervalSince1970 * 1000
        let startsRest = rir != nil && ex.restAfter
        let op = WatchOp(opId: UUID().uuidString, kind: "set", exId: exId, setIndex: setIndex,
                         weight: weight, reps: reps, rir: rir,
                         restStartAt: startsRest ? now : nil, at: now)
        pending.append(op)
        save()
        send(op)
        if startsRest {
            ownRestStartAt = now
            scheduleRestNotifications(from: Date(timeIntervalSince1970: now / 1000))
        }
        return startsRest
    }

    // 直前のセットを複製して1行足す(RIR は空 = 未実施)
    func addSet(exId: String) {
        guard let ex = snapshot?.exercises.first(where: { $0.id == exId }) else { return }
        let last = ex.sets.last { !$0.warmup } ?? ex.sets.last
        let now = Date().timeIntervalSince1970 * 1000
        let op = WatchOp(opId: UUID().uuidString, kind: "add", exId: exId, setIndex: ex.sets.count,
                         weight: last?.weight ?? "", reps: last?.reps ?? "", rir: nil,
                         restStartAt: nil, at: now)
        pending.append(op)
        save()
        send(op)
    }

    // MARK: - 合流(iPhone の applyWatchOps と同じ規則。表示のためだけに使う)

    static func apply(_ op: WatchOp, to s: inout WatchSnapshot) {
        guard let i = s.exercises.firstIndex(where: { $0.id == op.exId }) else { return }
        var sets = s.exercises[i].sets
        if op.setIndex == sets.count {
            sets.append(.init(weight: op.weight, reps: op.reps, rir: op.rir, warmup: false, prev: nil))
        } else if op.setIndex < sets.count, op.kind != "add" {
            sets[op.setIndex].weight = op.weight
            sets[op.setIndex].reps = op.reps
            sets[op.setIndex].rir = op.rir
        } else {
            return
        }
        s.exercises[i].sets = sets
        if let r = op.restStartAt, r > (s.restStartAt ?? 0) { s.restStartAt = r }
        if s.state != .active { s.state = .active }
    }

    // MARK: - 受信

    fileprivate func receive(_ snap: WatchSnapshot) {
        // 古いスナップショットが後から届いても巻き戻さない
        if let cur = base, cur.sentAt > snap.sentAt { return }
        base = snap
        let applied = Set(snap.applied ?? [])
        pending.removeAll { applied.contains($0.opId) }
        // iPhone が記録を終えた(保存・破棄)なら、宙に浮いた op は捨てる
        if snap.state != .active { pending.removeAll() }
        save()
        // Watch で始めた休憩が iPhone で確認された後に、iPhone 側で止まった・別の休憩が始まったら、
        // Watch の通知を取り消す(確認前の古いスナップショットでは判断しない)
        if let own = ownRestStartAt, !pending.contains(where: { $0.restStartAt == own }) {
            if snap.restStartAt == nil || snap.restStartAt! > own {
                cancelRestNotifications()
                ownRestStartAt = nil
            }
        }
    }

    #if DEBUG
    // シミュレータ検証用(Watch をタップできない環境向け): 起動引数 -KurabellDebugCommit <RIR> で、
    // スナップショットを受け取った直後に「最初の未実施セットを今の値のまま RIR で確定」を1回だけ行う。
    private var debugCommitDone = false
    fileprivate func debugCommitIfRequested() {
        let args = ProcessInfo.processInfo.arguments
        guard !debugCommitDone, let i = args.firstIndex(of: "-KurabellDebugCommit"), i + 1 < args.count,
              let rir = Int(args[i + 1]), let snap = snapshot, snap.state == .active else { return }
        for ex in snap.exercises {
            if let idx = ex.sets.firstIndex(where: { !$0.warmup && $0.rir == nil }) {
                debugCommitDone = true
                let s = ex.sets[idx]
                commit(exId: ex.id, setIndex: idx, weight: s.weight, reps: s.reps, rir: rir)
                return
            }
        }
    }
    #endif

    private func save() {
        if let data = try? JSONEncoder().encode(base) { defaults.set(data, forKey: baseKey) }
        if let data = try? JSONEncoder().encode(pending) { defaults.set(data, forKey: pendingKey) }
    }

    private func send(_ op: WatchOp) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated,
              let data = try? JSONEncoder().encode(op),
              let json = String(data: data, encoding: .utf8) else { return }
        let payload: [String: Any] = ["op": json, "opId": op.opId]
        let session = WCSession.default
        // iPhone に届く状態なら sendMessage(すぐ届き、裏で寝ている iPhone のアプリも起こす)。
        // 届かない・失敗したら transferUserInfo(FIFO で、届くまでシステムが保持する)。
        // 両方で届いても iPhone 側が opId で弾く。
        guard session.isReachable else {
            session.transferUserInfo(payload)
            return
        }
        session.sendMessage(payload, replyHandler: nil) { _ in
            WCSession.default.transferUserInfo(payload)
        }
    }

    // 未確認の op を送り直す。セッションの有効化時と、iPhone に届くようになったとき。
    // 届く状態なら、転送待ち(transferUserInfo)のものも sendMessage で先に届ける。
    // 重複して届いても iPhone 側(ネイティブのキューと JS の watchApplied)が opId で弾く。
    fileprivate func resendPending() {
        let session = WCSession.default
        let outstanding = Set(session.outstandingUserInfoTransfers.compactMap { $0.userInfo["opId"] as? String })
        for op in pending where session.isReachable || !outstanding.contains(op.opId) { send(op) }
    }

    // MARK: - 休憩の通知(Watch で始めた休憩だけ)

    private func scheduleRestNotifications(from start: Date) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            Task { @MainActor in
                self.cancelRestNotifications()
                // 文言は iPhone のアプリ内言語設定に従わせるため、スナップショットのラベルを優先する
                let labels = self.snapshot?.labels
                for m in Self.restNotifyMinutes {
                    let fire = start.addingTimeInterval(Double(m) * 60)
                    let interval = fire.timeIntervalSinceNow
                    guard interval > 0 else { continue }
                    let content = UNMutableNotificationContent()
                    content.title = labels?.rest ?? "Rest"
                    content.body = labels?.restBody.replacingOccurrences(of: "{n}", with: String(m))
                        ?? String(format: NSLocalizedString("rest.elapsed", comment: ""), m)
                    content.sound = .default
                    content.interruptionLevel = .timeSensitive
                    let req = UNNotificationRequest(
                        identifier: Self.restNotifyPrefix + String(m), content: content,
                        trigger: UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false))
                    try? await UNUserNotificationCenter.current().add(req)
                }
            }
        }
    }

    private func cancelRestNotifications() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: Self.restNotifyMinutes.map { Self.restNotifyPrefix + String($0) })
    }
}

extension SessionStore: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext
        Task { @MainActor in
            if let snap = Self.decode(context) { self.receive(snap) }
            if state == .activated { self.resendPending() }
            #if DEBUG
            self.debugCommitIfRequested()
            #endif
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        Task { @MainActor in self.resendPending() }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        Task { @MainActor in
            if let snap = Self.decode(context) { self.receive(snap) }
            #if DEBUG
            self.debugCommitIfRequested()
            #endif
        }
    }

    nonisolated static func decode(_ context: [String: Any]) -> WatchSnapshot? {
        guard let json = context["snapshot"] as? String, let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(WatchSnapshot.self, from: data)
    }
}

extension SessionStore: UNUserNotificationCenterDelegate {
    // Watch アプリを開いているときも、バナーと触覚で知らせる
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
