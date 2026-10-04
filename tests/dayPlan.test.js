import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { STARTER_PICKS, STARTER_FULL_BODY, starterPicks, DAY_GROUP_OF, autoDayName, nextDayName } = loadDomainModule("src/domain/dayPlan.js");

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
});
