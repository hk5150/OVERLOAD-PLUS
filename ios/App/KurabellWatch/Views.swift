import SwiftUI

// 色は iPhone アプリ(index.html の C)と Live Activity(RestActivityLiveActivity.swift)に揃える。
// 背景は OLED の黒に溶かし、面だけ C.surface で浮かせる。
enum Palette {
    static let surface = Color(red: 30 / 255, green: 32 / 255, blue: 35 / 255)
    static let surface2 = Color(red: 38 / 255, green: 41 / 255, blue: 45 / 255)
    static let text = Color(red: 242 / 255, green: 240 / 255, blue: 235 / 255)
    static let muted = Color(red: 142 / 255, green: 147 / 255, blue: 154 / 255)
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

// MARK: - 種目一覧

struct ExerciseListView: View {
    @ObservedObject var store: SessionStore
    let snap: WatchSnapshot

    private var currentId: String? {
        snap.exercises.first { ex in ex.sets.contains { !$0.warmup && $0.rir == nil } }?.id
    }

    var body: some View {
        List {
            if let r = snap.restStartAt {
                RestRow(label: snap.labels.rest, startAt: Date(timeIntervalSince1970: r / 1000))
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
                    RestRow(label: snap.labels.rest, startAt: Date(timeIntervalSince1970: r / 1000), compact: true)
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

struct SetEditView: View {
    @ObservedObject var store: SessionStore
    let ex: WatchSnapshot.Exercise
    let index: Int
    let labels: WatchSnapshot.Labels
    let done: () -> Void

    enum Field { case weight, reps }
    @State private var weight: Double = 0
    @State private var reps: Double = 0
    // Crown を回していない値は、iPhone で入力されたままの文字列を送り返す
    // (Double に読めない "80,5" などを 0 で上書きしないため)
    @State private var weightTouched = false
    @State private var repsTouched = false
    @FocusState private var focus: Field?

    private var row: WatchSnapshot.SetRow? { ex.sets.indices.contains(index) ? ex.sets[index] : nil }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                if let p = row?.prev {
                    Text("\(labels.prev) \(p.text)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Palette.muted)
                }
                HStack(spacing: 6) {
                    field(.weight, value: formatWeight(weight), caption: ex.weightLabel)
                        .digitalCrownRotation($weight, from: 0, through: 999, by: ex.step,
                                              sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                        .onChange(of: weight) { weightTouched = true }
                    field(.reps, value: String(Int(reps)), caption: labels.reps)
                        .digitalCrownRotation($reps, from: 0, through: 100, by: 1,
                                              sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                        .onChange(of: reps) { repsTouched = true }
                }
                if row?.warmup == true {
                    Button("OK") { commit(rir: nil) }
                        .buttonStyle(.borderedProminent)
                        .tint(Palette.green)
                } else {
                    Text("\(labels.rirQuestion ?? "") (RIR)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 2)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 2), spacing: 4) {
                        // iPhone の RIR 選択肢(0/1/2/3+、3+ は 3 として保存)と同じ
                        ForEach(0...3, id: \.self) { r in
                            Button { commit(rir: r) } label: {
                                Text(r == 3 ? "3+" : String(r))
                                    .numeric(20)
                                    .frame(maxWidth: .infinity, minHeight: 34)
                            }
                            .buttonStyle(.plain)
                            .background(RoundedRectangle(cornerRadius: 8)
                                .fill(row?.rir == r ? Palette.green : Palette.surface2))
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
            focus = .weight
        }
    }

    private func field(_ f: Field, value: String, caption: String) -> some View {
        VStack(spacing: 0) {
            Text(value).numeric(30)
            Text(caption).font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.muted).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 8)
            .stroke(focus == f ? Palette.green : Palette.surface2, lineWidth: 2))
        .focusable()
        .focusEffectDisabled() // 枠線で示すので、システムのフォーカスの光は消す
        .focused($focus, equals: f)
        .onTapGesture { focus = f }
    }

    private func commit(rir: Int?) {
        store.commit(exId: ex.id, setIndex: index,
                     weight: weightTouched ? formatWeight(weight) : (row?.weight ?? ""),
                     reps: repsTouched ? String(Int(reps)) : (row?.reps ?? ""), rir: rir)
        done()
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
