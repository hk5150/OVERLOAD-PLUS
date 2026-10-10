# Instagram の制作ツール

リール・カバー・プロフィール写真・SNS 用のアプリ画面を作るスクリプト。**素材と出来上がりは制作フォルダ `~/Desktop/KURABELL-reels/`**
(画像・テーマソング・カバーの文言の一覧)に置き、ここにはスクリプトだけを置く。
13時のルーティン「【毎日13時】KURABELL マーケティング PDCA」はリポジトリを変更しない決まりなので、ルーティンが書き換えるもの
(カバーの文言など)はデータファイルに分けてある。

| ファイル | 何を作るか | 使い方 |
|---|---|---|
| `build-silent-reel.sh` | ナレーションなしのリール(文字 + テーマソング、15〜20秒)。2026-10-10 から新しいリールはこの型 | `build-silent-reel.sh <リールのフォルダ> <出力.mp4>`(フォルダに `reel.html`・`durations.txt`) |
| `build-covers.py` | カバー画像(1080×1920)。一覧で 3:4 に切られても文字が残る位置 | `python3 build-covers.py [covers.json] [名前 ...]`(既定は `~/Desktop/KURABELL-reels/covers/covers.json`) |
| `white-icon.py` | @kurabell_workout_log_en のプロフィール写真(白背景) | `python3 white-icon.py` |
| `shoot-sns*.js` | SNS 用のアプリ画面(JP・EN、1320×2868) | Playwright MCP の `browser_run_code_unsafe` に渡す。一覧は `~/Desktop/KURABELL-reels/screens/README.md` |

- 制作フォルダの `build-silent-reel.sh` と `covers/build-covers.py` は、ここを呼ぶだけの入口(古いパスのまま使えるように残している)
- `build-silent-reel.sh` は `-loop 1` を付けない(zoompan は入力1コマから場面を作るので、ループ入力だと1場面目だけの動画になる。2026-10-10 に踏んだ)
- `shoot-sns*.js` はサーバーを立てない。Playwright がページの読み込みをリポジトリのファイルで返す(開発サーバーの上限に当たったため)
