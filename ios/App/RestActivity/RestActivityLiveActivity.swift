import ActivityKit
import WidgetKit
import SwiftUI

// 休憩タイマー(カウントアップ)のロック画面・Dynamic Island表示。
// アプリが止まっていても数字とゲージが進むように、すべてシステムが描く
// Text(timerInterval:)とProgressView(timerInterval:)で組む(アプリから毎秒updateはしない)。
// 色はアプリ内のパネル(index.htmlのC.green / C.yellow / C.red / C.surface)に合わせる。
private enum Palette {
    static let green = Color(red: 76 / 255, green: 175 / 255, blue: 110 / 255)
    static let yellow = Color(red: 232 / 255, green: 179 / 255, blue: 60 / 255)
    static let red = Color(red: 226 / 255, green: 69 / 255, blue: 60 / 255)
    static let surface = Color(red: 30 / 255, green: 32 / 255, blue: 35 / 255)
    static let muted = Color(red: 142 / 255, green: 147 / 255, blue: 154 / 255)
}

// 8時間はLive Activityのシステム上限。これより長い範囲を渡す意味はない。
private func elapsedRange(_ s: RestTimerAttributes.ContentState) -> ClosedRange<Date> {
    s.startedAt...s.startedAt.addingTimeInterval(8 * 3600)
}

// staleAt(放置とみなす時刻)を過ぎたときの固定表示。例: 30分なら "30:00+"。
private func staleLabel(_ s: RestTimerAttributes.ContentState) -> String {
    let minutes = Int(s.staleAt.timeIntervalSince(s.startedAt) / 60)
    return "\(minutes):00+"
}

// アプリ内の下部ゲージと同じ「1分ごとの3分割」。各セグメントが自分の1分の間だけ伸びる。
private struct MinuteGauge: View {
    let startedAt: Date
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                ProgressView(
                    timerInterval: startedAt.addingTimeInterval(Double(i) * 60)...startedAt.addingTimeInterval(Double(i + 1) * 60),
                    countsDown: false,
                    label: { EmptyView() },
                    currentValueLabel: { EmptyView() }
                )
                .tint([Palette.green, Palette.yellow, Palette.red][i])
            }
        }
    }
}

private struct ElapsedText: View {
    let state: RestTimerAttributes.ContentState
    let isStale: Bool
    var size: CGFloat
    var body: some View {
        Group {
            if isStale {
                Text(staleLabel(state)).foregroundStyle(Palette.muted)
            } else {
                Text(timerInterval: elapsedRange(state), countsDown: false).foregroundStyle(.white)
            }
        }
        // アプリ本体の数字(Barlow Condensed)に寄せて、縦長に詰めた字幅にする
        .font(.system(size: size, weight: .heavy))
        .fontWidth(.condensed)
        .monospacedDigit()
        // Text(timerInterval:)は最大桁ぶんの幅を取るので、Spacerでは右に寄らない。枠の中で右寄せする
        .multilineTextAlignment(.trailing)
    }
}

// アプリのパネルと同じく、ラベルは灰色。緑はアイコンと進行(ゲージ)だけに使う
private struct TitleLabel: View {
    let title: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "timer").foregroundStyle(Palette.green)
            Text(title).foregroundStyle(Palette.muted)
        }
        .font(.system(size: 14, weight: .bold))
    }
}

struct RestActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            // ロック画面・通知センター・StandBy
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    TitleLabel(title: context.state.title)
                    Spacer(minLength: 8)
                    ElapsedText(state: context.state, isStale: context.isStale, size: 38)
                        .frame(maxWidth: 140, alignment: .trailing)
                }
                if !context.isStale {
                    MinuteGauge(startedAt: context.state.startedAt)
                }
            }
            .padding(16)
            .activityBackgroundTint(Palette.surface)
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    TitleLabel(title: context.state.title)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ElapsedText(state: context.state, isStale: context.isStale, size: 30)
                        .frame(maxWidth: 120, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if !context.isStale {
                        MinuteGauge(startedAt: context.state.startedAt)
                            .padding(.horizontal, 4)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundStyle(Palette.green)
            } compactTrailing: {
                // timer表示は最大桁ぶんの幅を取るので、幅を固定して詰める。
                // 放置表示の「30:00+」(6文字)も収まる幅にし、万一はみ出す場合は縮める
                ElapsedText(state: context.state, isStale: context.isStale, size: 14)
                    .frame(width: 48)
                    .minimumScaleFactor(0.8)
            } minimal: {
                ProgressView(
                    timerInterval: context.state.startedAt...context.state.startedAt.addingTimeInterval(180),
                    countsDown: false,
                    label: { EmptyView() },
                    currentValueLabel: { Image(systemName: "timer").font(.system(size: 9)) }
                )
                .progressViewStyle(.circular)
                .tint(Palette.green)
            }
            .keylineTint(Palette.green)
        }
    }
}
