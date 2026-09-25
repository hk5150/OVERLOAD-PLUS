# App Store Connect 掲載情報(ドラフト)

このファイルはApp Store Connectでアプリを登録する際に、そのままコピー&ペーストするための下書きです。実際の入力はApp Store Connect(https://appstoreconnect.apple.com)の管理画面で行います。

## 掲載方針(2026-09-23 改訂)

- **売りは2つだけに絞る。**「前回の自分がセットごとに見える」と「サブスクなしの買い切り」。
  競合(Strong・Hevy等)はサブスク主体なので、買い切りはそれだけで購入理由になる
- **否定形から書き出さない。** 旧版は「次の重量を自動で決めません」「広告なし」から始まっていて守りに見えた。
  冒頭は得られるものを書き、「〜なし」の列挙は後ろにまとめる
- **課金条件は説明文の冒頭3行に入れる**(「続きを読む」の前に見える範囲)。Guideline 3.1.1 の開示要件も兼ねる
- **価格は書かない。** App内課金の価格はストアが自動で表示する。説明文に書くと価格改定のたびに審査が要る
- **「Apple Watch対応」とは書かない。** Watchアプリは無い(ロック中の通知がWatchに転送されるだけ)。
  Guideline 2.3(メタデータの正確性)に触れる

## 基本情報

| 項目 | 値 |
|---|---|
| アプリ名・日本語 (30文字以内) | `KURABELL｜筋トレ記録・前回比較` (19文字) |
| サブタイトル・日本語 (30文字以内) | `ジムで前回超え。サブスクなし` (14文字) |
| ホーム画面の表示名 | `KURABELL`(`Info.plist` の `CFBundleDisplayName`。掲載名とは別フィールドなので変更不要) |
| プライマリカテゴリ | ヘルスケア/フィットネス(Health & Fitness) |
| セカンダリカテゴリ(任意) | スポーツ(Sports) |
| 価格 | **無料**(App本体)。フル解除は非消耗型App内課金(後述) |
| Copyright | © 2026 (ご自身の氏名または個人事業の名称を入れてください) |
| サポートURL | `https://hk5150.github.io/OVERLOAD-PLUS/support.html` (GitHub Pagesを有効化後にアクセス可能。mailtoはApp Store Connectのサポート URL欄には使えないため、support.html内の問い合わせリンクとして残している) |
| マーケティングURL(任意) | GitHub PagesのURL(公開している場合) |
| プライバシーポリシーURL | `https://hk5150.github.io/OVERLOAD-PLUS/privacy.html` (GitHub Pagesを有効化後にアクセス可能) |
| 対応言語 | 日本語・英語。App Store Connectで **English (U.S.)** のローカライズを追加する(文面は後述の「英語ローカライズ」節) |

アプリ名を日本語ローカライズだけ変えるのは、アプリ名が検索で最も重く効く欄のため。
英語名のままだと「筋トレ記録」で検索されたときに不利になる。英語ローカライズは `KURABELL Workout Log` のまま。

## キーワード (100文字以内、カンマ区切り)

アプリ名・サブタイトルに入っている語(筋トレ記録・前回比較・ジム・サブスク)はキーワード欄に入れても重複になるので外している。

```
筋トレ,ベンチプレス,スクワット,漸進性過負荷,RIR,1RM,自己ベスト,買い切り,オフライン,休憩タイマー,ワークアウト,トレーニング日記
```

## プロモーションテキスト (170文字以内、審査不要で更新可能)

```
前回の重量・回数・余力が、セットごとに横に並ぶ筋トレ記録。最初の10回は全機能無料、あとは一度の購入でずっと使えます。サブスクなし・広告なし・アカウント登録なし。記録は端末内だけに保存され、電波のないジムでも動きます。
```

## 概要(Description、4000文字以内)

```
前回の重量・回数・余力が、セットごとに横に並ぶ。
思い出す手間はゼロ。「今日は前回を超える」ことだけに集中できる筋トレ記録アプリです。

最初の10回の記録まで、すべての機能を無料で使えます。
気に入ったら一度の購入でずっと使えます。サブスクリプションはありません。

■ 前回の自分と、セットごとに勝負
ベンチプレスの2セット目を入力するとき、その横には前回の2セット目「70×9 RIR1」が出ています。重量・回数・余力(RIR=あと何回できたか)を前回と並べて比べられるので、今日どこで上乗せするかがその場で決まります。推定1RMが前回を超えると「YOU WIN!」でお知らせ。

■ 今日やることは、もう並んでいる
全身・上下・Push/Pull/Legs・5分割・カスタムから分割を選ぶと、ローテーションに合わせて「今日のメニュー」を前回の記録から用意します。ジムに着いたらタップ1回で記録開始。同じ重量が3回続いたら「そろそろ上げどき」とお知らせします。次の重量を決めるのは、アプリではなくあなたです。

■ スマホを置いても、休憩時間がわかる
セットを記録すると休憩タイマーが自動で始まり、1分ごとに通知でお知らせ。ロック中でも届くので、画面を見ずに次のセットへ。

■ 伸びが、線で見える
・推定1RMと最大重量の推移(種目別)
・総ボリュームの推移(全体・週別・部位別)
・直近7日間の部位別セット数とボリューム
・カレンダーで、どの日にどの分割をやったか振り返り

■ ヘルスケアと連携
設定でオンにすると、保存したワークアウトをヘルスケアに記録し、体重をヘルスケアと同期します。体重計アプリで量った体重が、懸垂やディップスなど自重種目の計算にそのまま使われます。

■ 記録をそのままAIに相談
「AI相談」を押すと、記録と相談文がクリップボードにコピーされ、設定で選んだAIチャットが開きます。貼り付けて送るだけ。記録がアプリから自動で送信されることはありません。

■ その他
・約95種目を内蔵、カスタム種目も追加可能
・ダンベル種目は片手の重量で記録、自重種目は体重を加味して計算
・ウォームアップ・補助ありセットを区別
・kg / lb 切り替え、日本語 / 英語 切り替え
・JSONでバックアップと復元、CSV書き出し

■ 料金
・最初の10回の記録まで、すべての機能を無料で使えます
・11回目の記録を保存するには、フル解除(買い切りのApp内課金)が必要です
・それまでの記録・グラフ・バックアップは、購入しなくてもいつでも見られます
・月額・年額の課金はありません
・機種変更や再インストール時は「購入を復元」で元に戻せます

■ 安心して使える理由
・アカウント登録なし
・広告なし
・トラッキングなし
・記録は端末の中だけに保存
・記録・グラフ・バックアップはすべてオフラインで動作(電波の悪いジムでも使えます)
種目のフォームをYouTubeで調べる機能と、AI相談でチャットを開く機能を使ったときだけ外部ブラウザが開きます。どちらもアプリから記録を送信することはありません。
```

---

# 英語(English (U.S.))ローカライズ

App Store Connect の「App情報」→ 言語を追加 で **English (U.S.)** を足し、以下を入力する。
プライバシーポリシーURLとサポートURLは日本語版と同じで構わない
(1つのURLが端末の言語に応じて日英を出し分けるため。`privacy.html` / `support.html` を参照)。

| 項目 | 値 |
|---|---|
| App名 (30文字以内) | `KURABELL Workout Log` |
| サブタイトル (30文字以内) | `Beat your last session` (22文字) |

## キーワード (100文字以内、カンマ区切り)

アプリ名に含まれる語(workout, log)はキーワードに入れても重複になるため外している。

```
gym,lifting,strength,training,tracker,rir,1rm,progressive overload,barbell,offline,rest timer
```

## プロモーションテキスト (170文字以内、審査不要で更新可能)

```
Your last weight, reps and RIR sit on every set row, so beating last time is the only thing to think about. First 10 workouts free, then one purchase. No subscription.
```

## 概要(Description)

```
Your last weight, reps and RIR — right there on every set row.
Nothing to remember. Just beat last time.

Your first 10 workouts are free, with every feature included.
Like it? Unlock the full app with a single purchase. No subscription.

■ Beat your last session, set by set
When you log your second set of bench, your last second set — "155×9 RIR1" — is sitting right next to it. Weight, reps and RIR (reps in reserve) side by side, so you know exactly where to push today. Beat your estimated 1RM and you get a "YOU WIN!".

■ Today's plan is already waiting
Pick a split — full body, upper/lower, push/pull/legs, 5-day or your own — and each day's menu is built from your last session of that day. One tap at the gym and you're logging. Stuck at the same weight three sessions running? You'll get a nudge. The next weight is still your call, not the app's.

■ Put the phone down. We'll keep time.
The rest timer starts when you log a set and sends a notification every minute, even with the phone locked.

■ Watch your numbers climb
・Estimated 1RM and top weight per exercise
・Total volume over time — overall, weekly and by muscle
・Sets and volume per muscle for the last 7 days
・A calendar showing which split you trained on each day

■ Works with Apple Health
Turn it on in Settings to save your workouts to Apple Health and keep your body weight in sync. The weight from your smart scale goes straight into bodyweight lifts like pull-ups and dips.

■ Ask AI about your training
Tap "Ask AI" and your log is copied to the clipboard along with a prompt, then the AI chat you picked in Settings opens. Paste and send. The app never sends your log anywhere on its own.

■ And more
・About 95 built-in exercises, plus your own
・Dumbbell lifts logged per hand; bodyweight lifts include your bodyweight
・Warm-up and assisted sets kept apart
・kg or lb, English or Japanese
・JSON backup and restore, CSV export

■ Pricing
・Your first 10 workouts are free, with every feature
・Saving your 11th workout requires the one-time full unlock (in-app purchase)
・Everything you logged before that — history, charts, backups — stays available without buying
・No monthly or yearly fees
・New phone or reinstall? Use "Restore Purchases"

■ Built to stay out of your way
・No account
・No ads
・No tracking
・Your records stay on your device
・Logging, charts and backups all work offline — no signal at the gym, no problem
The app only opens your browser when you choose to look up an exercise on YouTube or open an AI chat. Neither sends your records anywhere.
```

## App Review用の申し送り事項(英語)

```
This app requires no account. Logging, totals, charts and backups run entirely on local device storage, with no communication to any server. No test credentials are needed.

In-app purchase: the app is free for the first 10 saved workouts. Saving the 11th workout shows a paywall offering a one-time non-consumable unlock (com.hajime5150.kurabellplus.unlock). Previously saved workouts, charts and backups remain accessible without purchasing. "Restore Purchases" is available in the Settings tab.

The exercise list includes a "YouTube" button that optionally opens the system browser to YouTube search results, passing only the exercise name. The "Ask AI" button copies the user's log to the clipboard and opens the AI chat site selected in Settings; nothing is placed in the URL and nothing is transmitted by the app itself. Unless the reviewer taps one of these buttons, the app makes no network requests (apart from StoreKit).

HealthKit: off by default. When the user turns on "Connect to Apple Health" in the Settings tab, the app asks for permission and then (1) saves each workout the user logs as Traditional Strength Training with its start and end times only (no calories), (2) reads the latest body weight to calculate bodyweight exercises, and (3) saves the body weight the user enters in Settings. Deleting a workout in the app also deletes the workout the app wrote to Health. Health data stays on the device; it is never sent to a server or used for advertising.

The app ships in English and Japanese; the language follows the device setting on first launch and can be changed in the Settings tab. Weight units (kg/lb) are a separate switch in the same tab.
```

## App内課金

| 項目 | 値 |
|---|---|
| 種類 | 非消耗型(Non-Consumable) |
| 商品ID | `com.hajime5150.kurabellplus.unlock`(`src/domain/iap.js` の `IAP_PRODUCT_ID` と一致させる) |
| 参照名 | Full Unlock |
| 表示名(日本語) | フル解除 |
| 説明(日本語) | 記録の保存回数の上限をなくします |
| 表示名(英語) | Full Unlock |
| 説明(英語) | Removes the 10-workout limit |
| 価格 | App Store Connectで設定(`ios/App/KurabellPlus.storekit` の¥600はテスト用の仮の値) |
| ファミリー共有 | 有効にする(`MONETIZATION.md` 参照) |
| 審査用スクリーンショット | ペイウォール画面(記録を10回保存した状態で11回目を保存しようとすると出る) |

## 年齢制限(Age Rating)アンケートの回答方針

すべて「なし」でよい想定です(暴力・アダルト・ギャンブル要素等は一切なし)。想定レーティング: 4+

## App Privacy(データ収集に関する質問)への回答方針

App Store Connectの「App Privacy」セクションでは、以下の方針で回答します。

- **データの収集: 収集なし(Data Not Collected)**
  - 入力されたトレーニング記録は端末のローカルストレージにのみ保存され、アプリ自身が外部サーバーへ送信することはありません。
  - アナリティクス・広告・トラッキングSDK、サードパーティ連携は組み込んでいません。
  - 外部サービスを開く機能が2つありますが、いずれも `window.open()` によるOS標準の外部リンク遷移で、SDK埋め込みではありません。どちらもアプリから外部へデータを送信しないため、「収集なし」の回答で問題ありません。
    - **YouTube検索**: 種目一覧の「YouTube」ボタン。種目名 + 固定の検索語のみをURLに載せます。トレーニング記録は渡しません。
    - **AIに相談**: 記録タブの「AI相談」ボタンと履歴タブの「AIに相談」ボタン。押すと記録を**端末のクリップボードにコピー**し、設定で選んだAIチャットのページ(ChatGPT / Claude / Gemini / Perplexity / Grok)を開くだけです。**URLのクエリには記録を一切載せていません**(この方式を意図的に避けています。理由は `docs/vite移行.md` を参照)。記録がAIサービスに渡るのは、ユーザー自身がチャット欄へ貼り付けたときだけで、アプリの送信行為ではありません。
  - **ヘルスケア(HealthKit)連携**(iOS、既定オフ): ワークアウトと体重をヘルスケアと端末内でやりとりするだけで、外部へは送信しません。
    Appleの定義上「収集」は端末の外へ送ることなので、これも「収集なし」のままでよい。
    ただし Guideline 5.1.3 により、ヘルスケアのデータを広告・マーケティングに使わないこと、プライバシーポリシーに明記することが必要(privacy.html の4章)。
  - 詳細は [privacy.html](privacy.html) を参照。

## スクリーンショット

- **iPad用は不要です。** iPhone専用アプリ(`TARGETED_DEVICE_FAMILY = "1"`)として提出するため、iPadではiPhone互換モードで動作します(縦画面前提のレイアウトのため、この構成にしています)。
- **スクリーンショットはローカライズごとに必要です。** 英語用を登録しないと、英語圏のユーザーに日本語版が表示されます。
- 検索結果に表示されるのは**先頭3枚だけで、しかもかなり小さく表示されます**。1枚目に一番の売り(前回との比較)を置き、該当部分は拡大表示で重ねてあります。

### 実物(v2、2026-09-23作成)

`~/Desktop/KURABELL-appstore-screenshots/v2/{ja,en}/` に 1320×2868(6.9インチ)で各6枚。
v1(`{ja,en}/` 直下の5枚、v93時点)はアプリ画面をそのまま撮ったもので、見出しもなく前回値がサムネイルでは読めなかったため作り直した。

| ファイル | 見出し(日本語) | 見出し(English) | 見せている画面 |
|---|---|---|---|
| `01-last-session.png` | 前回の自分が、セットごとに見える | Your last session, on every set | 記録画面。前回を超えた状態(YOU WIN!)+セット行の拡大 |
| `02-todays-menu.png` | 今日やることは、もう並んでいる | Today's plan is already waiting | 今日のメニュー(前回からの引き継ぎ) |
| `03-progress-charts.png` | 伸びが、線で見える | Watch your numbers climb | ボリューム推移と種目別の推定1RM推移 |
| `04-rest-timer.png` | スマホを置いても、休憩時間がわかる | Put the phone down. We'll keep time. | 休憩タイマー拡大表示+通知バナー(実際の通知文言) |
| `05-history-calendar.png` | 続けた日が、残っていく | Every session, on the calendar | 履歴カレンダー(日ごとの分割名) |
| `06-pricing.png` | サブスクなし。一度買えばずっと | No subscription. Pay once, keep it. | 画面なし。料金条件と「〜なし」の一覧 |

作り方(撮り直すとき):

1. Web版(`kurabell-dev`, 8765)を開く。SWが古いファイルを掴む罠を避けるため、Playwrightで
   `serviceWorkers: 'block'` の新しいコンテキスト(440×956、deviceScaleFactor 3 = 1320×2868)を作る
2. サンプル履歴(PPL・約11週間、36回分)を `localStorage` の `workout-log-v1` に入れてから起動する。
   英語版は `profile.unit: "lb"` にし、重量を5lb刻みに寄せたkg値で入れる(lbで端数が出ないように)
3. 今日のメニューから記録を開始し、ベンチプレスで前回(70kg×10)を超える72.5kg×10を入力して「YOU WIN!」を出す
4. 経過時間・休憩時間は下書き(`workout-draft-v1`)の `startAt` / `restStartAt` を書き換えてから再読み込みして作る
5. バージョンバッジ(`vNNN`)は非表示にしてから撮る
6. 見出し・端末フレーム・拡大部分・通知バナーはHTMLで合成して書き出す

撮影スクリプトと合成用HTMLはgitignore済みの `.playwright-mcp/store/` に置いてある(`shoot-{ja,en}.js`・`compose.html`)。
Web版で撮っているので、iOSのネイティブ版と見た目が違う箇所(ステータスバーなど)は合成側で描いている。
**画面の中身はすべて実際のアプリの表示で、文言も実装にあるもの**(通知の本文は `rest.notifyBody`)。

## App Review用の申し送り事項(App Review Information)

「メモ」欄に、審査担当者向けに以下のような一文を入れておくとスムーズです。

```
本アプリはアカウント登録が不要で、記録・集計・グラフ・バックアップなどの主要機能はすべて端末内のローカルストレージのみで完結し、外部サーバーとの通信は行いません。テスト用のログイン情報は不要です。

App内課金: 記録の保存10回までは無料で、11回目の保存時に買い切りのフル解除(非消耗型)を案内します。購入しなくても、それまでの記録・グラフ・バックアップは閲覧できます。「購入を復元」は設定タブにあります。

種目一覧に「YouTube」ボタンがあり、任意でOS標準の外部ブラウザを開いてYouTube検索結果を表示します(種目名のみを検索語として渡します)。「AI相談」ボタンは記録をクリップボードにコピーし、設定で選んだAIチャットのページを開くだけで、URLに記録は載せず、アプリから送信もしません。これらの操作を行わない限り、アプリは(StoreKitを除き)通信を発生させません。

ヘルスケア(HealthKit)連携: 既定はオフです。設定タブの「ヘルスケアと連携」をオンにすると権限を求め、(1)記録したワークアウトを「従来型筋力トレーニング」として開始・終了時刻のみ書き込み(消費カロリーは書きません)、(2)自重種目の計算のため最新の体重を読み込み、(3)設定で入力した体重を書き込みます。アプリで記録を削除すると、アプリが書き込んだワークアウトもヘルスケアから削除します。ヘルスケアのデータは端末内だけで扱い、外部への送信や広告目的の利用はしません。
```
