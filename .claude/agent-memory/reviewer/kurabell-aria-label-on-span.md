---
name: kurabell-aria-label-on-span
description: role無しの<span>にaria-labelを付けて読み上げを差し替えるパターン。ARIA上generic要素の名前付けは禁止で、無視されると可視テキストだけが読まれる
metadata:
  type: project
---

記録画面の上部バーの残量テキストは、`<span aria-label={full}>` で読み上げを長い説明に差し替えている(v136以前から)。
v1.3(改善要望9)で文言を「|」で2つの span に分け、2つ目を `aria-hidden` にした。

**Why:** ARIA 1.2 では role 無しの span(generic)への aria-label は禁止で、支援技術が無視しうる。
1つの span なら無視されても可視テキストが全部読まれるが、2つ目を aria-hidden にすると、
無視されたとき ja は数字(「あと480kg」)、en は基準(「vs last-3 avg」)が読まれなくなる。

**How to apply:** 可視テキストを分割して一部を aria-hidden にする差分を見たら、aria-label が
role を持つ要素(または視覚的に隠したテキスト)に付いているか確認する。

関連: [[kurabell-gauge-width-clamp]]
