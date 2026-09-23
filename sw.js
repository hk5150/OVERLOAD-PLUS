// KURABELL+ Service Worker
// アプリ本体をキャッシュし、オフラインでも起動できるようにする。ライブラリもすべてローカル同梱(CDN不使用)。
const CACHE = "kurabell-v116";

// ネットワーク優先フェッチのタイムアウト(電波が弱い環境でハングし続けるのを防ぐ)
const NETWORK_TIMEOUT_MS = 4000;

// アプリ本体(更新時はここが入れ替わる)
const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./manifest.en.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./vendor/react.production.min.js",
  "./vendor/react-dom.production.min.js",
  "./vendor/prop-types.min.js",
  "./vendor/recharts.js",
  "./vendor/babel.min.js",
  "./src/domain/i18n.js",
  "./src/domain/units.js",
  "./src/domain/oneRm.js",
  "./src/domain/storage.js",
  "./src/domain/backupValidation.js",
  "./src/domain/volume.js",
  "./src/domain/coefficients.js",
  "./src/domain/insight.js",
  "./src/domain/restNotifications.js",
  "./src/domain/iap.js",
  "./src/domain/health.js",
  "./src/domain/db/schema.js",
  "./src/domain/db/migration.js",
  "./src/domain/db/workoutStore.js",
  "./src/domain/db/capacitorSqliteDriver.js",
  "./fonts/barlow-condensed-600-latin.woff2",
  "./fonts/barlow-condensed-800-latin.woff2",
];

// SWのfetch/cache.addAllは既定でブラウザのHTTPキャッシュを通る。GitHub Pagesはmax-age付きで配信し、
// ヘッダーが無くてもLast-Modifiedからの推定でキャッシュされるため、既定のままだと新しい版のCACHEに
// 古いファイルが入り、新しいindex.htmlが古いsrc/domain/*.jsと組み合わさる(v112の検証で実際に踏んだ:
// ReferenceError: syncRestActivity is not defined)。installは必ずサーバーに確認する(cache: "no-cache")。
// "reload"にしないのは、版を上げるたびにvendor一式(約3.5MB)を全量取り直さず、変わっていないものは
// 304で済ませるため(電波の弱いジムでinstallが失敗し続けるのを避ける)。
// addAllは1件でも失敗すると全体がrejectする性質のまま使う(CLAUDE.md「www/に新しいファイルを足したら」参照)。
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(APP_ASSETS.map((u) => new Request(u, { cache: "no-cache" })));
      self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 正常系(res.ok)のレスポンスのみキャッシュする。404/500等をキャッシュして
// オフライン時にエラーを正常アセットとして返してしまうのを防ぐ。
const cacheIfOk = (req, res) => {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
};

// アプリ本体(APP_ASSETS)の絶対URL。スコープはsw.jsの場所(GitHub Pagesでは /OVERLOAD-PLUS/)。
const APP_ASSET_URLS = new Set(APP_ASSETS.map((u) => new URL(u, self.location.href).href));
const INDEX_URL = new URL("./index.html", self.location.href).href;
// アプリとして開くURL(スコープ直下と index.html)。これ以外の画面遷移(privacy.html・support.html。
// App Store Connectに登録しているURL)はアプリの画面にすり替えず、ネットワーク優先の経路で返す。
const APP_ENTRY_URLS = new Set([new URL("./", self.location.href).href, INDEX_URL]);

const offlineUnavailable = () => new Response("Offline asset unavailable", {
  status: 503,
  statusText: "Service Unavailable",
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});

// 保存済みの版(今のCACHE)から返す。無ければネットワークで補う(installのaddAllが通っていれば起きない保険)。
// 補うときは開こうとしたURLではなくkeyそのものを取りにいく(別のページの中身をkeyの場所に保存しないため)。
const fromCacheFirst = (key) =>
  caches.open(CACHE)
    .then((c) => c.match(key))
    .then((hit) => hit || fetch(key, { cache: "no-cache" }).then((res) => cacheIfOk(key, res)))
    .catch(offlineUnavailable);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // 同一origin以外は捕捉しない。ブラウザの通常のfetchに任せる
  // (現状すべて同梱なので外部リクエスト自体が無いはずだが、将来足された場合の保険)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // アプリ本体と画面遷移は、保存済みの版から丸ごと返す(キャッシュ優先)。
  // 以前はファイルごとに「ネットワーク優先、4秒でタイムアウトしたら保存済み」だったため、
  // 電波が弱いと index.html だけ新しくスクリプトは古い、という混在が起きた(v113の残課題)。
  // 版の入れ替えは install(addAllは1件でも失敗すれば全体が失敗)と activate だけに任せる。
  // 新しい版の反映はページ側がcontrollerchangeで検知してバナーで知らせる(index.html末尾)。
  url.search = "";
  url.hash = "";
  if (req.mode === "navigate" && APP_ENTRY_URLS.has(url.href)) {
    e.respondWith(fromCacheFirst(INDEX_URL));
    return;
  }
  if (req.mode !== "navigate" && APP_ASSET_URLS.has(url.href)) {
    e.respondWith(fromCacheFirst(url.href));
    return;
  }

  // それ以外(APP_ASSETSに無いもの・アプリ以外のページ): ネットワーク優先。タイムアウトまたは失敗時は
  // 以前取れたものがあればそれを返す。それも無ければ、画面遷移だけは保存済みのindex.htmlにし
  // (オフラインで何も出ないよりはアプリを開く)、それ以外は503(JS等にHTMLを返すと
  // 「Unexpected token '<'」のような誤動作を招くため)。
  e.respondWith(
    new Promise((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
      const fallback = () => caches.match(req).then((hit) => {
        if (hit) return resolve(hit);
        if (req.mode === "navigate") return caches.match(INDEX_URL).then((idx) => resolve(idx || offlineUnavailable()));
        resolve(offlineUnavailable());
      });

      // no-cache: HTTPキャッシュを使う前に必ずサーバーへ確認する(変わっていなければ304で軽い)。
      // 既定のままだと推定キャッシュで古いファイルを「ネットワークから取れた」ことにしてしまう。
      fetch(req, { signal: controller.signal, cache: "no-cache" })
        .then((res) => {
          clearTimeout(timer);
          resolve(cacheIfOk(req, res));
        })
        .catch(() => {
          clearTimeout(timer);
          fallback();
        });
    })
  );
});
