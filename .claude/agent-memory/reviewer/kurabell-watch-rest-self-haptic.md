---
name: kurabell-watch-rest-self-haptic
description: Watch休憩の自前振動(armRestAlerts)は予備通知を消すので、play()が効かない/タイマーが遅れると無音になる。(23)の1分16秒が反証候補(2026-10-15)
metadata:
  type: project
---

2026-10-15 の見直し(ブランチ claude/project-thread-23ulsd)で、ワークアウト中の休憩の知らせを DispatchSourceTimer + WKInterfaceDevice.play に切り替え、
鳴らした直後に予備の UN 通知を removePending、willPresent も armedAlerts/claimedAlerts で [] にする設計になった。

**Why:** play() は成否が分からない。play が無効な状態(別アプリ前面・手首下ろし中など)や、メインが間引かれて10秒以上遅れると、予備を消した/抑止したせいで「遅れる」が「鳴らない」に変わる。
(23)(7f73e2b) では画面側の Task.sleep+play が手首を下ろすと1分16秒になった実績がある(当時ワークアウトが動いていたかは不明。動いていなかったなら反証にならない)。

**How to apply:** この周辺の差分では、予備の通知を消す条件(applicationState 等)と、DiagLog に状態が残るかを確認する。実機の「REST alert played late=」が出ているのに体感で鳴っていなければ play 無効が原因。関連 [[kurabell-watch-workout-ownership]]
