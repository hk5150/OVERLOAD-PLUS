import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { STARTER_PICKS, STARTER_FULL_BODY, starterPicks, DAY_GROUP_OF, autoDayName, nextDayName, uniqueDayName, stalestDayIndex } = loadDomainModule("src/domain/dayPlan.js");

// EXERCISE_DB は index.html の #appsrc の中にあるので、文字列から名前と部位を拾う
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const db = new Map([...html.matchAll(/\{ n: "([^"]+)", m: "([^"]+)"/g)].map(m => [m[1], m[2]]));
const musclesSrc = html.match(/const MUSCLES = \[([\s\S]*?)\];/)[1];
const MUSCLES = [...musclesSrc.matchAll(/"([^"]+)"/g)].map(m => m[1]);

describe("STARTER_PICKS(おまかせの種目表)", () => {
  it("種目名はすべて EXERCISE_DB の正式名で、部位も一致する(別名だと前回の記録と名前が一致しない)", () => {
    for (const [muscle, names] of Object.entries(STARTER_PICKS)) {
      for (const n of names) {
        expect(db.has(n), `${n} が EXERCISE_DB に無い`).toBe(true);
        expect(db.get(n), `${n} の部位`).toBe(muscle);
      }
    }
    for (const n of STARTER_FULL_BODY) expect(db.has(n), `${n} が EXERCISE_DB に無い`).toBe(true);
  });

  it("全身以外のすべての部位に表がある", () => {
    for (const m of MUSCLES.filter(m => m !== "全身")) expect(STARTER_PICKS[m], m).toBeTruthy();
  });
});

describe("starterPicks", () => {
  it("胸だけの Day は胸の3種目を上から", () => {
    expect(starterPicks(["大胸筋"])).toEqual(["バーベルベンチプレス", "インクラインダンベルプレス", "ケーブルフライ"]);
  });

  it("部位を1つずつ回して取り、5つで止める(胸・肩前・三頭 = Push)", () => {
    expect(starterPicks(["上腕三頭筋", "三角筋前部", "大胸筋"])).toEqual([
      "バーベルベンチプレス", "ダンベルショルダープレス", "トライセッププレスダウン", "インクラインダンベルプレス", "ケーブルフライ",
    ]);
  });

  it("部位が多い Day でも5つまで(大きい部位から取る)", () => {
    const picks = starterPicks(["上腕二頭筋", "上腕三頭筋", "三角筋中部", "三角筋前部", "広背筋", "大胸筋"]);
    expect(picks).toHaveLength(5);
    expect(picks.slice(0, 2)).toEqual(["バーベルベンチプレス", "ラットプルダウン"]);
  });

  it("全身を含む Day は全身法の5種目", () => {
    expect(starterPicks(["全身"])).toEqual(STARTER_FULL_BODY);
    expect(starterPicks(["大胸筋", "全身"])).toEqual(STARTER_FULL_BODY);
  });

  it("部位が無ければ空", () => {
    expect(starterPicks([])).toEqual([]);
    expect(starterPicks(undefined)).toEqual([]);
  });
});

describe("autoDayName / nextDayName(部位から付ける Day 名)", () => {
  it("すべての部位に名前の区分がある", () => {
    for (const m of MUSCLES) expect(DAY_GROUP_OF[m], m).toBeTruthy();
  });

  it("区分を重ねずに、胸・背中・肩・腕・脚・腹の順で繋ぐ", () => {
    expect(autoDayName(["三角筋前部", "大胸筋", "三角筋中部"])).toBe("胸・肩");
    expect(autoDayName(["ふくらはぎ", "大腿四頭筋", "腹筋"])).toBe("脚・腹");
    expect(autoDayName(["大胸筋", "全身"])).toBe("全身");
    expect(autoDayName([])).toBe("");
  });

  it("既定の「Day 3」や、自動で付けた名前のままなら付け直す", () => {
    expect(nextDayName({ name: "Day 3", muscles: [] }, ["大胸筋"], 2)).toBe("胸");
    expect(nextDayName({ name: "胸", muscles: ["大胸筋"] }, ["大胸筋", "三角筋前部"], 2)).toBe("胸・肩");
  });

  it("部位を全部外したら「Day N」に戻す", () => {
    expect(nextDayName({ name: "胸", muscles: ["大胸筋"] }, [], 2)).toBe("Day 3");
  });

  it("手で付けた名前は触らない", () => {
    expect(nextDayName({ name: "Push", muscles: ["大胸筋"] }, ["大胸筋", "三角筋前部"], 0)).toBe("Push");
  });

  it("その名前の記録がある Day は変えない(Day 名で前回の記録を引いているため。5分割の「脚」に腹筋を足しても「脚」のまま)", () => {
    expect(nextDayName({ name: "脚", muscles: ["大腿四頭筋", "ハムストリングス"] }, ["大腿四頭筋", "ハムストリングス", "腹筋"], 2, { locked: true })).toBe("脚");
    expect(nextDayName({ name: "Day 3", muscles: [] }, ["大胸筋"], 2, { locked: true })).toBe("Day 3");
  });

  it("ほかの Day と同じ名前にならないよう番号を付ける(同じ名前だと記録が混ざる)", () => {
    expect(nextDayName({ name: "Day 4", muscles: [] }, ["大胸筋", "三角筋前部"], 3, { taken: ["胸・肩"] })).toBe("胸・肩 2");
    // 番号付きの自動名も「自動で付けた名前のまま」とみなす
    expect(nextDayName({ name: "胸・肩 2", muscles: ["大胸筋", "三角筋前部"] }, ["大胸筋"], 3, { taken: ["胸・肩"] })).toBe("胸");
    expect(nextDayName({ name: "胸", muscles: ["大胸筋"] }, [], 1, { taken: ["Day 1", "Day 2"] })).toBe("Day 3");
  });
});

describe("uniqueDayName", () => {
  it("空いていればそのまま", () => {
    expect(uniqueDayName("胸", ["背中"])).toBe("胸");
  });
  it("「Day N」は番号を進める", () => {
    expect(uniqueDayName("Day 2", ["Day 1", "Day 2", "Day 3"], true)).toBe("Day 4");
  });
  it("それ以外は後ろに番号を付ける", () => {
    expect(uniqueDayName("胸", ["胸", "胸 2"])).toBe("胸 3");
  });
});

/*
 * stalestDayIndex(保存した後の「今日」の Day)
 *
 * 以前は保存のたびに並び順の次(cursor + 1)へ進むだけだったので、Day を飛ばしたり
 * 「今日はこれ」で別の Day を選んだりすると、放っておかれた Day がさらに後回しになった。
 * ここでは「最後にやってから一番時間がたっている Day」を返すこと、
 * 全部未実施の新しい分割では従来のローテーションと同じ動きになること、を縛る。
 * 日付は固定の ISO 文字列で書き、Date.now には依存させない(関数自体も現在時刻を見ない)。
 * Day 名を変えたときに前の記録とつながらない点は仕様なので対象外。
 */
const ppl = () => [{ name: "Push" }, { name: "Pull" }, { name: "Legs" }];
const sampleWorkout = (overrides = {}) => ({ date: "2026-10-11T09:00:00.000Z", session: "Push", exercises: [], ...overrides });

describe("stalestDayIndex(ここが崩れると放っておかれた Day が後回しになる)", () => {
  it("全部未実施の分割では、fromIdx の次を返す(今までの cursor + 1 と同じ)", () => {
    expect(stalestDayIndex(ppl(), [], 0)).toBe(1);
  });

  it("全部未実施で fromIdx が最後なら、先頭に折り返す", () => {
    expect(stalestDayIndex(ppl(), [], 2)).toBe(0);
  });

  it("順番どおりに回した記録では、次の Day(Pull)を返す", () => {
    const workouts = [
      sampleWorkout({ date: "2026-10-06T09:00:00.000Z", session: "Push" }),
      sampleWorkout({ date: "2026-10-08T09:00:00.000Z", session: "Pull" }),
      sampleWorkout({ date: "2026-10-10T09:00:00.000Z", session: "Legs" }),
      sampleWorkout({ date: "2026-10-11T09:00:00.000Z", session: "Push" }),
    ];
    expect(stalestDayIndex(ppl(), workouts, 0)).toBe(1);
  });

  it("Day を飛ばして Pull を保存したら、一番前にやった Push を返す(今までの方式なら Legs だった)", () => {
    const workouts = [
      sampleWorkout({ date: "2026-10-06T09:00:00.000Z", session: "Push" }),
      sampleWorkout({ date: "2026-10-10T09:00:00.000Z", session: "Legs" }),
      sampleWorkout({ date: "2026-10-11T09:00:00.000Z", session: "Pull" }),
    ];
    expect(stalestDayIndex(ppl(), workouts, 1)).toBe(0);
  });

  it("新しく足した未実施の Day があれば、それを最優先で返す", () => {
    const days = [...ppl(), { name: "Arms" }];
    const workouts = [
      sampleWorkout({ date: "2026-10-01T09:00:00.000Z", session: "Push" }),
      sampleWorkout({ date: "2026-10-08T09:00:00.000Z", session: "Pull" }),
      sampleWorkout({ date: "2026-10-11T09:00:00.000Z", session: "Legs" }),
    ];
    expect(stalestDayIndex(days, workouts, 2)).toBe(3);
    expect(stalestDayIndex(days, workouts, 0)).toBe(3);
  });

  it("同名の Day が2つあって同じ記録を共有するときは、fromIdx の次から並び順で先に来る方を返す", () => {
    const days = [{ name: "Upper" }, { name: "Lower" }, { name: "Upper" }, { name: "Lower" }];
    const workouts = [
      sampleWorkout({ date: "2026-10-09T09:00:00.000Z", session: "Upper" }),
      sampleWorkout({ date: "2026-10-11T09:00:00.000Z", session: "Lower" }),
    ];
    expect(stalestDayIndex(days, workouts, 1)).toBe(2);
    expect(stalestDayIndex(days, workouts, 3)).toBe(0);
  });

  it("session の無い記録と日付が読めない記録は無視する", () => {
    const workouts = [
      sampleWorkout({ date: "2026-10-06T09:00:00.000Z", session: "Push" }),
      sampleWorkout({ date: "2026-10-08T09:00:00.000Z", session: "Pull" }),
      sampleWorkout({ date: "2026-10-10T09:00:00.000Z", session: "Legs" }),
      sampleWorkout({ date: "2026-10-11T09:00:00.000Z", session: undefined }),
      sampleWorkout({ date: "2026-10-11T09:00:00.000Z", session: null }),
      sampleWorkout({ date: "not a date", session: "Push" }),
      null,
    ];
    expect(stalestDayIndex(ppl(), workouts, 2)).toBe(0);
  });

  it("days が空なら 0 を返す", () => {
    expect(stalestDayIndex([], [sampleWorkout()], 0)).toBe(0);
    expect(stalestDayIndex(undefined, undefined, 0)).toBe(0);
  });

  it("fromIdx が範囲外・負・文字列でも落ちずに Day の位置を返す", () => {
    for (const from of [5, -1, "abc", "1", undefined, NaN]) {
      const i = stalestDayIndex(ppl(), [], from);
      expect(Number.isInteger(i) && i >= 0 && i < 3).toBe(true);
    }
    expect(stalestDayIndex(ppl(), [], 5)).toBe(0);
    expect(stalestDayIndex(ppl(), [], -1)).toBe(0);
  });

  // 端末の時計ずれや手入力で、ほかの Day に未来の時刻の記録があると、
  // 今保存した Day が「一番古い」と判定されて居座ってしまう。今日の Day は候補から外す
  it("Day が2つ以上あるときは、ほかの Day に未来の記録があっても今日の Day を返さない", () => {
    const days = [{ name: "A" }, { name: "B" }];
    const workouts = [
      sampleWorkout({ date: "2099-01-01T09:00:00.000Z", session: "B" }),
      sampleWorkout({ date: "2026-10-11T09:00:00.000Z", session: "A" }),
    ];
    expect(stalestDayIndex(days, workouts, 0)).toBe(1);
  });

  it("Day が1つだけなら、その Day(fromIdx)を返す", () => {
    expect(stalestDayIndex([{ name: "Full" }], [sampleWorkout({ session: "Full" })], 0)).toBe(0);
  });
});
