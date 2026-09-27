---
name: kurabell-watch-workout-ownership
description: v122 Watchワークアウト。iPhoneは"started"opを受けたら書かないが、Watchが保存に失敗してもiPhoneへ戻る経路がない。書き漏れ/誤った時間幅のバグクラス
metadata:
  type: project
---

v122(2026-09-28レビュー)で、iPhone が `watchWorkoutFor === startAt` ならヘルスケアに書かず、Watch が `lastSaved` を見て finish/discard する設計になった。
レビュー時点で見つけた穴: (1) 記録中に最後の種目を消すと snapshot が非active→Watchが破棄、startAt は残るので再開始されず、iPhoneも書かない (2) lastSaved は React state のみ・送信は400msデバウンス→アプリ終了で消える (3) 未対応付けのセッションは非activeで破棄されず、次の記録に対応付く(A開始〜B終了の幅で保存) (4) finish/discard が await 中に再入可能 (5) iPhoneからWatch由来ワークアウトを消せるか実機未確認。

**Why:** 「Watchが書くのでiPhoneは書かない」の判断は一方向で、Watch側の失敗(クラッシュ・系統終了・lastSaved未着)を iPhone が知る手段がない。
**How to apply:** Watch/HealthKit 周りの差分では、「started を送った後に Watch が保存できない経路」と「対応付け前のセッションの後始末」を必ず照合する。
また ios/App/.claude/ に reviewer のメモリが誤って作られていたことがある(cwd が ios/App のセッション)。範囲外ファイルとして報告する。
