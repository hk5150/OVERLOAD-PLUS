// index.html を含む静的ファイル一式を www/ にコピーする。
// GitHub Pages配信用のルート直下のファイル構成・ビルド不要の原則は変えない(CLAUDE.md参照)。
// Capacitor(www/)向けだけは、#appsrc のJSXをここで事前トランスパイルして app.bundle.js に書き出し、
// ランタイムBabel(vendor/babel.min.js, 2.87MB)と起動時のBabel.transform()/eval()を丸ごと不要にする。
//
// 出力先を引数で受け取れるようにしてあるのは、テストが生成物を一時ディレクトリへ吐いて
// 検証できるようにするため(tests/sync-www.test.js)。CLIとして実行したときは従来どおり www/ に出る。
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");

// index.html は個別処理(下でJSXを事前ビルドして書き出す)ので単純コピーの対象からは外す。
// sw.js も対象外: Capacitorはアプリバンドル内のファイルを配信するのでService Workerは不要で、
// かつ sw.js の APP_ASSETS は www/ に同梱しない babel.min.js を含むため、
// コピーすると cache.addAll() が必ず失敗し install が永久に完了しない(=無言で壊れる)。
const STATIC_FILES = [
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
];
// babel.min.js はビルド時にJSXを変換済みにするため www/ には同梱しない
const VENDOR_FILES = [
  "react.production.min.js",
  "react-dom.production.min.js",
  "prop-types.min.js",
  "recharts.js",
];
// #appsrcの外へ切り出したドメインロジック(純粋関数)。<script src>でapp.bundle.jsより先に読み込む必要がある。
const DOMAIN_FILES = [
  "oneRm.js",
  "storage.js",
  "backupValidation.js",
];

const appsrcRe = /<script type="text\/plain" id="appsrc">([\s\S]*?)<\/script>/;
// <body>直後の起動診断〜CDNローダーのブロック(元は「アプリ本体」コメントの手前まで)
const bootBlockRe = /<script>\s*\n\s*\/\/ ---- 起動診断 ----[\s\S]*?<\/script>\s*\n\s*\n<!-- アプリ本体[\s\S]*?-->\s*\n/;
// 末尾のService Worker登録ブロック(www/では丸ごと落とす)
const swRegisterRe = /<script>\s*\n\s*if \('serviceWorker' in navigator\)[\s\S]*?<\/script>\s*\n/;

function build(dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.mkdirSync(path.join(dest, "vendor"), { recursive: true });
  fs.mkdirSync(path.join(dest, "src", "domain"), { recursive: true });

  for (const file of STATIC_FILES) {
    fs.copyFileSync(path.join(ROOT, file), path.join(dest, file));
  }
  for (const file of VENDOR_FILES) {
    fs.copyFileSync(path.join(ROOT, "vendor", file), path.join(dest, "vendor", file));
  }
  for (const file of DOMAIN_FILES) {
    fs.copyFileSync(path.join(ROOT, "src", "domain", file), path.join(dest, "src", "domain", file));
  }
  // ローカル同梱フォント(オフラインでも字面が崩れないようにするため。CDNは使わない)
  const fontsDir = path.join(ROOT, "fonts");
  if (fs.existsSync(fontsDir)) {
    fs.mkdirSync(path.join(dest, "fonts"), { recursive: true });
    for (const file of fs.readdirSync(fontsDir)) {
      fs.copyFileSync(path.join(fontsDir, file), path.join(dest, "fonts", file));
    }
  }

  // ---- #appsrc のJSXを取り出して事前トランスパイル ----
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  const appsrcMatch = html.match(appsrcRe);
  if (!appsrcMatch) throw new Error("index.html 内に #appsrc ブロックが見つかりません(www側の生成ロジックを見直してください)");
  const jsxSource = appsrcMatch[1];

  const { code, warnings } = esbuild.transformSync(jsxSource, {
    loader: "jsx",
    jsx: "transform",           // classic runtime(React.createElement)。グローバルReactを使う既存コードに合わせる
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2019",           // ??/?. 等はes2020以降のため、iOSの古めのWKWebViewでも動くよう下位変換させる
    sourcefile: "appsrc.jsx",
  });
  warnings.forEach((w) => console.warn(w.text));
  fs.writeFileSync(path.join(dest, "app.bundle.js"), code);

  // ---- ブート用スクリプト(ライブラリを順に読み込み→app.bundle.jsを読み込むだけ。Babel/evalは使わない) ----
  const bootScript = `<script>
  window.addEventListener('error', function (ev) {
    var boot = document.getElementById('boot');
    if (!boot) return;
    var s = document.getElementById('spin'); if (s) s.style.display = 'none';
    var msg = document.getElementById('bootmsg'); if (msg) msg.textContent = '起動時にエラーが発生しました';
    var err = document.getElementById('booterr');
    var m = ev.message || (ev.error && ev.error.message) || String(ev);
    if (err) { err.style.display = 'block'; err.textContent = m + (ev.filename ? ('\\n' + ev.filename + ':' + ev.lineno) : ''); }
    var r = document.getElementById('retry'); if (r) r.style.display = 'block';
  });
</script>
<script src="vendor/react.production.min.js"></script>
<script src="vendor/react-dom.production.min.js"></script>
<script src="vendor/prop-types.min.js"></script>
<script src="vendor/recharts.js"></script>
<script src="src/domain/oneRm.js"></script>
<script src="src/domain/storage.js"></script>
<script src="src/domain/backupValidation.js"></script>
<script src="app.bundle.js"></script>`;

  if (!bootBlockRe.test(html)) throw new Error("index.html 内の起動ブロックが見つかりません(www側の生成ロジックを見直してください)");
  let wwwHtml = html.replace(bootBlockRe, bootScript + "\n\n");
  // 巨大な#appsrcのJSXテキストは事前ビルド済みなのでwww側には不要
  wwwHtml = wwwHtml.replace(appsrcRe, "");
  // Service Worker登録を落とす(sw.js自体をコピーしていないので、残すと404を踏みに行くだけ)
  if (!swRegisterRe.test(wwwHtml)) throw new Error("index.html 内のService Worker登録ブロックが見つかりません(www側の生成ロジックを見直してください)");
  wwwHtml = wwwHtml.replace(swRegisterRe, "");

  fs.writeFileSync(path.join(dest, "index.html"), wwwHtml);

  return { bundleBytes: code.length };
}

module.exports = { build };

if (require.main === module) {
  const dest = path.join(ROOT, "www");
  const { bundleBytes } = build(dest);
  console.log(
    `synced ${STATIC_FILES.length} files, ${VENDOR_FILES.length} vendor file(s), and pre-built app.bundle.js ` +
    `(${(bundleBytes / 1024).toFixed(0)}KB) into www/ — no runtime Babel, no service worker (both excluded)`
  );
}
