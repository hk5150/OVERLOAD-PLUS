---
name: kurabell-edit-screen-assisted
description: 履歴の編集画面は補助(assisted)を表示も切替もしない。v129でdraftにassistedを保持し、WトグルをONにするとassistedを外すようにした
metadata:
  type: project
---

履歴の編集画面(startEditWorkout / editSet の "warmup" トグル)は W の2状態だけで、補助の印は見えない。
v129 以前は draft 変換で assisted を落としており、**過去の記録を開いて保存するだけで補助の印が消えていた**
(この間に編集された記録の印は復元できない)。v129 で保持するようにした。

**Why:** 今日の記録画面は 通常→W→補→通常 の排他3状態。保持しただけだと編集画面の W トグルで
`{warmup:true, assisted:true}` が保存されうるので、v129 で W を ON にするとき assisted を外すようにした
(W→通常に戻しても補助には戻らない。補助の表示・付け外しUIは未実装)。同時trueが残っていた場合の影響:集計(workingSets/dayBest1RM/insight)は warmup 優先で無害、
表示は「W:補:」、今日画面の cycle は W→補 に進む、today の addSet / applyWatchOps は直前行を複製するので
末尾がこの状態だと次の行が(Watchでは見えない)補助になる。

**How to apply:** セットの作り直し・種別切替の差分では、warmup と assisted の排他を保っているか、
編集画面と今日画面で切替ロジックが揃っているかを見る。[[kurabell-1rm-filter-divergence]]
