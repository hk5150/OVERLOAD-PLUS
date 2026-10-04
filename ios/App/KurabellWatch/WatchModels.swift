import Foundation

// iPhone(index.html の src/domain/watch.js の buildWatchSnapshot)から届く表示用スナップショット。
// 表示文字列・単位換算・ダンベル片手表記はすべて iPhone 側で済ませてあり、Watch は並べるだけ。
// 重量・回数は today と同じ「表示単位の文字列」で持つ(Watch で kg/lb を換算しない)。
struct WatchSnapshot: Codable, Equatable {
    enum State: String, Codable { case active, menu, idle }

    var v: Int
    var sentAt: Double              // ms
    var state: State
    var restStartAt: Double?        // ms。nil なら休憩していない
    var dayName: String?
    var labels: Labels
    var exercises: [Exercise]
    var menu: [MenuItem]
    var applied: [String]?          // iPhone が today に合流済みの opId(直近のもの)
    var recordStartAt: Double? = nil    // 記録中なら、その記録の startAt(ms)。Watch のワークアウトと対応付ける
    var lastSaved: LastSaved? = nil     // 直近に保存した記録。Watch のワークアウトを保存するか破棄するかの判断に使う
    var volume: Volume? = nil           // 今日のボリュームと基準(改善要望 8)。記録中で、比べる基準があるときだけ

    // 計算と文言は iPhone 側(index.html の compareBase・volumeGoalKey)。Watch はリングと文字を並べるだけ
    struct Volume: Codable, Equatable {
        var ratio: Double           // 基準に対する割合(1 で1周)
        var now: String             // 今日のボリューム(表示用。例: 2,480kg)
        var lines: [String]         // 例: ["過去3回平均まで", "あと480kg"] / ["過去3回平均", "+105kg"]
        var over: Bool              // 基準を超えたか
    }

    struct LastSaved: Codable, Equatable {
        var key: String             // ヘルスケアの紐づけキー(記録の startAt の ISO 文字列)
        var startAt: Double         // ms
        var endAt: Double           // ms(ワークアウトの終了時刻にする)
    }

    struct Labels: Codable, Equatable {
        var rest: String            // インターバル / Rest
        var restBody: String        // 休憩通知の本文。{n} に経過分が入る(i18n の rest.notifyBody)
        var prev: String            // 前回 / Last
        var same: String            // → 同じ / → same
        var reps: String            // 回 / reps
        var startOnPhone: String    // iPhoneで記録を開始してください
        var warmup: String          // W
        var addSet: String          // セットを追加
        var rirQuestion: String?    // あと何回できた?(RIR の入力の見出し)
        var next: String?           // 次 / Next(休憩画面の「次のセット」)
        var assisted: String?       // 補 / A(補助ありの印。iPhone は以前から labels ごと送っている)
    }

    struct Exercise: Codable, Equatable, Identifiable {
        var id: String
        var name: String
        var weightLabel: String     // 重量 / 重量(片手) / 加重
        var unit: String            // kg / lb
        var step: Double            // −/+ 1回で動く重量(表示単位。kg なら 1、lb なら 2.5。src/domain/watch.js の watchWeightStep)
        var restAfter: Bool         // RIR を入れたら休憩を始めるか(スーパーセットの途中は false)
        var sets: [SetRow]
    }

    struct SetRow: Codable, Equatable {
        var weight: String
        var reps: String
        var rir: Int?               // nil = 未実施(RIR が入って初めて実施済み)
        var warmup: Bool
        var prev: Prev?             // 前回の同じ番手のセット

        var isDone: Bool { warmup ? !(reps.isEmpty) : rir != nil }
    }

    struct Prev: Codable, Equatable {
        var text: String            // 表示用(例: 80kg×8 RIR2)
        var weight: String
        var reps: String
        var rir: Int?
    }

    struct MenuItem: Codable, Equatable, Identifiable {
        var name: String
        var detail: String          // 前回の実績(整形済み)
        var id: String { name }
    }
}

// Watch → iPhone の操作。iPhone 側の applyWatchOps が today に合流させる。
// kind: "add"(行の追加)/ "set"(その行の値を確定)。届く順番が入れ替わっても同じ結果になるよう、
// 規則は applyWatchOps と SessionStore.apply で揃えてある。
struct WatchOp: Codable, Equatable {
    var opId: String
    var kind: String
    var exId: String
    var setIndex: Int
    var weight: String
    var reps: String
    var rir: Int?
    var restStartAt: Double?        // この op で休憩を始めたなら、その時刻(ms)
    var at: Double                  // ms
    // kind "workout" のときだけ: Watch がワークアウトを始めた知らせ(iPhone はその記録をヘルスケアに書かない)
    var status: String? = nil
    var recordStartAt: Double? = nil
}

extension WatchSnapshot.SetRow {
    // 前回と同じ重量・回数のときだけ RIR の差分を出す(index.html のゴースト表示と同じ条件)
    func rirDiff() -> Int? {
        guard let p = prev, let now = rir, let before = p.rir,
              let w1 = Double(weight), let w2 = Double(p.weight), w1 == w2,
              Int(reps) == Int(p.reps) else { return nil }
        return now - before
    }
}
