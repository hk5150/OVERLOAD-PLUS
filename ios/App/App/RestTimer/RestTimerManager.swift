import Foundation
import UserNotifications
#if canImport(ActivityKit)
import ActivityKit
#endif

// 休憩タイマーのネイティブ処理本体。Capacitorには依存しない(ブリッジはRestTimerPlugin.swift)。
// 設計判断は docs/休憩タイマー通知.md。
@MainActor
final class RestTimerManager {
    static let shared = RestTimerManager()
    private init() {}

    struct RestNotification {
        let id: String
        let title: String
        let body: String
        let threadIdentifier: String?
        let at: Date
    }

    // 休憩の経過通知を予約する。@capacitor/local-notificationsはinterruptionLevelを扱えないため、
    // 予約だけをここで行う。IDはLocalNotificationsと同じ文字列("4201"等)なので、
    // キャンセルや配信済みの削除は従来どおりLocalNotifications経由で効く。
    //
    // Time Sensitiveは「ユーザーが自分で始めた休憩タイマーの経過」専用。集中モード中でも
    // 届くようにするための指定なので、宣伝やお知らせなど他の通知には絶対に付けないこと
    // (App Store審査・HIGの趣旨: 今すぐ必要な情報だけに使う)。
    func schedule(_ items: [RestNotification]) async throws {
        let center = UNUserNotificationCenter.current()
        for item in items {
            let interval = item.at.timeIntervalSinceNow
            guard interval > 0 else { continue }
            let content = UNMutableNotificationContent()
            content.title = item.title
            content.body = item.body
            // 正式な既定音。LocalNotifications経由では"default"という存在しないファイル名で
            // 既定音にフォールバックさせていた(v109)が、こちらではその経験則に頼らない。
            content.sound = .default
            content.interruptionLevel = .timeSensitive
            if let thread = item.threadIdentifier { content.threadIdentifier = thread }
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            try await center.add(UNNotificationRequest(identifier: item.id, content: content, trigger: trigger))
        }
    }

    // Live Activityを「表示しておくべき状態」に合わせる。何度呼んでも結果は同じ
    // (JSのeffectから繰り返し呼ばれる前提。開始/終了の2本に分けると二重作成やちらつきの元になる)。
    //  - startedAtがnil: 残っているActivityをすべて即時に終了(「終了」ボタン・前回の残骸・放置)
    //  - 既存があれば中身が違うときだけupdate、2件目以降は終了
    //  - 無ければ作る(Activity.requestは前面でしか成功しないので、失敗は無視する)
    @available(iOS 16.2, *)
    func syncActivity(startedAt: Date?, staleAt: Date?, title: String) async {
        let current = Activity<RestTimerAttributes>.activities
        guard let startedAt, let staleAt else {
            for activity in current { await activity.end(nil, dismissalPolicy: .immediate) }
            return
        }
        let state = RestTimerAttributes.ContentState(startedAt: startedAt, staleAt: staleAt, title: title)
        let content = ActivityContent(state: state, staleDate: staleAt)
        let alive = current.filter { $0.activityState == .active || $0.activityState == .stale }
        // 8時間の上限などでシステムが終了させたものはロック画面にしばらく残るので、新しい表示と
        // 並ばないように消しておく。
        for ended in current where ended.activityState == .ended {
            await ended.end(nil, dismissalPolicy: .immediate)
        }
        if let first = alive.first {
            for extra in alive.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
            if first.content.state != state { await first.update(content) }
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        do {
            _ = try Activity.request(attributes: RestTimerAttributes(), content: content, pushType: nil)
        } catch {
            // 前面以外では失敗するのが仕様なので握りつぶすが、実機で出ない原因を追えるよう残す
            NSLog("[RestTimer] Activity.request failed: \(error.localizedDescription)")
        }
    }
}
