import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// App Storeの評価依頼(src/domain/review.js)の「いつ頼むか」と「頼めない環境で黙って引くか」を縛る。
// 条件がゆるむと記録の保存のたびに評価シートを求めることになり、iOSの年3回枠を早々に使い切るうえ、
// 記録中の利用者の邪魔をする。逆に日付の扱いを誤ると(読めない値をNaNのまま比較するなど)一度も頼まなくなるが、
// どちらもアプリ側には表示結果が返らないので無症状で壊れる。
// 前回比較を体験した人(記録3件以上)が前回を超えたときだけ、前回依頼から120日以上空けて頼む。
// requestAppReview はネイティブの Review プラグインを叩く部分で、例外を保存処理に漏らさないことが要る。
// 実際にiOSがシートを出すか(TestFlightでは出ない)と、ios/App/App/Review/ のネイティブ実装は対象外。

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-01T12:00:00.000Z");

function sampleInput(overrides = {}) {
  return {
    beatPrevious: true,
    workoutsCount: 10,
    lastRequestedAt: null,
    now: NOW,
    ...overrides,
  };
}

function load(initialGlobals = {}) {
  return loadDomainModule("src/domain/review.js", initialGlobals);
}

function nativeWindow(Review) {
  return {
    window: {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: Review === undefined ? {} : { Review },
      },
    },
  };
}

describe("公開される定数", () => {
  it("依頼日時の保存キーをreview-requested-atとしてグローバルに公開する", () => {
    const { REVIEW_REQUESTED_KEY } = load();
    expect(REVIEW_REQUESTED_KEY).toBe("review-requested-at");
  });
});

describe("shouldRequestReview(条件がゆるむと保存のたびに評価を求めてしまう)", () => {
  const { shouldRequestReview } = load();

  it("前回を超えていなければ、他の条件を満たしていても頼まない", () => {
    expect(shouldRequestReview(sampleInput({ beatPrevious: false }))).toBe(false);
  });

  it("記録が2件では頼まない", () => {
    expect(shouldRequestReview(sampleInput({ workoutsCount: 2 }))).toBe(false);
  });

  it("記録が3件になると頼む", () => {
    expect(shouldRequestReview(sampleInput({ workoutsCount: 3 }))).toBe(true);
  });

  it("記録件数が未指定なら頼まない", () => {
    expect(shouldRequestReview(sampleInput({ workoutsCount: undefined }))).toBe(false);
  });

  it("前回依頼日時がnull・undefined・空文字なら未依頼として頼む", () => {
    expect(shouldRequestReview(sampleInput({ lastRequestedAt: null }))).toBe(true);
    expect(shouldRequestReview(sampleInput({ lastRequestedAt: undefined }))).toBe(true);
    expect(shouldRequestReview(sampleInput({ lastRequestedAt: "" }))).toBe(true);
  });

  it("前回依頼日時が日付として読めない文字列なら未依頼として頼む", () => {
    expect(shouldRequestReview(sampleInput({ lastRequestedAt: "not-a-date" }))).toBe(true);
  });

  it("前回依頼からちょうど120日経っていれば頼む", () => {
    const last = new Date(NOW - 120 * DAY).toISOString();
    expect(shouldRequestReview(sampleInput({ lastRequestedAt: last }))).toBe(true);
  });

  it("前回依頼から120日に1ミリ秒足りなければ頼まない", () => {
    const last = new Date(NOW - 120 * DAY + 1).toISOString();
    expect(shouldRequestReview(sampleInput({ lastRequestedAt: last }))).toBe(false);
  });

  it("前回依頼が直前なら頼まない", () => {
    const last = new Date(NOW).toISOString();
    expect(shouldRequestReview(sampleInput({ lastRequestedAt: last }))).toBe(false);
  });

  it("前回依頼から120日以上経っていても、前回を超えていなければ頼まない", () => {
    const last = new Date(NOW - 365 * DAY).toISOString();
    expect(shouldRequestReview(sampleInput({ beatPrevious: false, lastRequestedAt: last }))).toBe(false);
  });
});

describe("requestAppReview(例外が漏れると保存処理を巻き込む)", () => {
  it("windowが無い環境ではfalseを返す", async () => {
    const { requestAppReview } = load();
    expect(await requestAppReview()).toBe(false);
  });

  it("window.Capacitorが無い(Web版)ならfalseを返す", async () => {
    const { requestAppReview } = load({ window: {} });
    expect(await requestAppReview()).toBe(false);
  });

  it("isNativePlatformがfalseならプラグインがあっても呼ばずにfalseを返す", async () => {
    let called = 0;
    const Review = { request: async () => { called++; } };
    const { requestAppReview } = load({
      window: { Capacitor: { isNativePlatform: () => false, Plugins: { Review } } },
    });
    expect(await requestAppReview()).toBe(false);
    expect(called).toBe(0);
  });

  it("ネイティブでもReviewプラグインが未登録(古いネイティブ)ならfalseを返す", async () => {
    const { requestAppReview } = load(nativeWindow(undefined));
    expect(await requestAppReview()).toBe(false);
  });

  it("plugin.requestがresolveすればtrueを返す", async () => {
    let called = 0;
    const { requestAppReview } = load(nativeWindow({ request: async () => { called++; } }));
    expect(await requestAppReview()).toBe(true);
    expect(called).toBe(1);
  });

  it("plugin.requestがrejectしても例外を外に出さずfalseを返す", async () => {
    const { requestAppReview } = load(nativeWindow({ request: async () => { throw new Error("boom"); } }));
    await expect(requestAppReview()).resolves.toBe(false);
  });

  it("plugin.requestが同期的に例外を投げても外に出さずfalseを返す", async () => {
    const { requestAppReview } = load(nativeWindow({ request: () => { throw new Error("boom"); } }));
    await expect(requestAppReview()).resolves.toBe(false);
  });

  it("isNativePlatformが例外を投げてもfalseを返す", async () => {
    const { requestAppReview } = load({
      window: { Capacitor: { isNativePlatform: () => { throw new Error("boom"); }, Plugins: { Review: { request: async () => {} } } } },
    });
    await expect(requestAppReview()).resolves.toBe(false);
  });
});
