---
name: kurabell-watch-finished-sheet
description: v1.3 改善要望12 Watch完了画面。RootViewのsheetが子のsheet(入力/休憩)表示中に出せるか未確認・shown idを閉じた時に記録する設計の穴
metadata:
  type: project
---

2026-10-05 レビュー(fdb0aee)。Watch の完了画面は `SessionStore.showingFinished` を RootView の `.sheet(item:)` に繋ぎ、
閉じたとき(`finishedDismissed`)に初めて shown id を UserDefaults に書く。確認は `-KurabellFinished` の起動引数だけで、
「Watch で休憩画面(SetEditView のシート内 RestTimerView / RestRowButton のシート)を開いたまま iPhone で保存」は未確認だった。
親の sheet を子の sheet 表示中(または同じ更新で子が閉じる最中)に出すと失敗しうる。失敗すると showingFinished が非nilのまま残り、
`guard showingFinished == nil` で以後の完了画面がプロセス終了まで出ない。

**Why:** 通常の締め方(最後のセット→休憩画面→iPhoneで保存)がちょうどこの状態。シミュレータの起動引数では再現しない。
**How to apply:** Watch に新しい sheet / 全画面表示を足す差分では、「別の sheet が出ている最中に状態が変わる」経路が確認済みかを聞く。
「1回だけ出す」は表示時に印を付けるか、閉じた時に付けるかを確認する(閉じた時だと再表示の窓と固着が生まれる)。[[kurabell-watch-workout-ownership]]
