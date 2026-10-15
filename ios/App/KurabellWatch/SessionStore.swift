import Foundation
import HealthKit
import SwiftUI
import UserNotifications
import WatchConnectivity
import WatchKit

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
    // 完了画面(改善要望 12)。出している間だけ値が入る。閉じたら id を覚えて、同じ記録では二度と出さない
    @Published var showingFinished: WatchSnapshot.Finished?
    // この Watch がワークアウトを記録していたときの心拍の平均と消費カロリー(WorkoutManager.finish が入れる)
    @Published var workoutStats: WorkoutStats?
    struct WorkoutStats: Equatable {
        var recordStartAt: Double
        var avgHeartRate: Double?
        var kcal: Double?
    }
    private let finishedShownKey = "watch.finishedShown.v1"
    // 保存から時間がたったものは出さない(何日も後に Watch のアプリを開いて「お疲れ様でした」は変なので)
    private static let finishedMaxAge: Double = 12 * 3600 * 1000

    private let defaults = UserDefaults.standard
    private let baseKey = "watch.snapshot.v1"
    private let pendingKey = "watch.pending.v1"
    // Watch が予約する休憩の通知。Watch で始めた休憩と、Watch がワークアウトを記録している間の iPhone の休憩(改善要望 4b)。
    // それ以外の iPhone の休憩は iPhone の通知(Watch に転送される)に任せる。
    // 経過分は iPhone の設定(スナップショットの restNotices)。取り消しは選べる時間のすべてで行う
    private static let restNotifyChoices: [Double] = [1, 1.5, 2, 2.5, 3, 4, 5]
    private static let restNotifyPrefix = "kurabell-watch-rest-"
    // いま iPhone の休憩のために予約してある通知の中身(開始時刻と経過分・本文)。同じ内容で予約し直さないため。
    // 休憩中に iPhone で通知を切った・時間や言語を変えたときは中身が変わるので予約し直す(reviewer 指摘)
    private var scheduledRestStartAt: Double?
    private var scheduledRestKey: String?
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
            // スクリーンショット用: -KurabellFinished 1 で完了画面を出した状態から始める
            if SampleData.launchValue("-KurabellFinished") != nil {
                let f = SampleData.finished(now: Date())
                showingFinished = f
                workoutStats = .init(recordStartAt: f.id, avgHeartRate: 118, kcal: 286)
            }
            return
        }
        if let data = defaults.data(forKey: baseKey) {
            base = try? JSONDecoder().decode(WatchSnapshot.self, from: data)
        }
        if let data = defaults.data(forKey: pendingKey) {
            pending = (try? JSONDecoder().decode([WatchOp].self, from: data)) ?? []
        }
        // アプリが開いていない間に保存の知らせが届いていたら、開いたときに一度だけ出す
        presentFinishedIfNeeded()
    }

    // MARK: - 完了画面

    private func presentFinishedIfNeeded() {
        guard showingFinished == nil, let f = base?.finished else { return }
        let shown = defaults.object(forKey: finishedShownKey) as? Double
        guard f.id != shown, Date().timeIntervalSince1970 * 1000 - f.endAt < Self.finishedMaxAge else { return }
        // 出した時点で「出した」ことにする。閉じたときに付けると、閉じる途中に届いたスナップショットでもう一度出る。
        // 出したまま Watch のアプリが落ちても、次の記録の起動時に前回のものを出さない(reviewer 指摘)
        defaults.set(f.id, forKey: finishedShownKey)
        showingFinished = f
    }

    func finishedDismissed(_ f: WatchSnapshot.Finished) {
        if showingFinished?.id == f.id { showingFinished = nil }
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
        lastActivityAt = Date()
        pending.append(op)
        save()
        send(op)
        // 無操作で終えた後に Watch でセットを入れたら、その場でワークアウトを始め直す(iPhone が寝ていても)
        startWorkoutIfNeeded()
        if startsRest {
            ownRestStartAt = now
            scheduledRestStartAt = now
            scheduledRestKey = nil
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
        lastActivityAt = Date()
        pending.append(op)
        save()
        send(op)
        startWorkoutIfNeeded()
    }

    // MARK: - 合流(iPhone の applyWatchOps と同じ規則。表示のためだけに使う)

    static func apply(_ op: WatchOp, to s: inout WatchSnapshot) {
        guard op.kind == "add" || op.kind == "set" else { return } // ワークアウトの知らせなどは行を触らない
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
        // セットか休憩が変わっていれば、届いた状態の時刻を「記録が動いた時刻」にする
        if base.map(activityKey) != activityKey(snap) {
            lastActivityAt = max(lastActivityAt, Date(timeIntervalSince1970: snap.sentAt / 1000))
        }
        // ワークアウトの判断に使う値が変わったときだけ残す(DiagLog)
        if base?.recordStartAt != snap.recordStartAt || base?.lastSaved != snap.lastSaved || base?.state != snap.state {
            DiagLog.add("RX state=\(snap.state.rawValue) rec=\(DiagLog.time(snap.recordStartAt)) saved=\(DiagLog.time(snap.lastSaved?.startAt))")
        }
        base = snap
        let applied = Set(snap.applied ?? [])
        pending.removeAll { applied.contains($0.opId) }
        // iPhone が記録を終えた(保存・破棄)なら、宙に浮いたセットの op は捨てる。
        // ワークアウトの知らせ(started/saved/discarded)は記録が終わった後に送るものなので残す
        if snap.state != .active { pending.removeAll { $0.kind != "workout" } }
        save()
        syncWorkout(with: snap)
        startWorkoutIfNeeded()
        // 次の記録が始まったら、前回の完了画面は下げる
        if snap.recordStartAt != nil { showingFinished = nil }
        presentFinishedIfNeeded()
        // Watch で始めた休憩が iPhone で確認された後に、iPhone 側で止まった・別の休憩が始まったら、
        // Watch の通知を取り消す(確認前の古いスナップショットでは判断しない)
        if let own = ownRestStartAt, !pending.contains(where: { $0.restStartAt == own }) {
            if snap.restStartAt == nil || snap.restStartAt! > own {
                cancelRestNotifications()
                ownRestStartAt = nil
                scheduledRestStartAt = nil
                scheduledRestKey = nil
            }
        }
        // この記録のワークアウトを Watch が記録している間は、iPhone で始めた休憩の通知も Watch が予約する(改善要望 4b)。
        // iPhone はその間、自分では予約しない(index.html の休憩の effect の watchLive)。手首に二重に届かないように
        let wm = WorkoutManager.shared
        if ownRestStartAt == nil {
            if wm.isRunning, let r = wm.recordStartAt, r == snap.recordStartAt {
                let key = snap.restStartAt.map { t in "\(t)|" + restNotices().map { "\($0.min):\($0.body)" }.joined(separator: ",") }
                if key != scheduledRestKey {
                    if let t = snap.restStartAt {
                        scheduleRestNotifications(from: Date(timeIntervalSince1970: t / 1000))
                    } else {
                        cancelRestNotifications()
                    }
                    scheduledRestStartAt = snap.restStartAt
                    scheduledRestKey = key
                }
            } else if scheduledRestKey != nil {
                // 記録が終わった(保存・破棄)・Watch のワークアウトが別の記録になった。iPhone の休憩のために
                // 予約した分を消す(残すと保存の後に「1分経過」が鳴る。reviewer 指摘)
                releaseForeignRestNotifications()
            }
        }
    }

    // MARK: - ワークアウト(WorkoutManager)との対応付け

    // 直近に iPhone で保存した記録(WorkoutManager が前のセッションを締めるときに使う)
    var lastSaved: WatchSnapshot.LastSaved? { base?.lastSaved }

    // WorkoutManager がセッションを始めたとき。記録中のスナップショットが先に届いていれば、ここで対応付ける
    func workoutDidStart() {
        if let snap = base { syncWorkout(with: snap) }
    }

    // Watch のワークアウトが始まっていないまま iPhone で記録が続いていたら、Watch 自身が始める(1.4.1 (29)、北村さん)。
    // 始める手段が「iPhone で記録を始めた瞬間の startWatchApp の1回」だけで、それが失敗する(Watch がロック中・圏外・
    // TestFlight の更新後に Watch 側のアプリの入れ替えが遅れている等)と、その記録の間ずっと心拍が出ず、手首を下ろすと
    // 文字盤に戻っていた。Watch で KURABELL を開けば、ここで始まる。
    // HKWorkoutSession は前面からなら始められるので、アプリが前面のときだけ。許可が無い等で失敗したら、同じ記録では二度と試さない
    // 失敗した記録(許可が無い等)は二度と試さない。始めた後にシステムに止められた場合は印を付けないので、開き直せばまた始まる
    private var selfStartTried: Set<Double> = []
    private var selfStarting = false
    // iPhone が記録中で、まだ保存していない記録の startAt
    var recordInProgress: Double? {
        guard let snap = base, let r = snap.recordStartAt else { return nil }
        if let saved = snap.lastSaved, saved.startAt == r { return nil }
        return r
    }
    // 裏に回った印(Views の scenePhase で立てる)。background → inactive → active と2段で戻っても判定できるように
    var wentBackground = false
    // userOpened: Watch で KURABELL を開いた(起動した・裏から前面に戻した)ときに呼ばれた。手首を上げただけは含まない
    func startWorkoutIfNeeded(userOpened: Bool = false) {
        // 起動直後で iPhone との通信がまだ有効でない間は、前回の古い状態しか知らない(保存済みの記録に始めてしまう。reviewer 指摘)。
        // 有効になれば activationDidCompleteWith → receive からここが呼ばれる
        guard WCSession.default.activationState == .activated else { return }
        guard let r = recordInProgress, !selfStarting, !selfStartTried.contains(r) else { return }
        if let t = idleEnded[r] {
            guard userOpened || lastActivityAt > t else { return }
            idleEnded[r] = nil
        }
        let wm = WorkoutManager.shared
        guard !wm.isRunning, !wm.isBusy else { return }
        guard WKApplication.shared().applicationState == .active else { return }
        guard Date().timeIntervalSince1970 * 1000 - r < WorkoutManager.maxDuration * 1000 else { return }
        selfStarting = true
        // 設定は iPhone から起こすとき(HealthManager.startWatchApp)と同じ
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        Task {
            let ok = await wm.start(config, forRecord: r)
            selfStarting = false
            if !ok { selfStartTried.insert(r) }
        }
    }

    // スナップショットの状態に合わせて、ワークアウトを記録に対応付ける・保存する・破棄する。
    private func syncWorkout(with snap: WatchSnapshot) {
        let wm = WorkoutManager.shared
        guard wm.isRunning, !wm.isBusy else { return }
        if let r = wm.recordStartAt {
            // 保存の途中の状態(lastSaved は入ったが recordStartAt はまだ残っている)でも締める。iPhone は裏に回ると
            // 待たずに送るので、保存の途中で JS が止まると、この状態が最後のスナップショットになりうる(reviewer 指摘)
            if let saved = snap.lastSaved, saved.startAt == r {
                DiagLog.add("SYNC saved -> finish")
                Task { await wm.finish(key: saved.key, endAt: saved.endAt) }
                return
            }
            if snap.recordStartAt == r { return } // 記録はまだ続いている(種目を消して入れ直す途中も含む)
            // 記録 r が終わった(破棄)か、別の記録に替わった(保存した記録は上で締めている)
            DiagLog.add("SYNC record gone -> discard")
            Task { await wm.discard(report: true) }
            return
        }
        // まだ対応付いていない。
        // 記録中のスナップショットは、セッションより前に送られたものでも対応付けてよい(iPhone は種目を足した
        // 時点で状態を送り、その後で Watch を起動するので、ふつうはこちらが先に届く)。前の記録の古い状態に
        // 誤って付かないよう、記録とセッションの開始時刻の近さで判断する(attach)。
        if let r = snap.recordStartAt {
            if wm.attach(recordStartAt: r) {
                sendWorkoutEvent("started", recordStartAt: r)
            } else if snap.sentAt >= wm.sessionStartMs {
                // セッションの開始後に届いた記録が、開始時刻から離れすぎている = このセッションのための記録ではない
                DiagLog.add("SYNC other record -> discard")
                Task { await wm.discard(report: false) }
            }
        } else if snap.sentAt > wm.sessionStartMs + 5000 {
            // 対応付く前に記録が終わった(iPhone は started を受け取っていないので自分で書く)
            DiagLog.add("SYNC no record -> discard")
            Task { await wm.discard(report: false) }
        }
    }

    // iPhone への知らせ: "started"(この記録は Watch が記録する)/ "saved" / "discarded"
    // 記録中の心拍(WorkoutManager から)。届くときだけ送り、届かなければ捨てる(op の流れには入れない)
    func sendHeartRate(bpm: Double, recordStartAt: Double) {
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else { return }
        s.sendMessage(["hr": Int(bpm.rounded()), "at": Date().timeIntervalSince1970 * 1000, "rec": recordStartAt],
                      replyHandler: nil, errorHandler: nil)
    }

    func sendWorkoutEvent(_ status: String, recordStartAt: Double) {
        let op = WatchOp(opId: UUID().uuidString, kind: "workout", exId: "", setIndex: 0,
                         weight: "", reps: "", rir: nil, restStartAt: nil,
                         at: Date().timeIntervalSince1970 * 1000,
                         status: status, recordStartAt: recordStartAt,
                         restNotify: status == "started" ? true : nil)
        pending.append(op) // 届くまで送り直す(iPhone が合流済みにしたら外れる)
        save()
        send(op)
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

    // MARK: - 休憩の通知

    // iPhone の休憩のために予約した分を消す。Watch のワークアウトが終わったとき(WorkoutManager.cleanUp)にも呼ぶ。
    // 終わると iPhone が予約し直す(discarded で watchOwnsRest が降りる)ので、残すと手首に二重に届く
    func releaseForeignRestNotifications() {
        guard ownRestStartAt == nil, scheduledRestKey != nil else { return }
        cancelRestNotifications()
        scheduledRestStartAt = nil
        scheduledRestKey = nil
    }

    // 経過分と本文。古い iPhone(restNotices が無い)なら今までどおり 1・2・3分とラベルの本文
    private func restNotices() -> [WatchSnapshot.RestNotice] {
        if let n = snapshot?.restNotices { return n }
        let labels = snapshot?.labels
        return [1, 2, 3].map { m in
            .init(min: Double(m), body: labels?.restBody.replacingOccurrences(of: "{n}", with: String(m))
                  ?? String(format: NSLocalizedString("rest.elapsed", comment: ""), m))
        }
    }

    // 休憩の通知の予約の世代。予約や取り消しのたびに進め、古い予約の続きは捨てる。
    // 最後に記録が動いた時刻(Watch でのセットの入力・セットの追加、iPhone から届いた新しい状態)。
    // これから WorkoutManager.idleLimit たっても動かなければ、Watch のワークアウトを終える(1.4.2、北村さん
    // 「アプリを終了したが Apple Watch が閉じない」。保存しないまま iPhone のアプリを閉じたとき用)
    private(set) var lastActivityAt: Date = .distantPast
    // 無操作で終えた記録と、終えた時刻。その後にセットが入るか、Watch で KURABELL を開き直すまで始め直さない
    // (保存のために iPhone を開いた・手首を上げただけで始め直すと、終えた記録に短いワークアウトが付いてしまう)
    private var idleEnded: [Double: Date] = [:]
    func markIdleEnded(_ r: Double) { idleEnded[r] = Date() }
    // アプリが再起動してワークアウトを引き取り直したとき(WorkoutManager.adopt)。lastActivityAt はメモリにしか無いので、
    // ここを起点にしないと、続いている記録を次の見回りで無操作と見なして捨てる(reviewer 指摘)
    func noteActivity() { lastActivityAt = max(lastActivityAt, Date()) }
    // 記録の中身(セットと休憩)。これが変わったときだけ「記録が動いた」と数える(iPhone を開いた・閉じたは数えない)
    private func activityKey(_ snap: WatchSnapshot) -> String {
        let sets = snap.exercises.map { ex in ex.id + ":" + ex.sets.map { "\($0.weight)x\($0.reps)r\($0.rir.map(String.init) ?? "-")" }.joined(separator: ",") }
        return sets.joined(separator: "|") + "#" + (snap.restStartAt.map { String($0) } ?? "")
    }

    // 権限の確認と add は非同期で、続けて予約し直すと古い時刻の add が後から入り、ずれた時刻に鳴っていた(1.4 (18)、北村さん「インターバル通知がズレて来る」)
    private var restNotifyGeneration = 0
    // 休憩画面を開いているか。開いている間は、休憩の通知のバナーで画面を覆わず、音と振動だけにする(willPresent)。
    // willPresent はメインスレッド以外から呼ばれうるので、ロック付きの値で読む(1.4.2 (39)。15秒の遅れの原因はこれではなく、
    // 下の「ワークアウト中は Watch 自身が鳴らす」の13秒の待ちだった)
    var restViewVisible: Bool {
        get { Self.restViewVisibleNow() }
        set { Self.visibleLock.lock(); Self.visibleFlag = newValue; Self.visibleLock.unlock() }
    }
    nonisolated private static let visibleLock = NSLock()
    nonisolated(unsafe) private static var visibleFlag = false
    nonisolated static func restViewVisibleNow() -> Bool {
        visibleLock.lock(); defer { visibleLock.unlock() }
        return visibleFlag
    }

    // MARK: - ワークアウト中は Watch 自身が鳴らす(1.4.2、2026-10-15)
    //
    // iPhone のアプリがある Watch アプリが自分で予約したローカル通知は、iPhone の同じ通知との重複を確かめるため、
    // iPhone に同じ通知が無いと最大13秒待ってから鳴る(Apple DTS の回答、developer.apple.com/forums/thread/765669)。
    // Watch がワークアウトを記録している間は iPhone は予約しない設計なので、休憩の知らせは毎回この待ちに当たり、
    // 北村さんの「インターバルの通知が15秒遅れる」になっていた((23)(39) の推定は外れ。メインスレッドの待ちではなかった)。
    // ワークアウトが動いている間は、アプリが裏・常時表示でも WKInterfaceDevice.play が効く(Apple のドキュメント)ので、
    // 予定の時刻にアプリ自身で振動させ、同じ時刻の通知は出さない。通知の予約はアプリが落ちたときの予備として残す。
    private var restTimers: [DispatchSourceTimer] = []
    // 予約してある自前の知らせ("id|予定時刻ms")と、ワークアウトが動いているか。willPresent(メインスレッド以外)から読む
    nonisolated private static let alertLock = NSLock()
    nonisolated(unsafe) private static var armedAlerts: Set<String> = []
    nonisolated(unsafe) private static var claimedAlerts: [String: Int64] = [:]
    // willPresent が自前の知らせに譲って止めた回。自前のタイマーが遅れても、この回だけは鳴らす(どちらも鳴らない、を作らない)
    nonisolated(unsafe) private static var deferredAlerts: Set<String> = []
    nonisolated(unsafe) private static var workoutRunningFlag = false
    // 予定より遅れすぎた自前の知らせは鳴らさない(アプリが止まっていた。通知の方が出ている)
    private static let restAlertMaxLate: TimeInterval = 10
    private static let restAlertLead: TimeInterval = 0.5

    nonisolated static func setWorkoutRunning(_ v: Bool) {
        alertLock.lock(); workoutRunningFlag = v; alertLock.unlock()
    }
    nonisolated private static func alertKey(_ id: String, _ fireMs: Int64) -> String { "\(id)|\(fireMs)" }
    nonisolated private static func ms(_ d: Date) -> Int64 { Int64((d.timeIntervalSince1970 * 1000).rounded()) }
    // その回の知らせを先に取った方が鳴らす(自前の振動と通知の二重を防ぐ)
    nonisolated private static func claimAlert(_ id: String, _ fireMs: Int64) -> Bool {
        alertLock.lock(); defer { alertLock.unlock() }
        if claimedAlerts[id] == fireMs { return false }
        claimedAlerts[id] = fireMs
        return true
    }
    // willPresent から: ワークアウト中で、自前の知らせが待っているなら通知は出さない(その回は譲った印を付ける)
    nonisolated private static func deferToOwnAlert(_ id: String, _ fireMs: Int64) -> Bool {
        alertLock.lock(); defer { alertLock.unlock() }
        let key = alertKey(id, fireMs)
        guard workoutRunningFlag, armedAlerts.contains(key) else { return false }
        deferredAlerts.insert(key)
        return true
    }
    nonisolated private static func takeDeferred(_ id: String, _ fireMs: Int64) -> Bool {
        alertLock.lock(); defer { alertLock.unlock() }
        return deferredAlerts.remove(alertKey(id, fireMs)) != nil
    }

    private func armRestAlerts(from start: Date, notices: [WatchSnapshot.RestNotice]) {
        cancelRestAlerts()
        var keys: Set<String> = []
        for n in notices {
            let fireAt = start.addingTimeInterval(n.min * 60)
            let wait = fireAt.timeIntervalSinceNow
            guard wait > 0 else { continue }
            let id = Self.restNotifyPrefix + String(n.min)
            let fireMs = Self.ms(fireAt)
            keys.insert(Self.alertKey(id, fireMs))
            // Task.sleep ではなく、まとめて遅らせない(.strict)時刻指定のタイマー。通知より少しだけ先に鳴らし、
            // 鳴らした後で予備の通知を取り消す(先に取り消せば、ほかの画面にいて willPresent が呼ばれないときも二重にならない)
            let t = DispatchSource.makeTimerSource(flags: .strict, queue: .main)
            t.schedule(wallDeadline: .now() + max(0, wait - Self.restAlertLead), leeway: .milliseconds(100))
            t.setEventHandler { [weak self] in
                MainActor.assumeIsolated { self?.restAlertFired(id: id, fireAt: fireAt) }
            }
            t.resume()
            restTimers.append(t)
        }
        Self.alertLock.lock(); Self.armedAlerts = keys; Self.alertLock.unlock()
    }

    private func cancelRestAlerts() {
        restTimers.forEach { $0.cancel() }
        restTimers = []
        Self.alertLock.lock(); Self.armedAlerts = []; Self.alertLock.unlock()
    }

    private func restAlertFired(id: String, fireAt: Date) {
        let fireMs = Self.ms(fireAt)
        Self.alertLock.lock(); Self.armedAlerts.remove(Self.alertKey(id, fireMs)); Self.alertLock.unlock()
        let late = Date().timeIntervalSince(fireAt)
        let running = WorkoutManager.shared.isRunning
        // 通知を譲ってもらった回は、遅れていても鳴らす(鳴らさないと、その回は何も鳴らない。reviewer 指摘)
        let deferred = Self.takeDeferred(id, fireMs)
        // 振動が効くのはワークアウトが動いている間だけ(それ以外は通知に任せる)。遅れすぎた回は、アプリが止まっていて通知の方が出ている
        guard running, late < Self.restAlertMaxLate || deferred else {
            DiagLog.add("REST alert \(id) skipped running=\(running) late=\(String(format: "%.1f", late))s")
            return
        }
        guard Self.claimAlert(id, fireMs) else {
            DiagLog.add("REST alert \(id) already shown by notification")
            return
        }
        WKInterfaceDevice.current().play(.notification)
        let app = WKApplication.shared()
        // 予備の通知を先に取り消すのは、画面を見ている(active)ときだけ。play は効いたかどうかを返さないので、
        // それ以外では予備を残し、willPresent が呼ばれたら(KURABELL が前面)そこで止める。前面でなければ予備も鳴る
        // (遅れて二重に鳴る方へ倒す。鳴らない、を作らない。reviewer 指摘)
        if app.applicationState == .active {
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
        }
        DiagLog.add("REST alert \(id) played late=\(String(format: "%.2f", late))s app=\(app.applicationState.rawValue)")
    }

    private func scheduleRestNotifications(from start: Date) {
        restNotifyGeneration += 1
        let gen = restNotifyGeneration
        armRestAlerts(from: start, notices: restNotices())
        DiagLog.add("REST schedule start=\(DiagLog.time(start.timeIntervalSince1970 * 1000)) running=\(WorkoutManager.shared.isRunning)")
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            Task { @MainActor in
                guard gen == self.restNotifyGeneration else { return }
                self.removeRestNotifications()
                // 前の休憩の通知が通知センターに溜まり続けないよう、届き済みのものも消す
                UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: Self.restNotifyIds)
                // 文言は iPhone のアプリ内言語設定に従わせるため、スナップショットのものを使う
                let title = self.snapshot?.labels.rest ?? "Rest"
                for n in self.restNotices() {
                    let interval = start.addingTimeInterval(n.min * 60).timeIntervalSinceNow
                    guard interval > 0 else { continue }
                    let content = UNMutableNotificationContent()
                    content.title = title
                    content.body = n.body
                    content.sound = .default
                    content.interruptionLevel = .timeSensitive
                    // 予定の時刻(willPresent で自前の知らせと照らし合わせる・遅れを DiagLog に残す)
                    content.userInfo = ["fireAt": Double(Self.ms(start.addingTimeInterval(n.min * 60)))]
                    let req = UNNotificationRequest(
                        identifier: Self.restNotifyPrefix + String(n.min), content: content,
                        trigger: UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false))
                    // 待っている間に新しい予約・取り消しがあれば、この古い予約は入れない
                    guard gen == self.restNotifyGeneration else { return }
                    try? await UNUserNotificationCenter.current().add(req)
                    // add を待つ間に取り消された(保存・休憩の終了など)なら、入れたばかりのものを消す
                    if gen != self.restNotifyGeneration {
                        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [req.identifier])
                        return
                    }
                }
            }
        }
    }

    private func cancelRestNotifications() {
        restNotifyGeneration += 1
        cancelRestAlerts()
        removeRestNotifications()
    }

    // 1.2 までは "kurabell-watch-rest-1" のように整数で積んでいたので、そちらも消す
    private static let restNotifyIds = restNotifyChoices.map { restNotifyPrefix + String($0) } + [1, 2, 3].map { restNotifyPrefix + String($0) }

    private func removeRestNotifications() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: Self.restNotifyIds)
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
        // 休憩画面を開いている間は、バナーで経過時間を覆わず、音と振動だけで知らせる。
        // ワークアウト中は Watch 自身が予定の時刻に鳴らす(armRestAlerts)ので、同じ回の通知は出さない。
        // ここで MainActor を待たない(メインスレッド以外から呼ばれうる)
        let id = notification.request.identifier
        guard id.hasPrefix("kurabell-watch-rest-") else { return [.banner, .sound] }
        if let f = notification.request.content.userInfo["fireAt"] as? Double {
            let fireMs = Int64(f)
            let late = Date().timeIntervalSince1970 - f / 1000
            if Self.deferToOwnAlert(id, fireMs) || !Self.claimAlert(id, fireMs) {
                DiagLog.add(String(format: "REST notif %@ suppressed late=%.1fs", id, late))
                return []
            }
            DiagLog.add(String(format: "REST notif %@ shown late=%.1fs", id, late))
        }
        if Self.restViewVisibleNow() { return [.sound] }
        return [.banner, .sound]
    }
}
