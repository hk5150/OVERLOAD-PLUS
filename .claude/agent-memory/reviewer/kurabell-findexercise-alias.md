---
name: kurabell-findexercise-alias
description: findExercise(q) が真でも q は正規の種目名とは限らない(ALIASESで別名→内蔵種目に解決される)。q をそのまま保存すると履歴と繋がらない
metadata:
  type: project
---

`findExercise(name)` は `allExercises.find(e => e.n === name) || dbLookup(name)` で、`dbLookup` は
`ALIASES`(「ベンチプレス」→「バーベルベンチプレス」、「スクワット」→「バーベルスクワット」など)を解く。
だから `findExercise(q)` が真 = 「q が種目名として保存してよい文字列」ではない。

**Why:** 2026-09-28 の分割タブDay編集レビュー(v123)で、検索欄の Enter が
`findExercise(q)` で存在判定したあと `toggleDayExercise(i, q)` と**入力文字列そのもの**を登録していた。
「ベンチプレス」Enter で Day に別名が入り、今日のメニューの前回実績(`e.name === name` の完全一致検索)が
「バーベルベンチプレス」の記録と繋がらない。記録画面の `addExercise(search)` の Enter も同型(既存)で、
こちらは別名のカスタム種目まで作る。日本語IMEの確定Enterでも発火しうる(isComposing ガードはリポジトリに無い)。

**How to apply:** 名前を保存・登録する差分で存在判定に `findExercise` / `dbLookup` を使っていたら、
保存しているのが `findExercise(q).n`(正規名)か `q`(入力値)かを確認する。
関連: [[kurabell-chip-jump-pool-mismatch]](判定と実体の母集団がずれる型)
