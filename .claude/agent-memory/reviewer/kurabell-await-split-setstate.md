---
name: kurabell-await-split-setstate
description: saveWorkout等でawaitを挟んで別々に落とすstateが、中間renderで副作用effect(Live Activity等)を一瞬走らせるバグクラス(v134)
metadata:
  type: project
---

v134(2026-10-01レビュー)で、saveWorkout 内の `setWatchLiveFor(null)` が `await store.set(WATCH_LAST_SAVED_KEY)` より前、`stopRest()`/`setStartAt(null)` が後にあった。
React 18(createRoot)でも await を跨ぐ setState は別 render になり、iOS の Preferences はブリッジ往復なので間に effect が走る → 抑止していた休憩 Live Activity が一瞬出て即終了(Watch のスマートスタックが出る元の問題そのもの)。

**Why:** 「A と B が両方変わった後の状態」を前提にした effect は、await を挟むと片方だけ変わった中間状態を見る。Web では syncRestActivity が no-op なので Web 確認では出ない。
**How to apply:** effect の deps に入る state を非同期関数内で更新している差分では、await の前後どちらで set しているかを照合する。
