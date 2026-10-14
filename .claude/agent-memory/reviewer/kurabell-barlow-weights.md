---
name: kurabell-barlow-weights
description: Barlow Condensed は 600/800 の2ウェイトしか同梱していない。fontWeight 700 は 800 に丸まり、700/800 の強弱差は見えない
metadata:
  type: project
---

`fonts/` にあるのは `barlow-condensed-600-latin.woff2` と `-800-` の2つだけ(`@font-face` も 600 と 800)。

**Why:** 2026-10-13 の履歴チップ化で、通常チップ `fontWeight: 700` / 1RM更新チップ `800` を
Barlow Condensed で描いていた。CSS のフォント合成規則では 700 の要求は「上方向の最近傍」=800 に解決されるので、
両者は同じ太さで出る(色と背景で区別は付くが、太さの差は設計意図どおりには見えない)。
600 の要求は 600 がそのまま使われる。

**How to apply:** `fontFamily: 'Barlow Condensed'` と一緒に 700 や 500 などの中間ウェイトを指定している差分を見たら、
600 か 800 のどちらに丸まるかを添えて指摘する。太さで強弱を付けたいなら 600 vs 800 にする。
