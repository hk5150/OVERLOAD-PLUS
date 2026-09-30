---
name: kurabell-edit-screen-assisted
description: 履歴の編集画面の補助(assisted)。v129でdraftに保持、v130で3状態切替nextSetTypeに集約、v131でvolume.jsへ移設しテスト化
metadata:
  type: project
---

v129 以前は編集画面の draft 変換で assisted を落としており、**過去の記録を開いて保存するだけで補助の印が消えていた**
(この間に編集された記録の印は復元できない)。v129 で保持し、W を ON にするとき assisted を外す暫定処理を入れた。

v130(未コミット差分をレビュー、2026-10-01)で、切替を `#appsrc` トップレベルの `nextSetType(s)` に集約し、
今日画面の onClick と編集画面の `editSetType` の両方から呼ぶ形にした。編集画面の `editAddSet` も直前行の assisted を
引き継ぐ(今日の `addSet` と同じ)。i18n `set.warmupToggle` は削除。

**Why:** 今日画面と編集画面で切替ロジックが別実装だと、片方で `{warmup:true, assisted:true}` が保存されうる。
同時trueの影響:集計は warmup 優先で無害、表示は「W:補:」、addSet / Watch の追加は直前行を複製するので
末尾がこの状態だと次の行が(Watchでは見えない)補助になる。

**How to apply:** セット種別に触る差分では、nextSetType を経由しているか(独自の三項演算子を書き足していないか)、
追加・複製経路(addSet / editAddSet / watch.js の sets.push)で warmup:false と assisted の扱いが揃っているかを見る。
v131 で nextSetType は src/domain/volume.js へ移設(globalThis公開)、tests/volume.test.js にテストあり。
今日画面も setToday の更新関数内で nextSetType(x) を呼ぶ(編集画面の editSetType と同形)。[[kurabell-1rm-filter-divergence]]
