---
name: kurabell-1rm-filter-divergence
description: 推定1RMの算出が4箇所に重複していて除外条件が3種類ある(workingSetsはwarmupしか除かず、assistedは除かない)
metadata:
  type: project
---

「式は既存と同じ」と言われても、**除外フィルタが同じとは限らない**。

**Why:** `est1RM(setEff(ex, s), s.reps)` の reduce は index.html 内に4箇所あり、
前段のフィルタが揃っていない:
- `prMap`: `workingSets` + `!s.assisted` + `reps >= 1`
- 履歴タブの⚡1RMバッジ: `!s.warmup && !s.assisted && s.reps`
- `chartData`: `workingSets` のみ(= assisted を含む)
- v104で追加した種目カード履歴パネルの日別1RM: `workingSets` のみ

`workingSets()`(src/domain/volume.js)は **warmup しか除かない**。「補助あり(assisted)も除かれる」
という思い込みで v104 のコメントが事実と逆になっていた。補助ありセットは回数が伸びるため
est1RM が本番セットを上回りやすく、同じ日の値が画面ごとに食い違う。

v1.3(7cb50a9、改善要望6)で記録画面の各セット行に1RMが出た。行の表示は `showsSet1RM`(oneRm.js)で
**素の重量 >0 と 回数≤12** を要求するが、同じ画面の `liveBest1RM`(上の比較行)・`bestIdxInSession`(⚡の位置)・
`prMap` はどちらの条件も持たない。結果: 加重0の自重種目は行に1RMが一切出ない／13回以上のセットが⚡と自己ベストを奪う。

4e49dc6 で showsSet1RM は実効重量判定になり、bestIdxInSession も showsSet1RM に揃った。
残る食い違い: `liveBest1RM`(比較行・評価依頼の beatPrevious)と `prMap`(pastBest1RM)は13回以上も数える。

**How to apply:** 1RM/PR まわりの差分を見たら、式ではなく**フィルタ行**を既存4箇所と突き合わせる。
新設するなら src/domain/oneRm.js に共通関数として出してテストで縛る方向を提案する
(index.html 内のインラインはテスト対象外)。
