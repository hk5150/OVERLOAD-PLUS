---
name: kurabell-day-name-is-history-key
description: Day名はworkoutsのsessionで履歴を引くキー。自動改名・同名Dayで前回比較が切れる/混ざる。プリセットDayは登録0件のまま。autoMenuは前回記録優先
metadata:
  type: project
---

Day の名前(`split.days[i].name`)は記録の `session` に保存され、lastSameSession・compareBase・sameSplitSessions・
buildMenuItem・initialSetsFor・dayToText が `w.session === todayDay.name` で引く。改名すると「前回の同じDay」が切れ、
同名の Day が2つあると履歴が混ざる。

v1.3(39ab907)の nextDayName は「名前が autoDayName(muscles) と一致する Day」も自動で付け直すので、
5分割プリセット(胸/背中/脚/肩/腕)と全身法の Day 名がそのまま該当する(部位を跨いで足すと改名)。

**Why:** プリセット(SPLIT_PRESETS)は exercises を持たず、addExercise は登録1件以上の Day にしか足さないので、
プリセット利用者の Day は記録が何十回あっても「登録0件」。「0件 = 最初の種目設定」という前提の機能
(おまかせ・選ばせるAI依頼文・保存時の登録の申し出)が既存利用者にも出る。
また autoMenu は lastSameSession > 登録種目 の順なので、記録のある Day では登録種目の並べ替えが今日のメニューに効かない。

**How to apply:** Day 名を変える/新しく付ける差分、「登録0件」で分岐する差分、登録種目の順に意味を持たせる差分では、
履歴の有無(workouts に session===name があるか)とプリセット利用者を必ず想定する。関連: [[kurabell-remove-undo]]
