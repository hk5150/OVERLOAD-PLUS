import Foundation
import HealthKit

// ヘルスケア(HealthKit)連携のネイティブ処理本体。Capacitorには依存しない(ブリッジはHealthPlugin.swift)。
// 設計判断は docs/ヘルスケア連携.md。
//
// 扱うのは: ワークアウトの書き込み(ウエイトトレーニング、時刻のみ。消費カロリーは書かない)、
// 体重の読み込み、体重の書き込み、Watch アプリの起動(Watch 側でワークアウトを始める)。
// Watch でワークアウトを記録した回は、心拍・カロリー付きのワークアウトを Watch が保存し、
// iPhone はここで書かない(二重にしない。判断は JS 側の saveWorkout。docs/Watchアプリ.md)。
final class HealthManager {
    static let shared = HealthManager()
    private init() {}

    private let store = HKHealthStore()
    private let workoutType = HKObjectType.workoutType()
    private let bodyMassType = HKQuantityType.quantityType(forIdentifier: .bodyMass)!
    private let kg = HKUnit.gramUnit(with: .kilo)

    // iPhoneでは常にtrue。iPadOS 17未満などヘルスケアが無い端末ではfalse。
    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    // Watch アプリがワークアウトに使う種類(WorkoutManager.swift の requestAuthorization と揃える。テストで縛ってある)。
    // Watch は startWatchApp で裏から起こされるので、権限シートを出せずにワークアウトが始まらない。
    // 許可は iPhone のアプリと共有されるので、iPhone 側で先に求めておく(1.1 (6) の実機で踏んだ)。
    // iPhone はこれらを書かない・使わない。許可を求めるだけ。
    private let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
    private let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)!

    // 権限シートは種類ごとに一度しか出ない。2回目以降は何も表示せずに返る。
    // includeWatch: Watch アプリが入っているときだけ、Watch 用の種類も求める
    func requestAuthorization(includeWatch: Bool) async throws {
        var share: Set<HKSampleType> = [workoutType, bodyMassType]
        var read: Set<HKObjectType> = [bodyMassType]
        if includeWatch {
            share.insert(energyType)
            read.formUnion([heartRateType, energyType])
        }
        try await store.requestAuthorization(toShare: share, read: read)
    }

    // 書き込みの権限だけは状態を取れる(読み込みの許否はHealthKitの仕様で知る方法が無い)。
    func authorizationStatus() -> (workout: String, bodyMass: String) {
        func name(_ s: HKAuthorizationStatus) -> String {
            switch s {
            case .sharingAuthorized: return "authorized"
            case .sharingDenied: return "denied"
            default: return "notDetermined"
            }
        }
        return (name(store.authorizationStatus(for: workoutType)),
                name(store.authorizationStatus(for: bodyMassType)))
    }

    // アプリ側の記録とはstartAt(ISO文字列)で紐づける。記録には一意なIDが無く、
    // startAtは保存後に変わらない(SQLite・JSONバックアップを往復しても残る)ため。
    private func syncIdentifier(_ key: String) -> String { "kurabell-workout-\(key)" }

    // syncIdentifierは削除時の検索キー。同じ値・同じSyncVersionで二度書いた場合は置き換わらない
    // (HealthKitは版が大きいときだけ置き換える)。UIからは同じ記録を二度書く経路は無い。
    func saveWorkout(key: String, start: Date, end: Date) async throws {
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        // 計測を始めずに保存した記録は開始と終了が同じ時刻になる。長さ0のワークアウトは
        // ヘルスケアで扱いが不安定なので、アプリの表示(最短1分)に合わせて1分前から始める。
        let startDate = end > start ? start : end.addingTimeInterval(-60)
        try await builder.beginCollection(at: startDate)
        try await builder.endCollection(at: end)
        try await builder.addMetadata([
            HKMetadataKeySyncIdentifier: syncIdentifier(key),
            HKMetadataKeySyncVersion: 1,
            HKMetadataKeyIndoorWorkout: true,
        ])
        _ = try await builder.finishWorkout()
    }

    // 記録を開始したときに Watch アプリを起動し、筋トレのワークアウトを始めさせる。
    // Watch 側は WKApplicationDelegate.handle(_ workoutConfiguration:) で受ける(KurabellWatchApp.swift)。
    // Watch がペアになっていない・Watch アプリが入っていないときは失敗する(呼び出し側は無視してよい)。
    func startWatchApp() async throws {
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            store.startWatchApp(with: config) { ok, error in
                if let error { cont.resume(throwing: error) }
                else if !ok { cont.resume(throwing: NSError(domain: "HealthManager", code: 1)) }
                else { cont.resume() }
            }
        }
    }

    // 同じ syncIdentifier のワークアウトを消す。Watch アプリが保存した分(ソースが Watch アプリ)も
    // 対象にするため、ソースでは絞らない。HealthKit はほかのアプリのデータを消させないうえ、
    // syncIdentifier はこのアプリ固有の接頭辞付きなので、ほかのアプリの記録に当たることはない。
    func deleteWorkout(key: String) async throws -> Int {
        let predicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier,
                                                    allowedValues: [syncIdentifier(key)])
        return try await withCheckedThrowingContinuation { cont in
            store.deleteObjects(of: workoutType, predicate: predicate) { _, count, error in
                if let error { cont.resume(throwing: error) } else { cont.resume(returning: count) }
            }
        }
    }

    // 最新の体重1件。無い(または読み込みを拒否されている)ときはnil。
    func latestBodyMass() async throws -> (kg: Double, date: Date)? {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        return try await withCheckedThrowingContinuation { cont in
            let query = HKSampleQuery(sampleType: bodyMassType, predicate: nil, limit: 1,
                                      sortDescriptors: [sort]) { [kg] _, samples, error in
                if let error {
                    // 読み込みを拒否されている・データが無いときもここに来ることがある。どちらも「無し」扱い。
                    if (error as? HKError)?.code == .errorNoData { cont.resume(returning: nil); return }
                    cont.resume(throwing: error)
                    return
                }
                guard let s = samples?.first as? HKQuantitySample else { cont.resume(returning: nil); return }
                cont.resume(returning: (s.quantity.doubleValue(for: kg), s.endDate))
            }
            store.execute(query)
        }
    }

    // 保存したサンプルの日時を返す。JS側はこれを「最後に同期した日時」にするので、
    // 次の読み込みで自分が書いた値を拾い直しても反映しない(書き戻しのループが起きない)。
    func saveBodyMass(kg value: Double) async throws -> Date {
        let now = Date()
        let sample = HKQuantitySample(type: bodyMassType, quantity: HKQuantity(unit: kg, doubleValue: value),
                                      start: now, end: now)
        try await store.save(sample)
        return now
    }
}
