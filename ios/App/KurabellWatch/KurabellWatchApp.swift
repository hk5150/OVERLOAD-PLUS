import SwiftUI

@main
struct KurabellWatchApp: App {
    @StateObject private var store = SessionStore.shared

    // 画面の表示を待たずに受信を始める(画面なしで起動されたときも未確認の op を送り直せるように)
    init() {
        SessionStore.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            // tint は付けない。緑は「進行・実施済み」だけに使い、戻る・閉じるはシステムの灰色のまま
            RootView(store: store)
        }
    }
}
