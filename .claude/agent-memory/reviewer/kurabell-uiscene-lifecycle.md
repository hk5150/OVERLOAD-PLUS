---
name: kurabell-uiscene-lifecycle
description: iOSは1.1.1(12)からUISceneライフサイクル(SceneDelegate.swift手書き、Capacitor 6)。scene化で死ぬ経路と、Capacitor 6.2.1コアで確認済みの安全点
metadata:
  type: project
---

1.1.1 (12) で iOS を UIScene ライフサイクルに切り替えた(Xcode 27 ビルドが iOS 27 実機で起動拒否された対応)。
Capacitor 6 系には公式対応が無いので `SceneDelegate.swift` を手書きし、`UIMainStoryboardFile` を外した。

**Why:** `EXC_BREAKPOINT ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`。iOS 26 シミュレータでは再現しない。

**How to apply(レビュー時の照合点):**
- AppDelegate の `applicationDidBecomeActive` 等は scene 化後は **呼ばれない**。ここにロジックを足す差分が来たら重大。
  JS 側は `document.visibilitychange` だけ、bridge は `UIApplication.willEnterForegroundNotification` 観測(6.2.1 で確認)なので現状は無影響
- `UIApplication.shared.delegate?.window` / `keyWindow` に頼るコードが来たら重大(AppDelegate.window は nil のまま)。
  Capacitor 6.2.1 コア・sqlite/local-notifications/preferences の pod には該当参照なし(確認済み、再grep不要)
- URL / NSUserActivity は scene 側だけに届く。AppDelegate の `application(_:open:)` は残っているが呼ばれない(二重処理は起きない)。
  そもそも URL スキームも applinks も無いので forwarding は現状デッドコード
- `UISceneConfigurationName` "Default Configuration" は Info.plist と AppDelegate の2箇所で手合わせ
- `tests/` は scene manifest の有無を縛っていない(2026-10-01 時点)。storyboard 復活の回帰テストは未整備
- StoreKit 2 `product.purchase()` は scene を自分で探す。scene 化後の実機で購入シートが出るかは未検証
