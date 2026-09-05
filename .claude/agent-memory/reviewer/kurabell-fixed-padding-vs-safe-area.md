---
name: kurabell-fixed-padding-vs-safe-area
description: fixed要素の高さをブラウザ実測した固定pxでpaddingBottomに入れると、iOS実機のenv(safe-area-inset-bottom)分だけ足りずコンテンツが隠れるバグクラス
metadata:
  type: project
---

`position: fixed` のパネルを避けるための `paddingBottom: <実測px>` は、iOS実機だけ不足する。

**Why:** このリポジトリのfixed要素は `bottom: calc(56px + env(safe-area-inset-bottom))` と
`padding-bottom: calc(14px + env(safe-area-inset-bottom))` のように env() を**2重に**含むことがある。
ブラウザ(inset=0)で実測した固定pxは iOS(inset=34px前後)で 2×inset 足りず、
本文末尾(保存ボタン)がパネルの裏に入って押せない。ページのスクロール上限が paddingBottom で
決まるので、スクロールしても救えない。v104のインターバルパネル(250→330)で実際に該当した。

**How to apply:** 差分に `paddingBottom: <数値>` があり、避けたい相手が fixed で env() を使っていたら、
その相手の `bottom:` と `padding-bottom:` に env() が何回出るか数える。
必要なのは `calc(<実測px> + env(safe-area-inset-bottom) * n)`。
「ブラウザで実測して収まることを確認した」という報告は iOS の検証にはならない
([[kurabell-1rm-filter-divergence]] と同じく、Web/iOSの2経路のうち片方しか見ていない型)。
