import Foundation
import HealthKit

// Watch のワークアウトセッション(筋トレ・屋内)。iPhone で記録を始めると、iPhone が
// HKHealthStore.startWatchApp で Watch アプリを起動し、ここで始まる(KurabellWatchApp の AppDelegate)。
// セッション中は、腕を下ろしても Watch が KURABELL の画面のまま保たれ、心拍・消費カロリーが記録される。
//
// 保存するかどうかは iPhone が決める(SessionStore.syncWorkout から呼ばれる):
// - iPhone で記録を保存した → その終了時刻で締めて保存し、"saved" を返す
// - iPhone で記録を破棄した・4時間を超えた・システムに止められた・保存に失敗した → 破棄し、"discarded" を返す
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

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var watchdog: Task<Void, Never>?
    private var endedWaiter: CheckedContinuation<Void, Never>?

    @Published private(set) var isRunning = false
    // start / finish / discard の途中(await の間)に、別のスナップショットで二重に呼ばれないように
    private(set) var isBusy = false
    // このワークアウトが対応する iPhone の記録の startAt(ms)。スナップショットで知る
    private(set) var recordStartAt: Double?
    private(set) var sessionStartMs: Double = 0

    func start(_ config: HKWorkoutConfiguration) async {
        guard !isBusy, HKHealthStore.isHealthDataAvailable() else { return }
        if isRunning {
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
        let energy = HKQuantityType(.activeEnergyBurned)
        let heartRate = HKQuantityType(.heartRate)
        do {
            // 初回だけ許可を求める(iPhone 側にも同じシートが出ることがある)
            try await store.requestAuthorization(toShare: [HKObjectType.workoutType(), energy],
                                                 read: [heartRate, energy])
            let session = try HKWorkoutSession(healthStore: store, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            session.delegate = self
            let now = Date()
            session.startActivity(with: now)
            try await builder.beginCollection(at: now)
            self.session = session
            self.builder = builder
            recordStartAt = nil
            sessionStartMs = now.timeIntervalSince1970 * 1000
            isRunning = true
            watchdog = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(Self.maxDuration * 1_000_000_000))
                guard !Task.isCancelled else { return }
                await self?.discard(report: true)
            }
        } catch {
            cleanUp()
            return
        }
        // 記録中のスナップショットが先に届いていれば、その場で対応付ける
        SessionStore.shared.workoutDidStart()
    }

    // スナップショットで分かった、この記録の startAt。開始時刻が離れすぎていれば対応付けない
    func attach(recordStartAt r: Double) -> Bool {
        guard isRunning, !isBusy, recordStartAt == nil else { return false }
        guard abs(sessionStartMs - r) <= Self.attachWindow * 1000 else { return false }
        recordStartAt = r
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
            if let record { SessionStore.shared.sendWorkoutEvent("saved", recordStartAt: record) }
        } catch {
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
        if report, let record { SessionStore.shared.sendWorkoutEvent("discarded", recordStartAt: record) }
        cleanUp()
    }

    private func endSession(_ session: HKWorkoutSession) async {
        guard session.state != .ended else { return }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            endedWaiter = cont
            session.end()
            // ended の通知が来なくても先へ進む(待ち続けて保存も破棄もできなくなるのを防ぐ)
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                self?.resumeEndedWaiter()
            }
        }
    }

    fileprivate func resumeEndedWaiter() {
        endedWaiter?.resume()
        endedWaiter = nil
    }

    // 自分で終わらせていないのにセッションが終わった(ほかのワークアウトアプリを始めた等)・失敗した
    fileprivate func sessionEndedUnexpectedly() {
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
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        Task { @MainActor in
            if self.endedWaiter != nil { self.resumeEndedWaiter() } else { self.sessionEndedUnexpectedly() }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in self.sessionEndedUnexpectedly() }
    }
}
