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

## 次のセッションでの再開方法

このファイルを読んで続きから、と伝えれば再開できる。App Store提出のブロッカー(旧課題1・2)は
解消済みなので、次に着手するとすれば上記「残っている課題」のどれか、またはユーザーからの新しい
指摘を待つ形になる。
