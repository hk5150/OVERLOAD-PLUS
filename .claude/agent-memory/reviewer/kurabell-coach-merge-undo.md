---
name: kurabell-coach-merge-undo
description: 1.4 AIコーチ(mergeCoachPlan)の記録中取り込みは行番号とex.idを保つ設計。undoはtoday丸ごと差し戻しで、5秒内の入力(Watch含む)を消す
metadata:
  type: project
---

1.4 (17) の AIコーチ(src/domain/aiCoach.js)は、記録中の「残りの組み直し」で today を案に入れ替える。
Watch の op は exId + setIndex で届くので、mergeCoachPlan は id 保持・最後の実施済み行まで不変・未実施のみの種目は外す。

**Why:** 外した種目に届いた Watch の op は applyWatchOps で「applied」扱いになり捨てられる。undo(notice kind "coach")は
holder.before で today を丸ごと戻すので、5秒内に入れた RIR や Watch のセットが全種目で消える(削除のundoより範囲が広い)。
2026-10-09 の初回レビューで指摘。案の数字は表示単位のまま coachMenu に持つので、単位切替で読み替わる点も指摘した。

**How to apply:** AIコーチ・today の一括置換・undo に触る差分では、行番号の保存、外した種目宛ての op、undo の範囲、
保存/破棄後の notice を確認する。関連: [[kurabell-remove-undo]] [[kurabell-watch-workout-ownership]]
