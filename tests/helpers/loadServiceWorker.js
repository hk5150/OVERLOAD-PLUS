import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// sw.js は module でも import 可能な形でもない素のService Workerスクリプト
// (self.addEventListener 等を直接呼ぶ)。テストでは自作の self/caches/fetch を
// 差し込んだ vm サンドボックス内でそのまま実行し、登録されたイベントハンドラを
// 直接呼び出すことで、本番と同じコードをオフライン/エラー系も含めて検証する。

const ORIGIN = "https://example.test";

function createFakeCache() {
  const store = new Map();
  const key = (req) => new URL(typeof req === "string" ? req : req.url, ORIGIN + "/").href;
  return {
    async put(req, res) { store.set(key(req), res); },
    async match(req) { return store.get(key(req)); },
    async addAll(urls) {
      for (const u of urls) store.set(key(u), new Response(`cached:${u}`, { status: 200 }));
    },
    async keys() { return [...store.keys()]; },
    async delete(k) { return store.delete(k); },
    has(req) { return store.has(key(req)); },
  };
}

export function createServiceWorkerHarness({ fetchImpl } = {}) {
  const absPath = path.resolve(process.cwd(), "sw.js");
  const code = fs.readFileSync(absPath, "utf-8");

  const listeners = {};
  const fakeSelf = {
    addEventListener(type, cb) { listeners[type] = cb; },
    location: { origin: ORIGIN },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const cache = createFakeCache();
  const fakeCaches = {
    open: async () => cache,
    match: async (req) => cache.match(req),
    keys: async () => cache.keys(),
    delete: async (k) => cache.delete(k),
  };

  const sandbox = {
    self: fakeSelf,
    caches: fakeCaches,
    fetch: (...args) => fetchImpl(...args),
    Response,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: absPath });

  return {
    cache,
    origin: ORIGIN,
    async triggerInstall() {
      let waitPromise;
      listeners.install({ waitUntil: (p) => { waitPromise = p; } });
      await waitPromise;
    },
    // req は { method, url, mode } の素のオブジェクトでよい(実際のRequestは
    // mode:"navigate" をコンストラクタで設定できない仕様上の制約があるため)。
    async triggerFetch(req) {
      let responded;
      listeners.fetch({ request: req, respondWith: (p) => { responded = p; } });
      return responded;
    },
  };
}
