import Foundation
import HealthKit

// Watch のワークアウトセッション(筋トレ・屋内)。iPhone で記録を始めると、iPhone が
// HKHealthStore.startWatchApp で Watch アプリを起動し、ここで始まる(KurabellWatchApp の AppDelegate)。
// セッション中は、腕を下ろしても Watch が KURABELL の画面のまま保たれ、心拍・消費カロリーが記録される。
//
// 保存するかどうかは iPhone が決める(SessionStore.syncWorkout から呼ばれる):
// - iPhone で記録を保存した → その終了時刻で締めて保存し、"saved" を返す
// - iPhone で記録を破棄した・4時間を超えた・30分記録が動かなかった(保存しないまま閉じた)・システムに止められた・保存に失敗した → 破棄し、"discarded" を返す
// iPhone は "saved" が返るまで自分の書き込みを保留し、"discarded" や無応答なら時刻だけ書く
// (src/domain/watch.js の settleWatchHealth)。Watch 側で何が起きても、ヘルスケアから記録が消えないように。
// 設計は docs/Watchアプリ.md の「ワークアウト」。
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    // iPhone の HEALTH_MAX_WORKOUT_MS と同じ。これを超える記録はヘルスケアに書かない決まりなので、放置されたら破棄する
    static let maxDuration: TimeInterval = 4 * 60 * 60
    // iPhone の記録の開始と、このセッションの開始の差の許容範囲。起動の遅れ(初回の許可画面など)は吸収し、
    // 前の記録のスナップショットに誤って対応付けないため
    static let attachWindow: TimeInterval = 10 * 60
    // 記録が動かないまま(SessionStore.lastActivityAt)これだけたったら、保存されないまま終わった記録と見なして終える
    // (1.4.2、北村さん「アプリを終了したが Apple Watch が閉じない」。iOS はアプリを上にスワイプして閉じても知らせてこないので、時間で見る)
    static let idleLimit: TimeInterval = 30 * 60
    // 見張り(watchdog)の間隔
    static let watchInterval: TimeInterval = 60

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var watchdog: Task<Void, Never>?
    private var endedWaiter: CheckedContinuation<Void, Never>?
    // endSession の3秒の待ちの合図。前の endSession の待ちが、後の endSession の待ちを解かないように
    private var endedWaiterId = 0

    @Published private(set) var isRunning = false {
        // 休憩の通知を出すか(willPresent、メインスレッド以外)の判断に使う
        didSet { SessionStore.setWorkoutRunning(isRunning) }
    }
    // 今の心拍(Watch の画面に出す。1.4.1 (31)、北村さん「Apple Watch にも心拍数表示」)。ワークアウトが動いていないときは nil
    @Published private(set) var heartRate: Int?
    // 最後に心拍を受け取った時刻。センサーが途切れたら(バンドが緩んだ等)古い値を隠すため(iPhone と同じ15秒。reviewer 指摘)
    private(set) var heartRateAt: Date = .distantPast
    // start / finish / discard の途中(await の間)に、別のスナップショットで二重に呼ばれないように
    private(set) var isBusy = false
    // このワークアウトが対応する iPhone の記録の startAt(ms)。スナップショットで知る。
    // アプリが再起動してセッションを引き取り直す(recover)ときのために、セッションの開始時刻と組で端末にも残す
    // (組にしないと、片付けずに落ちた前のセッションの値で、別のセッションを前の記録として締めうる。reviewer 指摘)
    private(set) var recordStartAt: Double? {
        didSet {
            if let r = recordStartAt { UserDefaults.standard.set(["record": r, "session": sessionStartMs], forKey: Self.recordKey) }
            else { UserDefaults.standard.removeObject(forKey: Self.recordKey) }
        }
    }
    private static let recordKey = "watch.workoutRecord.v1"
    private(set) var sessionStartMs: Double = 0
    // 心拍を iPhone に送った最後の時刻(5秒に1回までに絞る。sendMessage は iPhone のアプリを裏で起こすため)
    private var lastHeartRateSentAt: Date = .distantPast

    // forRecord: Watch で開いたときに Watch 自身が始めた場合の、iPhone の記録の startAt(SessionStore.startWorkoutIfNeeded)。
    // 途中から始めるので開始時刻の近さ(attachWindow)は見ずに、その記録に対応付けて iPhone に "started" を送る
    // 始めた(または動いているセッションをそのまま使う)なら true
    @discardableResult
    func start(_ config: HKWorkoutConfiguration, forRecord: Double? = nil) async -> Bool {
        DiagLog.add("WO start req forRecord=\(DiagLog.time(forRecord)) running=\(isRunning) busy=\(isBusy)")
        guard !isBusy, HKHealthStore.isHealthDataAvailable() else { return false }
        if isRunning {
            // まだ続いている記録に付いているセッション、または対応付けを待っている始めたばかりのセッションは捨てない。
            // iPhone の起こし直し(1.4.1 (29))や Watch 自身の開始が重なったときに、動いているワークアウトを捨てて
            // 始め直すと、それまでの心拍が消え、10分を超えると対応付けに失敗してワークアウトごと無くなった(reviewer 指摘)
            let ongoing = SessionStore.shared.recordInProgress
            if let r = recordStartAt, r == ongoing { return true }
            if recordStartAt == nil, Date().timeIntervalSince1970 * 1000 - sessionStartMs < Self.attachWindow * 1000 {
                if let r = forRecord, r == ongoing, attach(recordStartAt: r) { SessionStore.shared.sendWorkoutEvent("started", recordStartAt: r) }
                return true
            }
            // 前のセッションが残っている(対応付く前に記録が終わった・終わりの知らせが届かなかった)。
            // 保存されていれば保存し、そうでなければ破棄してから始め直す
            if let r = recordStartAt, let saved = SessionStore.shared.lastSaved, saved.startAt == r {
                await finish(key: saved.key, endAt: saved.endAt)
            } else {
                await discard(report: recordStartAt != nil)
            }
        }
        isBusy = true
        defer { isBusy = false }
        // アプリが再起動した直後で、引き取られていないセッションが残っていれば、新しく始めずにそれを引き取る
        // (handleActiveWorkoutRecovery より先にここが走ると、recover は isBusy で何もしないため。reviewer 指摘)。
        // 保存・破棄・対応付けは、この後の workoutDidStart で今の状態から決まる
        if await adoptRecoveredSession() {
            let ongoing = SessionStore.shared.recordInProgress
            let fresh = Date().timeIntervalSince1970 * 1000 - sessionStartMs < Self.attachWindow * 1000
            isBusy = false
            if let r = recordStartAt, r == ongoing {
                SessionStore.shared.workoutDidStart()
                return true
            }
            if recordStartAt == nil, fresh {
                if let r = forRecord, r == ongoing, attach(recordStartAt: r) { SessionStore.shared.sendWorkoutEvent("started", recordStartAt: r) }
                SessionStore.shared.workoutDidStart()
                return true
            }
            // 前の記録の残りだった。締めて(保存済みなら保存、でなければ破棄)から、今の記録のために新しく始める。
            // ここで返すと、その記録の間ずっと心拍が出なかった(reviewer 指摘)
            if let r = recordStartAt, let saved = SessionStore.shared.lastSaved, saved.startAt == r {
                await finish(key: saved.key, endAt: saved.endAt)
            } else {
                await discard(report: recordStartAt != nil)
            }
            guard !isRunning, !isBusy else { return false }
            isBusy = true
        }
        let energy = HKQuantityType(.activeEnergyBurned)
        let heartRate = HKQuantityType(.heartRate)
        recordStartAt = nil
        do {
            // 初回だけ許可を求める(iPhone 側にも同じシートが出ることがある)
            try await store.requestAuthorization(toShare: [HKObjectType.workoutType(), energy],
                                                 read: [heartRate, energy])
            let session = try HKWorkoutSession(healthStore: store, configuration: config)
            self.session = session
            let builder = session.associatedWorkoutBuilder()
            self.builder = builder
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            // 記録中の心拍を iPhone の画面に出す(1.4、北村さん)
            builder.delegate = self
            session.delegate = self
            let now = Date()
            session.startActivity(with: now)
            try await builder.beginCollection(at: now)
            sessionStartMs = now.timeIntervalSince1970 * 1000
            isRunning = true
            armTimers()
            DiagLog.add("WO start ok forRecord=\(DiagLog.time(forRecord))")
        } catch {
            DiagLog.add("WO start failed: \(error.localizedDescription)")
            // startActivity の後で失敗したら、始まったセッションを止めてから手放す(参照を捨てるだけだと、
            // 誰にも止められないワークアウトが残る)
            session?.end()
            builder?.discardWorkout()
            cleanUp()
            return false
        }
        if let r = forRecord {
            recordStartAt = r
            // 始めるのを待っている間(初回の許可シートなど)に記録が終わっていたら、"started" は送らない。
            // 後の workoutDidStart → syncWorkout が、今の状態で保存か破棄かを決める(reviewer 指摘)
            if SessionStore.shared.recordInProgress == r { SessionStore.shared.sendWorkoutEvent("started", recordStartAt: r) }
        }
        // 記録中のスナップショットが先に届いていれば、その場で対応付ける(forRecord のときは、記録が続いているかを確かめる)
        SessionStore.shared.workoutDidStart()
        return true
    }

    // 見張り。start と adopt から。1分ごとに、届いている状態での締め直し・4時間の上限・対応付かないセッション・無操作を見る
    // (常時表示で間引かれても、分単位の判断に数十秒の遅れは問題にならない)。
    // 以前は上限と対応付けを1回きりの Task で見ていて、そのときちょうど別の保存・破棄の途中(isBusy)だと何もせずに終わり、
    // 4時間の上限まで残った。また、途中で落とした「保存した」のスナップショットは、次のスナップショットが来るまで拾い直さなかった。
    // ここでは手が空いていなければ次の回に見直す(2026-10-15、(33)〜(40) の見直し)
    private func armTimers() {
        watchdog?.cancel()
        let started = sessionStartMs
        watchdog = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Self.watchInterval * 1_000_000_000))
                guard let self, !Task.isCancelled, self.isRunning, self.sessionStartMs == started else { return }
                guard !self.isBusy else { continue }
                if await self.checkLimits(started: started) { return }
                // 届いている最新の状態で、保存・破棄・対応付けを決め直す(受け取ったときに isBusy で落としていても拾う)
                SessionStore.shared.workoutDidStart()
            }
        }
    }

    // 上限に当たって終えたら true
    private func checkLimits(started: Double) async -> Bool {
        let now = Date()
        let age = now.timeIntervalSince1970 - started / 1000
        if age >= Self.maxDuration {
            DiagLog.add("WO limit 4h -> discard")
            await discard(report: true)
            return true
        }
        guard let r = recordStartAt else {
            // 記録に対応付かないまま attachWindow を過ぎたら破棄する(記録のスナップショットがそれより遅れて届く場合は諦める)。
            // 対応付いていないセッションは、iPhone から新しいスナップショットが届くまで終わらない(syncWorkout)ので、
            // 起こす要求が遅れて届く・iPhone のアプリが閉じられている等で届かないと、4時間の上限まで動き続けていた(2026-10-12、北村さんの実機)。
            // iPhone で記録していないときに短く切る案は採らない(記録を始めた知らせが遅れると、その記録の心拍が残らない。reviewer 指摘)
            guard age >= Self.attachWindow else { return false }
            DiagLog.add("WO unattached \(Int(age))s -> discard")
            await discard(report: false)
            return true
        }
        // 無操作の見張り(1.4.2 (40))。保存の知らせが届いていなかっただけなら締めて保存し、そうでなければ破棄する
        // (iPhone は保存時に時刻だけ書く)
        let last = max(SessionStore.shared.lastActivityAt, Date(timeIntervalSince1970: started / 1000))
        guard now.timeIntervalSince(last) >= Self.idleLimit else { return false }
        SessionStore.shared.markIdleEnded(r)
        if let saved = SessionStore.shared.lastSaved, saved.startAt == r {
            DiagLog.add("WO idle 30m, saved known -> finish")
            await finish(key: saved.key, endAt: saved.endAt)
        } else {
            DiagLog.add("WO idle 30m -> discard")
            await discard(report: true)
        }
        return true
    }

    // ワークアウト中にアプリが再起動した(更新・システムによる終了など)とき、システムが handleActiveWorkoutRecovery で呼ぶ。
    // 引き取り直さないと、このクラスはセッションを知らないまま、ワークアウトだけが誰にも止められずに残る
    // (2026-10-12、北村さんの実機。iPhone で保存しても Watch の文字盤に経過時間が出続け、アプリの一覧からも消せなかった)
    // start の途中で呼ばれたら、start が冒頭で同じことをする(adoptRecoveredSession)
    func recover() async {
        DiagLog.add("WO recovery launch session=\(session != nil) busy=\(isBusy)")
        guard session == nil, !isBusy else { return }
        isBusy = true
        let adopted = await adoptRecoveredSession()
        isBusy = false
        // 引き取る間に届いていた状態で、保存・破棄・対応付けを決める
        if adopted { SessionStore.shared.workoutDidStart() }
    }

    // 残っているセッションを HealthKit に尋ねる。返事が来ないと isBusy が立ったまま開始も終了もできなくなるので、3秒で諦める(reviewer 指摘)
    private func recoverSession() async -> HKWorkoutSession? {
        final class Once: @unchecked Sendable { var done = false }
        let once = Once()
        return await withCheckedContinuation { (cont: CheckedContinuation<HKWorkoutSession?, Never>) in
            store.recoverActiveWorkoutSession { s, _ in
                Task { @MainActor in
                    if once.done {
                        // 諦めた後に届いた。手が空いていれば引き取り、そうでなければ止める
                        // (end() だけだと、記録中のワークアウトを自分で止めて心拍が消える。reviewer 指摘)
                        guard let s else { return }
                        if self.session == nil, !self.isBusy, self.adopt(s) { SessionStore.shared.workoutDidStart() }
                        else if self.session !== s { s.end() }
                        return
                    }
                    once.done = true
                    cont.resume(returning: s)
                }
            }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if once.done { return }
                once.done = true
                cont.resume(returning: nil)
            }
        }
    }

    // 呼ぶ側が isBusy を立てておく
    private func adoptRecoveredSession() async -> Bool {
        guard session == nil else { return false }
        guard let session = await recoverSession() else { return false }
        return adopt(session)
    }

    // 取り戻したセッションに builder・delegate を付け直して、このクラスの状態にする
    private func adopt(_ session: HKWorkoutSession) -> Bool {
        let builder = session.associatedWorkoutBuilder()
        // 終わりかけのセッションは引き取らずに手放す
        guard session.state == .running || session.state == .paused else {
            builder.discardWorkout()
            if session.state != .ended { session.end() }
            return false
        }
        builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: session.workoutConfiguration)
        builder.delegate = self
        session.delegate = self
        self.session = session
        self.builder = builder
        sessionStartMs = (session.startDate ?? Date()).timeIntervalSince1970 * 1000
        // 残っている記録の startAt は、このセッションのものだと確かめられたときだけ戻す
        let saved = UserDefaults.standard.dictionary(forKey: Self.recordKey)
        if let r = saved?["record"] as? Double, let s = saved?["session"] as? Double, abs(s - sessionStartMs) < 1000 {
            recordStartAt = r
        } else {
            recordStartAt = nil
        }
        isRunning = true
        DiagLog.add("WO adopt state=\(session.state.rawValue) start=\(DiagLog.time(sessionStartMs)) record=\(DiagLog.time(recordStartAt))")
        SessionStore.shared.noteActivity()
        // このアプリは一時停止を使わないが、システムや文字盤のボタンで止められていた場合の保険
        if session.state == .paused { session.resume() }
        armTimers()
        return true
    }

    // 「ワークアウトを終了」(Watch の待機・メニュー画面のボタン。2026-10-12、北村さん)。iPhone で記録していないのに残っている
    // ワークアウトを止める。このクラスが知らない・引き取れないセッションも、新しいセッションを始めてすぐ終えることで止める
    // (watchOS で動くワークアウトは同時に1つだけなので、新しい方を始めると前のものはシステムが終える)。
    // (33)(34) で原因を推定して直しても実機で消えなかったので、原因に頼らず止められる手段として置く
    // 止められた(または止めるものが無かった)なら true。iPhone で記録中なら何もしない(種目を全部消して入れ直す途中は
    // Watch がメニュー画面になるが、記録は続いている。reviewer 指摘)
    func forceEnd() async -> Bool {
        guard !isBusy, SessionStore.shared.recordInProgress == nil, HKHealthStore.isHealthDataAvailable() else { return false }
        if !isRunning {
            isBusy = true
            let adopted = await adoptRecoveredSession()
            isBusy = false
            if !adopted {
                isBusy = true
                defer { isBusy = false }
                let config = HKWorkoutConfiguration()
                config.activityType = .traditionalStrengthTraining
                config.locationType = .indoor
                guard let s = try? HKWorkoutSession(healthStore: store, configuration: config) else { return false }
                s.startActivity(with: Date())
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                s.end()
                s.associatedWorkoutBuilder().discardWorkout()
                // 本当に止まったかを確かめ直す。まだ動いているセッションが返ってくれば、止められていない(reviewer 指摘)
                try? await Task.sleep(nanoseconds: 500_000_000)
                if let left = await recoverSession(), left.state == .running || left.state == .paused {
                    left.end()
                    DiagLog.add("WO forceEnd: still running")
                    return false
                }
                DiagLog.add("WO forceEnd: replaced and ended")
                return true
            }
        }
        // iPhone で保存済みの記録なら締めて保存し、そうでなければ破棄する(syncWorkout と同じ判断)
        if let r = recordStartAt, let saved = SessionStore.shared.lastSaved, saved.startAt == r {
            await finish(key: saved.key, endAt: saved.endAt)
        } else {
            await discard(report: true)
        }
        return !isRunning
    }

    // スナップショットで分かった、この記録の startAt。開始時刻が離れすぎていれば対応付けない
    func attach(recordStartAt r: Double) -> Bool {
        guard isRunning, !isBusy, recordStartAt == nil else { return false }
        guard abs(sessionStartMs - r) <= Self.attachWindow * 1000 else { return false }
        recordStartAt = r
        DiagLog.add("WO attach record=\(DiagLog.time(r))")
        return true
    }

    // iPhone で保存した時刻で締めて、ヘルスケアに保存する。
    // syncIdentifier は iPhone が書くときと同じ値にする(履歴の削除で iPhone から消せるように)。
    func finish(key: String, endAt: Double) async {
        guard let session, let builder, !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        let record = recordStartAt
        let end = max(Date(timeIntervalSince1970: endAt / 1000), builder.startDate ?? .distantPast)
        // Apple の手順どおり、セッションが ended になってから集計を締める
        await endSession(session)
        do {
            try await builder.endCollection(at: end)
            try await builder.addMetadata([
                HKMetadataKeySyncIdentifier: "kurabell-workout-\(key)",
                HKMetadataKeySyncVersion: 1,
                HKMetadataKeyIndoorWorkout: true,
            ])
            // 完了画面(改善要望 12)に出す心拍の平均と消費カロリー。集計を締めた後に読む
            let bpm = HKUnit.count().unitDivided(by: .minute())
            let hr = builder.statistics(for: HKQuantityType(.heartRate))?.averageQuantity()?.doubleValue(for: bpm)
            let kcal = builder.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
            if let record { SessionStore.shared.workoutStats = .init(recordStartAt: record, avgHeartRate: hr, kcal: kcal) }
            _ = try await builder.finishWorkout()
            DiagLog.add("WO finish saved record=\(DiagLog.time(record))")
            if let record { SessionStore.shared.sendWorkoutEvent("saved", recordStartAt: record) }
        } catch {
            DiagLog.add("WO finish failed: \(error.localizedDescription)")
            builder.discardWorkout()
            // 保存できなかった。iPhone に時刻だけ書いてもらう
            if let record { SessionStore.shared.sendWorkoutEvent("discarded", recordStartAt: record) }
        }
        cleanUp()
    }

    // report: 記録に対応付いていたなら、iPhone に「Watch では保存しなかった」と知らせる
    func discard(report: Bool) async {
        guard let session, let builder, !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        let record = recordStartAt
        await endSession(session)
        builder.discardWorkout()
        DiagLog.add("WO discard record=\(DiagLog.time(record)) report=\(report)")
        if report, let record { SessionStore.shared.sendWorkoutEvent("discarded", recordStartAt: record) }
        cleanUp()
    }

    private func endSession(_ session: HKWorkoutSession) async {
        guard session.state != .ended else { return }
        endedWaiterId += 1
        let id = endedWaiterId
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            endedWaiter = cont
            session.end()
            // ended の通知が来なくても先へ進む(待ち続けて保存も破棄もできなくなるのを防ぐ)。
            // 前の endSession の待ちが、後の endSession の待ちを早く解かないように、自分の回だけを解く
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard let self, self.endedWaiterId == id, self.endedWaiter != nil else { return }
                DiagLog.add("WO end: no ended event in 3s state=\(session.state.rawValue)")
                self.resumeEndedWaiter()
            }
        }
    }

    fileprivate func resumeEndedWaiter() {
        endedWaiter?.resume()
        endedWaiter = nil
    }

    // 自分で終わらせていないのにセッションが終わった(ほかのワークアウトアプリを始めた等)・失敗した
    fileprivate func sessionEndedUnexpectedly() {
        DiagLog.add("WO ended by system busy=\(isBusy)")
        guard isRunning, !isBusy else { return }
        Task { await discard(report: true) }
    }

    private func cleanUp() {
        watchdog?.cancel()
        watchdog = nil
        session = nil
        builder = nil
        recordStartAt = nil
        isRunning = false
        heartRate = nil
        SessionStore.shared.releaseForeignRestNotifications()
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        Task { @MainActor in
            // 手放した古いセッションの遅れた知らせで、今のセッションを捨てないように(reviewer 指摘)
            guard workoutSession === self.session else { return }
            if self.endedWaiter != nil { self.resumeEndedWaiter() } else { self.sessionEndedUnexpectedly() }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DiagLog.add("WO session error: \(error.localizedDescription)")
        Task { @MainActor in
            guard workoutSession === self.session else { return }
            self.sessionEndedUnexpectedly()
        }
    }
}

// 記録中の心拍を iPhone に送る(1.4、北村さん「心拍数も常時表示 ※Apple Watch 装着時のみ」)。
// 対応付いた記録があるときだけ、5秒に1回まで。届かない(iPhone が近くにいない)ときは捨てる(古い心拍に意味は無いので、
// op のように送り直したり保存したりしない)。
extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let type = HKQuantityType(.heartRate)
        guard collectedTypes.contains(type),
              let q = workoutBuilder.statistics(for: type)?.mostRecentQuantity() else { return }
        let bpm = q.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        Task { @MainActor in self.reportHeartRate(bpm) }
    }

    fileprivate func reportHeartRate(_ bpm: Double) {
        if isRunning {
            heartRateAt = Date()
            let v = Int(bpm.rounded())
            if heartRate != v { heartRate = v }
        }
        // iPhone のアプリが裏にいるときは送らない(届けると裏で起こすだけで、表示されない)
        guard let r = recordStartAt, SessionStore.shared.snapshot?.phoneActive == true,
              Date().timeIntervalSince(lastHeartRateSentAt) >= 5 else { return }
        lastHeartRateSentAt = Date()
        SessionStore.shared.sendHeartRate(bpm: bpm, recordStartAt: r)
    }
}
