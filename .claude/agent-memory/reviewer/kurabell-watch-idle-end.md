---
name: kurabell-watch-idle-end
description: 1.4.2 Watchの無操作30分終了(idleWatch)のレビュー観点。lastActivityAt非永続・discarded+startedの同一drain・scenePhase判定
metadata:
  type: project
---

1.4.2(2026-10-13レビュー): 保存せずiPhoneを閉じた記録のWatchワークアウトを、無操作30分で終える(idleWatch / lastActivityAt / idleEnded)。

**Why:** 北村さん「アプリを終了したが Apple Watch が閉じない」。iOSはスワイプ終了を知らせない。

**How to apply:** 後続の差分で以下を見る。
- lastActivityAt はメモリだけ。Watchアプリ再起動(recover)後は sessionStart との max になり、開始30分超のセッションを1分以内に誤って discard しうる
- iPhoneの drain は watchWorkoutFromOps の後に watchWorkoutStopped を当てる(at の順を見ない)。同じ記録の discarded→started が1回の drain に入ると、Watch が動いているのに iPhone は「Watchなし」になる
- 中断後に開き直すと、ヘルスケアのワークアウトは開き直した時刻から始まる(前半は破棄)
- scenePhase の old == .background は、background→inactive→active と遷移すると成り立たない(未確認)
関連: [[kurabell-watch-recover-adopt]] [[kurabell-watch-workout-ownership]]
