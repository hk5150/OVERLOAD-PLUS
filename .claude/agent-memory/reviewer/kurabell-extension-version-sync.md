---
name: kurabell-extension-version-sync
description: v112でウィジェット拡張RestActivityが追加された。pbxprojのMARKETING_VERSION/CURRENT_PROJECT_VERSION/SKIP_INSTALL差分を見るときの確認項目
metadata:
  type: project
---

v112(2026-09-23レビュー時点)で iOS に app-extension ターゲット `RestActivity`(Live Activity)が追加された。
pbxproj は xcodeproj gem で書き換えており、Xcode GUI の General タブで版を上げると App ターゲットだけが上がる。

**Why:** 拡張の CFBundleShortVersionString / CFBundleVersion が親Appとずれると App Store Connect へのアップロード時に
警告・却下の原因になる。SKIP_INSTALL が拡張から抜けると Archive が「汎用アーカイブ」になり配布できない。
レビュー時点ではどちらも静的テストで縛られていなかった(提案済み)。

**How to apply:** pbxproj の差分や iOS の版上げを含む差分では、App と RestActivity の
MARKETING_VERSION / CURRENT_PROJECT_VERSION が一致しているか、RestActivity に SKIP_INSTALL = YES が残っているか、
`Embed Foundation Extensions` が `[CP] Embed Pods Frameworks` より前にあるかを確認する。
`pod install` / `npm run ios:sync` の後の差分も同様。関連: [[kurabell-version-entry-in-vite-doc]]
