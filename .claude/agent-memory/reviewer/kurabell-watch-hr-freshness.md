---
name: kurabell-watch-hr-freshness
description: Watchの心拍表示(1.4.1(31))は新しい値でしか更新されず古さの判定が無い。iPhone側はWATCH_HR_FRESH_MS=15秒で隠す。ヘッダ行の高さが心拍の有無で変わる
metadata:
  type: project
---

2026-10-12 レビュー: WorkoutManager.heartRate は builder の didCollectDataOf でだけ更新、cleanUp で nil。
センサーが途切れても(手首から外す等)ワークアウト中は最後の値が出続ける。iPhone は watchHeartRateToShow で15秒超を隠すので両端末で振る舞いが違う。
また HeartRateLabel(numeric 17pt)を13ptの「インターバル」行に入れたため、心拍の出入りで行が高くなり下が跳ねる(RestIdleRowの「跳ねない」意図と衝突)。-KurabellHR 常時指定のスクショ確認では見えない。

**How to apply:** Watchの表示値を足す差分では、古さの判定(受信時刻)とnil↔値で高さが変わらないかを確認する。[[kurabell-watch-workout-ownership]]
