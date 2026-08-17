# App Store Connect 掲載情報(ドラフト)

このファイルはApp Store Connectでアプリを登録する際に、そのままコピー&ペーストするための下書きです。実際の入力はApp Store Connect(https://appstoreconnect.apple.com)の管理画面で行います。

## 基本情報

| 項目 | 値 |
|---|---|
| アプリ名 (30文字以内) | KURABELL Workout Log |
| サブタイトル (30文字以内) | 前回と比べる筋トレ記録 |
| プライマリカテゴリ | ヘルスケア/フィットネス(Health & Fitness) |
| セカンダリカテゴリ(任意) | スポーツ(Sports) |
| 価格帯 | 有料 — App Store Connectの「価格および配信状況」で価格帯(Tier)を選択(銀行・税務情報の登録後に選択可能) |
| Copyright | © 2026 (ご自身の氏名または個人事業の名称を入れてください) |
| サポートURL | `https://hk5150.github.io/OVERLOAD-PLUS/support.html` (GitHub Pagesを有効化後にアクセス可能。mailtoはApp Store Connectのサポート URL欄には使えないため、support.html内の問い合わせリンクとして残している) |
| マーケティングURL(任意) | GitHub PagesのURL(公開している場合) |
| プライバシーポリシーURL | `https://hk5150.github.io/OVERLOAD-PLUS/privacy.html` (GitHub Pagesを有効化後にアクセス可能) |
| 対応言語 | 日本語・英語。App Store Connectで **English (U.S.)** のローカライズを追加する(文面は後述の「英語ローカライズ」節) |

## キーワード (100文字以内、カンマ区切り)

```
筋トレ記録,ワークアウトログ,トレーニング日記,前回比較,RIR,重量記録,自己ベスト,1RM,ジム,オフライン
```

## プロモーションテキスト (170文字以内、審査不要で更新可能)

```
前回の重量・回数・RIRがセットごとにそのまま出てくる筋トレ記録アプリ。次の重量はアプリではなくあなたが決めます。主要機能はオフラインで動作し、記録は端末内にのみ保存されます。アカウント登録・広告・トラッキングなし。
```

## 概要(Description、4000文字以内)

```
前回の重量・回数・RIRを、セットごとに見ながら記録。

KURABELL Workout Logは、次の重量を自動で決めません。
前回の実績をわかりやすく提示し、今日どう伸ばすかはあなた自身が判断する筋トレ記録アプリです。

アカウント登録、広告、トラッキングはありません。
記録は端末内に保存され、主要機能はオフラインで動作します。

■ 主な機能
・記録: 重量・回数・RIR(あと何回できたか)を入力。ウォームアップとワーキングセットを区別
・前回との比較: 各セット行に前回の同じ番手のセットを並べて表示。同じ重量・回数なら余力の差もわかります
・今日のメニュー: 選んだ分割(全身/上下/PPL/5分割/カスタム)のローテーションに応じて、前回の記録をそのまま引き継いで提示。開始後に自由に調整できます
・推定1RM・自己ベスト: Epley式による推定1RM(参考値)と自己ベスト(PR)を自動計算、更新時にバッジ表示
・グラフ: 総ボリュームの推移(全体/週別/部位別)、種目別の重量・推定1RM推移
・タイマー: セッション経過時間、セット間インターバルを自動計測
・部位別集計: 直近7日のセット数・ボリューム・最終実施日を一覧表示
・種目マスター: 約95種目を内蔵。カスタム種目の追加も可能。種目名でYouTube検索を開き、フォームを確認できます(任意)
・バックアップ: JSON書き出し/復元、CSV書き出しに対応

■ KURABELL Workout Logが選ばれる理由
・セットごとに前回の重量・回数・RIRを並べて比較できる
・次回の重量をアプリが勝手に決めない、判断はあなた自身
・アカウント登録不要
・広告なし
・トラッキングなし
・記録は端末内保存
・JSON/CSVでのエクスポートに対応
・サブスクリプションなし

■ 通信について
トレーニング記録、集計、グラフ、バックアップなどの主要機能はすべてオフラインで動作します。種目のやり方をYouTubeで調べる場合のみ、任意で外部ブラウザが開き通信が発生します。この検索に使うのは種目名だけで、トレーニング記録がYouTubeや開発者に送信されることはありません。

■ こんな方におすすめ
・毎回のトレーニングで「前回何kg・何回やったか」を思い出すのが面倒な方
・重量や回数はアプリに決められるのではなく、前回の実績を見て自分で判断したい方
・シンプルなUIで記録だけに集中したい方
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
gym,lifting,strength,training,tracker,rir,1rm,progressive overload,barbell,dumbbell,offline
```

## プロモーションテキスト (170文字以内、審査不要で更新可能)

```
Your last weight, reps and RIR appear on every set row. The app never decides your next weight — you do. Works offline, stores everything on device. No account, no ads, no tracking.
```

## 概要(Description)

```
Your last weight, reps and RIR — right there on every set row.

KURABELL Workout Log does not pick your next weight.
It puts your last session in front of you and leaves the decision where it belongs: with you.

No account. No ads. No tracking.
Your records stay on your device and the main features work offline.

■ What it does
・Log: weight, reps and RIR (reps in reserve), with warm-up and working sets kept apart
・Compare to last time: every set row carries the matching set from your last session. Same weight and reps? You also see how your RIR changed
・Today's menu: pick a split (full body / upper-lower / PPL / 5-day / custom) and each rotation day carries your last session forward. Adjust anything once you start
・Estimated 1RM and PRs: Epley-based estimate and personal bests, calculated for you, with a badge when you beat one
・Charts: total volume over time (overall, weekly, by muscle) and weight plus estimated 1RM per exercise
・Timers: session time and rest between sets, started automatically
・Weekly muscle breakdown: sets, volume and days since you last trained each muscle
・94 built-in exercises, plus your own. Optionally open a YouTube search to check form
・Backup: JSON export and restore, plus CSV export
・kg or lb, English or Japanese — two independent switches in Settings

■ Why people choose it
・Last session's weight, reps and RIR sit next to what you are typing
・The app never overrides your judgment about the next weight
・No account required
・No ads
・No tracking
・Records stored on device
・JSON and CSV export
・No subscription

■ About network use
Logging, totals, charts and backups all work offline. The only time the app reaches the network is if you choose to look up an exercise on YouTube, which opens your browser. Only the exercise name is used as the search term — your training records are never sent to YouTube or to the developer.

■ Who it is for
・Anyone tired of trying to remember what they lifted last time
・Anyone who wants to decide their own weights, informed by what they actually did
・Anyone who wants a plain interface and nothing between them and the log
```

## App Review用の申し送り事項(英語)

```
This app requires no account. Logging, totals, charts and backups run entirely on local device storage, with no communication to any server. No test credentials are needed.

The exercise list includes a "YouTube" button that optionally opens the system browser to YouTube search results. It passes the exercise name as the search term only — no personal data or training records are transmitted. Unless the reviewer taps that button, the app makes no network requests.

The app ships in English and Japanese; the language follows the device setting on first launch and can be changed in the Settings tab. Weight units (kg/lb) are a separate switch in the same tab.
```

## App内課金

なし(単発の有料アプリ、In-App Purchaseは使用しない想定)

## 年齢制限(Age Rating)アンケートの回答方針

すべて「なし」でよい想定です(暴力・アダルト・ギャンブル要素等は一切なし)。想定レーティング: 4+

## App Privacy(データ収集に関する質問)への回答方針

App Store Connectの「App Privacy」セクションでは、以下の方針で回答します。

- **データの収集: 収集なし(Data Not Collected)**
  - 入力されたトレーニング記録は端末のローカルストレージにのみ保存され、アプリ自身が外部サーバーへ送信することはありません。
  - アナリティクス・広告・トラッキングSDK、サードパーティ連携は組み込んでいません。
  - 種目一覧に「YouTube」ボタンがあり、タップすると `window.open()` で外部ブラウザのYouTube検索結果を開きます(種目名 + 固定の検索語のみを渡す。SDK埋め込みではなく、OS標準の外部リンク遷移)。個人データやトレーニング記録は一切渡さないため、この機能があっても「収集なし」の回答で問題ありません。
  - 詳細は [privacy.html](privacy.html) を参照。

## スクリーンショット

- Xcode SimulatorでiPhone(6.9インチ相当、例: iPhone 16 Pro Max)を起動し、アプリの主要画面(オンボーディング/分割選択/記録入力/グラフ)を `Cmd+S` でスクリーンショット保存すれば、実機不要でApp Store用画像を用意できます。
- **iPad用は不要です。** iPhone専用アプリ(`TARGETED_DEVICE_FAMILY = "1"`)として提出するため、iPadではiPhone互換モードで動作します(縦画面前提のレイアウトのため、この構成にしています)。
- 必要枚数・サイズの詳細はApp Store Connectのアップロード画面が案内する現行の要件に従ってください(仕様がApple側で更新されることがあるため、ここでは固定しません)。

- **スクリーンショットはローカライズごとに必要です。** 英語ローカライズを追加したら、
  アプリの表示言語を English にした状態で撮り直す(シミュレータの言語設定を英語にするか、
  アプリ内の「設定」→ Language → English で切り替える)。
  App Store Connect は英語用スクリーンショットが未登録の場合、日本語のものを流用するため、
  英語圏のユーザーに日本語の画面が出てしまう。

### キャプション案(5枚構成)

実際にアプリに存在する画面・機能のみを使ってください。

| # | 画面 | 日本語 | English |
|---|---|---|---|
| 1 | 記録画面(前回値の表示箇所) | 前回の自分を、セットごとに超える | Beat your last session, set by set |
| 2 | 記録画面(重量・回数・RIR入力欄、前回値との並び) | 重量・回数・RIRを並べて比較 | Weight, reps and RIR side by side |
| 3 | 記録画面または今日のメニュー(前回引き継ぎ表示) | 次回の重量は、アプリではなく自分で決める | You decide the next weight, not the app |
| 4 | グラフ画面(推定1RM・ボリューム推移) | 推定1RMとボリュームの変化を確認 | Track estimated 1RM and volume |
| 5 | オンボーディングまたは設定画面 | 登録不要・広告なし・端末内保存 | No account, no ads, stored on device |

## App Review用の申し送り事項(App Review Information)

「メモ」欄に、審査担当者向けに以下のような一文を入れておくとスムーズです。

```
本アプリはアカウント登録が不要で、記録・集計・グラフ・バックアップなどの主要機能はすべて端末内のローカルストレージのみで完結し、外部サーバーとの通信は行いません。テスト用のログイン情報は不要です。

種目一覧に「YouTube」ボタンがあり、任意でOS標準の外部ブラウザを開いてYouTube検索結果を表示します(種目名のみを検索語として渡し、トレーニング記録などの個人データは一切送信しません)。この操作を行わない限り、アプリは通信を発生させません。
```
