import SwiftUI
import WatchKit

// 画面の小さい機種(40mm・41mm。幅 162/176pt、42mm 以上は 187pt〜)。休憩タイマーを1画面に収めるため、数字を一回り小さくする
// (シミュレータで、40mm では「前回」の行が画面の外に出ていた)
let isSmallWatch = WKInterfaceDevice.current().screenBounds.width < 180

// 色は iPhone アプリ(index.html の C)と Live Activity(RestActivityLiveActivity.swift)に揃える。
// 背景は OLED の黒に溶かし、面だけ C.surface で浮かせる。
enum Palette {
    static let surface = Color(red: 30 / 255, green: 32 / 255, blue: 35 / 255)
    static let surface2 = Color(red: 38 / 255, green: 41 / 255, blue: 45 / 255)
    static let text = Color(red: 242 / 255, green: 240 / 255, blue: 235 / 255)
    // iPhone 側(index.html の C.muted)と同じ値。#8E939A では手首で 10〜12pt の文字が読みにくかった
    static let muted = Color(red: 163 / 255, green: 168 / 255, blue: 176 / 255)
    static let green = Color(red: 76 / 255, green: 175 / 255, blue: 110 / 255)
    static let yellow = Color(red: 232 / 255, green: 179 / 255, blue: 60 / 255)
    static let red = Color(red: 226 / 255, green: 69 / 255, blue: 60 / 255)
    static let blue = Color(red: 61 / 255, green: 123 / 255, blue: 217 / 255)
}

// 数字は iPhone 版の Barlow Condensed に寄せて、縦長に詰めた太字
extension View {
    func numeric(_ size: CGFloat, weight: Font.Weight = .heavy) -> some View {
        font(.system(size: size, weight: weight)).fontWidth(.condensed).monospacedDigit()
    }
}

func formatWeight(_ v: Double) -> String {
    v == v.rounded() ? String(Int(v)) : String(format: "%g", v)
}

struct RootView: View {
    @ObservedObject var store: SessionStore
    // スクリーンショット用: -KurabellSample と一緒に -KurabellOpen <種目id> で種目画面から始める
    @State private var path: [String] = SampleData.launchValue("-KurabellOpen").map { [$0] } ?? []

    var body: some View {
        // 保存したら「お疲れ様でした」(改善要望 12)。シートで重ねると、休憩画面などの子のシートが出ている・閉じかけている
        // 間は出せずに終わり、値が残ったまま以後ずっと出なくなる(reviewer 指摘)。画面ごと差し替える
        // (NavigationStack ごと外れるので、子のシートも一緒に閉じる)
        if let f = store.showingFinished {
            FinishedView(finished: f, stats: store.workoutStats?.recordStartAt == f.id ? store.workoutStats : nil) {
                store.finishedDismissed(f)
            }
        } else {
            main
        }
    }

    private var main: some View {
        NavigationStack(path: $path) {
            if let s = store.snapshot {
                switch s.state {
                case .active: ExerciseListView(store: store, snap: s)
                case .menu: MenuView(snap: s)
                case .idle: IdleView()
                }
            } else {
                IdleView()
            }
        }
    }
}

// MARK: - 完了画面

// タップか15秒で閉じる。出たときに成功の振動を返す。15秒は画面を見ている(アクティブな)間だけ数える
// (ワークアウト中は手首を下ろしてもアプリが裏で動き続けるので、見ないうちに閉じてしまう。reviewer 指摘)。
// 心拍とカロリーは、この Watch がその記録のワークアウトを記録していたときだけ(iPhone は知らないので Watch の値)
struct FinishedView: View {
    let finished: WatchSnapshot.Finished
    let stats: SessionStore.WorkoutStats?
    let close: () -> Void
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(finished.title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Palette.text)
                Text(finished.stats.joined(separator: "  "))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.muted)
                VStack(alignment: .leading, spacing: 1) {
                    Text(finished.volume).numeric(26)
                        .foregroundStyle(Palette.text)
                    if !finished.lines.isEmpty {
                        Text(finished.lines.joined(separator: " "))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(finished.over ? Palette.green : Palette.muted)
                            .lineLimit(2)
                    }
                }
                .padding(.top, 2)
                if !finished.prs.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Label(finished.prTitle, systemImage: "bolt.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Palette.green)
                        ForEach(finished.prs, id: \.self) { name in
                            Text(name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
                        }
                    }
                    .padding(.top, 2)
                }
                if let s = stats, s.avgHeartRate != nil || s.kcal != nil {
                    HStack(spacing: 12) {
                        if let hr = s.avgHeartRate {
                            VStack(alignment: .leading, spacing: 0) {
                                Text(finished.hrLabel).font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.muted)
                                Text("\(Int(hr.rounded()))").numeric(20).foregroundStyle(Palette.text)
                            }
                        }
                        if let kcal = s.kcal {
                            VStack(alignment: .leading, spacing: 0) {
                                Text("kcal").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.muted)
                                Text("\(Int(kcal.rounded()))").numeric(20).foregroundStyle(Palette.text)
                            }
                        }
                    }
                    .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
            .contentShape(Rectangle())
            .onTapGesture { close() }
            // シートではないので × が無い。閉じる手段を見える形でも置く
            Button("OK") { close() }
                .buttonStyle(.borderedProminent)
                .tint(Palette.green)
                .padding(.top, 8)
        }
        .onAppear { WKInterfaceDevice.current().play(.success) }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            try? await Task.sleep(nanoseconds: 15_000_000_000)
            if !Task.isCancelled { close() }
        }
        .background(Color.black.ignoresSafeArea())
    }
}

// MARK: - 休憩

// アプリ内の休憩パネルと同じく、1分ごとに 緑 → 黄 → 赤
struct RestRow: View {
    let label: String
    let startAt: Date
    var compact = false   // 種目画面ではセット行が主役なので小さく

    var body: some View {
        TimelineView(.periodic(from: startAt, by: 1)) { ctx in
            let sec = ctx.date.timeIntervalSince(startAt)
            let color = sec < 60 ? Palette.green : sec < 120 ? Palette.yellow : Palette.red
            HStack(alignment: .firstTextBaseline) {
                Text(label).font(.system(size: compact ? 12 : 13, weight: .bold)).foregroundStyle(Palette.muted)
                Spacer()
                Text(timerInterval: startAt...startAt.addingTimeInterval(8 * 3600), countsDown: false)
                    .numeric(compact ? 20 : 30)
                    .foregroundStyle(color)
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}

// 一覧の上の休憩表示。タップすると大きいタイマー画面を開く
struct RestRowButton: View {
    @ObservedObject var store: SessionStore
    let label: String
    let startAt: Date
    var compact = false
    // スクリーンショット用: -KurabellSample と一緒に -KurabellRest 1 で、一覧からタイマー画面を開いた状態にする
    @State private var open = false

    init(store: SessionStore, label: String, startAt: Date, compact: Bool = false) {
        self.store = store
        self.label = label
        self.startAt = startAt
        self.compact = compact
        _open = State(initialValue: !compact && SampleData.launchValue("-KurabellRest") != nil)
    }

    var body: some View {
        Button { open = true } label: {
            RestRow(label: label, startAt: startAt, compact: compact)
                .contentShape(Rectangle()) // 文字の間(Spacer)を押しても開くように
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $open) { RestTimerView(store: store) }
    }
}

// 休憩中の全画面タイマー。経過を大きく、1分ごとの3分割ゲージ(アプリ内・Live Activity と同じ)、
// その下に次のセットと前回の実績。閉じる(左上の ×)とセット一覧に戻る。
struct RestTimerView: View {
    @ObservedObject var store: SessionStore

    var body: some View {
        if let snap = store.snapshot, let r = snap.restStartAt {
            let startAt = Date(timeIntervalSince1970: r / 1000)
            ScrollView {
                VStack(spacing: 4) {
                    TimelineView(.periodic(from: startAt, by: 1)) { ctx in
                        let sec = ctx.date.timeIntervalSince(startAt)
                        let color = sec < 60 ? Palette.green : sec < 120 ? Palette.yellow : Palette.red
                        VStack(spacing: 0) {
                            Text(snap.labels.rest)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Palette.muted)
                            Text(timerInterval: startAt...startAt.addingTimeInterval(8 * 3600), countsDown: false)
                                .numeric(isSmallWatch ? 38 : 46)
                                .foregroundStyle(color)
                                .multilineTextAlignment(.center)
                        }
                    }
                    MinuteGauge(startAt: startAt)
                        .padding(.horizontal, 6)
                    if let n = nextSet(snap) {
                        VStack(alignment: .leading, spacing: 2) {
                            // 「次」と番手・種目名を1行に(スクロールせずに前回の行まで見えるように)
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(snap.labels.next ?? "Next")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(Palette.muted)
                                Text(n.number).numeric(15, weight: .bold).foregroundStyle(Palette.muted)
                                Text(n.name)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Palette.text)
                                    .lineLimit(1)
                            }
                            // 次に挙げる重量×回数(今日入っている値。前回の複製から始まる)を大きく出し、
                            // 休憩中にプレートやピンの準備ができるようにする
                            HStack(alignment: .firstTextBaseline, spacing: 3) {
                                Text(n.set.weight.isEmpty ? "–" : n.set.weight).numeric(isSmallWatch ? 22 : 26)
                                Text(n.unit).font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.muted)
                                Text("×").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.muted)
                                Text(n.set.reps.isEmpty ? "–" : n.set.reps).numeric(isSmallWatch ? 22 : 26)
                            }
                            .foregroundStyle(Palette.text)
                            if let p = n.set.prev {
                                Text(prevLine(n.set, p, snap.labels))
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(Palette.muted)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Palette.surface))
                        .padding(.top, 2)
                    }
                    // 46mm で次のセットの「前回」の行までがスクロールせずに見える量なので、リングはその下(スクロールで見る)
                    if let v = snap.volume {
                        VolumeRow(volume: v)
                            .padding(.horizontal, 4)
                            .padding(.top, 6)
                    }
                }
            }
            // 後ろの画面(一覧の緑の数字など)が透けて見えないよう、背景は黒で塗る
            .background(Color.black.ignoresSafeArea())
            // 休憩画面を開いている間は、設定した経過時間に強めに振動する(改善要望 4a。通知とは別に)。
            // 休憩が替わったら(id が変わる)数え直す。過ぎた時間は鳴らさない
            .onAppear { store.restViewVisible = true }
            .onDisappear { store.restViewVisible = false }
            .task(id: r) {
                for m in store.restNoticeMinutes.sorted() {
                    let wait = startAt.addingTimeInterval(m * 60).timeIntervalSinceNow
                    guard wait > 0 else { continue }
                    try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
                    if Task.isCancelled { return }
                    WKInterfaceDevice.current().play(.notification)
                }
            }
        } else {
            // iPhone 側で休憩が止まった
            Image(systemName: "checkmark")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(Palette.muted)
        }
    }

    // 次にやるセット: 最初の未実施(RIR 未入力)の本番セット
    private func nextSet(_ snap: WatchSnapshot) -> (name: String, number: String, unit: String, set: WatchSnapshot.SetRow)? {
        for ex in snap.exercises {
            var n = 0
            for s in ex.sets {
                if s.warmup { continue }
                n += 1
                if s.rir == nil { return (ex.name, String(n), ex.unit, s) }
            }
        }
        return nil
    }

    // 前回と同じ重量・回数なら「前回 RIR1」だけ。変えている(重量を上げた等)なら前回の重量×回数も並べる
    private func prevLine(_ s: WatchSnapshot.SetRow, _ p: WatchSnapshot.Prev, _ labels: WatchSnapshot.Labels) -> String {
        let sameLoad = Double(s.weight) != nil && Double(s.weight) == Double(p.weight) && Int(s.reps) == Int(p.reps)
        if sameLoad, let r = p.rir { return "\(labels.prev) RIR\(r)" }
        return "\(labels.prev) \(p.text)"
    }
}

// 今日のボリュームを、基準(同じ Day の直近の平均など)で1周するリングで見せる(改善要望 8)。
// 超えたら緑で満たす。数字と「過去3回平均まで / あと480kg」は iPhone が作った文字をそのまま出す
struct VolumeRow: View {
    let volume: WatchSnapshot.Volume

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().stroke(Palette.surface2, lineWidth: 5)
                Circle()
                    .trim(from: 0, to: min(max(volume.ratio, 0), 1))
                    .stroke(volume.over ? Palette.green : Palette.text.opacity(0.85),
                            style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 34, height: 34)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(volume.now).numeric(18, weight: .bold).foregroundStyle(Palette.text)
                ForEach(Array(volume.lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(volume.over ? Palette.green : Palette.muted)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

// アプリ内の下部ゲージと同じ「1分ごとの3分割」。まだ来ていない分は灰色のまま、
// 経過した分だけその分の色(緑 → 黄 → 赤)で伸ばす。
private struct MinuteGauge: View {
    let startAt: Date
    var body: some View {
        TimelineView(.periodic(from: startAt, by: 1)) { ctx in
            let sec = ctx.date.timeIntervalSince(startAt)
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    let f = min(max((sec - Double(i) * 60) / 60, 0), 1)
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Palette.surface2)
                            Capsule().fill([Palette.green, Palette.yellow, Palette.red][i])
                                .frame(width: g.size.width * f)
                        }
                    }
                    .frame(height: 6)
                }
            }
        }
    }
}

// MARK: - 種目一覧

struct ExerciseListView: View {
    @ObservedObject var store: SessionStore
    let snap: WatchSnapshot

    private var currentId: String? {
        snap.exercises.first { ex in ex.sets.contains { !$0.warmup && $0.rir == nil } }?.id
    }

    var body: some View {
        List {
            // 休憩の経過は急ぐ情報なので先に、リングはその下に
            if let r = snap.restStartAt {
                RestRowButton(store: store, label: snap.labels.rest, startAt: Date(timeIntervalSince1970: r / 1000))
                    .listRowBackground(Color.clear)
            }
            if let v = snap.volume {
                VolumeRow(volume: v)
                    .listRowBackground(Color.clear)
            }
            ForEach(snap.exercises) { ex in
                NavigationLink(value: ex.id) {
                    ExerciseRow(ex: ex, isCurrent: ex.id == currentId)
                }
                .listRowBackground(RoundedRectangle(cornerRadius: 10)
                    .fill(ex.id == currentId ? Palette.surface2 : Palette.surface))
            }
        }
        .navigationTitle(snap.dayName ?? "")
        .navigationDestination(for: String.self) { id in
            ExerciseView(store: store, exId: id)
        }
    }
}

struct ExerciseRow: View {
    let ex: WatchSnapshot.Exercise
    let isCurrent: Bool

    var body: some View {
        let working = ex.sets.filter { !$0.warmup }
        let done = working.filter { $0.rir != nil }.count
        VStack(alignment: .leading, spacing: 4) {
            Text(ex.name)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(done == working.count && !working.isEmpty ? Palette.muted : Palette.text)
                .lineLimit(2)
            HStack(spacing: 3) {
                ForEach(Array(working.enumerated()), id: \.offset) { _, s in
                    Capsule()
                        .fill(s.rir != nil ? Palette.green : Palette.muted.opacity(0.35))
                        .frame(height: 4)
                }
                Text("\(done)/\(working.count)")
                    .numeric(13, weight: .semibold)
                    .foregroundStyle(isCurrent ? Palette.text : Palette.muted)
                    .padding(.leading, 4)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - 種目(セット一覧)

struct ExerciseView: View {
    @ObservedObject var store: SessionStore
    let exId: String
    // スクリーンショット用: -KurabellEdit <行番号> で入力画面を開いた状態から始める
    @State private var editing: Int? = SampleData.launchValue("-KurabellEdit").flatMap { Int($0) }

    var body: some View {
        if let snap = store.snapshot, let ex = snap.exercises.first(where: { $0.id == exId }) {
            let numbers = setNumbers(ex)
            List {
                if let r = snap.restStartAt {
                    RestRowButton(store: store, label: snap.labels.rest, startAt: Date(timeIntervalSince1970: r / 1000), compact: true)
                        .listRowBackground(Color.clear)
                }
                ForEach(Array(ex.sets.enumerated()), id: \.offset) { i, s in
                    Button { editing = i } label: {
                        SetRowView(set: s, number: numbers[i], ex: ex, labels: snap.labels)
                    }
                    .listRowBackground(RoundedRectangle(cornerRadius: 10).fill(Palette.surface))
                }
                Button { store.addSet(exId: ex.id) } label: {
                    Label(snap.labels.addSet, systemImage: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Palette.muted)
                }
                .listRowBackground(Color.clear)
            }
            .navigationTitle(ex.name)
            .sheet(item: Binding(get: { editing.map { EditTarget(index: $0) } },
                                 set: { editing = $0?.index })) { target in
                SetEditView(store: store, ex: ex, index: target.index, labels: snap.labels) {
                    editing = nil
                }
            }
        }
    }

    // ウォームアップは「W」、本番セットは 1, 2, 3…(index.html の wsIndex と同じ数え方)
    private func setNumbers(_ ex: WatchSnapshot.Exercise) -> [String] {
        var n = 0
        return ex.sets.map { s in
            if s.warmup { return "W" }
            n += 1
            return String(n)
        }
    }
}

private struct EditTarget: Identifiable {
    let index: Int
    var id: Int { index }
}

struct SetRowView: View {
    let set: WatchSnapshot.SetRow
    let number: String
    let ex: WatchSnapshot.Exercise
    let labels: WatchSnapshot.Labels

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(number)
                    .numeric(14, weight: .bold)
                    .foregroundStyle(Palette.muted)
                    .frame(width: 14, alignment: .leading)
                Text("\(set.weight.isEmpty ? "–" : set.weight)×\(set.reps.isEmpty ? "–" : set.reps)")
                    .numeric(22)
                    .foregroundStyle(set.isDone ? Palette.text : Palette.muted)
                Spacer(minLength: 0)
                if let rir = set.rir {
                    Text("RIR\(rir)").numeric(14, weight: .bold).foregroundStyle(Palette.green)
                }
            }
            if let p = set.prev {
                HStack(spacing: 4) {
                    Text("\(labels.prev) \(p.text)")
                    if let d = set.rirDiff() {
                        Text(d == 0 ? labels.same : "→ RIR\(d > 0 ? "+" : "")\(d)")
                            .foregroundStyle(d > 0 ? Palette.green : d < 0 ? Palette.yellow : Palette.muted)
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Palette.muted)
                .padding(.leading, 20)
            }
        }
        .padding(.vertical, 3)
    }
}

// MARK: - セット入力

// Digital Crown は使わない(ジムで回しにくく、腕の動きで誤って回ることもあるため)。
// 値は iPhone で入っているもの(前回の複製)から始まり、変えるときだけ −/+ を押す。
// いちばん多い「前回どおりにやって RIR だけ入れる」は、RIR を1回押すだけで済む。
struct SetEditView: View {
    @ObservedObject var store: SessionStore
    let ex: WatchSnapshot.Exercise
    let index: Int
    let labels: WatchSnapshot.Labels
    let done: () -> Void

    @State private var weight: Double = 0
    @State private var reps: Double = 0
    // −/+ を押していない値は、iPhone で入力されたままの文字列を送り返す
    // (Double に読めない "80,5" などを 0 で上書きしないため)
    @State private var weightTouched = false
    @State private var repsTouched = false
    // RIR を確定して休憩が始まったら、同じシートのままタイマー画面に切り替える
    // (シートを閉じてから別の画面を出すと、SwiftUI の表示の競合が起きやすいため)
    @State private var showRest = false

    private var row: WatchSnapshot.SetRow? { ex.sets.indices.contains(index) ? ex.sets[index] : nil }

    var body: some View {
        if showRest {
            RestTimerView(store: store)
        } else {
            editor
        }
    }

    private var editor: some View {
        // ScrollView で包まない: 包むと、スクロールかタップかを見分けるためにボタンの反応が遅れる
        // (シミュレータで、押した結果が次に押すまで出ない現象を確認)。46mm で1画面に収まる量にしてある
        Group {
            VStack(spacing: 4) {
                // 前回の値は、まとめて上に1行で出すのをやめ、重量・回数・RIR の各欄に分けて出す
                // (「前回 70kg×7 RIR0」を読んでから、どの欄の話かを頭の中で対応させる手間を無くす)。
                // 上の1行が無くなった分の高さで、46mm でも1画面に収まる
                ValueStepper(value: formatWeight(weight), caption: ex.weightLabel, shortCaption: ex.unit,
                        prev: row?.prev.map { "\(labels.prev) \(assistedMark($0))\($0.weight)" },
                        minus: { stepWeight(-1, $0) },
                        plus: { stepWeight(1, $0) })
                ValueStepper(value: String(Int(reps)), caption: labels.reps,
                        prev: row?.prev.map { "\(labels.prev) \($0.reps)" },
                        minus: { stepReps(-1, $0) },
                        plus: { stepReps(1, $0) })
                if row?.warmup == true {
                    Button("OK") { commit(rir: nil) }
                        .buttonStyle(.borderedProminent)
                        .tint(Palette.green)
                        .padding(.top, 4)
                } else {
                    HStack(spacing: 6) {
                        Text("\(labels.rirQuestion ?? "") (RIR)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Palette.muted)
                            .lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                        if let r = row?.prev?.rir {
                            Text("\(labels.prev) \(r)")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Palette.text)
                        }
                    }
                    .padding(.top, 2)
                    // いちばん押すボタンなので、スクロールせずに見える1行に並べる。
                    // 選択肢は iPhone と同じ 0/1/2/3+(3+ は 3 として保存)
                    HStack(spacing: 4) {
                        ForEach(0...3, id: \.self) { r in
                            Button { commit(rir: r) } label: {
                                Text(r == 3 ? "3+" : String(r))
                                    .numeric(20)
                                    .frame(maxWidth: .infinity, minHeight: 40)
                            }
                            .buttonStyle(PadButtonStyle(fill: row?.rir == r ? Palette.green : Palette.surface2,
                                                        shape: RoundedRectangle(cornerRadius: 8)))
                        }
                    }
                }
            }
        }
        .onAppear {
            weight = Double(row?.weight ?? "") ?? 0
            reps = Double(row?.reps ?? "") ?? 0
            weightTouched = false
            repsTouched = false
        }
    }

    // −/+ の1回分(改善要望 5)。押してすぐは今までどおり1刻み。押し続けると StepPad が繰り返し呼び、
    // 1.5秒を過ぎた分(.fast)は重量だけ 5kg(lb は 10)刻みに速める。速いときは刻みの倍数に揃える(61 → 65 → 70)。
    // 戻り値は「振動を返すか」。連続中は毎回ではなく、10kg(lb は 20)・5回の区切りをまたいだときだけ返す
    private func stepWeight(_ dir: Double, _ phase: StepPhase) -> Bool {
        let before = weight
        if phase == .fast {
            let fs: Double = ex.unit == "lb" ? 10 : 5
            weight = dir > 0 ? (floor(weight / fs + 1e-9) + 1) * fs : max(0, (ceil(weight / fs - 1e-9) - 1) * fs)
        } else {
            weight = max(0, weight + dir * ex.step)
        }
        weightTouched = true
        return phase == .tap || crossed(before, weight, every: ex.unit == "lb" ? 20 : 10)
    }

    private func stepReps(_ dir: Double, _ phase: StepPhase) -> Bool {
        let before = reps
        reps = max(0, reps + dir)
        repsTouched = true
        return phase == .tap || crossed(before, reps, every: 5)
    }

    private func crossed(_ a: Double, _ b: Double, every: Double) -> Bool {
        floor(a / every + 1e-9) != floor(b / every + 1e-9)
    }

    // 前回が補助ありだったときの印(「補」)。Prev に専用の項目は無いので、表示用の text の先頭で見分ける
    // (watch.js が text の先頭に labels.assisted を付けている)
    private func assistedMark(_ p: WatchSnapshot.Prev) -> String {
        guard let a = labels.assisted, !a.isEmpty, p.text.hasPrefix(a) else { return "" }
        return a
    }

    private func commit(rir: Int?) {
        let startedRest = store.commit(exId: ex.id, setIndex: index,
                                       weight: weightTouched ? formatWeight(weight) : (row?.weight ?? ""),
                                       reps: repsTouched ? String(Int(reps)) : (row?.reps ?? ""), rir: rir)
        if startedRest { showRest = true } else { done() }
    }
}

// 値を真ん中に、左右に大きめの −/+。汗や手袋でも押せるよう、ボタンは横 44pt を確保する。
private struct ValueStepper: View {
    let value: String
    let caption: String
    var shortCaption: String? = nil  // 幅が足りないときの見出し(例: 「重量 kg/片手」→「kg」)
    var prev: String? = nil   // 前回の値(例: 前回 70)。欄の下に、見出しより明るく出す
    let minus: (StepPhase) -> Bool
    let plus: (StepPhase) -> Bool

    var body: some View {
        HStack(spacing: 4) {
            stepButton("minus", action: minus)
            VStack(spacing: 0) {
                // 高さが足りないときに縮めない(小さい数字は手首で読みにくい)。横幅が足りないときだけ縮める
                Text(value).numeric(26).lineLimit(1).minimumScaleFactor(0.6).fixedSize(horizontal: false, vertical: true)
                // 40mm では「重量 kg 前回 80」が入りきらず「前回…」と切れた。入る形を順に試し、
                // 入らなければ見出しを短く(単位だけ)、それでも入らなければ前回の値だけにする
                ViewThatFits(in: .horizontal) {
                    captionRow(caption)
                    if let shortCaption { captionRow(shortCaption) }
                    if let prev {
                        Text(prev).font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.text)
                    }
                }
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            stepButton("plus", action: plus)
        }
    }

    private func stepButton(_ symbol: String, action: @escaping (StepPhase) -> Bool) -> some View {
        StepPad(symbol: symbol, action: action)
    }

    private func captionRow(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text(text).font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.muted)
            if let prev {
                Text(prev).font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.text)
            }
        }
        .fixedSize()
    }
}

// −/+ の1回分が、どの押し方で来たか
enum StepPhase { case tap, repeating, fast }

// −/+ は続けて何度も押すので、標準の Button ではなく「指が触れた瞬間」に反応させる。
// Button は指を離したときに確定し、素早く続けて押すと取りこぼした(シミュレータで3回押して1回しか増えない)。
// 入力画面は ScrollView で包まないので、スクロールのつもりで触れて誤って増減することはない。
// 押し続けると連続で入る(改善要望 5): 0.4秒で始まり1秒に約8回、1.5秒を過ぎると .fast(重量の刻みを大きく)。
// 指を離すとすぐ止まる。Digital Crown は使わない(2026-09-26 の判断のまま)。
private struct StepPad: View {
    let symbol: String
    let action: (StepPhase) -> Bool  // 戻り値が true のときだけ振動を返す
    // 触れている間だけ true。@GestureState は、指を離したときだけでなく、ジェスチャが途中で
    // 取り消されたときも必ず false に戻る(@State だと戻らずに次の接触を無視し続ける恐れがある)
    @GestureState private var pressed = false
    @State private var repeatTask: Task<Void, Never>?

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 18, weight: .bold))
            .frame(width: 50, height: 40)
            .background(Capsule().fill(Palette.surface2).brightness(pressed ? 0.15 : 0))
            .contentShape(Capsule())
            .scaleEffect(pressed ? 0.94 : 1)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .updating($pressed) { _, isDown, _ in
                        guard !isDown else { return } // 1回の接触で1回だけ(触れた瞬間)
                        isDown = true
                        DispatchQueue.main.async {
                            if action(.tap) { WKInterfaceDevice.current().play(.click) } // 押せたことを指先に返す
                            startRepeating()
                        }
                    }
            )
            // 離した・取り消された(pressed が false に戻った)ら、連続をすぐ止める
            .onChange(of: pressed) { _, isDown in
                if !isDown { repeatTask?.cancel(); repeatTask = nil }
            }
            .onDisappear { repeatTask?.cancel(); repeatTask = nil }
            .accessibilityElement()
            .accessibilityLabel(Text(symbol == "plus" ? "+" : "−"))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { _ = action(.tap) }
    }

    private func startRepeating() {
        repeatTask?.cancel()
        repeatTask = Task { @MainActor in
            let start = Date()
            try? await Task.sleep(nanoseconds: 400_000_000)
            while !Task.isCancelled && pressed {
                let phase: StepPhase = Date().timeIntervalSince(start) >= 1.5 ? .fast : .repeating
                if action(phase) { WKInterfaceDevice.current().play(.click) }
                try? await Task.sleep(nanoseconds: 125_000_000)
            }
        }
    }
}

// Watch の押しボタン共通の見た目と当たり判定。
// .plain スタイルに外から background を付けると、当たり判定が記号・数字の線だけになり、
// 「−」のような細い記号はほとんど押せなかった(実機で「回数の − の反応が悪い」)。
// 面をラベルの内側に描き、contentShape で面全体を押せる範囲にする。押している間は明るく縮めて反応を見せる。
struct PadButtonStyle<S: Shape>: ButtonStyle {
    var fill: Color
    var shape: S

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(shape.fill(fill).brightness(configuration.isPressed ? 0.15 : 0))
            .contentShape(shape)
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
    }
}

// MARK: - 記録前・未接続

struct MenuView: View {
    let snap: WatchSnapshot

    var body: some View {
        List {
            ForEach(snap.menu) { m in
                VStack(alignment: .leading, spacing: 2) {
                    Text(m.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                    if !m.detail.isEmpty {
                        Text(m.detail).font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.muted)
                    }
                }
                .listRowBackground(RoundedRectangle(cornerRadius: 10).fill(Palette.surface))
            }
            Text(snap.labels.startOnPhone)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Palette.muted)
                .listRowBackground(Color.clear)
        }
        .navigationTitle(snap.dayName ?? "")
    }
}

struct IdleView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone")
                .font(.system(size: 28))
                .foregroundStyle(Palette.muted)
            Text("idle.message")
                .font(.system(size: 14, weight: .medium))
                .multilineTextAlignment(.center)
                .foregroundStyle(Palette.text)
        }
        .padding()
    }
}
