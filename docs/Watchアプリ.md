# Apple Watch アプリ

Watch でセットを入力するためのアプリ(v120〜)。
経緯: 2026-08-23 には「Watch アプリは作らず、ローカル通知で代替する」としていた。v112 の Time Sensitive 通知と Live Activity を経て、1.0 の審査待ちの間に、記録の入力まで含めて作ることにした。

## できること / できないこと

| Watch でできる | iPhone でだけできる |
|---|---|
| 今日の種目一覧と進捗 | 記録の開始(種目の追加・今日のメニューから開始) |
| 各セットの前回の同じ番手のセット・RIR の差分 | 種目の追加・削除・並べ替え、スーパーセット |
| セットの入力(重量・回数は −/+ ボタン、RIR 0/1/2/3+) | 記録の保存・破棄 |
| セットの追加(直前のセットの複製) | ウォームアップ・補助の切り替え |
| 休憩タイマーの経過表示と、Watch で始めた休憩の通知 | 課金(Watch は未購入でも制限しない。制限は保存時だけなので) |
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

- Watch で RIR を確定し、その種目が `restAfter`(スーパーセットの途中ではない)なら、Watch 上で休憩を始める。1・2・3分のローカル通知も Watch 自身が予約する(Time Sensitive)。
- iPhone は op の `restStartAt` を受け取り、`restStartAt` と Live Activity を合わせる。
  - 使うのは**実際に適用できた op の休憩だけ**。捨てた・保留にした op の休憩は使わない。
  - 30分より古い休憩も無視する。保存後に遅れて届いた op や、下書きの期限切れの後に残っていた op で、終わった休憩を走らせないため。
  - **iPhone 側の通知は予約しない**(`restFromWatchRef`)。予約すると、ロック中の iPhone の通知が Watch に転送され、手首に二重に届くため。この値は下書きにも保存する(OS にアプリを終了されて再起動したときに、抑止が外れないように)。
- Watch は自分で始めた休憩の開始時刻を覚えておく。その op が iPhone で確認された後に、iPhone 側で休憩が止まった・新しい休憩が始まったら、Watch の通知を取り消す。
- iPhone で始めた休憩の通知は、これまでどおり iPhone が出す(ロック中は Watch に転送される)。

### 入力は −/+ ボタン(Digital Crown は使わない)

最初は重量・回数を Digital Crown で入れる形にしたが、ユーザーの判断でやめた(2026-09-26)。
ジムでは回しにくく、腕の動きで誤って回ることもある。

値は iPhone で入っているもの(前回の複製)から始まる。変えるときだけ −/+ を押す。
いちばん多い「前回どおりにやって RIR だけ入れる」はワンタップで済むように、RIR の4つのボタンを
スクロールせずに見える1行に並べてある。`tests/watch.test.js` で `digitalCrownRotation` を使っていないことを縛っている。

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
4. 画面だけ確認する場合: 起動引数 `-KurabellSample` で固定データを表示する(同期しない)
   - `-KurabellOpen a1`: 種目画面から始める
   - `-KurabellEdit 3`: 入力画面から始める
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

## 未確認のこと

- 実機の iPhone と Watch での通信の遅延と、iPhone がロック中に `sendMessage` で起こされたときの挙動
- 実機の Watch をタップして操作したときの使い心地(−/+ と RIR ボタンの押しやすさ、41mm など小さい画面で1画面に収まるか)
- Watch で始めた休憩の通知が、フィットネス集中モード中に届くか
- App Store Connect での Watch 用スクリーンショットと審査
