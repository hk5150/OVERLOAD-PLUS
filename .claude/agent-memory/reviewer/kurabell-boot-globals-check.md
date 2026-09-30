---
name: kurabell-boot-globals-check
description: v133のLIBS globals起動検査はWeb版だけで効く。公開名の追加・削除・改名はindex.htmlのglobalsとセット、落ちた後の再読み込みはHTTPキャッシュを破らない
metadata:
  type: project
---

v133 で index.html の LIBS(src/domain 各要素)に `globals:[...]` が付き、読み込み直後に
`typeof globalThis[name] === 'undefined'` なら起動エラーにする(v131 の nextSetType 個別検査を一般化)。

- iOS(www/)では走らない。sync-www.js が起動ブロックごと差し替えるため。iOS はバンドル同梱で新旧混在しないので不要という整理
- `tests/boot-globals.test.js` が globals と `^globalThis.X =` の双方向一致を縛る。公開名を足す/消す/改名する差分では index.html の globals も変わっているか見る
- 誤検知の前提: 全公開名が `globalThis.X = X;` の行頭無条件代入で、domain ファイルに環境依存のトップレベル処理が無いこと(v133時点で確認済み)。条件付き公開や `typeof window` 分岐の値を公開する差分が来たら最優先で疑う
- 「古いindex.html+新しいdomainファイル」の組では、テスト専用の公開名(normalizeRows 等)を消すだけでも起動エラーになる
- 起動エラーの再読み込みボタンは `location.reload(true)` で、SW非制御時は古いスクリプトのHTTPキャッシュを破らない。v133追補で「欠けたら fetch(url,{cache:'reload'}) → __reloadOnceForUpdate で1回自動再読み込み」を追加。SW制御下ではこのfetchはSWのキャッシュ優先経路に吸われ何もしない(混在も起きないので無害)
- v133最終形: refreshDomainCache が globals を持つ全要素を並列で本文まで取得(4秒で中断)し、全部取れたときだけ自動再読み込み。失敗・時間切れは即エラー画面。i18nキー追加のような公開名不変の更新は検出できない(テスト冒頭に明記)

**Why:** 誤検知は全利用者が起動できなくなるので、公開名まわりの差分は毎回この前提と照合する必要がある。
**How to apply:** src/domain の公開名や LIBS に触れる差分で確認する。関連: [[kurabell-sw-nonatomic-shell]]
