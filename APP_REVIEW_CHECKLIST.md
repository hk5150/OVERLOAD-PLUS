# App Store 提出前チェックリスト

App Store Connectでの提出直前に、上から順に確認する。チェック項目の根拠(なぜそう設定したか)は
できるだけ元のファイルにリンクしてある。ここは「今どの状態か」のスナップショットなので、
実装が変わったら値もあわせて更新すること。

## Privacy Manifest

- [ ] `ios/App/App/PrivacyInfo.xcprivacy` に以下が宣言されている
  - `NSPrivacyAccessedAPICategoryUserDefaults`(理由: `CA92.1`) — `@capacitor/preferences`用
  - `NSPrivacyAccessedAPICategoryFileTimestamp`(理由: `C617.1`) — `@capacitor-community/sqlite`用
- [ ] `NSPrivacyTracking` が `false`、`NSPrivacyTrackingDomains`/`NSPrivacyCollectedDataTypes` が空配列
- [ ] **未検証**: Xcodeでアーカイブ後、Organizerの「App Store Connect検証」または
  `Privacy Report`(Product → Analyze で確認できる)で、実際に使われているAPIと
  宣言内容が一致しているか確認する(詳細は[DATA_MIGRATION.md](DATA_MIGRATION.md)参照)

## App Privacy(データ収集に関する質問への回答)

- [ ] 「データを収集しない(Data Not Collected)」で回答する
- [ ] 回答方針の詳細は[APPSTORE.md](APPSTORE.md)の「App Privacy」節を参照
  (YouTube検索ボタン ― `window.open()` による外部ブラウザ遷移のみで、SDK連携や
  個人データの送信は無いことを踏まえた回答)

## Support URL

- [ ] `https://hk5150.github.io/OVERLOAD-PLUS/support.html`
- [ ] GitHub Pagesが有効化されていて、実際にアクセスできることを提出前に確認する
- [ ] [support.html](support.html) の内容(問い合わせ先・FAQ・バックアップ手順)が最新か確認

## Privacy Policy URL

- [ ] `https://hk5150.github.io/OVERLOAD-PLUS/privacy.html`
- [ ] [privacy.html](privacy.html) の「3. 通信・トラッキング・広告」がYouTube検索機能の実態と
  矛盾していないか確認(修正済み。今後この機能を変更したら記述もあわせて見直すこと)

## 年齢区分(Age Rating)

- [ ] 暴力・アダルト・ギャンブル要素などは無いため、想定レーティングは **4+**
- [ ] App Store Connectのアンケートはすべて「なし」で回答する

## 暗号化 / 輸出コンプライアンス

- [ ] `ios/App/App/Info.plist` に `ITSAppUsesNonExemptEncryption: false` を設定済み
  (標準HTTPS/TLS以外の独自暗号化を使っていないため)
- [ ] これにより、提出のたびに輸出コンプライアンスを手動回答する手間を省いている

## iPhone対応端末

- [ ] `TARGETED_DEVICE_FAMILY = "1"`(iPhone専用としてビルド)。iPadでは互換モードで動作する
- [ ] `IPHONEOS_DEPLOYMENT_TARGET = 13.0`(古めの端末まで対応)
- [ ] iPhone SE相当(狭い画面)とPro Max相当(広い画面)の両方で崩れがないか、
  シミュレータで目視確認する(**未検証**、Xcode環境が必要)

## 縦画面設定

- [ ] `ios/App/App/Info.plist` の `UISupportedInterfaceOrientations` が
  `UIInterfaceOrientationPortrait` のみになっている(横画面非対応。設定済み)
- [ ] Web版側も `index.html` の `@media (orientation: landscape)` で横向きを検知し、
  縦にするよう案内する画面を出している(iOS版はネイティブ側の制約で横向きにそもそもならない)

## スクリーンショット

- [ ] キャプション案は[APPSTORE.md](APPSTORE.md)の「スクリーンショット」節を参照(5枚構成)
- [ ] 実際にアプリに存在する画面・機能のみを使う(未実装機能を映さない)
- [ ] iPad用スクリーンショットは不要(iPhone専用アプリのため)
- [ ] **英語ローカライズ用のスクリーンショットを別途用意する**(アプリの表示言語をEnglishにして撮り直す)。
  未登録だとApp Store Connectが日本語のものを流用し、英語圏に日本語の画面が出る

## 多言語対応(日本語 / 英語)

- [ ] App Store Connectで **English (U.S.)** のローカライズを追加し、[APPSTORE.md](APPSTORE.md)の「英語ローカライズ」節の文面を入力した
- [ ] `ios/App/App/Info.plist` に `CFBundleLocalizations`(en / ja)がある
      (製品ページの「言語」表示に使われる。UI自体はWebView側で切り替える)
- [ ] プライバシーポリシーURL・サポートURLは日英で同じでよい
      (`privacy.html` / `support.html` が端末の言語で出し分ける)

## 審査担当者向けメモ(App Review Information)

- [ ] [APPSTORE.md](APPSTORE.md)の「App Review用の申し送り事項」の文面をそのまま貼る
  (ログイン不要である旨、YouTube検索ボタンの説明を含む)

## ログイン不要であること

- [ ] アカウント登録・ログイン機能は実装していない(意図的な設計)。審査担当者向けメモにも明記

## オフライン動作

- [ ] 記録・集計・グラフ・バックアップ/復元・CSV書き出しはすべてオフラインで動作する
- [ ] YouTube検索ボタンのみ、任意でオンライン接続(外部ブラウザ遷移)が発生する
- [ ] シミュレータで機内モードにしても正常に起動・記録できることを確認する
  (**未検証**、Xcode環境が必要。手順は[IOS_SUBMISSION_GUIDE.md](IOS_SUBMISSION_GUIDE.md)の
  「シミュレータでの動作確認」を参照)

## 外部リンク

- [ ] YouTube検索ボタン以外に外部リンク・外部通信は無い
- [ ] 送信される検索語は種目名 + 固定文言のみ(個人データ・トレーニング記録は含まれない)。
  実装は `index.html` の `openYouTube()` を参照

## データ削除

- [ ] 「設定」タブの「すべての履歴を削除」で、SQLite・Preferences・localStorageの
  すべてから対象データが削除される(`src/domain/storage.js` の `del()` を参照)
- [ ] アプリ削除(アンインストール)時にもすべてのローカルデータが失われる旨を
  [support.html](support.html) に明記済み

## バックアップ / 復元

- [ ] JSON書き出し(`formatVersion`/`appVersion`/`platform`/`exportedAt` を含む)、
  CSV書き出しに対応(詳細は[DATA_MIGRATION.md](DATA_MIGRATION.md)参照)
- [ ] 復元時に壊れたJSON・異常な数値・未知の将来`formatVersion`を拒否する
  (`src/domain/backupValidation.js` の `validateBackupPayload()`)
- [ ] 復元前に現在データを自動退避し、失敗時にロールバックできる
  (`index.html` の `importBackup`/`restoreFromPreImportSnapshot`)

## 課金を導入した場合の購入復元

- [ ] **現時点では未実装**(StoreKit未導入)。導入する場合は[MONETIZATION.md](MONETIZATION.md)の
  「案B」を参照し、「購入を復元」ボタンの実装(Guideline 3.1.2)を忘れないこと

## TestFlight確認

- [ ] 実機またはシミュレータでTestFlightビルドを配布し、新規インストール・既存データからの
  更新の両方の経路を確認する(**未実施**、Xcode/App Store Connect環境が必要)
- [ ] 特に「旧バージョン(Preferencesにデータがある状態)からの更新」で履歴が消えないことを確認
  (詳細は[DATA_MIGRATION.md](DATA_MIGRATION.md)の「検証状況」を参照)

## Archive時のReleaseビルド確認

- [ ] Xcodeで `Product → Scheme → Edit Scheme` の Archive が `Release` 構成になっていることを確認
- [ ] Releaseビルドでデバッグログ・開発用の分岐が残っていないか確認
  (このリポジトリはAI機能を `const AI_ENABLED = false` で無効化しているのみで、
  デバッグ専用コードパスは無い認識だが、変更を加えた場合は再確認すること)
