import { describe, it, expect } from "vitest";
import { createServiceWorkerHarness } from "./helpers/loadServiceWorker.js";

// P0-2/P0-3: sw.jsのfetchハンドラの回帰テスト。
// 「キャッシュにもネットワークにも無いとき、何を返すか」を検証する。
// ナビゲーション以外(JS/JSON/画像等)にindex.htmlを返すと、ブラウザがHTMLを
// JS等として解釈しようとして「Unexpected token '<'」のような誤動作を招くため、
// navigateリクエストのみindex.htmlへフォールバックし、それ以外は503を返すべき。

const offlineFetch = async () => { throw new Error("offline"); };

describe("sw.js fetch フォールバック", () => {
  it("navigationリクエストが失敗し、キャッシュにも無い場合はindex.htmlへフォールバックする", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: offlineFetch });
    await harness.triggerInstall();

    const req = { method: "GET", url: `${harness.origin}/some/deep/route`, mode: "navigate" };
    const res = await harness.triggerFetch(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("cached:./index.html");
  });

  it("JSリクエストが失敗し、キャッシュにも無い場合はindex.htmlを返さず503を返す", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: offlineFetch });
    await harness.triggerInstall();

    const req = { method: "GET", url: `${harness.origin}/src/domain/oneRm.js`, mode: "same-origin" };
    // インストール直後にAPP_ASSETSがキャッシュされているはずなのキャッシュヒットしてしまうため、
    // このテストではキャッシュに存在しない未知のファイルを使って「キャッシュにも無い」状況を作る。
    req.url = `${harness.origin}/src/domain/unknown-file.js`;
    const res = await harness.triggerFetch(req);

    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("<");
  });

  it("画像リクエストが失敗し、キャッシュにも無い場合もindex.htmlを返さない", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: offlineFetch });
    await harness.triggerInstall();

    const req = { method: "GET", url: `${harness.origin}/icon-unknown.png`, mode: "no-cors" };
    const res = await harness.triggerFetch(req);

    expect(res.status).toBe(503);
  });

  it("キャッシュ済みのsrc/domainファイルはオフラインでも正しく返る(P0-1の回帰確認)", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: offlineFetch });
    await harness.triggerInstall();

    const req = { method: "GET", url: `${harness.origin}/src/domain/oneRm.js`, mode: "same-origin" };
    const res = await harness.triggerFetch(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("cached:./src/domain/oneRm.js");
  });

  it("404レスポンスは正常アセットとしてキャッシュされない", async () => {
    let calls = 0;
    const harness = createServiceWorkerHarness({
      fetchImpl: async () => { calls++; return new Response("not found", { status: 404 }); },
    });
    await harness.triggerInstall();

    const url = `${harness.origin}/src/domain/unknown-file.js`;
    await harness.triggerFetch({ method: "GET", url, mode: "same-origin" });
    await harness.triggerFetch({ method: "GET", url, mode: "same-origin" });

    // キャッシュされていれば2回目はネットワークへ行かないはずだが、
    // 404はキャッシュされないため毎回ネットワークへ問い合わせに行く。
    expect(calls).toBe(2);
  });

  it("正常レスポンス(200)はキャッシュされ、次回はネットワーク不要でも返せる", async () => {
    let calls = 0;
    const harness = createServiceWorkerHarness({
      fetchImpl: async () => { calls++; return new Response("ok-body", { status: 200 }); },
    });
    await harness.triggerInstall();

    const url = `${harness.origin}/some/new/asset.js`;
    const firstRes = await harness.triggerFetch({ method: "GET", url, mode: "same-origin" });
    expect(await firstRes.text()).toBe("ok-body");
    expect(harness.cache.has({ url })).toBe(true);
  });
});

// ブラウザのHTTPキャッシュを素通りさせる指定。既定のままだと、版を上げても新しいCACHEに古い
// src/domain/*.js が入り、新しいindex.htmlと組み合わさって起動エラーになる(v112の検証で実際に踏んだ)。
describe("sw.js はHTTPキャッシュ越しの古いファイルを掴まない", () => {
  it("installはAPP_ASSETSをすべて cache: 'no-cache' でサーバーに確認する", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: offlineFetch });
    await harness.triggerInstall();

    const [reqs] = harness.cache.addAllCalls;
    expect(reqs.length).toBeGreaterThan(10);
    expect(reqs.filter((r) => typeof r === "string" || r.cache !== "no-cache")).toEqual([]);
    expect(reqs.map((r) => r.url)).toContain("./src/domain/restNotifications.js");
  });

  it("APP_ASSETS以外のネットワーク優先fetchは cache: 'no-cache' でサーバーに確認する", async () => {
    const ok = async () => new Response("fresh", { status: 200 });
    const harness = createServiceWorkerHarness({ fetchImpl: ok });
    await harness.triggerInstall();

    const req = { method: "GET", url: `${harness.origin}/some/new/asset.js`, mode: "same-origin" };
    const res = await harness.triggerFetch(req);

    expect(await res.text()).toBe("fresh");
    const [, init] = harness.fetchCalls.at(-1);
    expect(init.cache).toBe("no-cache");
  });
});

// 電波が弱いとファイルごとにタイムアウトが分かれ、新しいindex.htmlと古いスクリプトが混ざった(v113の残課題)。
// アプリ本体は保存済みの版から丸ごと返し、版の入れ替えはinstall/activateだけに任せる。
describe("sw.js はアプリ本体を保存済みの版から丸ごと返す(キャッシュ優先)", () => {
  // ネットワークは常に「新しい版」を返す状況。キャッシュ優先なら、これは使われないはず。
  const newerOnNetwork = async () => new Response("NEWER-FROM-NETWORK", { status: 200 });

  it("APP_ASSETSのスクリプトは、ネットワークが別の中身を返しても保存済みの版を返し、ネットワークに行かない", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: newerOnNetwork });
    await harness.triggerInstall();

    const req = { method: "GET", url: `${harness.origin}/src/domain/units.js`, mode: "same-origin" };
    const res = await harness.triggerFetch(req);

    expect(await res.text()).toBe("cached:./src/domain/units.js");
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it("アプリとして開く画面遷移(/ と index.html)は保存済みのindex.htmlを返し、ネットワークに行かない", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: newerOnNetwork });
    await harness.triggerInstall();

    for (const path of ["/", "/index.html", "/index.html?source=pwa"]) {
      const res = await harness.triggerFetch({ method: "GET", url: `${harness.origin}${path}`, mode: "navigate" });
      expect(await res.text(), path).toBe("cached:./index.html");
    }
    expect(harness.fetchCalls).toHaveLength(0);
  });

  // App Store Connectに登録しているURL。アプリの画面にすり替えると、Web版を開いたことがある
  // ブラウザでプライバシーポリシーとサポートが読めなくなる。
  it("privacy.html・support.htmlなどアプリ以外のページはネットワークから返す", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: async () => new Response("PRIVACY", { status: 200 }) });
    await harness.triggerInstall();

    for (const path of ["/privacy.html", "/support.html"]) {
      const res = await harness.triggerFetch({ method: "GET", url: `${harness.origin}${path}`, mode: "navigate" });
      expect(await res.text(), path).toBe("PRIVACY");
    }
  });

  it("保存先からindex.htmlが欠けていても、別ページの中身をindex.htmlとして保存しない", async () => {
    const harness = createServiceWorkerHarness({
      fetchImpl: async (req) => new Response(`from:${typeof req === "string" ? req : req.url}`, { status: 200 }),
    });
    await harness.triggerInstall();
    await harness.cache.delete(new URL("./index.html", `${harness.origin}/`).href);

    const res = await harness.triggerFetch({ method: "GET", url: `${harness.origin}/`, mode: "navigate" });
    // 開こうとしたURL(/)ではなく index.html そのものを取りにいく
    expect(await res.text()).toBe(`from:${harness.origin}/index.html`);
  });

  it("クエリ付きでもAPP_ASSETSなら保存済みの版を返す", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: newerOnNetwork });
    await harness.triggerInstall();

    const req = { method: "GET", url: `${harness.origin}/manifest.json?v=1`, mode: "same-origin" };
    expect(await (await harness.triggerFetch(req)).text()).toBe("cached:./manifest.json");
  });

  it("保存済みの版に無く、ネットワークも失敗したら503(index.htmlは返さない)", async () => {
    const harness = createServiceWorkerHarness({ fetchImpl: offlineFetch });
    await harness.triggerInstall();
    await harness.cache.delete(new URL("./src/domain/units.js", `${harness.origin}/`).href);

    const req = { method: "GET", url: `${harness.origin}/src/domain/units.js`, mode: "same-origin" };
    const res = await harness.triggerFetch(req);

    expect(res.status).toBe(503);
  });
});
