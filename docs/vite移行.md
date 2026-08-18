# ビルド化(Vite/esbuild)に関する決定事項メモ

対象: iOSアプリ(Capacitor)の起動速度改善のためのビルド化作業。
GitHub Pages配信用の`index.html`本体は対象外(後述)。

## 背景

外部レビューでの指摘:
- `vendor/babel.min.js`が2.87MB(gzip後604KB)あり、起動のたびに`Babel.transform()`で約3,500行のJSXを変換していた
- 実測(デスクトップ、高速CPU): `Babel.transform()`単体で160〜200ms。実機のiPhone(特に旧機種)ではこれより数倍かかる可能性が高い
- `eval()`を使う構成のため、CSPを`unsafe-eval`なしまで厳格化できない
- App Store審査そのものをブロックする要因ではないが(起動速度・CSP・審査時の説明のしやすさの観点で)不利

## 決定事項

### 1. Vite全面移行ではなく、iOSビルド(`www/`)だけをスコープにした

このリポジトリの`index.html`は「ビルド不要で直接編集できる」ことを設計原則にしている(CLAUDE.md参照)。もともとclaude.aiのArtifactとして作られた経緯もあり、GitHub Pages配信用の`index.html`をビルド成果物にしてしまうと、その原則が崩れる。

そのため:
- **GitHub Pages版(`index.html`)は無変更。** 今まで通りランタイムBabelで動く。zero-buildのまま
- **Capacitor(`www/`)側だけ**、`npm run sync-www`実行時に事前ビルドする方式にした

### 2. Babel(`@babel/core`)ではなくesbuildを採用

- 依存が軽い(単一バイナリ、`@babel/core`+プラグイン一式より小さい)
- JSX→`React.createElement`のclassic変換を明示的に指定でき、既存コード(グローバルの`React`/`ReactDOM`を使うUMD構成)とそのまま噛み合う
- 変換速度が速く、`npm run sync-www`の実行コストが問題にならない

### 3. 出力の構成

`scripts/sync-www.js`が以下を行う:
1. `index.html`から`<script type="text/plain" id="appsrc">`のJSXを取り出す
2. esbuildで事前トランスパイル(`jsx: "transform"`, `target: "es2019"` — `??`/`?.`等のES2020構文を下位互換のため変換)
3. `www/app.bundle.js`として書き出す
4. `www/index.html`の起動スクリプトを、ライブラリを順に読み込む`<script src>`列 + `<script src="app.bundle.js">`だけの単純な形に差し替え(Babel読み込み・`Babel.transform()`・`eval()`はすべて無し)
5. `vendor/babel.min.js`(2.87MB)は`www/vendor/`にコピーしない

## 変更したファイル

| ファイル | 内容 |
|---|---|
| `scripts/sync-www.js` | 事前ビルドロジックを追加(esbuildでJSX変換、www/index.htmlの起動スクリプトを書き換え) |
| `package.json` / `package-lock.json` | `esbuild`をdevDependencyに追加 |
| `.claude/launch.json` | `www/`をそのまま配信して検証するための`kurabell-www`エントリを追加(ポート8766) |

`index.html` / `sw.js`(ルート、GitHub Pages配信用)は今回のビルド化そのものでは変更していない。

## 検証内容

- `npm run sync-www`実行 → `www/app.bundle.js`(228KB、`React.createElement`呼び出しに正しく変換済み、生のJSX構文は残っていないことを確認)
- `www/`を`kurabell-www`でそのまま配信し、Babel読み込みなし・コンソールエラーなしで起動することを確認
- 分割選択・種目検索・種目追加・セット入力の一連の操作がソースビルド(ランタイムBabel版)と同じ挙動であることを確認

## 残っている課題

### ビルド化まわり
- 実機(iPhone)での起動時間の体感比較は未実施(ローカルでの計測のみ)
- `www/`をさらに圧縮・minifyするかは未検討(esbuildの`minify`オプションは現状オフ)

### 外部レビューで指摘され、まだ着手していない項目
1. ~~**Service Worker**: `vendor/*`をキャッシュ優先にする、`fetch`にタイムアウトを設け電波が弱い環境でのハングを防ぐ、同一origin以外(Google Fonts等)を捕捉しないようスコープを絞る~~ → 対応済み(`sw.js`, CACHE v63)。vendor/\*はキャッシュ優先+ネットワークからの補充、アプリ本体は`AbortController`で4秒タイムアウト後キャッシュへフォールバック、同一origin以外はfetchハンドラで捕捉しないよう`return`で除外。
2. ~~**データ安全性**: `navigator.storage.persist()`の呼び出し、`importBackup`の事前スナップショット退避+検証強化~~ → 対応済み(CACHE v64)。起動時に`navigator.storage.persist()`を呼ぶuseEffectを追加。`importBackup`はワークアウト配列/日付/種目名/セット配列の最低限の構造検証を先に行い、確認ダイアログを通過した後に現在のデータを`workout-log-v1-pre-import`へスナップショット退避してから復元するように変更。
3. ~~**Reactの整合性**: `EXERCISE_OVERRIDES`(モジュールレベル`let`)が`liveVolume`/`weekly`/`prMap`の`useMemo`依存配列に含まれておらず、可動域係数等を変更しても集計に即反映されない~~ → 対応済み(CACHE v64)。`prMap`/`weekly`/`liveVolume`に加えて、同じく`exVolume`経由でROM上書きを参照している`compareBase`/`sameSplitSessions`の依存配列にも`exerciseOverrides`を追加。
4. ~~**パフォーマンス**: 種目メモ欄が1文字ごとに全データを`persist`(JSON.stringify+localStorage書き込み)している。下書き保存の`useEffect`も同様。デバウンス化が必要~~ → 対応済み(CACHE v64)。種目メモ欄は`ExerciseNoteEditor`コンポーネントを新設し、入力中はローカルstateのみ更新、600ms入力が止まってから`persist`を呼ぶように変更。下書き保存の`useEffect`(today/startAt/restStartAt)も800msデバウンス化(`visibilitychange`/`pagehide`での即時flushは変更なし)。
5. ~~**堅牢性**: React ErrorBoundaryが無く、マウント後の例外で画面が白くなると復旧手段がない~~ → 対応済み(CACHE v64)。`ErrorBoundary`クラスコンポーネントを追加し、`<App />`をラップ。例外発生時は再読み込みを促すフォールバック画面を表示(記録データ自体はlocalStorageに残るため消えない)。
6. ~~**アクセシビリティ**: viewportの`maximum-scale=1`がピンチズームを殺している~~ → 対応済み(CACHE v64)。viewport metaから`maximum-scale=1`を削除。

すべて対応済み。次にやるとすれば「ビルド化まわり」の2件(実機起動時間の実測、`www/`のminify検討)。

---

# 2026-08-16: 改名・iOS SQLite移行・App Store申請準備

このセクションはビルド化(上記)とは別件。同じ「決定事項メモ」として一箇所にまとめておく。

## 決定事項

### 1. アプリ名を「KURABELL Workout Log」に変更

`OVERLOAD+`という名前が既存アプリ(KOSEI MASUDA氏の「筋トレ・ワークアウト・ジム 記録 - Overload+」)と
衝突していたため改名。検討順序: OVERLOAD+ → MAESET → KURABELL+ → KURABELL Workout Log(最終)。

- Bundle ID: `com.hajime5150.kurabellplus`(未申請だったため自由に変更できた)
- App Store掲載名・タイトル類は正式名「KURABELL Workout Log」
- ホーム画面アイコンラベル・アプリ内ヘッダーロゴは「KURABELL」(コンパクト表記。
  `manifest.json`の`name`/`short_name`の使い分けと同じ考え方。文字数制限・見切れ対策)
- リポジトリ名・GitHub Pages URL(`OVERLOAD-PLUS`)は意図的に変更していない
  (審査上必須ではなく、変更するとリンクが切れるリスクの方が大きいため)

### 2. iOS版の永続化をCapacitor Preferences(UserDefaults)からSQLiteへ移行

数年分のトレーニング履歴を1個のJSON文字列としてUserDefaultsへ毎回丸ごと書き直す設計は、
性能・破損・保存失敗のリスクがあったため。採用ライブラリは`@capacitor-community/sqlite@^6.0.2`
(現在のCapacitor 6系と`peerDependencies`が一致する最後の系列)。設計判断・スキーマ・移行手順の
詳細は[DATA_MIGRATION.md](../DATA_MIGRATION.md)を参照。ここでは要点だけ:

- `workouts`/`workout_exercises`/`sets`のみ正規化。`settings`/`custom_exercises`はキー1行=JSON文字列1個
  (形の決まっていない小さな設定値をカラム分割すると、フィールド追加のたびにDDL変更が要るため)
- 旧Preferencesデータからの移行は1回きり・1トランザクション・失敗しても次回起動時に再試行可能
- `workouts`配列への参照が変わっていない保存(プロフィール編集など)はworkouts系テーブルに触れない
  最適化(UserDefaults時代の「小さな変更で履歴全体を書き直す」問題を繰り返さないため)
- Web版は変更なし(引き続きlocalStorage)。`src/domain/storage.js`が`workout-log-v1`キーだけを
  ネイティブ+SQLiteプラグインが使える環境でSQLite経由にすり替える

### 3. Xcodeシミュレータでの実機相当検証で見つけたバグを修正

`CapacitorSQLite.query()`の戻り値(`values`配列)は、**先頭要素だけが`{"ios_columns":[列名,...]}`
という特殊なメタデータ行**という仕様だった。Swiftソースの型だけを見て「先頭行も含めて全部が
`{列名:値}`の行オブジェクト」と誤読して実装し、実機で「settings行のJSON.parseに失敗」という
バグを引き起こした。`capacitorSqliteDriver.js`に`normalizeRows()`を追加して修正。
詳細は[DATA_MIGRATION.md](../DATA_MIGRATION.md)の「実機検証で見つけた不具合」を参照。

同じ検証で、旧バージョンからの更新(Preferencesに旧データがある状態からの起動)・二重移行防止・
前回記録の表示・バックアップ書き出しが実機で正しく動作することも確認済み。

### 4. その他のP0対応

- `support.html`新規作成、Support URLをmailtoから`support.html`のURLに変更
- Privacy Manifest(`PrivacyInfo.xcprivacy`)にSQLite用のFile Timestamp API宣言(`C617.1`)を追加
- YouTube検索機能とprivacy.html/APPSTORE.mdの「外部通信なし」表記の矛盾を解消
  (「主要機能はオフライン、YouTube検索時のみ外部接続」という正確な記述に統一)
- バックアップJSONに`formatVersion`/`appVersion`/`platform`を追加、復元時の検証を強化
  (数値異常・日付・未知のformatVersion拒否)
- 初回起動時に分割設定を強制せず「今すぐ記録する」を選べるように変更。分割未設定での
  初回記録後に「メニューとして保存しますか?」と提案する導線を追加
- アクセシビリティ: 未ラベルのアイコンボタンに`aria-label`追加、狭い画面幅(iPhone SE相当)での
  ボタン折り返し崩れを修正、通知音トグルに`role="switch"`/`aria-checked`を追加

## 変更したファイル(主なもの)

| ファイル | 内容 |
|---|---|
| `index.html` | 改名、SQLite関連ファイルのLIBS追加、初回体験改善、a11y修正 |
| `src/domain/storage.js` | `workout-log-v1`のみSQLite経由に振り分けるルーティングを追加 |
| `src/domain/db/schema.js` | SQLiteスキーマ定義(新規) |
| `src/domain/db/migration.js` | 旧JSON⇔SQLite行の変換ロジック(新規) |
| `src/domain/db/workoutStore.js` | 移行・読み書きのオーケストレーション(新規) |
| `src/domain/db/capacitorSqliteDriver.js` | ネイティブSQLiteプラグインへの薄いラッパー(新規) |
| `src/domain/backupValidation.js` | `validateBackupPayload`・formatVersion検証を追加 |
| `capacitor.config.json` / `ios/App/App/Info.plist` / `ios/App/App.xcodeproj/project.pbxproj` | 改名・SQLiteプラグイン設定 |
| `ios/App/App/PrivacyInfo.xcprivacy` | File Timestamp API宣言を追加 |
| `support.html` / `MONETIZATION.md` / `APP_REVIEW_CHECKLIST.md` / `DATA_MIGRATION.md` | 新規作成 |
| `APPSTORE.md` / `README.md` / `CLAUDE.md` / `IOS_SUBMISSION_GUIDE.md` / `privacy.html` | 改名・内容更新 |
| `tests/db/*.test.js` / `tests/helpers/fakeSqliteDriver.js` | SQLite永続化層のテスト(新規、node:sqliteのフェイクドライバ使用) |

コミット: `c7ca114`(改名+SQLite移行本体)〜`374e930`(移行検証)。

## 検証内容

- `npm test`: 141件パス(スキーマ・移行・setAll/getAll・storage.js経路切り替え・
  実機で踏んだ行データ形状の回帰テストを含む)
- Xcodeシミュレータ(iPhone 17 Pro)で実際にビルド・起動・操作して確認:
  新規インストール、アプリ完全終了後の再起動、旧バージョンからの更新、二重移行防止、
  前回記録のUI表示、バックアップ書き出し

## 残っている課題

- **TestFlight/実機(シミュレータでなく物理iPhone)での最終確認は未実施**
- 機内モード相当のオフライン動作確認はシミュレータでは検証困難だったため未実施
  (Macのネットワークを切ると他の作業に影響するため。主要機能はコード上もともと
  通信を必要としない設計)
- 「すべての履歴を削除」ボタンの実機タップ操作は座標特定が難航し断念
  (`clearAll()`自体はunit testでSQLite/Preferences両方から削除されることを確認済み)
- P1のうち休憩タイマーのiOS通知は対象外(現状維持でよいとの指示)
- P2(可動域係数のオン/オフ、推定1RMの説明改善)は未着手
- StoreKit実装は未着手(`MONETIZATION.md`で案A「買い切り」を推奨、実装はこれから)
- ホーム画面に旧Bundle ID(`overloadplus`系)の古いインストールが別アプリとして残っている
  可能性がある(実機で不要なら手動削除が必要)

---

# 2026-08-18: 開発支援エージェントチームの構築

このセクションもビルド化・SQLite移行(上記)とは別件。

## 背景

多言語化Phase 1〜3の作業中に、実装者本人が同じ文脈で確認したために見逃した不具合が2件あった
(英語文言の前置詞重複、セーフエリアの原因を実測せず断定して誤記録)。どちらもテストでは
捕まらない種類で、別文脈からの検証が要ると判断し、調査・検証専用のサブエージェントを構築した。

## 決定事項

### 1. 実装はメインスレッド1本、サブエージェントは調査と検証に限定

`index.html`に3,776行が集中しており、実装を複数エージェントに分割すると衝突と設計の
不整合を招くため。実装用サブエージェントは作らない。

### 2. 当初案を調査で3点修正

- **`npm test`は既にJSX構文エラーを捕捉していた**(`tests/sync-www.test.js`の`beforeAll`で
  `build()`を実行し、esbuildが`#appsrc`をJSXとしてパースするため)。CLAUDE.mdの罠リスト筆頭
  「JSXの構文エラーはBabelが走るまで表面化しない」への正しい打ち手はエージェントでなくフックだった
- **逆にテストは「起動するか」を一切保証していない**(`vitest.config.mjs`に明記のとおり
  `index.html`自体は実行しない)。ここが実は最大の穴で、当初案の5エージェントはどれも
  埋めていなかった。`boot-check`エージェントを追加して対応
- **CLAUDE.mdの「SQLite未検証」記述が既に腐っていた**(`6b4d1b4`・`374e930`で検証済みだった)。
  エージェント構築前に訂正した

`security-auditor`は認証・認可・シークレットが存在せず空振りしやすいため削除し、
観点は`reviewer`と外部通信テストの強化に吸収した。

### 3. 各エージェント共通の制約

- `www/`と`ios/App/App/public/`は生成物なので調査対象外
  (`app.bundle.js`に同じコードがもう2セット存在し、誤って実装箇所として引用する事故が起きるため)
- 行番号でなく一意なコード片を引用する(複数セッションが並行編集するため行番号は陳腐化する)
- CLAUDE.mdの罠一覧をエージェント定義に複製しない(複製すると更新時にそちらが先に腐る)

## 変更したファイル

| ファイル | 内容 |
|---|---|
| `.claude/agents/explorer.md` | `#appsrc`(3,776行)への横断調査(新規、sonnet指定) |
| `.claude/agents/researcher.md` | 外部技術調査。既定ではファイルに書き出さない(新規) |
| `.claude/agents/reviewer.md` | 実装後の別文脈レビュー。重大/改善提案/好みの3分類(新規) |
| `.claude/agents/tester.md` | 不足テストの追加のみ。既存テストのアサーション変更禁止(新規) |
| `.claude/agents/boot-check.md` | 起動確認(Web版8765とwww版8766の両方を必ず開く)(新規) |
| `.claude/hooks/run-tests.sh` | `index.html`等の編集後に`npm test`を自動実行し、失敗をadvisoryで通知(新規) |
| `.claude/settings.json` | `permissions.deny`で`www/`と`ios/App/App/public/`への書き込みを拒否、`run-tests.sh`をフック登録 |
| `CLAUDE.md` | SQLite未検証の記述を実態に訂正、「検証手段と、その守備範囲」「進め方」セクションを追記 |
| `tests/sync-www.test.js` | 外部ホスト検査を拡張(`src`/`href`属性だけでなく`fetch`/XHR/WebSocket/CSSの`url()`まで) |

## 検証内容

- `npm test` 187件通過
- JSX構文エラーを故意に挿入し、`run-tests.sh`フックが検出・原因特定まで示すことを確認
- `fetch("https://...")`を故意に挿入し、拡張した外部通信検査が検出することを確認
- `www/`配下へのEditが`permissions.deny`で実際にブロックされることを確認
- 5エージェント全ての frontmatter を検証(`name`/`description`必須、`tools`/`model`/`memory`)

コミット: `fe201a8`。

## 残っている課題

- `.claude/agents/`はセッション再起動後でないと読み込まれない。構築したセッション内では
  `reviewer`を実際に呼べておらず、動作確認は未実施
- 次のセッションで5エージェントを実際に走らせて、意図どおりの粒度・判定が返るか確認する必要がある
- `security-auditor`の代替としたテスト強化(外部通信チェック)は1回の実装のみ。
  新しい通信APIが増えたときに検出パターンを追従できるかは未検証
