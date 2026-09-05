# 非消耗型IAP(StoreKit 2)の実装方針

`MONETIZATION.md`で決定済みの収益化方針(無料ダウンロード + 記録10回まで試用 + 非消耗型IAPで
フル解除、サブスクなし)を実装した。ここでは実装時に固めた判断だけを書く。

## 既製プラグインを使わず自前のCapacitorプラグインにした理由

調査した4つ(RevenueCat / `@capgo/native-purchases` / Capawesome / Fovea)はいずれも不採用。

- **RevenueCat**: Capacitor 8+必須(このリポジトリは6)。加えて購入検証・エンタイトルメント管理を
  自社サーバー経由で行う設計で、「バックエンドなし」という原則そのものと衝突する
- **`@capgo/native-purchases`・Capawesome**: いずれもCapacitor 6が非サポート(前者は非メンテ、
  後者はCapacitor 8+必須の有料プラン)
- **Fovea(`capacitor-plugin-cdv-purchase`)**: Capacitor 6+を明記し、レシート検証サーバーもオプション
  (未指定で動作)で制約面では問題ないが、Cordova由来のAPIで採用実績を確認できなかった

**StoreKit 2のSwift APIを直接使う自前プラグインを新規作成した**(`ios/App/App/Iap/`)。
非消耗型1商品だけならAPI自体がシンプルで、自前実装のコストは既製プラグインの互換性リスクより低いと判断した。

## 購入フラグは独立キーで保存する(settings経由にしない)

`store.get/set/del("iap-unlocked-v1")` で保存する。`DRAFT_KEY`と同じ枠組みで、Preferences止まり
(SQLiteは通らない)。

理由: 非消耗型IAPの真実の情報源はAppleのTransactionで、ローカルの値は単なるキャッシュ。
`persist()`経由でsettings行きにすると、`clearAll()`(全データ削除)で購入済みフラグまで消えてしまい、
「記録を全削除したら課金も消えた」という直感に反する不具合になる。

## 起動時は`Transaction.currentEntitlements`のみ。`AppStore.sync()`は復元ボタン専用

`MONETIZATION.md`のドラフト時点の注記「起動時に必ずAppStore.sync()相当で確認」は、この判断で
上書きした。起動時に自動で`AppStore.sync()`を呼ぶと、Apple IDのパスワード確認が入りUXを損なう。

- 起動時(`src/domain/iap.js`の`refreshPurchaseState()`): `Transaction.currentEntitlements`のみ
- 「購入を復元」ボタン(`restorePurchase()`): `AppStore.sync()` → `Transaction.currentEntitlements`再読込

## 試用制限の判定は「保存の直前」だけ

11回目の**保存**をブロックする。記録・比較・グラフ・バックアップの閲覧は無制限。

`saveWorkout`(index.html)で、空の記録を弾くバリデーションの**後**に判定する。空の状態で
ペイウォールを出すと「何も記録していないのに課金を迫られた」という誤解を生むため。

```js
if (isTrialLimitReached(workouts.length, purchased, iapAvailable())) {
  setShowPaywall(true); setSaving(false); return;
}
```

`isTrialLimitReached(workoutsCount, purchased, isNative)`は`src/domain/iap.js`の純粋関数
(`tests/iap.test.js`でテスト)。Web版は`isNative`が常にfalseなので試用制限自体が発動しない。

購入成功後は自動保存しない。`today`はそのまま残るので、ユーザーが改めて保存ボタンを押せば通る
(purchase完了とReactのstate更新のタイミングが絡む自動保存より、ユーザー操作を挟む方が事故が少ない)。

## 商品ID

`src/domain/iap.js`の`IAP_PRODUCT_ID`定数1箇所にプレースホルダーを置いている
(`com.hajime5150.kurabellplus.unlock`)。App Store Connect側で商品登録した後、この1行だけ
差し替えれば反映される(Swift側にはハードコードしていない)。

## Xcodeでの手動作業(このリポジトリのコード変更だけでは完結しない)

**Xcode統合(以下2点)は2026-08-24に完了済み**。生テキストでの`.pbxproj`手編集は壊れやすいため、
CocoaPods/fastlaneが内部で使う`xcodeproj` gem(Rubyの専用ツール、手編集ではない)で行った。
手順は`git log`の当該コミットを参照。

1. `ios/App/App/Iap/StoreManager.swift` / `IapPlugin.swift` をターゲット`App`のCompile Sourcesに追加
2. `StoreKit.framework`をFrameworksにリンク

残っているのは以下2点(有料Apple Developer Programの承認待ちのため未着手。
[docs/vite移行.md](vite移行.md)の2026-08-23セクション参照):

- Signing & Capabilitiesタブで「In-App Purchase」Capabilityを追加する
  (`com.apple.developer.storekit`エンタイトルメントが必要になるケースがあり、
  有料メンバーシップでの正式なDEVELOPMENT_TEAM確定後に行う)
- App Store Connect側で非消耗型IAP商品を登録し、`src/domain/iap.js`の`IAP_PRODUCT_ID`を実際の
  商品IDに差し替える

シミュレータでの動作確認にはXcodeのStoreKit Testing機能(`.storekit`設定ファイルをSchemeの
Run Optionsに指定)を使う。App Store Connect登録前でもローカルで購入フローをテストできる
(未実施。現状は商品ID未登録のため`getProducts`が失敗し、「価格を取得できませんでした」の
エラー文言が出ることをシミュレータで確認済み — これは想定どおりの異常系表示)。

### ハマった点: `CAPBridgedPlugin`準拠だけでは自動登録されなかった

`IapPlugin.swift`のコメント(旧版)は「CAPBridgedPluginプロトコルを実装すればCapacitorが
自動でJS側に登録する」としていたが、**実際にはXcode統合直後、`window.Capacitor.Plugins`に
`Iap`が出現しなかった**(他のnpm経由プラグインは出るのに、ソースファイルを直接ターゲットに
追加したこのプラグインだけ抜けていた)。一時的にJS側へ`window.Capacitor.Plugins`の中身を
出力するデバッグ表示を仕込んでシミュレータで実測して発覚し、確認後に元へ戻した。

原因はCapacitorのobjcランタイム自動検出が、npm/CocoaPods経由のプラグイン(別ターゲット/
フレームワークとしてビルド)とアプリターゲットに直接ソース追加したプラグインとで登録経路が
異なること(既知の制約、Swift Package Manager構成でも同様の報告がある)。

対応: `ios/App/App/BridgeViewController.swift`(新規)で`CAPBridgeViewController`をサブクラス化し、
`capacitorDidLoad()`をオーバーライドして`bridge?.registerPluginInstance(IapPlugin())`を明示的に
呼ぶようにした。`Main.storyboard`の`customClass`もこれに合わせて変更した。

### ハマった点: `IPHONEOS_DEPLOYMENT_TARGET`が13.0のままだった

`StoreManager.swift`はStoreKit 2の`Product`型を使うため**iOS 15.0以降が必須**だが、
プロジェクトのデプロイターゲットはCapacitorの初期値である13.0のままで、ビルドエラーになった
(`'Product' is only available in iOS 15.0 or newer`)。`Podfile`の`platform :ios`とApp
ターゲットのDebug/Release両方を15.0に引き上げ、`pod install`を再実行して解決した。
iOS 13/14のシェアは2026年時点で実用上ゼロに近く、`@available`でガードして機能を制限するより
デプロイターゲットを上げる方が妥当と判断した。

## 検証内容

- `npm test`: `tests/iap.test.js`(純粋関数・フェイクブリッジ、`isTrialLimitReached`の境界値
  9件→false/10件→true、Web版は常にfalse等)、既存の`tests/i18n.test.js`(ja/enパリティ)、
  `tests/sync-www.test.js`/`tests/sw-assets.test.js`(www同期3箇所の実ビルド検証)
- ブラウザでの統合確認: `window.Capacitor.Plugins.Iap`のフェイクを`<head>`先頭に注入した
  テスト用配信で、10件保存済み・未購入の状態から11回目の保存を試み、ペイウォール表示 →
  購入 → キャッシュへの永続化(`localStorage`の`iap-unlocked-v1`が`"1"`)→ 再保存で通る、
  という一連の流れを実測確認。設定タブでの購入/復元ボタン、価格の先読み表示、
  「購入履歴が見つかりません」のエラー表示も確認済み
- Swift側(`StoreManager.swift`/`IapPlugin.swift`)は自動テスト対象外(XCTestターゲットが
  このリポジトリに存在しない)。**Xcode統合後、シミュレータでの手動確認が必須**
