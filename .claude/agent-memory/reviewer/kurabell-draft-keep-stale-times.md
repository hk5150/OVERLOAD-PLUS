---
name: kurabell-draft-keep-stale-times
description: 下書きを長く生かす変更(2026-10-18 B3 draft.keep)では、復元後の保存で date/durationMin/kcal が保存時刻基準になり記録が壊れる
metadata:
  type: project
---

saveWorkout は `end = Date.now()`、`start = startAt`、`date = end` で記録を作る。下書きの寿命を延ばす変更
(d5c1d38 の試用上限 `draft.keep`、24時間の期限を外す)を入れると、上限で止めた日から数日後に購入して保存した記録が
「購入した日の日付」「durationMin が数千分」「kcal が数万」で永久に残る。restStartAt も数日前のまま復元され、休憩パネルが巨大な時計になる。
24時間以内でも同じ形は以前からあったが、keep はまさにその経路(迷って翌日以降に買う)を狙っている。

**Why:** 記録の日付は履歴・カレンダー・PR達成日・stalestDayIndex のキー。durationMin/kcal は保存後に直す手段がない。

**How to apply:** 下書きの保持期間・復元条件を触る差分では、復元→保存の経路で startAt/endAt/date/durationMin と restStartAt が
どの時刻基準になるかを確認する。関連: [[kurabell-error-banner-single-slot]] [[kurabell-day-name-is-history-key]]

**対処済み(2026-10-18):** `draft.keep` に保存を止めた時刻(ms)を入れ、saveWorkout は `draftKeep` があればその時刻で `end` を締める。keep の復元では restStartAt を戻さない。
