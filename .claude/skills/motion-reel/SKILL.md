---
name: motion-reel
description: KURABELL の宣伝用リール(縦型の短い動画)をコードで作る。「リールを作って」「/motion-reel 頭打ち 15秒」など、Instagram・TikTok 用の動きのある動画を新しく作るときに使う。既存 mp4 の切り貼りやナレーション付けだけなら marketing/tools/ の既存スクリプトを使う。
---

# motion-reel: KURABELL のリールをコードで作る

動画は「t 秒目の画面を描く関数 `seek(t)`」を持つ1枚の HTML として書き、Playwright で1コマずつ撮って ffmpeg でつなぐ。
置き場所は `marketing/motion-reel/`。見本は `reels/2026-11-04-plateau/`(15秒、頭打ち → 上げどき)。

使い方の例: `/motion-reel 頭打ち 15秒` / `/motion-reel 週1回で十分? 20秒 参考 ./refs/frame.png`

## 先に読む

1. `marketing/motion-reel/style_guide.md`(描き方・色・置き場所・使わない定番・中身の約束)
2. `marketing/instagram/README.md` と、いちばん新しい `marketing/instagram/analysis-*.md`(伸びた回の型)
3. Obsidian `Projects/kurabell-pdca.md` で、同じ題材の施策が実施中・判定待ちでないか

## 手順(関門ごとに北村さんの OK をもらう。無人で動くときは関門 2 で止めて報告する)

**関門 1: 指示書と素材**
- `reels/<YYYY-MM-DD-題材>/brief.md` を書く。見本と同じ表: 見た人に残す一文・対象・長さと形・素材(実物のパス)・参考・禁止・納品
- 素材はリポジトリ内の実物だけ(`marketing/instagram/assets/`、`appstore/` のスクショ、`icon-512.png`、`fonts/`)。
  足りない画面があれば**描かずに**頼む。数字は素材に写っているものだけ使う

**関門 2: ショットリスト**
- `shotlist.md` に秒ごとの表(役割・画面・つなぐ要素・音)。型は 掴み(問い)→ 課題 → 登場 → 証拠 → 締め
- 各カットに「入り方・出方・ある理由」を言えること。言えないカットは削る

**関門 3: 静止画**
- 見本の `index.html` を複製して書き換える。素材は相対パス(`../../../instagram/assets/…`)で参照する
- 一番ものが多い秒を数枚描いて見る: `node ../../tools/render.cjs index.html --stills 1.5,4.9,7.8`(reel のフォルダで実行)

**関門 4: 書き出し**
- `cues.json`(音のきっかけ。形は `tools/sound.py` の冒頭)を書き、`tools/build.sh reels/<名前>` → `out/reel.mp4` と `out/cover.jpg`
- 曲を使うなら `track.wav` を置く(cues.json の音より優先)

**関門 5: 自己採点(飛ばさない)**
- `tools/check.sh reels/<名前> <一番速い動きの秒>` で一覧・連続コマ・スマホ幅・ループ・決定性・音量を出す
- 描いたつもりの絵ではなく、出てきたコマだけを見て 1〜10 点で採点する: 掴み(2秒以内)/ スマホでの読みやすさ / 動き / 変化 / 音と絵のずれ / ブランド
- 悪い順に3つ、秒・証拠・直し方を書いて直す。全項目 8 点以上になるまで繰り返す(採点は `reviews/notes.md`)
- 探すもの: 文字の重なり、滑るべきところで止まる要素、四隅のラベル、拡大でぼけた文字、何も起きない拍、ループのつなぎ目のガタつき、場面転換で一瞬出る塊

**関門 6: 納品**
- `out/reel.mp4` と `out/cover.jpg` を `marketing/instagram/drafts/` の下書き(`YYYY-MM-DD-topic.md`)に紐づけて渡す。投稿は既存の流れ(drafts → approved → published)
- mp4・音・チェック画像はコミットしない(`marketing/motion-reel/.gitignore`)。コミットするのは brief / shotlist / cues / index.html

## 罠

- `render.cjs` は `file://` で開く。外部の URL(フォント・CDN)を参照しない。オフラインで描けること
- 日本語フォントは Mac では Hiragino、クラウドの Linux では Noto Sans CJK JP に落ちる。字幅が少し変わるので、行が折り返していないか静止画で確かめる
- 場面をまたいで動く要素は、塗りつぶしの四角のまま大きく変形させると一瞬「塊」に見える。変形は、上に重なるもの(カードなど)が出てから始める
- Remotion は会社利用だと有料ライセンスが要る(4人以上)。この仕組みは Remotion なしで動くので、入れないこと
