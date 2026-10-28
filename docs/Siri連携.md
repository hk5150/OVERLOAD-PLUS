# Siri・Apple Intelligence 連携(検討)

2026-10-28 に検討を始めた(北村さん「Siri AI の機能を取り込むことを検討」)。**この文書は検討の段階で、実装は北村さんの「はい」を待っている。**

## いまの状況(2026-10-28 時点)

- **Siri AI の日本語対応は、2026-10-27 配信の iOS 27.2 で始まったばかり**(ベータ扱い)。使えるのは Apple Intelligence 対応機種だけ(iPhone 15 Pro / 15 Pro Max、iPhone 16 以降。Apple Watch は Series 9 以降・Ultra 2 以降・SE 3 を対応 iPhone とペアリングしたとき)。EU では使えない
  - 出典: [ITmedia Mobile 2026-10-27](https://www.itmedia.co.jp/mobile/articles/2610/27/news050.html)、[gori.me](https://gori.me/ios/171770)
- **他社アプリが Siri から使われる道は App Intents だけになった。** SiriKit は iOS 27 で非推奨になったと報じられている(第三者の記事。Apple の文書では未確認)。KURABELL はどちらも未対応(コードに `AppIntent` も Intents 拡張も無い)
  - 出典: [WWDC26 iOS ガイド](https://developer.apple.com/wwdc26/guides/ios/)、[WWDC26 セッション 240「Build intelligent Siri experiences with App Schemas」](https://developer.apple.com/videos/play/wwdc2026/240/)
- **iOS 27 の「スキーマ」(Siri が決まった言い回し無しで理解する型)に、筋トレ・ワークアウトの分野は無い**(確認できたのはメール・写真・メッセージ・本・日記・プレゼン・表計算・システムなど)。KURABELL は普通の `AppIntent` と `AppShortcutsProvider`(App ショートカット)で出すことになる。これでも Siri・Spotlight・ショートカット App・アクションボタンには出る
  - 出典: [App Intents for iOS 27: The Indie Playbook](https://www.applyra.io/blog/app-intents-ios-27-indie-siri-playbook)(第三者の解説。全分野の一覧は Apple の「App schema domains」の文書で要確認)
- **App ショートカットは iOS 16 から動く。** アプリの最低対応は iOS 15.0(App ターゲット)なので、`@available(iOS 16, *)` で囲めば最低対応を上げずに足せる。古い Siri でも、決まった言い回し(「KURABELLで〜」)なら呼べる。iOS 27.2 の Siri AI なら、言い回しが多少違っても拾われる見込み(実機で要確認)

## アプリ側で使えるもの(すでにある仕組み)

- **Watch の op キュー**(`WatchSessionManager` の `watch.ops.v1`、JS 側 `applyWatchOps`)。iPhone が裏にいる間に届いた入力を UserDefaults に溜め、JS が動いた時点で `today` に合流させる。Siri からのセット入力は、これと同じ道に op を積めば `today` の更新を JS の1か所に保てる
- **Watch のスナップショット**(`updateSnapshot`)。JS が今日のメニュー・前回の値をネイティブへ渡している。Siri 用にも、同じ形で「種目ごとの前回と過去のベスト」の要約をネイティブに置けば、アプリを開かずに答えられる
- **休憩タイマーのネイティブ側**(`RestTimerManager`:通知の予約と Live Activity)。ただし休憩の状態の持ち主は JS
- 記録本体は SQLite(`workout-log-v1`)。**Swift から直接読まない**(移行・読み直しの罠が多い。`DATA_MIGRATION.md`)。読むのは JS が渡した要約だけにする

## 使い道ごとの整理

| # | 使い道(話しかけ方の例) | 何が起きるか | 手間 | 効果 |
|---|---|---|---|---|
| A | 「KURABELLで前回のベンチプレス」 | アプリを開かずに Siri が「10月25日、80kg×8回(余力2)、80kg×7回…」と答え、小さな画面(スニペット)を出す | 小〜中(1〜2日) | 主機能「前回の実績を見せる」の延長で、コンセプトに一番合う。ジムで手がふさがっているときに効く |
| B | 「KURABELLで記録を始める」 | アプリが記録タブで開き、記録が始まる | 小(半日) | 起動の一手が減るだけ。ただし A と並べて出すと「Siri 対応」として見せやすい |
| C | アクションボタン・コントロールセンター・ロック画面から休憩タイマー | ボタン1つで休憩タイマーが始まる(iOS 18 のコントロール) | 中(2〜3日) | ジム向き。ただし休憩の状態は JS が持っているので、裏にいるときに始めた休憩を JS・Watch・Live Activity と揃えるのが難しい |
| D | 「KURABELLで80キロ8回、余力2」 | 記録中の種目の次のセットに入る(Watch の op キューに積む) | 中〜大(3〜5日) | 手が汚れていても入力できる。ただし**記録を書き換える道が増える**ので、種目の取り違え・重複入力の検証が要る。`today` の罠(CLAUDE.md)に直結 |
| E | Spotlight で「ベンチ」と打つと、自分の履歴が出る | 種目を `IndexedEntity` として Spotlight に入れる | 中(2日) | 便利だが目立たない |
| F | 端末内の AI(Foundation Models)で今日のメニューを組む | AIコーチをアプリ内で完結させる | 大 | **見送りを提案。** 端末内 AI の言い換え(1.4 (16) の「次の一手」)は価値が薄くて外した経緯がある(`c92490a`)。Apple のクラウドの無料枠(Small Business Program で初回 DL 200万未満)もあるが、「アプリから AI へは何も送らない」の線に触れる |

### ダウンロード・継続利用への効果(見込み。データは無い)
- **ダウンロードを直接増やす効果は小さい。** App Intents は App Store の検索順位には効かない。Siri が「まだ入っていないアプリ」を勧めるかは Apple が明らかにしていない
- 効くとすれば**継続利用**(ジムでの使いやすさ)と、**見せ方**。iOS 27.2 で日本語の Siri AI が始まった直後なので、「Siri に『前回のベンチは?』と聞ける」は掲載文・What's New・Instagram/TikTok の題材になる(SNS の方針「エビデンスにもとづく有益な情報」とは別枠の、アプリ紹介として)
- 自分の端末で使えるのは iPhone 15 Pro 以降の人だけ。古い Siri でも決まった言い回しなら動くので、A・B は全員に効く

## 提案する順番

1. **A + B を最初の版に入れる**(合わせて 2〜3 日、iOS 16 以上で動く、記録は書き換えない)
   - JS が保存のたびに「種目ごとの前回のセット・過去のベスト・最終日」をネイティブに渡す(`Watch.updateSnapshot` と同じ作り。ダンベル片手・自重の実効重量は JS 側で計算済みの値を渡す)
   - Swift 側に `AppIntent` 2つ・種目の `AppEntity`(名前で探せる `EntityStringQuery`)・`AppShortcutsProvider`。日英の言い回し
   - 確かめること: iOS 27.2 の Siri AI(実機)と古い Siri(シミュレータ)の両方、言語が英語の端末、記録が0件のとき
2. 1 を出して反応を見てから **C(休憩タイマーのコントロール)**
3. **D(声でセット入力)** は、C で「裏から JS の状態を動かす」道を固めた後に検討
4. E は余力があれば。F は見送り

## 未決

- 北村さんの「はい」待ち(1 に着手するか)
- 入れる版(1.4.4 (47) は審査中なので、その次の版)
