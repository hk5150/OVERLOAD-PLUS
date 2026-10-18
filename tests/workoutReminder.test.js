import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// トレーニング日のお知らせ(src/domain/restNotifications.js、UI レビュー A3)
function load(initialGlobals = {}) {
  return loadDomainModule("src/domain/restNotifications.js", initialGlobals);
}
const TEXTS = { title: "KURABELL", body: "今日は Pull の日。" };
// 2026-10-18 (日) 12:00(端末のタイムゾーン)
const NOW = new Date(2026, 9, 18, 12, 0, 0).getTime();

describe("normalizeWorkoutReminder", () => {
  it("未設定はオフで、月・水・金の19時", () => {
    const { normalizeWorkoutReminder } = load();
    expect(normalizeWorkoutReminder(undefined)).toEqual({ on: false, days: [1, 3, 5], time: "19:00" });
  });
  it("曜日は 0〜6 だけを並べ直し、壊れた時刻は既定に戻す", () => {
    const { normalizeWorkoutReminder } = load();
    expect(normalizeWorkoutReminder({ on: true, days: [5, 9, 1, 1, -1], time: "25:00" })).toEqual({ on: true, days: [1, 5], time: "19:00" });
    expect(normalizeWorkoutReminder({ on: "yes", days: [], time: "07:30" })).toEqual({ on: false, days: [], time: "07:30" });
  });
});

describe("buildWorkoutReminders", () => {
  it("オフなら何も予約しない", () => {
    const { buildWorkoutReminders } = load();
    expect(buildWorkoutReminders({ on: false, days: [0, 1, 2, 3, 4, 5, 6], time: "19:00" }, NOW, null, TEXTS)).toEqual([]);
  });

  it("選んだ曜日の指定時刻に、28日先まで1件ずつ積む(IDは連番で固定の範囲)", () => {
    const { buildWorkoutReminders, WORKOUT_REMINDER_IDS } = load();
    const list = buildWorkoutReminders({ on: true, days: [1, 3], time: "19:30" }, NOW, null, TEXTS);
    // 10/19(月)から 11/14 までの月・水 = 8件
    expect(list).toHaveLength(8);
    list.forEach((n) => {
      expect([1, 3]).toContain(n.schedule.at.getDay());
      expect(n.schedule.at.getHours()).toBe(19);
      expect(n.schedule.at.getMinutes()).toBe(30);
      expect(WORKOUT_REMINDER_IDS).toContain(n.id);
      expect(n.body).toBe(TEXTS.body);
      expect(n.sound).toBe("default");
    });
    expect(new Set(list.map((n) => n.id)).size).toBe(list.length);
    expect(list[0].schedule.at.getDate()).toBe(19);
  });

  it("今日の時刻がもう過ぎていれば、今日の分は積まない", () => {
    const { buildWorkoutReminders } = load();
    const list = buildWorkoutReminders({ on: true, days: [0], time: "09:00" }, NOW, null, TEXTS);
    expect(list[0].schedule.at.getDate()).toBe(25);
  });

  it("今日まだ時刻前なら今日も積むが、今日もう記録を保存していれば積まない", () => {
    const { buildWorkoutReminders } = load();
    const r = { on: true, days: [0], time: "19:00" };
    expect(buildWorkoutReminders(r, NOW, null, TEXTS)[0].schedule.at.getDate()).toBe(18);
    const savedToday = new Date(2026, 9, 18, 10, 0).getTime();
    expect(buildWorkoutReminders(r, NOW, savedToday, TEXTS)[0].schedule.at.getDate()).toBe(25);
    const savedYesterday = new Date(2026, 9, 17, 20, 0).getTime();
    expect(buildWorkoutReminders(r, NOW, savedYesterday, TEXTS)[0].schedule.at.getDate()).toBe(18);
  });
});

describe("suggestWorkoutReminder", () => {
  it("記録が無ければ既定の曜日・時刻でオン", () => {
    const { suggestWorkoutReminder } = load();
    expect(suggestWorkoutReminder([], NOW)).toEqual({ on: true, days: [1, 3, 5], time: "19:00" });
  });

  it("直近28日で2回以上やった曜日と、一番多く始めた時刻(00分)", () => {
    const { suggestWorkoutReminder } = load();
    const at = (m, d, h) => ({ startAt: new Date(2026, m, d, h, 10).toISOString(), date: new Date(2026, m, d, h + 1).toISOString() });
    const ws = [
      at(9, 6, 7), at(9, 13, 7), // 火曜 7時 ×2
      at(9, 8, 20), at(9, 15, 7), // 木曜 20時・7時
      at(9, 10, 7), // 土曜 1回だけ
      at(8, 1, 7), at(8, 3, 7), // 28日より前(数えない)
    ];
    expect(suggestWorkoutReminder(ws, NOW)).toEqual({ on: true, days: [2, 4], time: "07:00" });
  });
});
