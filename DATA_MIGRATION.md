# データ移行設計(iOS版: Preferences → SQLite)

このファイルは「なぜこの設計にしたか」を残す場所であり、実装の説明を散文で複製する場所ではない。
実装そのものは `src/domain/db/` 以下を読むこと。

## 背景

iOS版はこれまで、トレーニング履歴全体を1個のJSON文字列として Capacitor Preferences
(実体はUserDefaults)へ、保存するたびに丸ごと書き直していた。UserDefaultsは小さな設定値向けの
仕組みで、数年分の履歴を1個のキーにまとめて毎回シリアライズし直す設計は、性能・破損・
保存失敗のリスクを増やす。この問題を解消するのがこの移行の目的。

## ライブラリ選定

**採用: `@capacitor-community/sqlite@^6.0.2`**

- 現在のCapacitorメジャーバージョン(`@capacitor/core: ^6.0.0`)に対して `peerDependencies` が
  `^6.0.0` と一致するのはこのバージョン系列のみ(npm registryを直接確認: 6.0.0/6.0.1/6.0.2は
  `^6.0.0`、7.x以降は `>=7.0.0`、最新の8.1.1は `>=8.0.0` を要求する)。Capacitor本体を7/8へ
  上げない限り、これより新しい系列は入れられない。
- `deprecated` フラグなし、`ios/` ディレクトリに実際のSwiftソース(SQLCipher版sqlite3ラッパー)
  を同梱しており、CocoaPods経由で問題なくビルドできることを本リポジトリで実際に
  `npx cap sync ios` を実行して確認済み(Podが解決され `pod install` が成功している)。
- 代替候補として検討し、採用しなかったもの:
  - `capacitor-data-storage-sqlite`: メンテナが引退を表明しており(README記載)、選外。
  - `@capgo/capacitor-data-storage-sqlite`: 同種のフォーク。今回はコミュニティ版の実績を優先した。
  - `node:sqlite`(Node組み込み): iOSのWKWebView上では動かない(Node.js専用)。**テスト側**の
    フェイクドライバでのみ採用(後述)。
  - 自前でWKWebView + `sql.js`(WASM)を組む案: 実装・保守コストが大きく、ネイティブプラグインで
    足りる要件に対して過剰と判断。

## スキーマ

`src/domain/db/schema.js` に実体。

- `workouts` / `workout_exercises` / `sets`: 年々増え続ける本体データなので正規化。
  外部キーは `workout_id` / `workout_exercise_id`。
- `custom_exercises`: `name` をキーに、種目オブジェクト全体をJSON文字列で1行に保存。
- `settings`: `split` / `profile` / `recentNames` / `exerciseNotes` / `exerciseOverrides` /
  `lastBackupAt` / `guideSeen` を「キー1行=JSON文字列1個」で保存。
  **意図的にカラム分割していない**: これらは形の決まっていない小さな設定値で、
  カラム分割するとフィールドが増えるたびにDDL変更(マイグレーション)が必要になる。
  正規化して守りたいのは「本体データの整合性」であって「設定値のスキーマ」ではないため、
  ここは指示された想定構造から意図的に簡略化した。
- `legacy_migration`: 1行だけの状態テーブル(`id=1` 固定)。旧データ移行が完了したかどうかを持つ。
- `schema_version`: 将来のDDL変更に備えたバージョン番号(現状は1のみ、`addUpgradeStatement`相当の
  仕組みは未実装 — 今回はテーブルを作るだけで、実際のスキーマ変更は発生していないため)。
- 行IDはSQLiteのAUTOINCREMENTに頼らず、書き込み側(`migration.js`)が文字列IDを発行する。
  複数テーブルへのINSERTを1回のトランザクション(`executeSet`)でまとめて送るには、
  外部キーを事前に確定させておく必要があるため。

## 書き込み方式: 「参照が変わっていなければ触らない」最適化

`persist()`(index.html)は、`workouts` 配列を変更しない保存(プロフィール編集・分割変更など)でも
毎回呼ばれる。これを毎回SQLiteの `workouts` 系3テーブルへの全削除+全INSERTにすると、
UserDefaultsで起きていた「小さな変更で履歴全体を書き直す」問題をSQLiteへ移すだけになる。

そこで `workoutStore.js` は、直前に書き込んだ `workouts` 配列への**参照**(`===`)を覚えておき、
参照が変わっていなければ `workouts`/`workout_exercises`/`sets` には一切触れない。
Reactのstateは不変更新(immutable update)なので、変更されていない配列は同じ参照のまま
渡ってくるという前提に乗っている。プロフィール編集や分割変更(圧倒的多数の保存操作)は
`settings` テーブルの数行のUPSERTだけで済み、履歴全体の書き直しは「ワークアウトを終了した」
「削除した」など、実際にworkouts配列が変わったときだけ発生する。

**既知の限界**: workouts配列が変わったときは、今回は「全削除して全部入れ直す」方式にしている
(1個のワークアウトだけを差分挿入する方式ではない)。数年分の履歴でも1回のトランザクションで
数万件のINSERTを投げること自体は現実的な範囲(SQLiteは得意)だが、真に理想的なのは
「変更のあったワークアウトだけを書き込む」差分方式。それには `persist()` の呼び出し元
(index.html、3000行超)に「どのワークアウトが変わったか」を渡す改修が要り、
共通コードを大きく壊すリスクがあるため今回は見送った。将来、体感速度に問題が出るようなら
次の一手として検討する。

## 移行(旧Preferences → SQLite)の手順

`workoutStore.migrateLegacyIfNeeded(legacyJsonGetter)`:

1. `legacy_migration.status` を見る。`'done'` なら何もしない(二重移行防止)。
2. `legacyJsonGetter()` で旧Preferences値を読む(この関数自体は旧データを一切書き換えない)。
3. 旧データが無ければ(新規インストール)、`status='done'` にするだけで終わる。
4. 旧データがあれば `legacyBlobToState()` でパース+検証(壊れていれば例外。この時点では
   何もSQLiteに書き込まれていない)。
5. `buildFullReplaceStatements()` で生成した全INSERT文 + `status='done'` へのUPDATE文を、
   **1回のトランザクション**(`executeSet` / テストでは `BEGIN`~`COMMIT`)としてまとめて実行する。
   途中で1文でも失敗すれば全体がロールバックされ、`status` は `'pending'` のまま残る。

この設計により:

- **移行に成功するまで旧データを削除しない**: `legacyJsonGetter` は読むだけで、
  storage.js側もどこからも旧Preferences値を削除しない(「すべての履歴を削除」操作でユーザーが
  明示的に削除する場合を除く)。
- **移行途中の失敗**は、トランザクションのロールバックにより中途半端な行を残さない。
- **次回起動時の再試行**は、`status` が `'pending'` のままなので、モジュールが再読み込みされる
  次回起動時に自動的にもう一度試みられる(storage.js側は1セッションにつき1回だけ試みる設計。
  同一セッション内で無限リトライしない)。
- **二重移行防止**は `status==='done'` の早期returnで保証。

## Web版への影響

Web版(`window.Capacitor` が無い、またはネイティブでない)は今までどおり
Preferences→localStorageの経路のみを使う。`storage.js` の `nativeSqliteDriver()` は
ネイティブでなければ(あるいはSQLiteプラグインが未登録なら)`null` を返し、
その場合は既存の経路にフォールスルーする。SQLite関連ファイル(`src/domain/db/*.js`)は
Web版でも読み込まれる(index.htmlのLIBS/sw.jsのAPP_ASSETSに追加済み)が、
関数を定義するだけで副作用は起こさないため、Web版の動作には影響しない。

## 保存失敗の扱い

SQLiteが使える環境(ネイティブ+プラグイン登録済み)では、`workout-log-v1` の読み書き失敗を
Preferencesへフォールバックせず、そのまま呼び出し側へ投げる。理由: 失敗のたびに
Preferences/SQLiteへ書き先が入れ替わると、データがどちらか一方に断片化する
(「保存できたと見せかけて実は消えていた」より、明示的なエラー表示の方が安全)。
index.html側の `persist()` は元々 `saveStatus` を "saving"/"saved"/エラー表示で持っており
(直近のコミットで実装済み)、この仕組みにそのまま乗る。

## 検証状況

- ✅ `npm test`: スキーマDDL・移行・setAll/getAll・clearAll・storage.js経路の切り替えを
  Node組み込みの `node:sqlite`(`DatabaseSync`)を使ったフェイクドライバで検証(136件)。
  手書きのモックではなく本物のSQLiteエンジンを使っているため、トランザクションの
  ロールバックや外部キーも含めて検証できている。
- ✅ `npx cap sync ios`: `@capacitor-community/sqlite@6.0.2` が正しく認識され、CocoaPodsの
  `pod install` が成功することを確認(本リポジトリで実行し、"Found 2 Capacitor plugins for ios"
  のログを確認)。
- ✅ `CapacitorSQLite.query()` がiOS側で `[[String: Any]]`(行オブジェクトの配列)を返すことは、
  プラグインのSwiftソース(`CapacitorSQLitePlugin.swift`)を直接確認した
  (npm型定義の "iOS the first row is the returned ios_columns name list" というコメントは
  古い記載で、現行のSwift実装とは一致しないと判断し、ソースコードを優先した)。
- ⚠️ **未検証(Xcode実機/シミュレータが必要)**: `capacitorSqliteDriver.js` から実際に
  ネイティブプラグインを呼び出す経路そのもの(`window.Capacitor.Plugins.CapacitorSQLite`
  経由の生のブリッジ呼び出し)。ビルド・実行環境が無いため、この一枚だけは
  Xcodeでのビルドと実機/シミュレータでの動作確認が必要。TestFlightまたはシミュレータで
  以下を確認すること:
  1. 新規インストールで正常に起動し、記録・保存ができる
  2. 旧バージョンのアプリ(Preferencesにデータがある状態)から更新して、履歴が消えずに
     引き継がれる
  3. 機内モードでも正常に動作する(SQLiteはローカルファイルなので通信は発生しないはずだが、
     プラグインの初期化自体に問題が無いか)
  4. Xcodeの Privacy Report で `PrivacyInfo.xcprivacy` に宣言した
     `NSPrivacyAccessedAPICategoryFileTimestamp` が実際の使用状況と一致しているか

## Privacy Manifest

`ios/App/App/PrivacyInfo.xcprivacy` に以下を追加した(既存の `@capacitor/preferences` 用の
UserDefaults宣言はそのまま)。

- `NSPrivacyAccessedAPICategoryFileTimestamp` / 理由コード `C617.1`
  (自アプリのコンテナ内にあるファイルのタイムスタンプへのアクセス)。
  SQLite本体がDB/ジャーナルファイルの入出力で内部的に `stat`/`fstat` 系APIを使うため。
  プラグイン自身はPrivacy Manifestを同梱していない(`ios/` 配下に `.xcprivacy` が無いことを
  npmパッケージの中身を展開して確認済み)ため、アプリ側で宣言する必要がある。
  理由コードは推測ではなく、Appleの公式カテゴリ定義とこのアプリの実際の使い方
  (DBファイルはアプリのコンテナ内、ユーザーが選んだ外部ファイルではない)を突き合わせて選んだ。

## バックアップとの関係

`src/domain/db/workoutStore.js` の `getAll()` は常にSQLiteの現在の中身を復元するので、
`store.get(STORAGE_KEY)` が返す値は常にSQLiteの最新状態と一致する。`exportBackup()`
(index.html)はReactのstate(persist()のたびにstoreと同期済み)から書き出すため、
結果的に「SQLiteからJSONバックアップを生成する」という要件を満たす。
バックアップのフォーマットバージョン管理・復元時の検証は `src/domain/backupValidation.js` の
`validateBackupPayload()` / `CURRENT_BACKUP_FORMAT_VERSION` を参照。
