// OVERLOAD+ Service Worker
// アプリ本体をキャッシュし、オフラインでも起動できるようにする。ライブラリもすべてローカル同梱(CDN不使用)。
const CACHE = "overload-v66";

// ネットワーク優先フェッチのタイムアウト(電波が弱い環境でハングし続けるのを防ぐ)
const NETWORK_TIMEOUT_MS = 4000;

// アプリ本体(更新時はここが入れ替わる)
const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./vendor/react.production.min.js",
  "./vendor/react-dom.production.min.js",
  "./vendor/prop-types.min.js",
  "./vendor/recharts.js",
  "./vendor/babel.min.js",
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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // 同一origin以外(Google Fontsなど)は捕捉しない。ブラウザの通常のfetchに任せる
  if (new URL(req.url).origin !== self.location.origin) return;

  // vendor同梱ライブラリ: サイズが大きく更新頻度も低いのでキャッシュ優先。無ければネットワークから取得してキャッシュに補充
  if (req.url.includes("/vendor/")) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  // アプリ本体: ネットワーク優先(更新を取りにいく)。タイムアウトまたは失敗時はキャッシュにフォールバック
  e.respondWith(
    new Promise((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
      const fallback = () => caches.match(req).then((hit) => resolve(hit || caches.match("./index.html")));

      fetch(req, { signal: controller.signal })
        .then((res) => {
          clearTimeout(timer);
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          resolve(res);
        })
        .catch(() => {
          clearTimeout(timer);
          fallback();
        });
    })
  );
});
