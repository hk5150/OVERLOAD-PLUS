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
