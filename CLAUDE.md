# CLAUDE.md

このファイルは、コードを読めば分かることを書き写す場所ではない。
**「なぜそうなっているか」と「触るときに踏み抜きやすい罠」だけを書く。**
実装の説明を散文で複製すると必ず実装より先に腐り、実際に一度そうなった
(「sw.jsにvendorのcache-first経路はない」と書いてあったが、実際にはあった)。

## これは何か

KURABELL Workout Log は漸進性過負荷にもとづく筋トレ記録PWA。**中心にある考え方は「前回の実績をそのまま見せて、判断はユーザーに委ねる」**。
各セット行に前回の同じ番手のセット(重量×回数×RIRと、同一負荷なら余力の差分)を並べるのが主機能で、
自動でメニューを判定する層は持たない。以前あった決定論的ルールエンジン(`analyzeExercise`)は
削除済み(コミット `6af3353`)。復活させたくなったらgit履歴から。

バックエンドなし。全てクライアントで動く。

## 配布経路が2つあり、実行のしかたが違う

| | Web (GitHub Pages) | iOS (Capacitor) |
|---|---|---|
| 配信元 | リポジトリ直下の `index.html` | `www/`(生成物・gitignore) |
| JSX変換 | ブラウザ上でランタイムBabel + `eval` | esbuildで事前ビルド → `app.bundle.js` |
| Service Worker | 使う (`sw.js`) | **使わない**(バンドル内配信なので不要) |
| 保存先 | localStorage | SQLite(`workout-log-v1`のみ) + Capacitor Preferences(それ以外) |

**Webをビルド不要に保つのは意図的**(単一ファイルをpushすれば配信される手軽さを優先)。
その代償として、実行経路がiOSと分岐している。片方だけで動作確認して満足しないこと。

- Web: `python3 -m http.server` などで配信して `index.html`(`file://`不可、SWとmanifestに実オリジンが要る)
- iOS: `npm run ios:sync` → Xcode。`www/` は手で編集しない
- `npx cap sync ios` がCocoaPodsのエンコーディングエラーで落ちるときは `LANG=en_US.UTF-8` を付ける

## 踏み抜きやすい罠

- **`#appsrc` の中を編集する。** アプリ本体は `<script type="text/plain" id="appsrc">` の中にある。
  ブラウザは直接実行しないので、**JSXの構文エラーはBabelが走るまで表面化しない**(白画面ではなく起動エラー画面に出る)。
- **バージョンは2箇所ある。** `sw.js` の `CACHE` と、ヘッダーのバッジ。
  片方だけ上げると、SWが古い `index.html` を配り続けて「直したはずの変更が返ってこない」という無症状の不具合になる。
  `tests/version.test.js` が一致を強制しているので、忘れてもテストが落ちる。
- **`today`(記録中の状態)の更新は必ず関数形式で。** `setToday(t => ...)`。
  ステートの取り違えで記録中の内容が消えるバグを実際に出したことがある。
- **RIRが入って初めて「実施済み」。** RIR未入力のセットは「まだやっていない」であって「余力0」ではない。
- **セーフエリアはCSS側(`env(safe-area-inset-*)`)だけで扱う。** `capacitor.config.json` の
  `ios.contentInset` は `"never"` にしてある(position: fixed要素の表示には実測で影響しないと
  確認済みだが、ネイティブ側とCSS側の責務を分けておく意図で維持)。
- **`www/` に新しいファイルを足したら、参照元3箇所を揃える。** `index.html` の `LIBS` /
  `sw.js` の `APP_ASSETS` / `scripts/sync-www.js` の `DOMAIN_FILES`(SQLite関連は`DB_DOMAIN_FILES`)。
  ここがズレて `cache.addAll()` が落ち、iOS版のSWが永久にactivateしない状態で出荷されかけた
  (`addAll` は1つでも失敗すると全体がrejectする)。`tests/sync-www.test.js` が生成物を実際にビルドして検証している。
  かつては `sync-www.js` 側に**4箇所目**(生成する `<script src>` の並びを手書きしていた)があり、
  `i18n.js` と `units.js` が「www/にコピーされるが読み込まれない」状態で数コミット出荷されかけた。
  Web版は `LIBS` 経由で読むので無症状、テストも「参照先が実在するか」しか見ていなかった。
  今は `<script src>` を `DOMAIN_FILES` から生成し、逆方向(コピーしたのに読み込まれていない)も
  テストで縛ってある。**手で並びを書き足す場所を作らないこと。**
- **外部ホストへのリクエストを足さない。** フォントもライブラリも同梱済み。
  電波の悪いジムや機内モードが主戦場なので、外部依存は実用上の欠陥になる。テストで縛ってある。
- **`src/domain/storage.js` はもう完全に汎用のkey-valueストアではない。** `"workout-log-v1"`
  というキー文字列だけを特別扱いして、ネイティブ+SQLiteプラグインが使える環境ではSQLite
  (`src/domain/db/workoutStore.js`)経由にすり替える。この1文字列は `index.html` の
  `STORAGE_KEY` と手で一致させている(定数の共有はできない、storage.jsはindex.htmlより先に
  読み込まれるスクリプトなので)。下書き(`workout-draft-v1`)や復元前スナップショットは
  従来どおりPreferences止まり。詳細と設計判断は `DATA_MIGRATION.md` を参照。
- **SQLite関連はテストが緑でも何も保証しない。** `tests/db/` は `node:sqlite` のフェイク
  ドライバに対してのみ通しており、`src/domain/db/capacitorSqliteDriver.js` が
  `window.Capacitor.Plugins.CapacitorSQLite` を叩く部分は**テストの対象外**。
  実際にここで、`query()` の戻り値の先頭行が `{"ios_columns":[...]}` というメタデータ行だと
  気づかずアプリが起動のたびにJSON Parse errorを出す不具合が出た(`6b4d1b4`)。
  シミュレータで実行して初めて分かった。**触るときは必ずシミュレータで動作確認すること。**
  検証済みなのは、旧Preferences→SQLite移行・二重移行の防止・バックアップ書き出し(`374e930`)。
  未検証で残っているのはオフライン動作(シミュレータの制約)。詳細は `DATA_MIGRATION.md`。

## 検証手段と、その守備範囲

`package.json` を見れば分かることは書かない。**読んでも分からないこと**だけ:

- **`npm test` は0.8秒で終わる。** 気軽に何度でも回してよい。中身は `src/domain/` の
  純粋関数のテストに加えて、`www/` の**実ビルド**(esbuildが`#appsrc`をJSXとしてパースする)・
  バージョン整合・i18nのja/enパリティ・外部通信の不在まで含む。
  つまり**JSXの構文エラーはここで落ちる**(`.claude/hooks/run-tests.sh` が編集後に自動で回す)
- **`npm test` は `index.html` を実行しない**(`vitest.config.mjs` に明記)。
  未定義グローバル・Reactのフック違反・`LIBS`の読み込み順ミスは全部素通りする。
  **テストが緑でも起動するとは限らない**
- **起動確認は `.claude/launch.json` の2設定を両方開く。**
  `kurabell-dev`(8765)=Web版(ランタイムBabel経路)、`kurabell-www`(8766)=iOS相当(事前ビルド経路)。
  8766側を見る前に `npm run sync-www` を回さないと古いままになる
- **lint / typecheck / build スクリプトも CI も無い。** 入れていないので `npm run lint` は失敗する

## 進め方

- **新機能・仕様変更はプランモードで合意してから実装する。** 曖昧な仕様は推測で実装せず確認する
- 実装 → `tester`(不足テストの追加) → `boot-check`(起動確認) → `reviewer`(別文脈レビュー) →
  コミット。`reviewer` は自分で `git diff` を取り、この「踏み抜きやすい罠」と照合する
- 調査は `explorer`(リポジトリ内) / `researcher`(外部情報) に投げて、メインの文脈を汚さない
- **実装はメインスレッドが一本で担当する。** `index.html` 1ファイルに集中しているので、
  実装をサブエージェントに分割すると衝突と設計の不整合を招く

## ドメインの約束事

- 記録の単位: `{ date, exercises: [{ name, sets: [{weight, reps, rir, warmup, assisted}] }] }`
- **ダンベル種目は片手の重量で記録**し、ボリューム・1RM計算では2倍する
- **自重種目**の実効重量は `体重 × 係数 + 加重`
- **ROM係数**: シュラッグ・カーフレイズなど可動域の小さい種目はボリューム集計だけ半分にする(1RM推定には影響させない)
- 保存キー: `workout-log-v1`(履歴)、`workout-draft-v1`(入力途中。事故ってもセットが消えないように)

## このリポジトリは複数の場所から編集される

過去のclaude.aiチャット(このリポジトリ以前)と、複数のClaude Codeセッションが同じリポジトリを触る。
実際に、どのセッションも身に覚えのないコミットが `git log` に現れたことがある。

- **作業開始時と、時間が空いたときは `git log --oneline -10` と `git status` を見る。**
  会話の前半で得た行番号やバージョン文字列を信用せず、編集直前に `grep` し直す。
- 他のチャットの差分を貼られたら、**意図としては正**として扱いつつ、実ファイルを確認してから動く。
- 大きめのリファクタや改名に入る前は、衝突の可能性をユーザーに伝える。

## ファイル

- `src/domain/*.js`: `#appsrc` の外に出した純粋ロジック。**テストしたいものはここに置く**
  (素のグローバルスクリプトとして `<script src>` で読む。importもmodule.exportsも使わない)
- `src/domain/db/`: iOS版のSQLite永続化層(スキーマ・旧データ移行・ドライバ)。設計判断は `DATA_MIGRATION.md`
- `tests/`: `npm test`(vitest)。生成物・バージョン整合・保存レイヤの移行までカバーしている
- `vendor/`: React等をローカル同梱(CDN不使用)。gitignoreせずコミットする
- `fonts/`: Barlow Condensed(数字・ロゴ用、SIL OFL)。日本語本文は端末標準フォントに任せる
  (Noto Sans JPを同梱すると数MBになるため)
- `ios/`, `www/`, `scripts/sync-www.js`: Capacitorラッパーとそのビルド。`www/` と `node_modules/` は生成物
