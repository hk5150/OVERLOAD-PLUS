---
name: kurabell-window-open-native
description: iOS(Capacitor 6.2.1)でwindow.open(url)が外部アプリを開く経路を確認済み。mailto/https/独自スキームの判断材料と、iOSのmailto挙動の誤解しやすい点
metadata:
  type: reference
---

2026-10-17 の「ご意見・不具合の報告」レビューで確認した事実(node_modules/@capacitor/ios 6.2.1):

- `window.open(url, "_blank", ...)` は WKUIDelegate の `createWebViewWith` に来て、`UIApplication.shared.open(url)` するだけ
  (`WebViewDelegationHandler.swift`)。プラグインの `shouldOverrideLoad` も `applicationState == .active` 判定も通らない
  (それは `decidePolicyFor` 側=location遷移やリンクの経路)。ios/App/App 側に uiDelegate の上書きは無い
- WKWebView が createWebViewWith を呼ぶのはユーザー操作の同期的な延長のときだけ。await を挟むと開かない(index.html の consultAi のコメントと同じ)
- `noopener,noreferrer` を付けても付けなくても同じ経路(既存の AI・YouTube・音楽アプリで実績あり)
- iOS の mailto: は「既定のメールアプリ」(iOS 14+ で Gmail 等に変更可)が開く。Mail を消して既定も無いときは「メールを復元」の確認が出る。
  「Gmailアプリだけの人は何も開かない」は既定にしていない場合だけ正しい
- アプリは iPhone 専用(TARGETED_DEVICE_FAMILY = 1)なので、WKWebView の UA は iPhone 形式。iPad のデスクトップ UA を心配しなくてよい

**How to apply:** window.open の追加では、同期呼び出しかどうかと、外部通信テスト(tests/sync-www.test.js は fetch 等だけを見ていて window.open は対象外)を見る。[[kurabell-share-sheet-export]]
