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
