import WidgetKit
import SwiftUI

// 休憩タイマーのLive Activityだけを持つウィジェット拡張(ホーム画面ウィジェットは無い)。
@main
struct RestActivityBundle: WidgetBundle {
    var body: some Widget {
        RestActivityLiveActivity()
    }
}
