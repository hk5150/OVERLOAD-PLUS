# Instagram 運用(英語版アカウント)

2026-10-07 開始。英語圏の筋トレ層向け。日本語版 @kurabell_workout_log_jp(旧 @kurabell_app、`../instagram/`)とは別アカウント。
流れ(`drafts/` → `approved/` → `published/`)と書くときの約束は `../instagram/README.md` と同じ。

## 日本語版との違い

- **単位は lb**。アプリ画面は英語表示・lb のサンプルデータで撮る(`.playwright-mcp/store/en-shoot-pr.js` / `en-shoot-rir.js`、
  ベンチは前回 155lb → 今日 160lb、余力の例は 155lb×10 RIR2 → RIR3)
- **論文の数値は論文の単位のまま**(kg・mm)。換算すると原表と照合できなくなる
- ナレーションは Gemini 3.8 Flash TTS、声 Charon、英語の指示文(KURABELL は koo-rah-bell と読ませる)
- 字幕は手動で改行しない(英語は単語の切れ目で自然に折り返せる。手で改行すると二重に折り返す)

## 置き場

- リール1本目の英語版にもナレーションを入れた(日本語版の1本目は無音で、音源はアプリで付けた)。場面の長さが決まっているので、各場面に収まる短い文にし、2場面目だけ 1.1 倍速にした
- `drafts/`: 英語版リール5本(`reel1-intro`・`reel-po`・`reel2-failure`・`reel3-load`・`reel4-rir`)と各キャプション
- 元データ: リール1本目は `../instagram/reel-en.html`(素材 `../instagram/assets-en/`)。
  ほかの4本は `~/Desktop/KURABELL-reels/en/`(`build-reel.sh` で束ねる)
- iCloud Drive の `KURABELL-Instagram/EN/` にも同じものを置いてある(iPhone から投稿するため)

## プロフィール

```
Beat your last session.
Evidence-based lifting tips
Last weight × reps × RIR on every set
iPhone + Apple Watch · No subscription · 10 free workouts
```

リンクは英語版用のキャンペーンリンク(`ct=instagram_en`):

```
https://apps.apple.com/app/apple-store/id6816090624?pt=129352960&ct=instagram_en&mt=8
```

アイコンは日本語版と同じアプリアイコン。
