import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// sw.js は module でも import 可能な形でもない素のService Workerスクリプト
// (self.addEventListener 等を直接呼ぶ)。テストでは自作の self/caches/fetch を
// 差し込んだ vm サンドボックス内でそのまま実行し、登録されたイベントハンドラを
// 直接呼び出すことで、本番と同じコードをオフライン/エラー系も含めて検証する。

const ORIGIN = "https://example.test";

// sw.js が new Request(url, init) で作るリクエストの代わり。本物の Request は相対URL("./index.html")を
// 受け付けない(Node には SW の基準URLが無い)ので、url と cache を持つだけの偽物にする。
class FakeRequest {
  constructor(url, init = {}) {
    this.url = url;
    this.cache = init.cache;
  }
}

const urlOf = (req) => (typeof req === "string" ? req : req.url);

function createFakeCache() {
  const store = new Map();
  const key = (req) => new URL(urlOf(req), ORIGIN + "/").href;
  const addAllCalls = [];
  return {
    async put(req, res) { store.set(key(req), res); },
    // 本物の Cache API は match のたびに新しい Response を返す(同じ本文を何度でも読める)
    async match(req) { return store.get(key(req))?.clone(); },
    async addAll(reqs) {
      addAllCalls.push(reqs);
      for (const r of reqs) store.set(key(r), new Response(`cached:${urlOf(r)}`, { status: 200 }));
    },
    addAllCalls,
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
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js` },
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

  const fetchCalls = [];
  const sandbox = {
    self: fakeSelf,
    caches: fakeCaches,
    fetch: (...args) => { fetchCalls.push(args); return fetchImpl(...args); },
    Request: FakeRequest,
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
    fetchCalls,
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
