import Foundation
#if canImport(ActivityKit)
import ActivityKit

// 休憩タイマーのLive Activityの型。App(RestTimerManager)と拡張(RestActivity)の両方で
// コンパイルする共有ファイル。ActivityKitは型名で照合するので、定義は必ずこの1つだけにする。
//
// タイマーはカウントアップなので、表示に必要なのは開始時刻だけ(経過はシステムが
// Text(timerInterval:)で描き続ける。アプリが止まっていても進む)。
// titleをここ(ContentState)に入れるのは、アプリ内で言語を切り替えたときにupdateで追従させるため。
@available(iOS 16.2, *)
struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var startedAt: Date
        // この時刻を過ぎたら放置とみなし、拡張側は動く数字をやめて固定表示にする
        // (JSのREST_ACTIVITY_STALE_MINUTESから計算された値。staleDateにも同じ値を渡す)。
        var staleAt: Date
        var title: String
    }
}
#endif
