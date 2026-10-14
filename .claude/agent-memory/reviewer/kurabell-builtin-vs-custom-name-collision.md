---
name: kurabell-builtin-vs-custom-name-collision
description: EXERCISE_DB に種目を足すと、既存利用者の同名カスタム種目と衝突する。dbLookup/resolveIsDb/findExercise は内蔵を優先、一覧は2行、設定の編集はカスタム側に書かれて効かない
metadata:
  type: project
---

2026-10-11(プリセット19種目追加、内転筋追加)のレビューで確認した構造。

- カスタム作成は `findExercise(n)` が真なら弾くので「作成時」は衝突しない。だが**後から内蔵に同名を足す**と、既存のカスタムがそのまま残る
- `allExercises = [...EXERCISE_DB, ...customExercises]` に同名が2つ並ぶ → ピッカー・設定一覧に2行(React key 重複)
- `findExercise` は先頭(内蔵)を返し、`resolveIsDb`/`dbLookup` は `DB_BY_NAME` を見るので、係数・db・部位は内蔵が勝つ。`resolveIsDb` はマスター優先なので過去記録も遡って変わる
- 設定画面の `updateCustomExercise` は `isCustomExercise(name)` が真ならカスタム実体を書き換える → 計算は内蔵+overrides を見るので**編集が効かない**

**Why:** 内転筋の受け皿が無かった時期に「ヒップアダクション」などをカスタムで作った利用者が現実にいそう。

**How to apply:** EXERCISE_DB に名前を足す差分では、同名カスタムの扱い(移行で消す/上書きへ変換する/放置を明記)を確認する。関連: [[kurabell-findexercise-alias]]
