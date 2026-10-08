---
name: kurabell-exid-survives-swap
description: swapExerciseは種目のidを保ったまま名前・セットを差し替える。ex.idをキーにした開閉・キャッシュ(nextOpenのAI文など)は別種目に持ち越される
metadata:
  type: project
---

`swapExercise(id, newName)` は `{ ...ex, name: n, sets: initialSetsFor(n) }` で **id を変えない**。
ex.id をキーにした UI 状態(openHist、1.4 の「次の一手」nextOpen に保存した AI の文、非同期の返事の書き込み先)は、
差し替え後の別種目にそのまま付いて残る。

**Why:** 1.4「次の一手」(764b762, 2026-10-08)で、ベンチの AI 文がダンベルプレスの案の横に残る経路を指摘した。
aiTextIsConsistent の数字検証は「開いた時点の案」に対してしか効かない。単位・言語・repLow/increment の変更も同じ形。

**How to apply:** ex.id をキーにキャッシュした派生値(特に await の返事)を見たら、差し替え・単位/言語切替後も
内容が今の入力と一致するか(入力の鍵を一緒に保存して照合しているか)を確認する。[[kurabell-day-name-is-history-key]]
