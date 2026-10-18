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

// 設定タブの「ご意見・不具合の報告」が開くメール。アプリからは何も送らず、メールアプリに下書きを渡すだけ。
// 本文に記録や体重が混ざるとプライバシーの申告(Data Not Collected)と食い違うので、入れてよい項目を縛る。
// 件名の頭の [KURABELL] は Gmail の振り分けに使うので、言語によらず固定。
describe("意見・不具合の報告のメール", () => {
  const { buildFeedbackMailUrl, iosVersionFromUa, FEEDBACK_EMAIL, APP_STORE_REVIEW_URL } = load();
  const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

  function parse(url) {
    const m = /^mailto:([^?]+)\?subject=([^&]*)&body=(.*)$/.exec(url);
    return { to: m[1], subject: decodeURIComponent(m[2]), body: decodeURIComponent(m[3]) };
  }

  it("iOS の版を userAgent から読む(読めなければ null)", () => {
    expect(iosVersionFromUa(IPHONE_UA)).toBe("18.1.1");
    expect(iosVersionFromUa("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)")).toBe("26.0");
    expect(iosVersionFromUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(null);
    expect(iosVersionFromUa(undefined)).toBe(null);
  });

  it("宛先・件名・本文の環境情報を組み立てる", () => {
    const { to, subject, body } = parse(buildFeedbackMailUrl({
      subject: "ご意見・不具合の報告", bodyLead: "(ここに書いてください)", envLabel: "お使いの環境",
      appVersion: "v166", platform: "iOS", userAgent: IPHONE_UA, lang: "ja", unit: "kg",
    }));
    expect(to).toBe(FEEDBACK_EMAIL);
    expect(subject).toBe("[KURABELL] ご意見・不具合の報告");
    // 完全一致で縛る(環境欄に記録・体重などが足されたら落ちる)
    expect(body).toBe("(ここに書いてください)\n\n\n\n-- お使いの環境 --\nApp: v166 (iOS)\niOS: 18.1.1\nLang: ja / Unit: kg\n");
  });

  it("& や改行を含む文言でもURLが壊れない", () => {
    const url = buildFeedbackMailUrl({ subject: "Bugs & ideas", bodyLead: "a&b=c\nd", envLabel: "Env", appVersion: "v1" });
    expect(url.split("&").length).toBe(2); // subject と body の区切りだけ
    const { subject, body } = parse(url);
    expect(subject).toBe("[KURABELL] Bugs & ideas");
    expect(body.startsWith("a&b=c\nd")).toBe(true);
    expect(body).toContain("iOS: ?\nLang: ? / Unit: ?");
  });

  it("Web 版では iOS の行を出さない", () => {
    const { body } = parse(buildFeedbackMailUrl({ subject: "s", bodyLead: "b", envLabel: "Env", appVersion: "v1", platform: "Web", userAgent: "Mozilla/5.0 (Macintosh)", lang: "en", unit: "lb" }));
    expect(body).toBe("b\n\n\n\n-- Env --\nApp: v1 (Web)\nLang: en / Unit: lb\n");
  });

  it("Instagram の DM は表示言語のアカウントを開く(知らない言語は日本語のアカウント)", () => {
    const { instagramDmUrl } = load();
    expect(instagramDmUrl("ja")).toBe("https://ig.me/m/kurabell_workout_log_jp");
    expect(instagramDmUrl("en")).toBe("https://ig.me/m/kurabell_workout_log_en");
    expect(instagramDmUrl("fr")).toBe("https://ig.me/m/kurabell_workout_log_jp");
  });

  it("DM 用にコピーする環境の情報は、版・iOS・言語・単位だけ(完全一致)", () => {
    const { feedbackEnvText } = load();
    expect(feedbackEnvText({ appVersion: "v166", platform: "iOS", userAgent: IPHONE_UA, lang: "en", unit: "lb" }))
      .toBe("App: v166 (iOS)\niOS: 18.1.1\nLang: en / Unit: lb");
  });

  it("App Store のレビューを書く画面のURL", () => {
    expect(APP_STORE_REVIEW_URL).toBe("https://apps.apple.com/app/id6816090624?action=write-review");
  });
});
