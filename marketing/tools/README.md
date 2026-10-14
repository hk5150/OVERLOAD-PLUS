# Instagram の制作ツール

リール・カバー・プロフィール写真・SNS 用のアプリ画面を作るスクリプト。**素材と出来上がりは制作フォルダ `~/Desktop/KURABELL-reels/`**
(画像・テーマソング・カバーの文言の一覧)に置き、ここにはスクリプトだけを置く。
13時のルーティン「【毎日13時】KURABELL マーケティング PDCA」はリポジトリを変更しない決まりなので、ルーティンが書き換えるもの
(カバーの文言など)はデータファイルに分けてある。

| ファイル | 何を作るか | 使い方 |
|---|---|---|
| `tts.sh` | ナレーションを1場面ぶん作る(Gemini 3.8 Flash TTS、声 Charon)。Genspark が応答しないときは5分で打ち切り、1回やり直して失敗で終わる | `tts.sh <出力.mp3> <ja\|en> "<読む文>"` |
| `tiktok-safe.sh` | Instagram 用のリールを TikTok 用にする(映像を80%に縮めて余白を付ける。TikTok は左右が約1割切れるため) | `tiktok-safe.sh <元の mp4> <出力.mp4>` |
| `tiktok-cta.sh` | TikTok 用の動画の最後の場面(参考文献とロゴ)に「App Storeで「KURABELL」と検索」を入れる(個人アカウントはフォロワー1,000人までリンクを貼れないため)。`tiktok-safe.sh` の後に使う | `tiktok-cta.sh <元のリール.mp4> <tiktok-safe 済み.mp4> <出力.mp4>` |
| `shoot-frames.sh` | reel.html の各場面を Chrome のヘッドレスで `frames/sN.png` にし、確認用の横並び `sheet.png` も作る | `shoot-frames.sh <リールのフォルダ>` |
| `add-theme.sh` | ナレーション入りのリール(制作フォルダの `build-reel.sh` の出力)にテーマソングを重ねる。**2026-10-11 から新しいリールはこの型**(エビデンス → アプリの機能、30〜45秒) | `add-theme.sh <ナレーションだけの mp4> <出力.mp4>` |
| `build-silent-reel.sh` | ナレーションなしのリール(文字 + テーマソング、15〜20秒)。2026-10-10〜11 に使った型。北村さんの判断で使うのをやめた(機能説明だけに見えるため) | `build-silent-reel.sh <リールのフォルダ> <出力.mp4>`(フォルダに `reel.html`・`durations.txt`) |
| `build-covers.py` | カバー画像(1080×1920)。一覧で 3:4 に切られても文字が残る位置 | `python3 build-covers.py [covers.json] [名前 ...]`(既定は `~/Desktop/KURABELL-reels/covers/covers.json`) |
| `white-icon.py` | @kurabell_workout_log_en のプロフィール写真(白背景) | `python3 white-icon.py` |
| `shoot-sns*.js` | SNS 用のアプリ画面(JP・EN、1320×2868)。`shoot-sns-hr*.js` は Watch のプラグインを模して、上部バーに心拍が出ている記録画面を撮る | Playwright MCP の `browser_run_code_unsafe` に渡す。一覧は `~/Desktop/KURABELL-reels/screens/README.md` |

- 制作フォルダの `build-silent-reel.sh` と `covers/build-covers.py` は、ここを呼ぶだけの入口(古いパスのまま使えるように残している)
- `build-silent-reel.sh` は `-loop 1` を付けない(zoompan は入力1コマから場面を作るので、ループ入力だと1場面目だけの動画になる。2026-10-10 に踏んだ)
- `shoot-sns*.js` はサーバーを立てない。Playwright がページの読み込みをリポジトリのファイルで返す(開発サーバーの上限に当たったため)

- 13時のルーティンは無人で動くので、ここのスクリプトを**絶対パスで単独で**呼ぶ(`.claude/settings.local.json` の許可の一覧に、その形で入れてある。2026-10-12)。呼び方を変えるときは許可の一覧も揃える
