# App Store Connect API の道具(`scripts/asc/`)

2026-10-09 に作った。これまで Chrome で App Store Connect の画面を操作していた作業を、API で行う。画面の作業では次の罠を踏んでいた:
- 入力の途中でログインが切れる
- 「⋯」「✕」が無効な文字で保存できない
- メディアマネージャーで欄が畳まれる
- 別のセッションと同時に入力してぶつかる

キーはリポジトリに置かない。`~/.appstoreconnect/kurabell.json` と `private_keys/AuthKey_<keyId>.p8` を使う。日次の指標取得・`npm run ios:upload` と同じキー。

**書き込む操作は、どれも `--apply` を付けたときだけ行う。** 付けなければ、何をするか(差分)を表示して終わる。
`--apply` のときは `.claude/locks/` に印があると止まる(自分の印なら `--ignore-locks`)。審査への提出は、さらに `--yes-submit` が要る。

| やること | コマンド |
|---|---|
| 審査・配信・ビルドの状態(前回から変わったことを先頭に) | `node scripts/asc/status.mjs`(`--json` はルーティン用) |
| 今の掲載情報をファイルに写す | `node scripts/asc/metadata.mjs pull 1.3` → `appstore/1.3/` |
| 掲載情報を入れる(版が無ければ作る。読み戻して確かめる) | `node scripts/asc/metadata.mjs push 1.4 --apply` |
| 版にビルドを付ける | `node scripts/asc/metadata.mjs build 1.4 17 --apply` |
| 提出できる状態か確かめる | `node scripts/asc/metadata.mjs check 1.4` |
| 審査へ提出(**北村さんの確認を取ってから**) | `node scripts/asc/metadata.mjs submit 1.4 --apply --yes-submit` |
| TestFlight の処理を待って「テスト内容」を入れる | `node scripts/asc/testflight.mjs 17 --wait --apply`(`ios:upload` の最後で自動) |
| スクリーンショットを丸ごと入れ替える | `node scripts/asc/screenshots.mjs 1.4 --dir ~/Desktop/KURABELL-appstore-screenshots/v5 --exclude 08 --apply` |
| カスタマーレビューを読む / 返信(**確認を取ってから**) | `node scripts/asc/reviews.mjs` / `reviews.mjs reply <id> --text "…" --apply` |

## 掲載情報のファイル(`appstore/<版>/`)
- `ja/` と `en-US/` に `description.txt`・`keywords.txt`・`promotional_text.txt`・`whats_new.txt`
- `review_notes.txt`(審査メモ。連絡先は App Store Connect 側のまま)
- `testflight_ja.txt`(TestFlight の「テスト内容」)

無いファイルの項目は触らない。サブタイトル・アプリ名は扱わない(変えないと決めている)。
**`APPSTORE.md` は経緯と判断の記録、`appstore/<版>/` は実際に入れる文面**、と分ける。次の版は、前の版のフォルダを写してから直す。

## 日次ルーティンとの関係
「【毎日12時】KURABELL App Store実績」が `status.mjs --json` と `reviews.mjs --json` を読む(審査の変化・差し戻し・新しいレビューの報告)。
前回の状態は `~/Library/Caches/kurabell-asc/` に残る(キーの置き場の `~/.appstoreconnect/` には書かない)。ルーティンは `--apply` を使わない。

## 確かめたこと・まだのこと(2026-10-09)
- 確かめた:
  - `status`・`reviews`(読むだけ)
  - `metadata pull 1.3`。`push 1.3` でも差分が出ず、往復で一致する
  - `testflight 17 --apply`(1.4 (17) に「テスト内容」を入れ、読み戻して一致)
  - `screenshots`(差分の表示まで)
- まだ: `metadata push --apply`(版を作るところから)・`build`・`submit`・`screenshots --apply`。1.4 の提出のときに初めて実際に動かす。
  失敗したら、画面で直してから、このファイルに罠を書き足す
