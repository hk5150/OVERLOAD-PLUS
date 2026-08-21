# App Store提出準備 + 品質改善に関する決定事項メモ

対象: App Store提出に向けたブロッカー解消と、データ保護・アクセシビリティ・テストカバレッジの改善。
現在のバージョン: v81(`sw.js`のCACHEとアプリ内バッジ)。

## 背景

「もうApp Storeに出せる内容?」という問いから始まり、実際にコードを監査して2件のブロッカー
(プライバシーマニフェスト欠如、実装と食い違うメタデータ)を発見・修正。その後「さらにブラッシュ
アップすべき点」を洗い出し、8件を追加対応した。

## 決定事項

### 1. iPhone専用として提出する(iPad非対応)

`TARGETED_DEVICE_FAMILY` を `"1,2"` → `"1"` に変更(`ios/App/App.xcodeproj/project.pbxproj`、
Debug/Release両方)。`Info.plist`の`UISupportedInterfaceOrientations~ipad`キーも削除。

理由: レイアウトが縦画面のiPhone前提で作られている。`"1,2"`のままだと(a) iPad用スクリーンショットが
提出に必須になる、(b) iPadはマルチタスク対応アプリとして扱われ全方向回転をサポートする必要があるため
縦画面固定が効かない。iPadでもiPhone互換モードで縦画面のまま動く。

### 2. プライバシーマニフェスト(`PrivacyInfo.xcprivacy`)を新規追加

`@capacitor/preferences`が iOS側で`UserDefaults`(Required Reason API)を使うが、Capacitor本体・
`@capacitor/preferences`のどちらもマニフェストでこれを宣言していなかった。放置するとアップロード時に
`ITMS-91053: Missing API declaration`で弾かれる。

`ios/App/App/PrivacyInfo.xcprivacy`を新規作成し、`NSPrivacyAccessedAPICategoryUserDefaults`を
理由コード`CA92.1`(自アプリ内のみのデータ)で宣言。Xcodeプロジェクトのリソースとして登録
(`project.pbxproj`の3箇所: PBXBuildFile/PBXFileReference/PBXGroup + Resources build phase)。
`xcodebuild`でビルドし、`App.app`バンドル内に正しく含まれることを確認済み。

### 3. メタデータをルールエンジン削除後の実態に合わせて修正

ルールエンジンは以前のセッションで完全削除済み(`6af3353`)だったが、`manifest.json`/`README.md`/
`APPSTORE.md`(App Store掲載文の下書き)が「次回メニューを自動提案」「ダブルプログレッション」と
いう表現のまま残っていた。ガイドライン2.3(不正確なメタデータ)に抵触しうるため、「前回の記録を
そのまま引き継ぎ、判断はユーザーに委ねる」という実態に合わせて書き換えた。アプリ内文言も1箇所
同じ誤りがあり修正(「今日のメニューが自動で提案されます」→「今日のメニューに前回の記録が
引き継がれます」)。

### 4. 保存失敗時: stateはロールバックせず、再試行ボタンで対応

`persist()`はReact stateを先に楽観的更新してから`store.set`を呼ぶため、書き込み失敗時に
「画面上は保存できたように見えるが実は消えている」問題があった。対応方針として:
- stateのロールバックはしない(ユーザーが既に積み上げた新しい入力を消す方がリスクが高いため)
- 代わりに`saveStatus`(idle/saving/saved/error)を可視化し、失敗時はエラーバナーに「再試行」ボタンを表示
- 再試行は元のpatchを覚えておく必要がなく、現在のstate(既に楽観的更新済み)をそのまま再送信するだけでよい

### 5. `src/domain/`への関数抽出は「呼び出し側のシグネチャを変えない」方針

`workingSets`/`setVolume`/`exVolume`は呼び出し箇所が12箇所以上に散らばっていたため、抽出時に
シグネチャを変えて全呼び出し箇所を書き換えるのはリスクが高いと判断。代わりに:
- `src/domain/volume.js`側は`bodyweight`と`deps`(`effWeight`/`resolveIsDb`/`resolveRom`)を
  明示的に引数で受け取る純粋関数にする
- `index.html`側(`App()`内)は元と同じ引数1つの呼び出し方を保つ薄いラッパーとして再定義し、
  内部で`window.exVolume(ex, profile.bodyweight, volumeDeps)`のように委譲する

**ハマった点**: `resolveIsDb`/`resolveRom`は`#appsrc`内で`const`宣言されているだけで
`globalThis`に明示登録されていない。`effWeight`(`oneRm.js`側で`globalThis.effWeight = effWeight`
している)と違い、別スクリプト(`volume.js`)からはbareな識別子として解決できない。当初この2つを
bare参照するコードを書いてしまい`ReferenceError: resolveIsDb is not defined`が発生。さらに
デバッグ中、使い回していたブラウザタブが以前のモンキーパッチ(`window.confirm`/`window.store.set`
の一時差し替え)で汚染されており、新旧どちらのコードでも同じエラーが再現するように見えて
原因切り分けに時間を溶かした(→新しいタブで検証したら解決)。**教訓: ブラウザでの検証は、
長時間モンキーパッチ等を行ったタブを使い回さず、疑わしければ新しいタブで再現確認する。**

### 6. 種目名の重複防止

種目入れ替え(スワップ)・通常追加(ピッカー)のどちらも、今日の記録(`today`)に既にある種目名は
候補から除外するようにした。理由: `lastConfig`/`initialSetsFor`/`exerciseInsight`等が
`workouts[].exercises.find(e => e.name === name)`という名前ベース・最初の一致のみの検索をして
いるため、同名が2枚あると2枚目の記録が保存後に前回記録として参照されなくなる(データは消えないが
実質死蔵する)。

## 変更したファイル(主なもの)

- `ios/App/App/PrivacyInfo.xcprivacy`(新規)
- `ios/App/App.xcodeproj/project.pbxproj`(iPhone専用化、プライバシーマニフェスト登録)
- `ios/App/App/Info.plist`(`~ipad`向け回転設定を削除)
- `manifest.json` / `README.md` / `APPSTORE.md`(メタデータ修正)
- `index.html`: 保存状態表示・再試行、モーダルa11y(`useModalA11y`フック新設)、種目名重複防止、
  移行ロジック共通化(`migrateWorkouts`/`migrateSplit`/`defaultProfile`)、起動時読み込みの構造検証
- `src/domain/backupValidation.js`(新規、`extractWorkoutsArray`/`validateWorkoutsShape`)
- `src/domain/volume.js`(新規、`workingSets`/`setVolume`/`exVolume`)
- `tests/backupValidation.test.js` / `tests/volume.test.js`(新規、計32件)

すべてpush済み(`main`ブランチ、最新コミット `f2883e7`、CACHE v81)。

## 残っている課題

### App Store提出そのもの(ユーザー側の作業、コードでは対応できない)

1. Apple Developer Program登録(年額$99、審査に数日かかることあり)。有料アプリにするなら
   App Store Connectで銀行口座・税務情報の登録も必要
2. XcodeでSigning & Capabilities → Teamを選択(`CODE_SIGN_STYLE = Automatic`なので選べば
   証明書は自動生成される)
3. App Store用スクリーンショット撮影(iPhone 6.9インチ相当のシミュレータで`Cmd+S`。
   iPad用は不要になった)
4. **Archive(Release)ビルドでの実機検証は未実施。** ここまで確認したのはシミュレータ向けの
   Debug/Releaseビルドの成功のみ。実機Archiveでしか顕在化しない署名まわりの問題が残っている
   可能性がある
5. `ITSAppUsesNonExemptEncryption`が`Info.plist`に未設定。ブロッカーではないが、提出のたびに
   輸出コンプライアンスを手動回答することになる

### コードの残課題

6. 実機iPhoneでの起動時間の実測(未実施)
7. `www/`のminify検討(esbuildの`minify`オプション、現状オフ)
8. 種目入れ替え(`swapExercise`)自体のテスト未着手。`today`/`setToday`等の component state に
   深く依存しており抽出コストが高いため後回しにした。ただし実際に見つかっていたバグ(同名重複、
   上記「決定事項6」)は既に修正・ブラウザ検証済み
9. 多言語対応は方針検討中でペンディング(対応範囲・対応言語をユーザーと未確定)

## 次のセッションでの再開方法(2026-08-20時点、以下は古い記述)

このファイルを読んで続きから、と伝えれば再開できる。App Store提出のブロッカー(旧課題1・2)は
解消済みなので、次に着手するとすれば上記「残っている課題」のどれか、またはユーザーからの新しい
指摘を待つ形になる。

---

# 2026-08-21: App Store審査前 最終レビュー

上記セクション(v81時点)から、改名・SQLite移行・多言語化・エージェントチーム構築を経てv93まで
進んだ状態で、ユーザーから改めて「App Store審査前の最終チェック」を依頼された。旧セクションの
残課題のうち、多言語対応(旧課題9)・`ITSAppUsesNonExemptEncryption`(旧課題5)・スクリーンショット
撮影(旧課題3)はこの間に別作業で解消済みだったため、ここでは反映していなかった実態を棚卸しした。

## 決定事項

### 1. Guideline 4.2・Capacitor設定・プライバシー・クラッシュ耐性・UI/UX・メタデータ整合性の5観点を並行調査

`explorer`エージェント5体を並行起動し、それぞれ担当観点でコードベース全体を調査させた。
結果は以下の通り(詳細はコミット`29a0f93`前後の会話ログ参照):

- **Critical 1件**: `~/Desktop/KURABELL-appstore-screenshots/`の撮影済みスクリーンショット
  (v87時点)が、その後のUI変更(ヘッダー文字サイズ、部位名「胸」→「大胸筋」)で現行版と
  乖離していた。Guideline 2.3(メタデータと実装の不一致)に抵触しうるため撮り直しが必須と判断
- **Warning**: タップ領域がHIG推奨44×44ptを大きく下回るボタン群(セット行の種別トグル・
  前セットコピー・削除、履歴カードの削除、編集モードの同種ボタン)。同じく、「同一分割の履歴」
  下部シートモーダルだけ`env(safe-area-inset-bottom)`対応が漏れていた
- **問題なし**: データ・プライバシー(外部通信はYouTube検索の`window.open`のみ、送信内容も
  種目名のみと確認済み)、クラッシュ耐性(ErrorBoundary・空データ起動・異常データ耐性いずれも
  ガード済み)、Capacitor設定(Info.plist・PrivacyInfo.xcprivacy・バージョン整合すべて妥当)、
  メタデータ本文(APPSTORE.mdの機能訴求はすべて実装済み、削除済み機能への言及も無し)

### 2. Warning 2件を修正(コミット`29a0f93`、CACHE v93)

- セーフエリア: 「同一分割の履歴」シートの`padding`に`env(safe-area-inset-bottom)`を追加
- タップ領域: `.tapArea`という共通CSSクラス(`position:relative` + `::before`疑似要素で
  縦方向のみ`-6px`拡張、視覚サイズは変えない)を追加し、対象ボタンに適用。**横方向は拡張しない**
  (隣接ボタンとのgapが4〜8pxしかなく、全方向拡張すると誤タップを誘発するため)。`reviewer`の
  指摘で、`flexWrap:"wrap"`により折り返しうる密集行(YouTubeボタンを含む行)は対象から除外し、
  折り返さない行(編集モードの▲▼削除)は追加するという一貫した基準に整理した

### 3. スクリーンショット10枚を撮り直し(v93)

`docs/多言語化.md`の手順(旧Preferencesへの直接書き込み→SQLite移行に乗せる)を踏襲しつつ、
サンプルデータをNode.jsスクリプトで生成する方式を新たに確立した。

- 6週間・Push/Pull/Legsローテーション(18セッション)、重量が週を追うごとに増加する
  データを生成。`split`オブジェクトには`name`フィールド(プリセット名と一致させる文字列)と
  各dayに`muscles`配列が必須(無いと「今日のセッション(Day 1/3・undefined)」という
  表示バグになる。実装のバリデーション(`validateWorkoutsShape`)はこの2つを必須にしていない
  ため、壊れたデータのまま起動してしまい実機確認で初めて気づいた)
- `lastBackupAt`を設定しておかないと「まだ一度もバックアップしていません」という警告バナーが
  出る。撮影用データでは適当な過去日時を入れておくと綺麗な画面になる
- SQLiteの`legacy_migration`テーブルが一度`status='done'`になると二度と移行が走らないため、
  データを差し替えるたびに`Library/CapacitorDatabase/*.db`ファイルをアンインストール後に
  手動削除してから再投入する必要がある(単に`xcrun simctl uninstall`するだけでは不十分な
  ケースがある。念のため`uninstall`→起動→`terminate`→DBファイル削除→plist書き込み→再起動、
  という手順を徹底した)
- **iOS Simulatorツールの`control`アクション(tap/swipe)の座標系で終始つまずいた。**
  ツールは「440×956 points」と明言しているが、実際に有効な値は、スクリーンショット画像を
  見たときの見かけの位置を0〜1の比率に換算し、それぞれ440・956を掛けた値だった(例:
  ナビゲーションバーの4タブはほぼ均等割りで、中心はおよそ0.125/0.375/0.625/0.875の位置に
  あり、440倍すると55/165/275/385に一致した)。画像のピクセル値をそのまま座標として渡すと
  大きすぎて無視される(要素にヒットしない)。次回このツールで座標を指定するときは、
  最初に位置が明確な要素(ナビゲーションバーの4タブなど)で座標系を検証してから本題に入ると
  試行錯誤を減らせる

## 変更したファイル

| ファイル | 内容 |
|---|---|
| `index.html` | `.tapArea`クラス追加・適用、`showSplitHistory`のセーフエリア対応 |
| `sw.js` | CACHE v92→v93 |
| `APPSTORE.md` | スクリーンショットの節にCACHE v93と明記、02のキャプション実態を修正 |
| `docs/多言語化.md` | スクリーンショット撮影バージョンをv87→v93に更新 |
| `~/Desktop/KURABELL-appstore-screenshots/{ja,en}/*.png` | 全10枚を再撮影(リポジトリ外、Desktop) |

コミット: `29a0f93`(コード修正、push済み)。ドキュメント更新分は別コミットが必要。

## 検証内容

- `npm test` 187件通過
- `boot-check`・`reviewer`エージェントでの検証(タップ領域拡張が隣接ボタンを誤って覆わないこと、
  セーフエリアpaddingが正しく適用されること)
- 撮影した10枚を目視確認、解像度1320×2868(6.9インチ要件)を`file`コマンドで確認

## 残っている課題

### App Store提出そのもの(ユーザー側の作業、コードでは対応できない)

1. Apple Developer Program登録(未着手、これから)
2. XcodeでSigning & Capabilities → Teamを選択
3. **Archive(Release)ビルドでの実機検証は未実施。** シミュレータ向けDebugビルドの成功のみ確認
4. TestFlight配布での新規インストール・既存データからの更新確認(未実施)

### コードの残課題

5. 実機iPhoneでの起動時間の実測(未実施)
6. `www/`のminify検討(esbuildの`minify`オプション、現状オフ)
7. 収益化方針(`MONETIZATION.md`)が未決定(案A「買い切り」を推奨で止まっている)。
   App Store Connectで価格帯を選ぶ前に決める必要がある
8. Guideline 4.2の残余リスク: Haptics・ローカル通知・ステータスバー制御など「見えるネイティブ
   機能」が無い。SQLite永続化・縦固定・セーフエリア対応で最低限の実体はあるが、審査で
   指摘された場合の対応カードとして認識しておく

### 解消済み(このセクションで確認・反映)

- 多言語対応・`ITSAppUsesNonExemptEncryption`・スクリーンショット撮影(旧課題)はすべて対応済み
- タップ領域・セーフエリアのWarning 2件は本セクションで対応済み
