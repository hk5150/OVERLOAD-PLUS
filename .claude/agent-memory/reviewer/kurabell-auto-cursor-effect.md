---
name: kurabell-auto-cursor-effect
description: 2026-10-11 「今日」の Day を useEffect で自動選択(stalestDayIndex includeFrom + split.manual)。保存時の除外と食い違う未来時刻の件、Day 改名/追加で即ジャンプ、並走 persist
metadata:
  type: project
---

1.4.1 (20) の次の差分で、todayDay の直後の useEffect が today 空・未開始・!split.manual のとき cursor を stalestDayIndex(includeFrom) に合わせて persist する。

**Why:** 保存時だけ選ぶ作りだと旧版の cursor が残り、実機で「胸が4日前なのに肩が今日」になった。

**How to apply:**
- 保存時は今日の Day を候補から外す(未来時刻の記録対策、以前の reviewer 指摘)が、effect は includeFrom で入れるので、他の Day に未来時刻の記録があると保存直後に同じ Day へ戻る。両経路の選択が一致するか見る
- Day 名は履歴のキー([[kurabell-day-name-is-history-key]])。改名・addDay で「未実施=最優先」になり、編集中に赤枠(今日)が即移る
- 履歴の削除/編集・復元の persist の await 中に effect の persist が並走する(SQLite のドライバは直列化しない)
- split.manual は migrateSplit/バックアップ/SQLite(settings に JSON)を素通し。manual を解除する経路は保存(nextSplit)とプリセット/作り直しだけ
