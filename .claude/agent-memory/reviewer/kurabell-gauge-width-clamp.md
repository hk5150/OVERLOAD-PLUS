---
name: kurabell-gauge-width-clamp
description: ゲージ幅を `${計算値}%` で組むとき、片側しかクランプしないと負値/NaNでCSSが無効になり幅autoで「満杯」に見えるバグクラス
metadata:
  type: project
---

`width: \`${x * 100}%\`` 形式のゲージは、`x` を **両側クランプ**する(`Math.max(0, Math.min(1, x))`)。

**Why:** 片側だけ(`Math.min(x, 1)`)だと `x` が負や NaN のときに `width: "-32%"` / `"NaN%"` という
不正なCSS値になり、ブラウザは宣言ごと無視して幅 auto = 親の100% にする。
結果、値が異常なときに限ってゲージが**満杯**に見える(空でも赤でもなく、最良の見た目になる)。
KURABELLでは重量入力が `type="text"` の NumInput なので、Web版では `-5` を打てて
liveVolume が負になりうる。

**How to apply:** index.html のインターバル用セグメントゲージ(`segProgress`)が
`Math.max(0, Math.min(1, ...))` で両側クランプしているのが既存パターン。
新しいゲージがこれから外れていたら指摘する。分母が0/NaNになる経路の有無もセットで確認する。

関連: [[kurabell-select-sentinel-mismatch]]
