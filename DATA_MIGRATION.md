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

- ✅ `npm test`: スキーマDDL・移行・setAll/getAll・clearAll・storage.js経路の切り替え・
  `capacitorSqliteDriver.js` の行データ正規化を、Node組み込みの `node:sqlite`
  (`DatabaseSync`)を使ったフェイクドライバ、および実際の生データ形状の単体テストで検証
  (141件)。手書きのモックではなく本物のSQLiteエンジンを使っているため、トランザクションの
  ロールバックや外部キーも含めて検証できている。
- ✅ **Xcodeシミュレータ(iPhone 17 Pro)での実機相当検証を完了**。以下を実際に確認した:
  - ビルド・新規インストール・起動
  - アプリを完全終了(`simctl terminate`)→再起動しても、設定・履歴が壊れずに読み込める
  - **旧バージョンからの更新シナリオ**: Preferencesへ旧形式JSON(ワークアウト2件・分割・
    プロフィール込み)を直接書き込んでから起動し、SQLiteへの自動移行→UIへの正しい反映
    (分割のcursor位置、直近7日間の部位別集計まで)を確認。移行後も旧Preferencesデータが
    削除されずに残っていることも確認(設計通り)
  - **二重移行防止**: 移行後にもう一度完全終了→再起動しても、`workouts`テーブルの件数・IDが
    変わらないこと(重複挿入されないこと)を確認
  - `sqlite3` CLIでSQLiteに直接テスト行をINSERTし、「前回の記録」としてUIに正しく表示される
    こと(このアプリの中心機能)、履歴タブへの反映まで確認
  - 「バックアップを書き出す(JSON)」をタップし、iOSの共有/ファイル保存シートが正しく
    開くことを確認
- ✅ `npx cap sync ios`: `@capacitor-community/sqlite@6.0.2` が正しく認識され、CocoaPodsの
  `pod install` が成功することを確認("Found 2 Capacitor plugins for ios" のログを確認)。
- ⚠️ **未検証**: 実際のTestFlight配布経由でのアップデート(今回はシミュレータ上で
  Preferencesを直接書き換える形で模擬)。機内モード相当のオフライン動作
  (シミュレータはホストMacのネットワークを共有しており、Macごとネットワークを切ると
  他の作業に影響するため今回は実施せず。主要機能はコード上もともと通信を必要としない設計)。
  「すべての履歴を削除」ボタンの実機タップ操作(座標特定が難航したため断念。
  `clearAll()`自体は`tests/db/workoutStore.test.js`・`tests/storage.test.js`で
  SQLite/Preferences両方から削除されることを単体テスト済み)。

### 実機検証で見つけた不具合(修正済み)

Xcodeシミュレータでの検証中に、**`CapacitorSQLite.query()` の戻り値の実際の形が
当初の想定と違う**という重大なバグを発見し、修正した。

- **症状**: アプリを初回起動→ガイド完了(初めての`persist`が走る)→完全に終了して
  再起動すると、「保存されている記録を正しく読み込めませんでした(JSON Parse error:
  Unexpected identifier "undefined")」というエラーが再現性高く発生した。
- **調査**: `sqlite3` CLIでSQLiteファイルを直接開いて中身を確認したところ、
  保存されているデータ自体は正常なJSON文字列だった。つまり書き込みではなく
  **読み込み側**(`capacitorSqliteDriver.js`の`all()`)に問題があると判明。
  一時的に生のレスポンスをエラーメッセージとして投げるデバッグコードを仕込み、
  実機ログではなく画面上のエラーバナーから実際の値を直接確認する方法で特定した
  (WKWebViewのコンソールにXcode無しでは到達できなかったため)。
- **真因**: `query()`の`values`配列は、**先頭要素だけが`{"ios_columns": [列名, ...]}`という
  特殊なメタデータ行で、2番目以降は最初から`{列名: 値, ...}`という正しい行オブジェクト**、
  という形式だった。型定義ファイルの "iOS the first row is the returned ios_columns name
  list" というコメントはこの意味であり、古い記載ではなく正しい仕様だった。
  当初これを「Swiftソースの`[[String: Any]]`をそのまま返す」と誤読し、
  ヘッダー行を無視して先頭行もデータとして扱ってしまっていた。
- **修正**: `capacitorSqliteDriver.js`に`normalizeRows()`を追加し、先頭の
  `ios_columns`メタ行だけを取り除く。`tests/db/capacitorSqliteDriver.test.js`で
  実際に観測した形状に対する回帰テストを追加(node:sqliteのフェイクドライバでは
  この形状差は再現しないため、実データ形状の単体テストとして別途カバーしている)。
- **検証**: 修正後、同じ手順(新規インストール→ガイド完了→完全終了→再起動)で
  エラーが解消したことを確認。さらに`sqlite3`で`workouts`/`workout_exercises`/`sets`に
  直接テスト行をINSERTしてから再起動し、「前回の記録」(過去の自分 101.3kg、
  80kg×8回など)がUIに正しく表示されること、履歴タブに一覧表示されることまで確認した。
  これによりこのアプリの中心機能(前回の実績を見せる)がSQLite経由で実際に動作することを
  実証できた。

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
