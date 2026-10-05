import Foundation

// 画面を作るとき・スクリーンショットを撮るとき用の固定データ。
// 起動引数 -KurabellSample のときだけ使い、iPhone との同期は行わない。
enum SampleData {
    // -KurabellSample のときだけ、続く引数の値を返す(画面を直接開くため)
    static func launchValue(_ key: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("-KurabellSample"), let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    static func snapshot(now: Date) -> WatchSnapshot {
        // -KurabellLang en で英語の固定データ(英語ストア用のスクリーンショット。文言は index.html の i18n と同じ、単位は lb)
        if launchValue("-KurabellLang") == "en" { return snapshotEn(now: now) }
        let ms = now.timeIntervalSince1970 * 1000
        func row(_ w: String, _ r: String, _ rir: Int?, prev: (String, String, Int?)?, warmup: Bool = false) -> WatchSnapshot.SetRow {
            .init(weight: w, reps: r, rir: rir, warmup: warmup,
                  prev: prev.map { .init(text: "\($0.0)kg×\($0.1)" + ($0.2.map { " RIR\($0)" } ?? ""),
                                         weight: $0.0, reps: $0.1, rir: $0.2) })
        }
        return WatchSnapshot(
            v: 1, sentAt: ms, state: .active, restStartAt: ms - 47_000, dayName: "Day A 胸・三頭",
            labels: .init(rest: "インターバル", restBody: "{n}分経過しました。次のセットへ。", prev: "前回", same: "→ 同じ", reps: "回",
                          startOnPhone: "iPhoneで記録を開始してください", warmup: "W", addSet: "セットを追加", rirQuestion: "あと何回できた?", next: "次"),
            exercises: [
                .init(id: "a1", name: "ベンチプレス", weightLabel: "重量 kg", unit: "kg", step: 1, restAfter: true, sets: [
                    row("40", "10", nil, prev: nil, warmup: true),
                    row("80", "8", 2, prev: ("80", "8", 1)),
                    row("80", "8", 1, prev: ("80", "7", 1)),
                    row("80", "7", nil, prev: ("77.5", "8", 0)),
                ]),
                .init(id: "a2", name: "インクラインダンベルプレス", weightLabel: "重量 kg/片手", unit: "kg", step: 1, restAfter: true, sets: [
                    row("26", "10", nil, prev: ("26", "10", 2)),
                    row("26", "10", nil, prev: ("26", "9", 1)),
                    row("26", "9", nil, prev: ("26", "8", 0)),
                ]),
                .init(id: "a3", name: "ディップス", weightLabel: "加重 kg", unit: "kg", step: 1, restAfter: true, sets: [
                    row("10", "8", nil, prev: ("10", "8", 2)),
                    row("10", "8", nil, prev: ("10", "7", 1)),
                ]),
                .init(id: "a4", name: "ケーブルプレスダウン", weightLabel: "重量 kg", unit: "kg", step: 1, restAfter: true, sets: [
                    row("30", "12", nil, prev: ("30", "12", 2)),
                    row("30", "12", nil, prev: ("30", "11", 1)),
                ]),
            ],
            menu: [],
            applied: [],
            volume: .init(ratio: 0.62, now: "2,480kg", lines: ["過去3回平均まで", "あと1,520kg"], over: false)
        )
    }

    static func finished(now: Date) -> WatchSnapshot.Finished {
        let ms = now.timeIntervalSince1970 * 1000
        if launchValue("-KurabellLang") == "en" {
            return .init(id: ms - 3_000_000, endAt: ms, title: "Great work", stats: ["52 min", "4 exercises · 12 sets"],
                         volume: "10,650lb", lines: ["+230lb", "vs last-3 avg"], over: true,
                         prTitle: "New 1RM", prs: ["Bench Press"], hrLabel: "Avg HR")
        }
        return .init(id: ms - 3_000_000, endAt: ms, title: "お疲れ様でした", stats: ["52分", "4種目・12セット"],
                     volume: "4,830kg", lines: ["過去3回平均", "+105kg"], over: true,
                     prTitle: "1RM更新", prs: ["ベンチプレス"], hrLabel: "平均心拍")
    }

    static func snapshotEn(now: Date) -> WatchSnapshot {
        let ms = now.timeIntervalSince1970 * 1000
        func row(_ w: String, _ r: String, _ rir: Int?, prev: (String, String, Int?)?, warmup: Bool = false) -> WatchSnapshot.SetRow {
            .init(weight: w, reps: r, rir: rir, warmup: warmup,
                  prev: prev.map { .init(text: "\($0.0)lb×\($0.1)" + ($0.2.map { " RIR\($0)" } ?? ""),
                                         weight: $0.0, reps: $0.1, rir: $0.2) })
        }
        return WatchSnapshot(
            v: 1, sentAt: ms, state: .active, restStartAt: ms - 47_000, dayName: "Push",
            labels: .init(rest: "Rest", restBody: "{n} min elapsed. Time for your next set.", prev: "Last", same: "→ same", reps: "Reps",
                          startOnPhone: "Start a workout on your iPhone to log sets here", warmup: "W", addSet: "Add set", rirQuestion: "Reps left?", next: "Next"),
            exercises: [
                .init(id: "a1", name: "Bench Press", weightLabel: "Weight lb", unit: "lb", step: 2.5, restAfter: true, sets: [
                    row("95", "10", nil, prev: nil, warmup: true),
                    row("155", "8", 2, prev: ("155", "8", 1)),
                    row("155", "8", 1, prev: ("155", "7", 1)),
                    row("155", "7", nil, prev: ("150", "8", 0)),
                ]),
                .init(id: "a2", name: "Incline Dumbbell Press", weightLabel: "Weight lb/hand", unit: "lb", step: 2.5, restAfter: true, sets: [
                    row("55", "10", nil, prev: ("55", "10", 2)),
                    row("55", "10", nil, prev: ("55", "9", 1)),
                    row("55", "9", nil, prev: ("55", "8", 0)),
                ]),
                .init(id: "a3", name: "Dips", weightLabel: "Added lb", unit: "lb", step: 2.5, restAfter: true, sets: [
                    row("25", "8", nil, prev: ("25", "8", 2)),
                    row("25", "8", nil, prev: ("25", "7", 1)),
                ]),
                .init(id: "a4", name: "Cable Pressdown", weightLabel: "Weight lb", unit: "lb", step: 2.5, restAfter: true, sets: [
                    row("65", "12", nil, prev: ("65", "12", 2)),
                    row("65", "12", nil, prev: ("65", "11", 1)),
                ]),
            ],
            menu: [],
            applied: [],
            volume: .init(ratio: 0.62, now: "5,470lb", lines: ["3,350lb short of", "last-3 avg"], over: false)
        )
    }
}
