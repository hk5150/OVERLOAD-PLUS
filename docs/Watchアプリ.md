# Apple Watch アプリ

Watch でセットを入力するためのアプリ(v120〜)。
経緯: 2026-08-23 には「Watch アプリは作らず、ローカル通知で代替する」としていた。v112 の Time Sensitive 通知と Live Activity を経て、1.0 の審査待ちの間に、記録の入力まで含めて作ることにした。

## 引き継ぎ(2026-10-04 22:20 の時点。次のセッションはここから)

### いまの状態(3行で)
- **配信中は 1.2 (14)**(2026-10-05 22:59 に公開。iTunes lookup の日米で確認)。提出の記録は `APPSTORE.md` の「1.2」
- **1.1.1 (13) は審査を通過し、2026-10-02 9:11 に App Store で公開された**(iTunes lookup で確認)。iOS 27 の実機で起動・Watch・重量欄・共有シート・購入シートを確認済み(北村さん)。
  中身は v135 + iOS 27 で起動するための UIScene 対応(`fee5499`)。What's New と提出の記録は `APPSTORE.md` の「1.1.1」
- **画面改善+新アイコン(1.2 の中身)を main に取り込んだ**(2026-10-01 23:00、CACHE v136、Web 版に配信)。iOS は 1.2 (14) に上げて **TestFlight にアップロード済み**(23:03)。`docs/画面改善.md`

### 次にやること(優先順)
1. ~~1.1.1 の審査結果~~ → 承認・公開済み(2026-10-02)
2. ~~iOS 27 の実機で 1.1.1 (13) を確認~~ → 済(2026-10-01)。~~1.1.1 (13) を審査に出す~~ → 済(22:56)
3. ~~`ui-refresh` を main に取り込む~~ → 済(2026-10-01。v136 は main の v135 より上なのでそのまま、iOS は 1.2 (14))。
   worktree `../OVERLOAD-PLUS-ui` とブランチは、1.2 が出たら片付けてよい
4. ~~1.2 (14) を実機で確認~~ → 済(2026-10-01 夜、北村さん。アイコン・記録画面・カレンダー・タブ・Watch の前回表示とも問題なし)。
   ~~1.2 (14) を審査へ~~ → 済(2026-10-04 22:15)
5. ~~1.2 の審査結果~~ → 承認・公開済み(2026-10-05)。worktree `../OVERLOAD-PLUS-ui` とローカルのブランチ `ui-refresh` は片付けた
   (GitHub 側の `ui-refresh` ブランチは残っている。main に取り込み済みなので消してよい)
6. **次に版を作るときに、日本語のキーワードを差し替える**(案と理由は `APPSTORE.md` の「次のバージョンで差し替えるキーワード」。サブタイトルは変えない)
7. **1.3(改善要望)を実装中**: worktree `/Users/hajimekitamura/OVERLOAD-PLUS-13`・ブランチ `v1.3`(未 push)。
   9・6・10a〜c・11・2・3・5 は済、Watch の 4・8・12 が残り。**進み具合と北村さんに確かめることは、ブランチ側の
   `docs/改善要望_2026-10.md` の冒頭**(main の同じファイルは古い)。Web 版の確認は `.claude/launch.json` の `kurabell-13`(8775)

### 片付け・メモ
- App Store Connect の API キー `kurabell-upload`(1つ目、`WSJRFU647F`)は無効化済み(2026-10-01、ユーザーとアクセス → 統合で確認)。
  `kurabell-upload2`(キー ID `FDQ5SP8S2F`)も無効化した(2026-10-01、「最終使用日」が 10/1 になっていたため)。アクティブなキーは0個。
  アップロードは Xcode のサインインで足りている。API キーが要るときは新しく作り、`.p8` は Mac のブラウザで落とす
- アイコン案の比較ページ・画面改善案のページは claude.ai の Artifact(非公開)
- Watch の小さい画面(42/41/40mm)はシミュレータで確認済み。Series 9 41mm のシミュレータを1台作った(`08E252FC-…`)

---
(以下は当日の経緯)

**1.1 (ビルド10) は審査を通過した**(2026-10-01 朝の時点で、1.1 のトレインが閉じていた)。
**TestFlight に 1.1.1 (11) をアップロード済み**(2026-10-01 8:29、v135)。中身は v134(Watch の記録中は休憩の Live Activity を出さない)と
v135(数値欄の遅延 select() がフォーカスを奪い合い、重量に「60」と打つと「6」になる不具合)。審査にはまだ出していない。

**1.1.1 (11) は iOS 27.0 に上がった実機で起動直後にクラッシュした**(2026-10-01 9:05、北村さんの iPhone 15 Pro Max)。
クラッシュログ: `EXC_BREAKPOINT` in `UIKitCore ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`。
Xcode 27(iOS 27 SDK)でビルドしたアプリは **UIScene のライフサイクルを採用していないと iOS 27 の端末で起動を拒否される**
(Apple DTS: `UIApplicationSceneManifest` が無い、または `application(_:configurationForConnecting:options:)` 未実装で起動失敗。
Capacitor 公式の手順は 8.5 向け https://capacitorjs.com/docs/updating/8-5 で、6 系にはバックポートされていない)。
iOS 26.5 のシミュレータでは再現しない(検査は iOS 27 の実行環境でだけ働く)ので、**実機の OS 版を最初に疑うこと**。
→ **1.1.1 (12) で対応**: `SceneDelegate.swift`(ウィンドウと `BridgeViewController()` をコードで作る。URL / NSUserActivity は
`ApplicationDelegateProxy` へ)、`AppDelegate` に `configurationForConnecting`、`Info.plist` に `UIApplicationSceneManifest`
(`UIMainStoryboardFile` は外した。`Main.storyboard` のファイルは残っているが未使用)。
シミュレータ(26.5、Release、既存アプリの上に上書き)で起動・設定画面のプラグイン表示まで確認。**iOS 27 の実機で起動するかは (12) の TestFlight で確かめる。**

**1.1.1 (13) を TestFlight にアップロード済み**(2026-10-01 22:40。中身は (12) と同じで番号だけ上げた)。
(12) は、Xcode のサインインを直したあとの1回目のアップロードで App Store Connect 側に受け付け枠だけが作られて失敗し、
以後「The bundle version must be higher than the previously uploaded version」(409、ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE)で
上げられなくなった。**アップロードが途中で失敗したら、番号を1つ上げて作り直すのが早い。**
**次: iOS 27 の実機で (13) が起動するかを確かめ、問題なければ 1.1.1 を審査に出す。**

以下は (12) のときの経緯。
**1.1.1 (12) はアーカイブ済み・アップロード待ち**(2026-10-01 午前)。`xcodebuild -exportArchive` が
「Failed to Use Accounts(App Store Connect access for LJR5Q5TU54 is required)」で止まった(Xcode の Apple Account のセッション切れ。前にも起きた)。
帰宅後にやること(どちらか):
- **Xcode → 設定 → Apple Accounts でサインアウト→サインイン** してから、次を実行(または Xcode → Window → Organizer で
  「KURABELL 1.1.1 (12)」を選んで Distribute App → App Store Connect → Upload):
  `xcodebuild -exportArchive -archivePath "$HOME/Library/Developer/Xcode/Archives/2026-10-01/KURABELL 1.1.1 (12).xcarchive" -exportOptionsPlist ios/ExportOptions.plist -exportPath /tmp/kurabell-export-12 -allowProvisioningUpdates`
- または App Store Connect の API キー `kurabell-upload2`(キー ID `FDQ5SP8S2F`、Issuer ID は App Store Connect の「統合」に表示)の `.p8` を **Mac のブラウザで**落とし、
  上のコマンドに `-authenticationKeyPath <p8> -authenticationKeyID FDQ5SP8S2F -authenticationKeyIssuerID <Issuer ID>` を足す。
  **iPhone の Safari ではダウンロードが2回とも「エラーが発生しました」になり、1回目のキー(`kurabell-upload`)はファイルが残らないまま使用済みになった**(取り消すこと)。
  `.p8` はリポジトリに入れない。
- 待つ間は TestFlight の「以前のビルド」から 1.1 (10) を入れ直せば使える(1.1 (10) は Xcode 26 でビルドしたので iOS 27 でも落ちない。
  Xcode 27 に入れ替わったのは 10/1 0:34、1.1 (10) のアップロードは 9/30 9:15。App Store の利用者は影響を受けない)

(以下は 1.1 提出時点のメモ)
提出の内容と App Store Connect の入力の罠は `APPSTORE.md` の提出記録。コードは全部 push 済み(`d95f721`)。

**次のセッションでやること(優先順)**
0. **1.1.1 (12) を実機(iOS 27.0)で確かめる**: まず起動すること。次に (a) iPhone でセットを入力しても Watch の KURABELL が隠れないか(下の「休憩」)、
   (b) 前回の記録が無い種目の重量欄に2桁を打っても消えないか、(c) 前面復帰・共有シート(書き出し)・Live Activity・購入シート(サンドボックス)が scene 化で壊れていないか。
   問題なければ 1.1.1 として審査に出す(最新情報は不具合修正の2点 + iOS 27 対応)。**審査に出さないと、App Store 版 1.1 (10) も iOS 27 の端末では
   同じ理由で落ちる可能性がある**(1.1 (10) は Xcode 26 系でビルドしたので対象外のはず。クラッシュの報告が来たら最優先)
1. 審査結果のメールを見る。差し戻しなら内容に沿って対応(1.0 のときは新規アカウント向けの 2.1 Information Needed だった)
2. 承認されたら、実機の App Store で 1.1 が出ることと、Watch アプリが App Store 版で入ることを確認
3. 残課題(コード変更が要る): `www/` の minify、`swapExercise` のテスト、初回訪問時のスクリプト混在(低優先)。
   **v128〜v132 はまだ TestFlight に上げていない**(Web版のみ配信)。次に iOS のビルドを作るときに入る。
   iOS で範囲外を含むバックアップを復元 → 再起動 → 履歴表示、はシミュレータで未確認(値は通常の保存と同じ数値の形なので、SQLite 側は変わらないはず)
4. ~~回数 1010 のような記録を保存できるのに復元では弾かれる~~ → v128 で対応(2026-10-01)。入力欄で範囲外(重量0〜2000kg・回数0〜1000・RIR -10〜30、
   `src/domain/backupValidation.js` の `SET_VALUE_LIMITS`)を打てないようにし、復元では範囲外の値を保存時と同じ形(重量・回数は0、RIR はキーを消して未実施)に
   置き換えて件数を知らせる。**`rir: ""` を保存データに入れてはいけない**(前回の実績欄に偽の「RIR+2」、Watch の前回値のデコード失敗。レビューで発覚)。
   Watch の −/+ には上限がない(実用上届かないので放置)
5. 文書の掃除は済んだ(`docs/AppStore提出準備.md` の2件、`ios/App/.claude/` の削除)
6. 保留(2026-10-01、北村さんと合意): Watch の「セットを追加」は直前の行の補助の印を引き継ぐ(`applyWatchOps`、iPhone の addSet と同じ)。
   Watch には補助の印を表示・解除する手段がないので、補助ありのセットの直後に Watch で追加すると、気づかないまま補助ありで記録され自己ベストに数えられない。
   **Watch に補助の印を出すときに、あわせて見直す**(今は直さない)

**1.0 (3) は審査を通過した。** TestFlight は 1.1 (10) をアップロード(2026-09-30)。
- 1.1 (10): v126〜v127。書き出しの連打対策、保存失敗の文の消し忘れ、ヘルスケアの権限で「許可しない」を選ぶと
  「接続できませんでした」と出ていた件(失敗ではなく権限の状態で判断する。docs/ヘルスケア連携.md)。
  **実機で「許可しない」を選んだときの経路は未確認**(シミュレータでは失敗が返らない)。Safari の Web インスペクタか
  `console.warn("Health requestAuthorization:", ...)` で、実機の失敗の文と状態を確かめる
- 1.1 (9): v125。iOS の「バックアップを書き出す」「CSVで書き出す」を共有シートで保存できるようにした
  (自前プラグイン FileExport、コミット `0e127ce`)
- 1.1 (8): v124。ページの再読み込み後に SQLite の読み書きが全部失敗して記録が消える不具合の修正
  (コミット `8576784`。原因と再現手順は CLAUDE.md の SQLite の罠と、Obsidian の `capacitor-sqlite-webview-reload`)。
  iOS の「バックアップを書き出す」がファイルを作っていなかった件は、表示だけ直した(実装は次)
- 1.1 (6): v121〜v123(Watch の 1kg 刻み、ボタンの反応、Watch の自動起動・ワークアウト記録、日の種目登録の検索など)。
  承認済みの 1.0 には新しいビルドを足せない(「train version '1.0' is closed」)ので `MARKETING_VERSION` を 1.1 にした
- **1.1 (6) の実機で、記録を始めても Watch が起動しなかった。** ヘルスケアの許可に心拍数・アクティブエネルギーが無く、
  裏から起こされた Watch が権限シートを出せずに止まっていた。1.1 (7) で iPhone が Watch 用の種類も求めるようにした
  (下の「設計 → ワークアウト」の流れ 2)。**iPhone と Watch で許可が共有される前提は、1.1 (7) の実機で確かめる**
- アップロードの手順: `xcodebuild archive … -allowProvisioningUpdates` → `xcodebuild -exportArchive`(`method=app-store-connect`、`destination=upload`)。
  「No Accounts」や、画面の Archive の「Personal development teams … do not support」で失敗したときは、
  Xcode → 設定 → Apple Accounts でサインアウトして、サインインし直すと両方直った(`defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier` が `Individual` になる)

**実機で確かめること(1.1 (7) が入ったら)** → **2026-09-30、TestFlight 1.1 (10)(iPhone 15 Pro Max + Watch Series 10)で 0〜4 とも問題なし(北村さん確認)。**
あわせて、書き出し →「"ファイル"に保存」、ヘルスケアの権限で「許可しない」(赤い「接続できませんでした」は出ない)、
裏に回してから戻って保存、も問題なし。掲載文の主張(Watch の自動起動・心拍と消費カロリー・削除の連動)はそのまま使える。
0. 記録を始めたとき iPhone に心拍数・アクティブエネルギーの許可シートが出るか。許可した**その回**に Watch が起動するか、2回目からか(許可の同期が遅れると初回だけ失敗しうる。reviewer 指摘)
1. iPhone で記録を始めると Watch が自動で起動し、腕を下ろしても KURABELL の画面のまま保たれるか
   (純正「ワークアウト」を併用すると、あちらが優先される。KURABELL のワークアウトが止まり、iPhone が時刻だけ書く)
2. 保存すると、フィットネスアプリに心拍・カロリー付きのワークアウトが1件だけ載るか
3. **iPhone で履歴を削除したとき、Watch 由来のワークアウトがヘルスケアから消えるか**(reviewer 重大4。消えなければ、設定の説明文と APPSTORE.md の「削除で連動」を直す)
4. −/+ と RIR ボタンの反応(3回押して3回動くか)、重量の刻みが 1kg か

## できること / できないこと

| Watch でできる | iPhone でだけできる |
|---|---|
| 今日の種目一覧と進捗 | 記録の開始(種目の追加・今日のメニューから開始) |
| 各セットの前回の同じ番手のセット・RIR の差分 | 種目の追加・削除・並べ替え、スーパーセット |
| セットの入力(重量・回数は −/+ ボタン、RIR 0/1/2/3+) | 記録の保存・破棄 |
| セットの追加(直前のセットの複製) | ウォームアップ・補助の切り替え |
| 休憩タイマー(RIR の確定後に全画面で表示)と、Watch で始めた休憩の通知 | 課金(Watch は未購入でも制限しない。制限は保存時だけなので) |
| 記録前の「今日のメニュー」の表示 | |

## 設計

### iPhone(JS)が唯一の正

| 方向 | 手段 | 中身 |
|---|---|---|
| iPhone → Watch | `updateApplicationContext` | スナップショット(`buildWatchSnapshot`)。表示用文字列・種目 id・セット値・刻み・休憩開始・ラベル・合流済み opId |
| Watch → iPhone | 届くなら `sendMessage`、届かなければ `transferUserInfo` | op: `{opId, kind, exId, setIndex, weight, reps, rir, restStartAt, at}`。kind は `add`(行の追加)/ `set`(値の確定) |

- **計算は Swift に持ち込まない。** kg/lb 換算、ダンベル片手の表記、前回の同じ番手との対応付け、ラベルの言語は、すべて JS で済ませてから送る。
  - Watch の判定は「前回と同じ重量・回数なら RIR の差分を出す」だけで、index.html のゴースト表示と同じ条件にしてある。
- 重量と回数は `today` と同じ「表示単位の文字列」でやりとりする。保存時の kg 換算は、これまでどおり `saveWorkout` が行う。
- ラベル(休憩通知の本文を含む)は iPhone から送る。Watch の端末言語ではなく、アプリ内の言語設定に従わせるため。
  - Watch 側の Localizable は、何も届いていないときの文言と、その予備だけ。

### 取りこぼしと二重適用

iPhone のアプリが裏にいる間は WebView の JS が止まっているので、Watch からの op をその場で `today` に入れることはできない。そこで次の順に受け渡す。

1. **Watch**
   - op を pending(UserDefaults)に積み、画面には楽観的に反映する。
   - セッションの有効化時と、iPhone に届くようになったとき(`sessionReachabilityDidChange`)に、未確認の op を送り直す。
2. **iPhone ネイティブ**(`WatchSessionManager`)
   - op を UserDefaults のキュー(`watch.ops.v1`)に積む。
   - WCSession は `AppDelegate` の起動直後に有効化する。WebView の準備を待たないのは、裏で起こされたときに取りこぼさないため。
3. **iPhone JS**
   - 起動時・前面復帰時・受信イベント時にキューを**読む(消さない)**。
   - `watchApplied`(下書きに保存している opId の一覧)に無いものだけを `setToday(t => applyWatchOps(t, fresh).today)` で合流させる。
4. 下書き(`workout-draft-v1`)に `watchApplied` ごと保存できたら、`ackWatchOps` でキューから消す。
5. 次のスナップショットの `applied` に入った op を、Watch は pending から外す。

どの段階で落ちても、次の起動で同じ op を読み直し、`watchApplied` で重複を弾く。**ack は下書きの保存後にだけ行う**(読み込みの時点で「合流済みだから」と ack すると、保存前に落ちたときに失われる。reviewer の指摘で修正)。

### 到着順の入れ替わり

`sendMessage` が失敗した op だけ `transferUserInfo` に回るので、**到着順は作成順と入れ替わる**。例えば「行を追加」(A)より、その行の確定(B)が先に届くことがある。`applyWatchOps` は次の規則で、順番に依らず同じ結果にする。

- 1回の読み込みの中では、作成時刻 `at` の順に並べてから適用する
- `set`: 行があれば上書きする。行数ちょうどなら足す(add より先に届いた場合)
- `add`: 行がすでにあれば何もしない(set が先に届いて足してある)。行数ちょうどなら足す
- 行数より先を指す op は**保留**する。合流済みに数えないのでキューに残り、間の行が届いた後の読み込みで適用される
- 存在しない種目への op は捨てる(合流済みに数えて ack する)
- 足す行は直前の行を複製する(iPhone の「セットを追加」と同じく、補助の印を引き継ぐ)

Watch 側の楽観表示(`SessionStore.apply`)も同じ規則にしてある。

Watch で −/+ を押していない値は、iPhone で入力されたままの文字列を送り返す。`Double()` で読めない `"80,5"` などを 0 で上書きしないため。

### 休憩

- RIR を確定して休憩が始まると、入力画面の**シートのまま**全画面のタイマーに切り替わる(`RestTimerView`)。
  - シートを閉じてから別の画面を出すと、SwiftUI の表示が競合しやすいため、この形にした。
  - 画面の中身: 経過時間(1分ごとに緑 → 黄 → 赤)、1分ごとの3分割ゲージ、次のセット(最初の未実施の本番セット)。
  - 次のセットは、**今日入っている重量×回数を大きく**出し、その下に前回の RIR を出す(休憩中にプレートやピンを準備できるように。ユーザーの要望)。
    - 前回と同じ重量・回数なら「前回 RIR1」だけにする。変えているなら「前回 77.5kg×8 RIR0」と前回の値も並べる。
    - 目標 RIR は出さない。「前回を見せて判断は委ねる」というアプリの考え方に合わせ、ユーザーが前回の RIR を選んだ。
  - 46mm の画面で、スクロールせずに前回の行まで見えるよう詰めてある。
  - × で閉じるとセット一覧に戻る。一覧の上の小さい休憩表示をタップしても開ける。
- Watch で RIR を確定し、その種目が `restAfter`(スーパーセットの途中ではない)なら、Watch 上で休憩を始める。1・2・3分のローカル通知も Watch 自身が予約する(Time Sensitive)。
- iPhone は op の `restStartAt` を受け取り、`restStartAt` と Live Activity を合わせる。
  - 使うのは**実際に適用できた op の休憩だけ**。捨てた・保留にした op の休憩は使わない。
  - 30分より古い休憩も無視する。保存後に遅れて届いた op や、下書きの期限切れの後に残っていた op で、終わった休憩を走らせないため。
  - **iPhone 側の通知は予約しない**(`restFromWatchRef`)。予約すると、ロック中の iPhone の通知が Watch に転送され、手首に二重に届くため。この値は下書きにも保存する(OS にアプリを終了されて再起動したときに、抑止が外れないように)。
- Watch は自分で始めた休憩の開始時刻を覚えておく。その op が iPhone で確認された後に、iPhone 側で休憩が止まった・新しい休憩が始まったら、Watch の通知を取り消す。
- iPhone で始めた休憩の通知は、これまでどおり iPhone が出す(ロック中は Watch に転送される)。
- **Watch がこの記録のワークアウトを記録している間は、iPhone の休憩の Live Activity を出さない**(v134)。
  出すと watchOS がそれを Watch のスマートスタックにも自動で出し、KURABELL の画面を隠す
  (1.1 の実機で「トレーニング中に Watch のアプリが消えた」。ワークアウトは裏で続いていた)。
  - 判定は `watchLiveFor`(`watchWorkoutForRef` の state 版)と `startAt` の一致。Watch の `started` で立ち、保存・破棄で降りる。下書きからも戻す
  - Watch が途中でワークアウトをやめた(`discarded`、`watchWorkoutStopped`)ら、出す側に戻す。`watchWorkoutForRef` も降ろすので、
    保存時は iPhone がすぐヘルスケアに書き、下書きの復元でも抑止は戻らない(Watch は discarded の後に同じ記録で started を送らない)
  - 保存では `watchLiveFor` を降ろさない(`startAt` が null になれば外れる)。`await` の前に降ろすと、間の render で Live Activity が一瞬出る(reviewer 重大1)
  - 代わりに、この間は iPhone のロック画面・Dynamic Island に休憩の経過が出ない。iPhone の1分ごとの通知と Watch の休憩画面・通知は残る

### 入力は −/+ ボタン(Digital Crown は使わない)

最初は重量・回数を Digital Crown で入れる形にしたが、ユーザーの判断でやめた(2026-09-26)。
ジムでは回しにくく、腕の動きで誤って回ることもある。

値は iPhone で入っているもの(前回の複製)から始まる。変えるときだけ −/+ を押す。
重量の刻みは種目の設定(バーベル 2.5kg など)を使わず、**一律で kg なら 1、lb なら 2.5**(`watchWeightStep`)。
手首の小さいボタンでは細かく刻めるほうが合わせやすい、というユーザーの判断(2026-09-28)。

**ボタンの反応(2026-09-28、実機で「重量・回数の入力の反応が悪い。特に回数の −」)。** 原因は3つあった。
- `.buttonStyle(.plain)` に外から `background` を付けていたので、当たり判定が記号の線だけだった(「−」は線が細く、ほぼ押せない)。
  → 面をラベルの内側に描き、`contentShape` で面全体を押せるようにした(`PadButtonStyle`)。RIR のボタンも同じだった。
- 入力画面を `ScrollView` で包んでいたので、スクロールかタップかを見分けるためにボタンの反応が遅れていた。
  → 包まない。46mm で1画面に収まる量にしてある。42mm・41mm・40mm はシミュレータで確認済み(2026-10-01、ブランチ `ui-refresh`)。
    40mm では見出しが「前回 80」だけに縮む(`ValueStepper` の `ViewThatFits`)。
- 標準の `Button` は指を離したときに確定するので、続けて押すと取りこぼした。
  → −/+ だけは `DragGesture(minimumDistance: 0)` で**触れた瞬間**に反応させ、振動(`.click`)を返す(`StepPad`)。
    押している状態は `@GestureState` で持つ。`@State` だと、ジェスチャが取り消されたときに押しっぱなしのまま残り、次の接触を無視し続けた。
- シミュレータで確認した。3回押すと3回反応すること、ボタンの端を押しても反応すること。
いちばん多い「前回どおりにやって RIR だけ入れる」はワンタップで済むように、RIR の4つのボタンを
スクロールせずに見える1行に並べてある。`tests/watch.test.js` で `digitalCrownRotation` を使っていないことを縛っている。

### ワークアウト(iPhone で記録を始めると Watch が自動で起動する、v122)

ユーザーの要望は「iPhone でアプリを立ち上げたら、Watch アプリも自動で立ち上がってほしい」(2026-09-28)。
iPhone から Watch アプリを起動できる公式の方法は `HKHealthStore.startWatchApp(with:)` だけで、Watch 側でワークアウトセッションを始める形になる。
ワークアウト中は腕を下ろしても KURABELL の画面のまま保たれ、心拍・消費カロリーも取れる。

ユーザーの決定:
- **Watch で心拍・消費カロリー付きのワークアウトを保存する。** その記録では、iPhone 側の時刻だけの書き込みを止める(二重にしない)
- **自動起動は「ヘルスケアと連携」(`profile.healthOn`)に連動させる。** 新しい設定項目は足さない

流れ:
1. iPhone の `ensureStarted`(startAt が null から値になる唯一の場所)で、`healthOn` なら `healthStartWatchWorkout()` を呼ぶ。
   下書きの復元は「開始」ではないので呼ばない
2. Watch の `AppDelegate.handle(_ workoutConfiguration:)` → `WorkoutManager.start` で `HKWorkoutSession` と `HKLiveWorkoutBuilder` を作る。
   権限(書き込み: ワークアウト・消費カロリー、読み取り: 心拍・消費カロリー)は **iPhone が先に求めておく**。
   Watch は裏から起こされるので権限シートを出せず、未決定だとワークアウトが始まらない(1.1 (6) の実機で踏んだ。
   シミュレータでは Watch に許可画面が出て通ったので気づかなかった)。許可は iPhone と Watch のアプリで共有される。
   iPhone は Watch アプリが入っているとき(`WatchSessionManager.hasWatchApp`)だけ、連携のオン時と `startWatchWorkout` の直前に求める。
   Watch 側の `requestAuthorization` の種類と iPhone 側を揃えることはテストで縛ってある
3. 記録中のスナップショットの `recordStartAt` で、ワークアウトをその記録に対応付ける。
   op `{kind: "workout", status: "started", recordStartAt}` を iPhone に送り、iPhone は `watchWorkoutFor` として下書きに保存する
4. iPhone の保存(`saveWorkout`)で、`watchWorkoutFor === startAt` なら iPhone はその場ではヘルスケアに書かない。
   代わりに `lastSaved: {key, startAt, endAt}` をスナップショットに載せ、書き込みを pending に積む(どちらも store に保存)
5. Watch はスナップショットが active でなくなったら、次のとおり処理する
   - `lastSaved.startAt` が自分の記録と一致する: iPhone の保存時刻で締めて保存(`finishWorkout`)
   - 一致しない: 破棄(`discardWorkout`)
6. 4時間(`HEALTH_MAX_WORKOUT_MS` と同じ)たっても終わらなければ、Watch が破棄する。iPhone も4時間を超える記録は書かない決まりなので、それに揃えている
7. **Watch は結果を返す。** 保存できたら `saved`、破棄した・保存に失敗した・システムにセッションを止められたら `discarded`。
   iPhone は `settleWatchHealth` で pending を締める。`saved` なら外すだけ、`discarded` か1時間の無応答なら **iPhone が時刻だけ書く**。
   これで、Watch で始めた後に何が起きても(Watch のアプリが落ちる、届かない、保存に失敗する)、ヘルスケアから記録が消えない。
   最悪でも、心拍の無い時刻だけのワークアウトになる(reviewer の指摘で追加)

落とし穴:
- **`recordStartAt` は、種目が0件でも記録(startAt)が続く間は送る。** 以前は active のときだけ送っていたので、差し替えのために
  最後の種目を消すと、Watch は「記録が終わった」と判断してワークアウトを破棄していた(reviewer の指摘)
- **対応付けは、記録とセッションの開始時刻の近さ(10分以内)で判断する。** 送信時刻で判断してはいけない。
  iPhone は種目を足した時点で状態を送り、その後で Watch を起動するので、正しいスナップショットほど「セッションより前」に送られている
  (送信時刻で弾いたら対応付かなくなった。シミュレータで確認)
- 対応付けの前は、「記録が無い」スナップショットで破棄するのは、セッション開始から5秒より後に送られたものだけにする
  (起動直後に届く古い状態で、始めたばかりのワークアウトを破棄しないため)
- start / finish / discard は `isBusy` で二重に走らせない。await の途中で別のスナップショットが届くため
- 保存は Apple の手順どおり、`session.end()` → ended の通知 → `endCollection` → `finishWorkout` の順にする
- Watch の `WKBackgroundModes`(`workout-processing`)は、ビルド設定の `INFOPLIST_KEY_*` では入らない。`KurabellWatch/Info.plist` に書いて、自動生成の分と合わせている
- **シミュレータでは、署名なし(`CODE_SIGNING_ALLOWED=NO`)でビルドすると HealthKit の entitlement が入らない。**
  「Missing com.apple.developer.healthkit entitlement」で全部失敗する。検証では署名ありでビルドする
- 保存するワークアウトの syncIdentifier は、iPhone と同じ `kurabell-workout-<startAt ISO>` にしている。
  iPhone の `deleteWorkout` はソースで絞らない形に変えた(Watch が保存した分も消せるように)。
  **実際に iPhone から Watch 由来のワークアウトを消せるかは、実機で未確認**

シミュレータで確認済み(2026-09-28、iPhone 17 Pro Max + Watch Series 11。reviewer の指摘の修正後も再確認):
- 最後の種目を消して入れ直しても、Watch のワークアウトは続く
- 保存すると Watch が `saved` を返し、iPhone の pending(`watch-health-pending-v1`)が空になる
- iPhone で記録を開始すると Watch アプリが起動し、初回はヘルスケアの許可画面が出る(日本語の説明文)。許可するとセッションが running になる
  (**実機ではこの許可画面が出ず、起動しなかった。** 上の「流れ」の 2 を参照)
- iPhone に `watchWorkoutFor` が届き、記録の startAt と一致する
- 保存すると Watch がワークアウトを Finished にし、iPhone はヘルスケアに書かない
- 2回目以降は許可画面なしで始まる。記録を破棄すると Watch のワークアウトも Discarded になる

## Xcode プロジェクト

- ターゲット `KurabellWatch` は `xcodeproj` gem で追加した。
  - 構成: SwiftUI・watchOS 10 以上・単一ターゲットの Watch アプリ
  - Bundle ID: `com.hajime5150.kurabellplus.watchkitapp`
  - `WKCompanionAppBundleIdentifier` = iPhone アプリ
- App の「Embed Watch Content」(`$(CONTENTS_FOLDER_PATH)/Watch`)で埋め込む。`[CP] Embed Pods Frameworks` より**前**に置くこと(RestActivity と同じ理由)。
- **版番号は App・RestActivity・KurabellWatch の3ターゲット、Debug/Release の6箇所で揃える。** `tests/restNotifications.test.js` が一致を縛っている。
- iPhone 側の `WatchPlugin` は `BridgeViewController.capacitorDidLoad()` で明示的に登録している(Iap・RestTimer と同じ)。
- アイコンは iPhone と同じ 1024px 画像(watchOS の単一サイズ)。

## 検証のしかた(シミュレータ)

1. watchOS のランタイムを入れる: `xcodebuild -downloadPlatform watchOS`(数 GB)
2. ペアを作る: `xcrun simctl pair <Watch UDID> <iPhone UDID>`
3. ビルドする
   - iPhone: `npm run ios:sync` の後、App スキームを iOS Simulator 向けにビルドする。Watch アプリも埋め込まれる
   - Watch: KurabellWatch スキームを watchOS Simulator 向けに別途ビルドし、`simctl install` する
4. 画面だけ確認する場合: 起動引数 `-KurabellSample` で固定データを表示する(同期しない)。`-KurabellLang en` を足すと英語・lb の固定データ(英語ストアのスクリーンショット用)
   - `-KurabellOpen a1`: 種目画面から始める
   - `-KurabellEdit 3`: 入力画面から始める
   - `-KurabellRest 1`: 一覧からタイマー画面を開いた状態で始める
5. Watch をタップできないとき: Debug ビルドの起動引数 `-KurabellDebugCommit <RIR>` を使う。スナップショットを受け取った直後に「最初の未実施セットを RIR で確定」を1回だけ行う
6. キューを見る
   - iPhone: `plutil -p <App のデータコンテナ>/Library/Preferences/com.hajime5150.kurabellplus.plist`(`watch.ops.v1`)
   - Watch: `watch.pending.v1`

### 確認済み(2026-09-26、iPhone 17 Pro Max + Watch Series 11 46mm、iOS/watchOS 26.5)

- iPhone で種目を追加 → Watch の一覧に出る
- Watch で RIR を確定 → iPhone のセットに RIR が入り、休憩が始まる
- iPhone のアプリをホームに退避したまま Watch で確定 → iPhone を前面に戻すと合流する(二重にならない)
- Watch の再起動をまたいでも、未確認の op が送り直される

### シミュレータで分かったこと

- **Watch → iPhone の `transferUserInfo` は、シミュレータでは iPhone に届かなかった**(Watch 側のログは `transferring: YES` のまま)。そのため、届く状態なら `sendMessage` を使い、iPhone に届くようになったときに再送する形にした。
  - 実機での `sendMessage` は、裏で寝ている iPhone のアプリも起こす(Apple の仕様)。
  - 実機で `transferUserInfo` だけの経路がどう振る舞うかは未確認。

## 実機での確認(2026-09-26、iPhone 15 Pro Max iOS 26.6.1 + Apple Watch Series 10 watchOS 26.6、TestFlight 1.0 (4))

ユーザーが次の7項目を試し、いずれも問題なしと報告した。

1. iPhone で記録を開始すると、Watch に種目の一覧が出る
2. Watch で RIR を押すとタイマー画面に切り替わり、iPhone のセットにも RIR が入る
3. iPhone をロックしたまま Watch で数セット入力し、iPhone を開くと合流している(重複なし)
4. Watch で始めた休憩の通知が、1・2・3分で1回ずつ届く
5. Watch のワークアウト(フィットネス集中モード)中でも休憩の通知が届く
6. iPhone で保存すると、Watch が今日のメニューまたは待機画面に戻る
7. −/+ と RIR のボタンが押しやすく、スクロールせずに RIR まで見える(46mm 以外の画面サイズは未確認)

### 実機に入れるまでにつまずいたこと

- **開発版を「Watch」アプリの「利用可能なアプリ」から入れると「今はこのAppをインストールできません」になった。**
  原因は、Watch アプリのプロビジョニングプロファイルに Watch の UDID が入っていなかったこと。
  `xcodebuild -allowProvisioningDeviceRegistration` では Watch が自動登録されなかったので、
  developer.apple.com の「デバイス」で手動登録してから再ビルドした(プロファイルに入ったことは `security cms -D` で確認)。
  それでも同じエラーが続いた(原因は未特定)。
- **Mac から Watch へ直接入れる経路(`devicectl` / Xcode の Run)は、Wi-Fi のトンネル確立でタイムアウトし続けた。**
  Mac の VPN・ファイアウォールは問題なし。ルーターの端末間通信の制限などが疑わしいが、未確認。
- **TestFlight で iPhone を 1.2 (14) に上げたとき、Watch へのインストールが途中で止まった**(2026-10-01。iPhone の「Watch」アプリ →
  アプリ一覧で KURABELL が ■ の付いた円のまま進まない)。ビルドは正しかった(アーカイブ内の Watch アプリは 1.2 (14))。
  Watch を充電器に載せて iPhone の近くに置く・止めて入れ直す・両方を再起動する、のどれかで入った。**「Watch が古いまま」と言われたら、まずここを見る**
- **TestFlight(内部テスト)で配ると、Watch アプリも普通に入った。** Watch の実機確認は、最初から TestFlight を使うのが早い。
  審査中のバージョンがあっても、同じバージョンの新しいビルドを TestFlight 用にアップロードできる(審査中のビルドは差し替わらない)。

## 未確認のこと

- ~~41mm など小さい画面で、入力画面とタイマー画面が1画面に収まるか~~ → シミュレータ(Series 11 42mm・Series 9 41mm・SE 3 40mm、日英)で確認済み。
  40/41mm(幅180pt未満、`isSmallWatch`)は休憩タイマーの数字を一回り小さくしている。実機では未確認
- 長時間(1回のトレーニング全体)使ったときの通信の遅延と、取りこぼしが無いか
- App Store Connect での Watch 用スクリーンショットと審査
