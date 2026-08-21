// KURABELL+ Service Worker
// アプリ本体をキャッシュし、オフラインでも起動できるようにする。ライブラリもすべてローカル同梱(CDN不使用)。
const CACHE = "kurabell-v95";

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
  "./src/domain/db/schema.js",
  "./src/domain/db/migration.js",
  "./src/domain/db/workoutStore.js",
  "./src/domain/db/capacitorSqliteDriver.js",
  "./fonts/barlow-condensed-600-latin.woff2",
  "./fonts/barlow-condensed-800-latin.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(APP_ASSETS);
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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // 同一origin以外は捕捉しない。ブラウザの通常のfetchに任せる
  // (現状すべて同梱なので外部リクエスト自体が無いはずだが、将来足された場合の保険)
  if (new URL(req.url).origin !== self.location.origin) return;

  // 同梱ライブラリとフォント: サイズが大きく中身も変わらないのでキャッシュ優先。
  // 無ければネットワークから取得してキャッシュに補充する。
  if (req.url.includes("/vendor/") || req.url.includes("/fonts/")) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => cacheIfOk(req, res));
      })
    );
    return;
  }

  // アプリ本体: ネットワーク優先(更新を取りにいく)。タイムアウトまたは失敗時はキャッシュにフォールバック。
  // キャッシュにも無い場合、index.htmlへのフォールバックはナビゲーションリクエストのみに限定する
  // (JS/JSON/画像等のリクエストにHTMLを返すと「Unexpected token '<'」のような誤動作を招くため)。
  e.respondWith(
    new Promise((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
      const fallback = () => caches.match(req).then((hit) => {
        if (hit) return resolve(hit);
        if (req.mode === "navigate") return caches.match("./index.html").then(resolve);
        resolve(new Response("Offline asset unavailable", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }));
      });

      fetch(req, { signal: controller.signal })
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
