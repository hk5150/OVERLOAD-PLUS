---
name: kurabell-watch-workout-ownership
description: v122 Watchワークアウト。iPhoneは"started"opを受けたら書かないが、Watchが保存に失敗してもiPhoneへ戻る経路がない。書き漏れ/誤った時間幅のバグクラス
metadata:
  type: project
---

v122(2026-09-28レビュー)で、iPhone が `watchWorkoutFor === startAt` ならヘルスケアに書かず、Watch が `lastSaved` を見て finish/discard する設計になった。
レビュー時点で見つけた穴: (1) 記録中に最後の種目を消すと snapshot が非active→Watchが破棄、startAt は残るので再開始されず、iPhoneも書かない (2) lastSaved は React state のみ・送信は400msデバウンス→アプリ終了で消える (3) 未対応付けのセッションは非activeで破棄されず、次の記録に対応付く(A開始〜B終了の幅で保存) (4) finish/discard が await 中に再入可能 (5) iPhoneからWatch由来ワークアウトを消せるか実機未確認。

**Why:** 「Watchが書くのでiPhoneは書かない」の判断は一方向で、Watch側の失敗(クラッシュ・系統終了・lastSaved未着)を iPhone が知る手段がない。
v1.3 改善要望4b(2fc7f22)で同じ一方向の委譲が休憩通知にも広がった: watchLive の間 iPhone は通知を予約せず、Watch が SessionStore.receive で予約する。
その予約ブロックは「記録中」条件の内側だけで動くので、保存・破棄・Watch側の終了で条件が外れると予約した通知を取り消せない(保存後に「1分経過」が鳴る/iPhoneと二重)。
Watchアプリのクラッシュ・強制終了で discarded が来ないと watchLive が立ったままになり、通知が誰からも出ない(handleActiveWorkoutRecovery 無し)。

**How to apply:** Watch/HealthKit 周りの差分では、「started を送った後に Watch が保存できない経路」と「対応付け前のセッションの後始末」を必ず照合する。
また ios/App/.claude/ に reviewer のメモリが誤って作られていたことがある(cwd が ios/App のセッション)。範囲外ファイルとして報告する。
