import Foundation
import HealthKit

// ヘルスケア(HealthKit)連携のネイティブ処理本体。Capacitorには依存しない(ブリッジはHealthPlugin.swift)。
// 設計判断は docs/ヘルスケア連携.md。
//
// 扱うのは3つだけ: ワークアウトの書き込み(ウエイトトレーニング、時刻のみ。消費カロリーは書かない)、
// 体重の読み込み、体重の書き込み。
final class HealthManager {
    static let shared = HealthManager()
    private init() {}

    private let store = HKHealthStore()
    private let workoutType = HKObjectType.workoutType()
    private let bodyMassType = HKQuantityType.quantityType(forIdentifier: .bodyMass)!
    private let kg = HKUnit.gramUnit(with: .kilo)

    // iPhoneでは常にtrue。iPadOS 17未満などヘルスケアが無い端末ではfalse。
    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    // 権限シートは種類ごとに一度しか出ない。2回目以降は何も表示せずに返る。
    func requestAuthorization() async throws {
        try await store.requestAuthorization(toShare: [workoutType, bodyMassType], read: [bodyMassType])
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

    // このアプリが書いた分だけが対象(他のアプリのデータは消せない仕様だが、述語でも絞る)。
    func deleteWorkout(key: String) async throws -> Int {
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
            HKQuery.predicateForObjects(from: HKSource.default()),
            HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier,
                                        allowedValues: [syncIdentifier(key)]),
        ])
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
