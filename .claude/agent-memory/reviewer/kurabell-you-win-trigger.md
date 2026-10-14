---
name: kurabell-you-win-trigger
description: YOU WIN!はRirSelectのonChangeだけで判定、⚡/緑は描画時判定。基準(今日の最高を含むか)は10-09→10-10→10-11と2回反転。コメント/テスト/docsの取り残しに注意
metadata:
  type: project
---

1.4 (18)(v140、2026-10-09)で、推定1RMの自己ベスト更新時に全画面「YOU WIN!」が入った。
判定は `isNew1RMBest`(oneRm.js)で、呼ぶのは `RirSelect` の onChange(RIRを空から入れた瞬間)だけ。
行の緑(over1RM)・⚡(isSetPR && over1RM)は描画のたびに計算される。

基準の変遷(北村さんの指示で2回反転):
- 10-09 (18): 過去の自己ベストと今日それまでの最高(todayBest)の両方を超えたら
- 10-10 (19) `51a019e`: 過去の自己ベストを超えたら毎回(「2連続で更新したのに出ない」苦情)。todayBest削除
- 10-11: 「過去最高が出たときだけ」で todayBest を index.html 側だけに戻した。oneRm.js のコメント・
  tests/oneRm.test.js のテスト名・docs/Watchアプリ.md「毎回」が10-10のまま取り残された(レビューで指摘)

食い違う入力(仕様上許容したもの):
- RIRを入れた後に重量/回数を上げて自己ベスト超え → ⚡は付くがYOU WIN!は出ない
- Watch入力(applyWatchOps)は通らない。ただしWatchのセットはtodayBestには入る
- celebratedRef のキーは行番号。行削除で番号がずれると別セットが既祝扱いになる

**Why:** 祝う演出をイベント起点、印を状態起点にしたため。比較対象(showsSet1RMを通る実施済みセット、0.01の差)は揃えてある。

**How to apply:** 1RM・PR周りの差分では、印と演出の両方の経路を見る。基準を変える差分では oneRm.js のコメント・テスト名・docs/Watchアプリ.md の記述も追随しているか見る。同値の2セット目が出ない件は10-10の苦情と同じ形なので、仕様確認を促す。関連: [[kurabell-1rm-filter-divergence]]
