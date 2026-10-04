---
name: kurabell-remove-undo
description: v1.3(4e49dc6)の種目カード✕削除の「元に戻す」(removedEx)は1枠で、Dayの登録をDay名で照合して戻す。保存・破棄で消えない
metadata:
  type: project
---

v1.3(改善要望11、4e49dc6)で種目の削除が見出し右端の ✕ になり、5秒の「元に戻す」(`removedEx` / `undoRemoveExercise`)が付いた。
`removeExercise` は今日の Day の登録種目からも外す(persist される)ので、取り消しは today と Day 登録の両方を戻す。

**Why:** 取り消しは1枠。✕の連打(次のカードの✕が同じ位置に来る)や連続削除で前の分の取り消しが消え、
Day 登録の削除だけが永続化して残る。Day の照合は `todayDay.name === r.dayName` の名前比較で、
同名の Day(作業中の dayPlan.js の自動命名で出やすい)や保存で cursor が進んだ後に別の Day へ戻しうる。
保存(saveWorkout)・下書き破棄で removedEx はクリアされない。

**How to apply:** 削除・取り消し・Day 登録に触る差分では、取り消しの枠の数、Day の特定方法(名前か index+cursor か)、
保存/破棄後に removedEx が残るかを確認する。関連: [[kurabell-error-banner-single-slot]]
