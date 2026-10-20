import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { STARTER_PICKS, STARTER_FULL_BODY, starterPicks, DAY_GROUP_OF, autoDayName, nextDayName, uniqueDayName, stalestDayIndex, addAdductorDays } = loadDomainModule("src/domain/dayPlan.js");

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
 * 日付は固定の ISO 文字列で書く。関数は未来の記録を丸めるために現在時刻を見る(opts.now が無ければ Date.now())ので、
 * 未来の記録を扱うテストでは opts.now を必ず渡す。
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

  // opts.includeFrom は、画面を開いた時点で「今日」を合わせる経路(index.html の useEffect)用。
  // 今日の Day も候補に入れ、同じ時刻・同じく未実施なら今日の Day を優先する(合っていれば動かさない)。
  // 北村さんの実例: 肩が「今日」のまま、もっと前にやった胸が後回しになっていた
  const bro = () => [{ name: "肩" }, { name: "胸" }, { name: "背中" }, { name: "脚" }];
  const broWorkouts = () => [
    sampleWorkout({ date: "2026-10-09T09:00:00.000Z", session: "肩" }),
    sampleWorkout({ date: "2026-10-07T09:00:00.000Z", session: "胸" }),
    sampleWorkout({ date: "2026-10-08T09:00:00.000Z", session: "背中" }),
    sampleWorkout({ date: "2026-10-10T09:00:00.000Z", session: "脚" }),
  ];

  it("includeFrom で今日の Day(肩)より前にやった Day があれば、一番前の胸を返す", () => {
    expect(stalestDayIndex(bro(), broWorkouts(), 0, { includeFrom: true })).toBe(1);
  });

  it("includeFrom で今日の Day(胸)が一番前にやった Day なら、動かさずに胸を返す(既定なら外して背中)", () => {
    expect(stalestDayIndex(bro(), broWorkouts(), 1, { includeFrom: true })).toBe(1);
    expect(stalestDayIndex(bro(), broWorkouts(), 1)).toBe(2);
  });

  it("includeFrom で全部未実施なら、今日の Day を動かさない(既定なら次の Day に折り返す)", () => {
    expect(stalestDayIndex(ppl(), [], 2, { includeFrom: true })).toBe(2);
    expect(stalestDayIndex(ppl(), [], 2)).toBe(0);
  });

  it("Day が1つだけなら、includeFrom でも既定でも 0 を返す", () => {
    const days = [{ name: "Full" }];
    const workouts = [sampleWorkout({ session: "Full" })];
    expect(stalestDayIndex(days, workouts, 0, { includeFrom: true })).toBe(0);
    expect(stalestDayIndex(days, workouts, 0)).toBe(0);
  });

  // 時刻が未来(opts.now より後)の記録は、未来でない記録のうち一番新しい時刻として扱う。
  // そのままだと今保存した Day の方が「古い」と判定され、開いた時点の判定(includeFrom)で同じ Day に戻り続ける
  const futureWorkouts = () => [
    sampleWorkout({ date: "2099-01-01T09:00:00.000Z", session: "B" }),
    sampleWorkout({ date: "2026-10-11T10:00:00.000Z", session: "A" }),
  ];
  const justAfterSave = Date.parse("2026-10-11T10:00:05.000Z");

  it("includeFrom で、ほかの Day に未来の記録があっても、保存直後に今日の Day(B)から A へ戻らない", () => {
    const days = [{ name: "A" }, { name: "B" }];
    expect(stalestDayIndex(days, futureWorkouts(), 1, { includeFrom: true, now: justAfterSave })).toBe(1);
  });

  it("既定でも、未来の記録を丸めたうえで今日の Day(A)を外して B を返す", () => {
    const days = [{ name: "A" }, { name: "B" }];
    expect(stalestDayIndex(days, futureWorkouts(), 0, { now: justAfterSave })).toBe(1);
  });

  it("全部の記録が未来なら、どれも now と同じ扱いの同点になり、並び順で決まる", () => {
    const workouts = [
      sampleWorkout({ date: "2099-01-01T09:00:00.000Z", session: "Push" }),
      sampleWorkout({ date: "2099-06-01T09:00:00.000Z", session: "Pull" }),
      sampleWorkout({ date: "2098-01-01T09:00:00.000Z", session: "Legs" }),
    ];
    expect(stalestDayIndex(ppl(), workouts, 1, { includeFrom: true, now: justAfterSave })).toBe(1);
    expect(stalestDayIndex(ppl(), workouts, 1, { now: justAfterSave })).toBe(2);
    expect(stalestDayIndex(ppl(), workouts, 2, { now: justAfterSave })).toBe(0);
  });
});

// 内転筋(2026-10 に部位を追加)を、保存済みの分割の脚の Day に1回だけ足す移行。
// 足さないと、脚の Day でアダクションを入れたときに「今日の部位外」のバッジが出る。
// 逆に印(adductorV1)を見ずに足すと、利用者が内転筋を外しても読み込みのたびに戻ってくる。
// 新しく作る分割には最初から印を付けて、この移行を通さない(下の「#appsrc の配線」で縛る)。
// 「脚の Day」の判定は 大腿四頭筋 か 臀部 を含むこと。ハムストリングス・ふくらはぎだけの Day は対象外とする
// (実装の判定式どおり。ここを変えるなら、このテストも仕様として見直すこと)。
const sampleSplit = (overrides = {}) => ({
  name: "PPL",
  cursor: 0,
  days: [
    { name: "Push", muscles: ["大胸筋", "三角筋前部", "上腕三頭筋"] },
    { name: "Pull", muscles: ["広背筋", "上腕二頭筋"] },
    { name: "Legs", muscles: ["大腿四頭筋", "ハムストリングス", "ふくらはぎ"] },
  ],
  ...overrides,
});

describe("addAdductorDays(内転筋を脚の Day に足す移行)", () => {
  it("大腿四頭筋を含む Day に内転筋を1回だけ足す", () => {
    const out = addAdductorDays(sampleSplit());
    expect(out.days[2].muscles).toEqual(["大腿四頭筋", "ハムストリングス", "ふくらはぎ", "内転筋"]);
  });

  it("臀部を含む Day にも足す", () => {
    const out = addAdductorDays(sampleSplit({ days: [{ name: "尻", muscles: ["臀部", "ハムストリングス"] }] }));
    expect(out.days[0].muscles).toEqual(["臀部", "ハムストリングス", "内転筋"]);
  });

  it("上半身の Day には足さない", () => {
    const out = addAdductorDays(sampleSplit());
    expect(out.days[0].muscles).toEqual(["大胸筋", "三角筋前部", "上腕三頭筋"]);
    expect(out.days[1].muscles).toEqual(["広背筋", "上腕二頭筋"]);
  });

  it("全身の Day には、大腿四頭筋や臀部を含んでいても足さない", () => {
    const out = addAdductorDays(sampleSplit({ days: [
      { name: "全身", muscles: ["全身"] },
      { name: "全身+脚", muscles: ["全身", "大腿四頭筋", "臀部"] },
    ] }));
    expect(out.days[0].muscles).toEqual(["全身"]);
    expect(out.days[1].muscles).toEqual(["全身", "大腿四頭筋", "臀部"]);
  });

  it("ハムストリングスやふくらはぎだけの Day には足さない", () => {
    const out = addAdductorDays(sampleSplit({ days: [{ name: "ハム", muscles: ["ハムストリングス", "ふくらはぎ"] }] }));
    expect(out.days[0].muscles).toEqual(["ハムストリングス", "ふくらはぎ"]);
  });

  it("足した後は adductorV1 を立てる", () => {
    expect(addAdductorDays(sampleSplit()).adductorV1).toBe(true);
  });

  it("adductorV1 が立っていたら何もしない(利用者が外した後に足し直さない)", () => {
    const removed = sampleSplit({ adductorV1: true });
    expect(addAdductorDays(removed)).toBe(removed);
    expect(addAdductorDays(removed).days[2].muscles).not.toContain("内転筋");
  });

  it("2回通しても内転筋は1つだけ", () => {
    const twice = addAdductorDays(addAdductorDays(sampleSplit()));
    expect(twice.days[2].muscles.filter(m => m === "内転筋")).toHaveLength(1);
  });

  it("印が無くても、すでに内転筋を含む Day には二重に足さない", () => {
    const out = addAdductorDays(sampleSplit({ days: [{ name: "脚", muscles: ["大腿四頭筋", "内転筋"] }] }));
    expect(out.days[0].muscles).toEqual(["大腿四頭筋", "内転筋"]);
  });

  it("名前・cursor・部位以外の Day の中身(登録した種目)はそのまま残す", () => {
    const exercises = ["バーベルスクワット", "レッグプレス"];
    const out = addAdductorDays(sampleSplit({ name: "自作", cursor: 2, days: [{ name: "脚", muscles: ["大腿四頭筋"], exercises }] }));
    expect(out.name).toBe("自作");
    expect(out.cursor).toBe(2);
    expect(out.days[0].name).toBe("脚");
    expect(out.days[0].exercises).toEqual(exercises);
  });

  it("受け取った分割を書き換えない", () => {
    const sp = sampleSplit();
    const before = JSON.parse(JSON.stringify(sp));
    addAdductorDays(sp);
    expect(sp).toEqual(before);
  });

  it("muscles の無い Day や days の無い分割でも落ちない", () => {
    expect(addAdductorDays(sampleSplit({ days: [{ name: "Day 1" }] })).days[0]).toEqual({ name: "Day 1" });
    expect(addAdductorDays({ name: "空" }).days).toEqual([]);
  });

  it("null を受けたら null を返す", () => {
    expect(addAdductorDays(null)).toBe(null);
  });
});

// npm test は index.html を実行しないので、新しく分割を作る経路が印を付け忘れても単体テストは緑のまま。
// 付け忘れると、作った直後の分割が次の読み込みで migrateSplit を通り、利用者が外した内転筋が戻ってくる。
// そこで #appsrc をテキストとして検査する(tests/exerciseCoefficients.test.js の「係数の配線」と同じ発想)。
describe("#appsrc の配線(新しく作る分割は移行を通さない)", () => {
  const appsrc = html.slice(html.indexOf('id="appsrc"'))
    .split("\n").filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
  const splitLiteralOf = (name) => appsrc.match(new RegExp(`split: \\{ name: ${name},[^\\n]*`))?.[0];

  it("マイメニューとして保存する分割に adductorV1: true を付けている", () => {
    expect(splitLiteralOf('"マイメニュー"')).toMatch(/adductorV1: true/);
  });

  it("プリセットから作る分割に adductorV1: true を付けている", () => {
    expect(splitLiteralOf("preset\\.name")).toMatch(/adductorV1: true/);
  });

  it("カスタム分割に adductorV1: true を付けている", () => {
    expect(splitLiteralOf('"カスタム分割"')).toMatch(/adductorV1: true/);
  });

  it("読み込み時の migrateSplit が addAdductorDays を通している", () => {
    expect(appsrc).toMatch(/const migrateSplit = [^\n]*addAdductorDays\(/);
  });
});

describe("dayMenuNames(今日のメニューの種目)", () => {
  const { dayMenuNames } = loadDomainModule("src/domain/dayPlan.js");

  it("前回の記録があれば、登録に残っていても前回やらなかった種目は出さない(2026-10-20、多すぎた)", () => {
    expect(dayMenuNames(["A", "B", "C", "D", "E"], ["A", "C"])).toEqual(["A", "C"]);
  });

  it("前回やって登録に無い種目も、前回の位置で出す", () => {
    expect(dayMenuNames(["A", "B"], ["X", "A", "Y"])).toEqual(["X", "A", "Y"]);
  });

  it("登録にもある種目どうしは登録の順(分割タブの ▲▼)に入れ替え、ほかの種目の位置は動かさない", () => {
    expect(dayMenuNames(["C", "B", "A"], ["A", "X", "B", "C"])).toEqual(["C", "X", "B", "A"]);
  });

  it("前回の同じ種目が2回あっても1回だけ", () => {
    expect(dayMenuNames([], ["A", "B", "A"])).toEqual(["A", "B"]);
  });

  it("前回の記録が無い Day は登録の順", () => {
    expect(dayMenuNames(["B", "A"], [])).toEqual(["B", "A"]);
    expect(dayMenuNames(["B", "A"], undefined)).toEqual(["B", "A"]);
  });

  it("どちらも無ければ null(呼び出し側で部位一致の履歴から組む)", () => {
    expect(dayMenuNames([], [])).toBeNull();
    expect(dayMenuNames(undefined, undefined)).toBeNull();
  });
});
