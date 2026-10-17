---
name: kurabell-scroll-compensation-clamp
description: 上部バー出入りの scrollBy 位置補正(2026-10-14)。ページ下端では文書の縮みでブラウザがscrollYを先にクランプ済みで、差分scrollByが二重になる
metadata:
  type: project
---

2026-10-14 未コミット差分: barVisible の切り替えで header 下端の文書上の位置の差だけ `window.scrollBy` する useLayoutEffect。

- **下端で二重補正**: バーが消えて文書が縮むと、layout 時点でブラウザが scrollY をクランプ(=見た目は既に保たれている)。
  その後 `scrollBy(0, -d)` が更に動かす。headless Chromium で再現済み(130px バー、下端で印が130px動いた。中ほどでは0)。
  rest 終了時に restFull の paddingBottom(322px+)も同時に縮むと、下端から ~350px 以内まで巻き込む
- **上端でバーが出る**: scrollY=0 でも +d スクロールし、header と本文先頭が sticky バーの裏に入る(記録開始の典型経路)
- saveWorkout は `await store.del` を跨いで setView("history") するので iOS では「view 同時変更なら補正しない」が効かない
  ([[kurabell-await-split-setstate]])

**How to apply:** スクロール位置の差分補正を見たら、文書の高さが同時に変わる場面(下端・上端)でクランプとの二重を疑う。
差分ではなく「直前の scrollY + d」への scrollTo か、スクロールイベントで覚えた値を使う形かを確認する。
