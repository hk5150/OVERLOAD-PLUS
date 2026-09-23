---
name: kurabell-sw-nonatomic-shell
description: sw.jsのアプリ本体はファイル単位のネットワーク優先+4秒タイムアウトなので、電波が弱いと新旧版のファイルが混ざりCACHEにも混在が書き戻される(v113レビューで未解決として指摘)
metadata:
  type: project
---

sw.js のアプリ本体経路は「ファイルごとにネットワーク優先、4秒でCACHEへフォールバック、成功分は現行CACHEへ put」。
サーバーが新版を配信済みでSWが旧版のまま、電波が弱いと index.html(新)+一部の src/domain/*.js(旧CACHE)が組み合わさり、
新版の index.html が旧版名のCACHEに書き戻されるので、次のオフライン起動でも混在が続く。
v113 は HTTPキャッシュ由来の混在(install の cache:"reload"、fetch の cache:"no-cache")だけを直しており、この経路は残っている(2026-09-24時点)。

**Why:** 「新しい index.html と古い domain JS の組み合わせ」は起動エラー(ReferenceError)になる。混在の原因はHTTPキャッシュだけではない。

**How to apply:** sw.js の fetch/install を触る差分や、「SW経由では古いファイルを掴まない」と主張する文書を見たら、
タイムアウト→CACHE フォールバックによる混在が残っていないか、主張の範囲が正しいかを確認する。関連: [[kurabell-version-entry-in-vite-doc]]
