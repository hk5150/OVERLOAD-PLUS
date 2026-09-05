import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// window を渡さない = 非ネイティブ環境。ブリッジ側は全て no-op になる。
function load(initialGlobals = {}) {
  return loadDomainModule("src/domain/restNotifications.js", initialGlobals);
}

const TEXTS = { title: "インターバル", body: (n) => `${n}分経過しました。` };
const MIN = 60000;

describe("buildRestNotifications", () => {
  it("インターバル停止中(null)は何も予約しない", () => {
    const { buildRestNotifications } = load();
    expect(buildRestNotifications(null, 1000, TEXTS)).toEqual([]);
    expect(buildRestNotifications(undefined, 1000, TEXTS)).toEqual([]);
  });

  it("開始直後は1・2・3分の3件を予約する", () => {
    const { buildRestNotifications } = load();
    const start = 1_000_000;
    const list = buildRestNotifications(start, start, TEXTS);

    expect(list).toHaveLength(3);
    expect(list.map((n) => n.schedule.at.getTime())).toEqual([
      start + 1 * MIN, start + 2 * MIN, start + 3 * MIN,
    ]);
  });

  it("IDが固定で重複しない(確実にキャンセルするため)", () => {
    const { buildRestNotifications } = load();
    const start = 1_000_000;
    const ids = buildRestNotifications(start, start, TEXTS).map((n) => n.id);

    expect(new Set(ids).size).toBe(ids.length);
    // 同じ開始時刻なら毎回同じIDになる(動的採番していない)
    expect(buildRestNotifications(start, start, TEXTS).map((n) => n.id)).toEqual(ids);
    // 開始時刻が変わってもIDは変わらない(前回分を必ず上書きできる)
    expect(buildRestNotifications(start + 5 * MIN, start + 5 * MIN, TEXTS).map((n) => n.id)).toEqual(ids);
  });

  it("文言が渡したtextsから作られる(経過分がbodyに入る)", () => {
    const { buildRestNotifications } = load();
    const start = 1_000_000;
    const list = buildRestNotifications(start, start, TEXTS);

    expect(list[0].title).toBe("インターバル");
    expect(list.map((n) => n.body)).toEqual([
      "1分経過しました。", "2分経過しました。", "3分経過しました。",
    ]);
  });

  it("通知センターで束ねるためthreadIdentifierが揃っている", () => {
    const { buildRestNotifications } = load();
    const start = 1_000_000;
    const threads = buildRestNotifications(start, start, TEXTS).map((n) => n.threadIdentifier);

    expect(new Set(threads).size).toBe(1);
    expect(threads[0]).toBeTruthy();
  });

  // iOSはsoundを省略すると無音の通知になる(プラグインの公式仕様)。通知を許可した端末では
  // beep()を止めて通知に一本化しているため、ここが抜けると音が一切出ない。
  // v96〜v108で実際にそうなっていて、「インターバルの音が鳴らない時がある」として報告された。
  it("全ての通知にsoundが付いている(iOSで無音にならないため)", () => {
    const { buildRestNotifications } = load();
    const start = 1_000_000;
    const list = buildRestNotifications(start, start, TEXTS);

    expect(list).toHaveLength(3);
    // "default" は存在しないファイル名で、システム既定音へのフォールバックを踏む設計。
    // 同梱ファイル名に変えるなら、Xcodeプロジェクト(pbxproj)へのリソース追加も要る。
    for (const n of list) expect(n.sound).toBe("default");
  });

  // ここが最も壊れやすい。下書き復元でタイマーが途中から再開したとき、
  // 既に過ぎた分を予約すると復元した瞬間に通知が発火してしまう。
  it("下書き復元で途中から再開したとき、過ぎた分は予約しない", () => {
    const { buildRestNotifications } = load();
    const start = 1_000_000;
    const now = start + 90_000; // 1分30秒経過した状態で復元

    const list = buildRestNotifications(start, now, TEXTS);

    expect(list.map((n) => n.body)).toEqual(["2分経過しました。", "3分経過しました。"]);
    expect(list.every((n) => n.schedule.at.getTime() > now)).toBe(true);
  });

  it("ちょうど境界の分は予約しない(即時発火を避ける)", () => {
    const { buildRestNotifications } = load();
    const start = 1_000_000;

    const list = buildRestNotifications(start, start + 1 * MIN, TEXTS);

    expect(list.map((n) => n.body)).toEqual(["2分経過しました。", "3分経過しました。"]);
  });

  it("3分を過ぎていれば何も予約しない", () => {
    const { buildRestNotifications } = load();
    const start = 1_000_000;

    expect(buildRestNotifications(start, start + 3 * MIN, TEXTS)).toEqual([]);
    expect(buildRestNotifications(start, start + 10 * MIN, TEXTS)).toEqual([]);
  });
});

describe("非ネイティブ環境でのフォールバック", () => {
  it("windowが無ければ通知は使えない扱いになる", () => {
    const { restNotificationsAvailable } = load();
    expect(restNotificationsAvailable()).toBe(false);
  });

  it("Web版(isNativePlatformがfalse)では通知を使わない", () => {
    const { restNotificationsAvailable } = load({
      window: { Capacitor: { isNativePlatform: () => false, Plugins: { LocalNotifications: {} } } },
    });
    expect(restNotificationsAvailable()).toBe(false);
  });

  it("ネイティブでもプラグインが未登録なら使わない", () => {
    const { restNotificationsAvailable } = load({
      window: { Capacitor: { isNativePlatform: () => true, Plugins: {} } },
    });
    expect(restNotificationsAvailable()).toBe(false);
  });

  it("ネイティブかつプラグインがあれば使える", () => {
    const { restNotificationsAvailable } = load({
      window: { Capacitor: { isNativePlatform: () => true, Plugins: { LocalNotifications: {} } } },
    });
    expect(restNotificationsAvailable()).toBe(true);
  });

  it("使えない環境では予約・キャンセルを呼んでも例外にならない", async () => {
    const m = load();
    await expect(m.scheduleRestNotifications(1000, 1000, TEXTS)).resolves.toBeUndefined();
    await expect(m.cancelRestNotifications()).resolves.toBeUndefined();
    await expect(m.clearDeliveredRestNotifications()).resolves.toBeUndefined();
    await expect(m.ensureRestNotificationPermission()).resolves.toBe(false);
    await expect(m.checkRestNotificationPermission()).resolves.toBe("unavailable");
  });
});

// tests/storage.test.js の fakePreferences() と同じ要領で、プラグインの偽物を差す。
function fakePlugin(overrides = {}) {
  const calls = { schedule: [], cancel: [], requestPermissions: 0, removeDelivered: [] };
  const plugin = {
    async checkPermissions() { return { display: overrides.display ?? "prompt" }; },
    async requestPermissions() {
      calls.requestPermissions++;
      return { display: overrides.afterRequest ?? "granted" };
    },
    async schedule(arg) { calls.schedule.push(arg); },
    async cancel(arg) { calls.cancel.push(arg); },
    async getDeliveredNotifications() { return { notifications: overrides.delivered ?? [] }; },
    async removeDeliveredNotifications(arg) { calls.removeDelivered.push(arg); },
  };
  const globals = {
    window: { Capacitor: { isNativePlatform: () => true, Plugins: { LocalNotifications: plugin } } },
  };
  return { globals, calls };
}

describe("許可の扱い", () => {
  it("未確認(prompt)のときだけ要求する", async () => {
    const { globals, calls } = fakePlugin({ display: "prompt", afterRequest: "granted" });
    const { ensureRestNotificationPermission } = load(globals);

    expect(await ensureRestNotificationPermission()).toBe(true);
    expect(calls.requestPermissions).toBe(1);
  });

  it("許可済みなら要求しない", async () => {
    const { globals, calls } = fakePlugin({ display: "granted" });
    const { ensureRestNotificationPermission } = load(globals);

    expect(await ensureRestNotificationPermission()).toBe(true);
    expect(calls.requestPermissions).toBe(0);
  });

  // iOSは一度拒否されると2回目以降のダイアログを出さない。要求しても無駄なので呼ばない。
  it("拒否済みなら再要求しない", async () => {
    const { globals, calls } = fakePlugin({ display: "denied" });
    const { ensureRestNotificationPermission } = load(globals);

    expect(await ensureRestNotificationPermission()).toBe(false);
    expect(calls.requestPermissions).toBe(0);
  });
});

describe("予約とキャンセル", () => {
  it("予約の前に必ずキャンセルする(同じIDで二重に積まない)", async () => {
    const { globals, calls } = fakePlugin({ display: "granted" });
    const { scheduleRestNotifications } = load(globals);
    const start = 1_000_000;

    await scheduleRestNotifications(start, start, TEXTS);

    expect(calls.cancel).toHaveLength(1);
    expect(calls.schedule).toHaveLength(1);
    expect(calls.schedule[0].notifications).toHaveLength(3);
  });

  it("予約するものが無ければscheduleを呼ばない(キャンセルはする)", async () => {
    const { globals, calls } = fakePlugin({ display: "granted" });
    const { scheduleRestNotifications } = load(globals);
    const start = 1_000_000;

    await scheduleRestNotifications(start, start + 5 * MIN, TEXTS);

    expect(calls.cancel).toHaveLength(1);
    expect(calls.schedule).toHaveLength(0);
  });

  it("配信済みの通知のうち自分のものだけ消す", async () => {
    const { globals, calls } = fakePlugin({
      display: "granted",
      delivered: [{ id: 4201 }, { id: 9999 }, { id: 4203 }],
    });
    const { clearDeliveredRestNotifications } = load(globals);

    await clearDeliveredRestNotifications();

    expect(calls.removeDelivered).toHaveLength(1);
    expect(calls.removeDelivered[0].notifications.map((n) => n.id)).toEqual([4201, 4203]);
  });

  it("消すべき配信済み通知が無ければ何もしない", async () => {
    const { globals, calls } = fakePlugin({ display: "granted", delivered: [{ id: 9999 }] });
    const { clearDeliveredRestNotifications } = load(globals);

    await clearDeliveredRestNotifications();

    expect(calls.removeDelivered).toHaveLength(0);
  });
});
