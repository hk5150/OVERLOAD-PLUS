# Notion の運用データ(定時タスクの書き込み先)

2026-11-19、北村さんの依頼で、施策ボード・App Store の指標・台帳・毎朝のDL集計の書き込み先を
Obsidian(`~/Library/Mobile Documents/com~apple~CloudDocs/Obsidian AI連携/Projects/`)から Notion に移した。
**Obsidian のノートは消さずに残してあるが、以後は更新しない(読むのは過去の経緯を追うときだけ)。**

## 置き場所

Notion「AIコンテキスト（共通）/ 個人開発プロジェクト / KURABELL Workout Log / 運用データ(定時タスクの書き込み先)」
<https://www.notion.so/41c4d3c471e8819ea63fc946ae4250a9>

このページの本文に、施策ボードの決まり(使い方・状態の流れ・自動でやってよい範囲)と、移行前の原本(Obsidian の .md 6本の添付)がある。

| データベース | data_source_id(行を足すときの parent) | 旧 Obsidian | 書く回 |
|---|---|---|---|
| 施策ボード | `41c4d3c4-71e8-811b-b456-000bebfcbbd8` | `kurabell-pdca.md` の施策一覧 | 12時・13時・06:10 |
| App Store 実績ログ | `41c4d3c4-71e8-81b0-abf8-000b5887a753` | `kurabell-metrics.md` の表 | 12時 |
| App Store 日ごとの入口 | `41c4d3c4-71e8-81cb-8858-000b4efab0ab` | `kurabell-appstore-daily.md` | 12時 |
| 日次ダウンロード | `41c4d3c4-71e8-81b2-8692-000b7056443a` | `app-downloads-daily.md` | 06:10(06:00 の launchd が取った数字を写す) |
| 分析ノート | `41c4d3c4-71e8-81f5-9620-000b2fac035b` | `kurabell-metrics.md` の「分析と対策」「分析の学び」、`kurabell-pdca.md` の「週のふりかえり」「朝のメールの提案の出し方」 | 12時・06:10 |
| ユーザーの声 台帳 | `41c4d3c4-71e8-81c9-8d8c-000b17edb878` | `kurabell-feedback.md` | 12時 |
| 朝の4役 学び | `41c4d3c4-71e8-8136-a767-000b79d6d102` | `kurabell-morning-lessons.md` | 朝の4役の品質チェック |

列(プロパティ)の名前:

- 施策ボード: `施策ID`(タイトル。P001…)・`起票日`・`対象`・`施策`・`狙う指標`・`状態`・`実施日`・`判定日`・`判定日(メモ)`・`結果`・`メモ`・`出典`
- 実績ログ: `取得日`(タイトル)・`日付`・`データ最終日`・`表示`・`閲覧`・`初回DL`・`再DL`・`CVR`・`IAP件数`・`収益`・`メモ`
- 日ごとの入口: `日付キー`(タイトル。YYYY-MM-DD)・`日付`・`表示`・`閲覧`・`初回DL`・`閲覧率`・`CVR`
- 日次ダウンロード: `日付キー`(タイトル)・`日付`・`KURABELL 初回`・`KURABELL 再DL`・`HEART HIIT 初回`・`HEART HIIT 再DL`・`レポート`(あり / なし)・`取得`
- 分析ノート: `題`(タイトル)・`日付`・`種類`(分析と対策 / 週のふりかえり / 分析の学び / 提案の出し方)・`書いた回`。中身はページ本文
- ユーザーの声 台帳: `要約`(タイトル)・`日付`・`入口`・`分類`・`状態`・`元`
- 朝の4役 学び: `決まり`(タイトル)・`区分`(必ず守ること / 試してよいこと / 改善と判定)・`日付`・`くり返し`・`判定`・`有効`

## 書き方の決まり(定時タスク向け)

- 使うツールは Notion コネクタの `notion-fetch`(データベースやページを読む)・`notion-query-data-sources`(条件で行を探す)・
  `notion-create-pages`(行を足す。parent は `{"type":"data_source_id","data_source_id":"…"}`)・`notion-update-page`(行を書き換える。`update_properties`、本文に足すのは `insert_content`)。
  ツール名の前置きは `mcp__notion__` のことも、別の接続名のこともある。どちらでもよい
- 行を探すときは `notion-query-data-sources` の `mode: "rows"`(filter・sort つき)を先に使う。SQL モードはプランによって回数の上限があり、使い切ると止まる
- 日付の列は `date:日付:start` のように書く。数の列は数値で書く。チェックは `__YES__` / `__NO__`
- 日付のある表(実績ログ・日ごとの入口・日次ダウンロード)は**1日1行**。同じ日付の行があれば足さずに書き換える
- テキストの列は1つ1,900字まで。長いメモは列には要点だけ入れ、全文はその行のページ本文に `insert_content` で足す
- 施策ボードで北村さんが書いた「採用」「却下」「中止」は書き換えない(これまでと同じ)
- **Notion に書けなかったとき**(接続切れ・エラー・許可待ちになりそう)は、書くはずだった中身を
  `/Users/hajimekitamura/OVERLOAD-PLUS/reports/notion-fallback/<タスク名>-YYYY-MM-DD.md` に Write で残し、報告の先頭に「Notion に書けず(理由)」と書く。
  **Obsidian には戻さない**(2か所に分かれると、どちらが正か分からなくなる)。次の回か人のいるセッションが Notion に写す

## Notion 以外に残したもの(理由つき)

- `reports/downloads/latest.md`(06:00 の launchd が書く): launchd は Notion のコネクタを使えない(API の鍵を Mac に置いていない)ので、
  数字はいったんここに置き、06:10 の定時タスクが Notion の「日次ダウンロード」に写す。06:00 は Obsidian へのコピーをやめた
- `reports/appstore/kurabell-metrics.md`・`kurabell-appstore-daily.md`: `marketing/tools/dashboard-digest.py`(Python)が読むための写し。
  12時の回が Notion に書いたあと、同じ表をここにも書く。正は Notion
- Obsidian に残したまま(今回は移していない): `kurabell-reel-pdca.md`(リールの PDCA)・`kurabell-instagram-metrics.md`(`~/Insta/kurabell/insights.py` が launchd で書く)・
  `kurabell-pdca-drafts/`(施策の文案)・`kurabell-follow-candidates.md`。移すなら、insights.py が Notion に書く手段(Notion の連携トークン)が要る

## 移行のときに決めたこと

- 長い施策のメモと 2026-11-08 以前の「分析と対策」は、Notion では要点だけにした。全文は親ページに添付した原本で読める
- 「施策ボード」の決まりの文章は、データベースではなく親ページの本文に置いた(ルーティンは読むだけで、書き換えるのは北村さん)
