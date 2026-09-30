---
name: kurabell-sw-nonatomic-shell
description: sw.jsの新旧混在問題の経緯。v113までネットワーク優先で混在、v114でキャッシュ優先+navigate全部index.htmlに変更。同スコープのprivacy.html/support.htmlを飲み込む副作用に注意
metadata:
  type: project
---

v113 まで: アプリ本体は「ファイルごとにネットワーク優先、4秒でCACHEへフォールバック」で、電波が弱いと新旧が混在し旧CACHEにも書き戻された。
v114(2026-09-24レビュー時点で未コミット): APP_ASSETS と navigate をキャッシュ優先にし、版の入れ替えは install/activate のみ。
controllerchange でバナー、起動失敗時だけ自動再読み込み。localhost は `?sw=1` 無しだと SW を解除する。

v114 レビューで指摘した残りの穴:
- navigate を URL に関係なく index.html で返すため、同じスコープ(/OVERLOAD-PLUS/)にある `privacy.html` / `support.html`
  (App Store Connect に登録する URL)が、Web版を使ったブラウザでは開けなくなる
- 起動途中(LIBS 読み込み中)に新SWが activate+claim すると、残りの LIBS は新版から返り混在しうる(bootFail 側の自動再読み込みで一部救済)

**Why:** 「新旧は原理的に混ざらない」「navigate は全部 index.html でよい」という主張は、スコープ内の他のHTMLと起動中の claim を見落としやすい。

**How to apply:** sw.js の fetch/install/activate を触る差分では、スコープ内の index.html 以外のHTML(git ls-files '*.html')と、
claim のタイミングで起動中のページがどうなるかを確認する。関連: [[kurabell-version-entry-in-vite-doc]]

v131 レビュー(2026-10-01)で整理した「新index.html+旧domain/*.js」の残り経路: SW制御下は同一CACHEなので起きない(claim途中は旧index+新jsで、
追加だけの変更なら無害)。残るのはSW非制御(初回・ITPで登録消失・SW無効ブラウザ)で、GitHub Pagesの max-age=600 の窓内に
デプロイを跨いだ通常リロードのみ。iOSは同梱なので起きない。**イベントハンドラ内でだけ参照するグローバルはbootFailに掛からず、
押した時点で落ちる**(setStateの更新関数内だとErrorBoundary画面、ハンドラ直下なら無反応)。
v131 では nextSetType だけ index.html の起動ローダー(`typeof Babel` の並び)に存在確認を足し、起動エラー→再読み込みの経路に乗せた。
他のクリック時だけ参照するドメイン関数は未対応。
