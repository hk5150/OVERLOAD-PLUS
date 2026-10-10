import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { extractCoachPlan, validateCoachPlan, makeCoachNameResolver, mergeCoachPlan, coachNameKey } =
  loadDomainModule("src/domain/aiCoach.js");

const CATALOG = [
  { name: "ダンベルショルダープレス", labels: ["Dumbbell Shoulder Press"] },
  { name: "サイドレイズ", labels: ["Lateral Raise"] },
  { name: "リアレイズ", labels: ["Rear Delt Raise"] },
  { name: "ラットプルダウン(リバース)", labels: [] },
  { name: "ラットプルダウン", labels: [] },
];
const resolveName = makeCoachNameResolver(CATALOG);
const opts = { resolveName, weightInRange: w => w >= 0 && w <= 2000, maxReps: 100 };
const BLOCK = '{"kurabell":1,"day":"肩","exercises":[{"name":"ダンベルショルダープレス","sets":[{"w":24,"r":10},{"w":22,"r":10}]},{"name":"サイドレイズ","sets":[{"w":10,"r":15,"wu":true},{"w":18,"r":8}]}]}';

describe("答えから案のブロックを探す", () => {
  it("説明文とコードブロックに挟まれていても読む(ChatGPT・Claude の典型)", () => {
    const text = `前回は後半で回数が落ちているので…\n\n\`\`\`kurabell\n${BLOCK}\n\`\`\`\n\n無理のない範囲で。`;
    const r = extractCoachPlan(text);
    expect(r.ok).toBe(true);
    expect(r.plan.exercises).toHaveLength(2);
  });

  it("コードブロックの中身だけをコピーしてきても読む", () => {
    expect(extractCoachPlan(BLOCK).ok).toBe(true);
  });

  it("目印が無くても exercises があれば読む。中の小さなオブジェクトに引っかからない", () => {
    const r = extractCoachPlan('案です {"day":"肩","exercises":[{"name":"サイドレイズ","sets":[{"w":18,"r":8}]}]}');
    expect(r.ok).toBe(true);
    expect(r.plan.exercises[0].name).toBe("サイドレイズ");
  });

  it("全角の記号・数字、「“”」の引用符、末尾のカンマを直して読む", () => {
    const text = '｛“kurabell”：１，“exercises”：［｛“name”：“サイドレイズ”，“sets”：［｛“w”：１８，“r”：８｝，］｝］｝';
    const r = extractCoachPlan(text);
    expect(r.ok).toBe(true);
    expect(r.plan.exercises[0].sets[0]).toEqual({ w: 18, r: 8 });
  });

  it("前に別の JSON があっても、exercises を持つ方を拾う", () => {
    const r = extractCoachPlan(`{"note":"x"}\n${BLOCK}`);
    expect(r.ok).toBe(true);
  });

  it("空・見つからない・途中で切れたコピーは失敗として返す", () => {
    expect(extractCoachPlan("  ").error).toBe("empty");
    expect(extractCoachPlan("今日は休みましょう").error).toBe("notFound");
    expect(extractCoachPlan(BLOCK.slice(0, 60)).error).toBe("notFound");
  });
});

describe("種目名の照合", () => {
  it("英語の表示名・空白や全角の違い・括弧の注記でも、保存用の名前に引ける", () => {
    expect(resolveName("Lateral Raise")).toBe("サイドレイズ");
    expect(resolveName("lateral  raise")).toBe("サイドレイズ");
    expect(resolveName("サイドレイズ(片手)")).toBe("サイドレイズ");
    expect(resolveName("ダンベル ショルダープレス")).toBe("ダンベルショルダープレス");
  });

  it("括弧つきの正式名は、注記を消した別の種目より先に当たる", () => {
    expect(resolveName("ラットプルダウン(リバース)")).toBe("ラットプルダウン(リバース)");
    expect(resolveName("ラットプルダウン")).toBe("ラットプルダウン");
  });

  it("アプリに無い種目は null", () => {
    expect(resolveName("ケトルベルスイング")).toBe(null);
    expect(resolveName(undefined)).toBe(null);
  });

  it("キーは括弧の記号を無視する", () => {
    expect(coachNameKey("A (B)")).toBe(coachNameKey("a b"));
  });
});

describe("案を取り込める形に絞る", () => {
  it("重量の文字列・別名のキー・'24x10' の文字列も読み、ウォームアップの印を持つ", () => {
    const plan = { exercises: [
      { name: "サイドレイズ", sets: [{ weight: "10kg", reps: "15回", warmup: true }, "18x8", { w: 18, r: 7.6 }] },
    ] };
    const r = validateCoachPlan(plan, opts);
    expect(r.exercises[0].sets).toEqual([{ w: 10, r: 15, wu: true }, { w: 18, r: 8, wu: false }, { w: 18, r: 8, wu: false }]);
    expect(r.dropped).toBe(0);
  });

  it("アプリに無い種目は取り込まずに名前を返す", () => {
    const r = validateCoachPlan({ exercises: [{ name: "ケトルベルスイング", sets: [{ w: 16, r: 15 }] }, { name: "サイドレイズ", sets: [{ w: 18, r: 8 }] }] }, opts);
    expect(r.exercises.map(e => e.name)).toEqual(["サイドレイズ"]);
    expect(r.unknown).toEqual(["ケトルベルスイング"]);
  });

  it("範囲外・読めない値のセットは捨てて数える。セットが残らない種目は入れない", () => {
    const plan = { exercises: [
      { name: "サイドレイズ", sets: [{ w: -5, r: 8 }, { w: 18, r: 0 }, { w: 18, r: 500 }, { w: 3000, r: 8 }, { w: "重め", r: 8 }, { w: 18, r: 8 }] },
      { name: "リアレイズ", sets: [{ w: 8, r: 0 }] },
    ] };
    const r = validateCoachPlan(plan, opts);
    expect(r.exercises).toHaveLength(1);
    expect(r.exercises[0].sets).toEqual([{ w: 18, r: 8, wu: false }]);
    expect(r.dropped).toBe(6);
  });

  it("AI が RIR を書いてきても読まない(RIR が入る=実施済みになってしまう)", () => {
    const r = validateCoachPlan({ exercises: [{ name: "サイドレイズ", sets: [{ w: 18, r: 8, rir: 1 }] }] }, opts);
    expect(r.exercises[0].sets[0]).not.toHaveProperty("rir");
  });

  it("同じ種目が2回出てきたら後の方を捨てる", () => {
    const r = validateCoachPlan({ exercises: [
      { name: "サイドレイズ", sets: [{ w: 18, r: 8 }] }, { name: "Lateral Raise", sets: [{ w: 15, r: 10 }, { w: 15, r: 10 }] },
    ] }, opts);
    expect(r.exercises).toHaveLength(1);
    expect(r.dropped).toBe(2);
  });
});

describe("案を today に合わせる", () => {
  let n = 0;
  const newExercise = (name) => ({ id: `new${++n}`, name, sets: [] });
  const set = (weight, reps, rir = "", warmup = false) => ({ weight, reps, rir, warmup });
  const plan = (...exs) => ({ exercises: exs.map(([name, sets]) => ({ name, sets: sets.map(([w, r, wu]) => ({ w, r, wu: !!wu })) })) });

  it("始める前(today が空)は、案がそのまま today になる。RIR は空、重量・回数は文字列", () => {
    const t = mergeCoachPlan([], plan(["サイドレイズ", [[10, 15, true], [18, 8]]]), { newExercise });
    expect(t).toHaveLength(1);
    expect(t[0].sets).toEqual([set("10", "15", "", true), set("18", "8")]);
  });

  it("実施済みの行までは触らず、その後ろだけを置き換える。種目の id は保つ", () => {
    const today = [{ id: "a", name: "サイドレイズ", sets: [set("10", "15", "", true), set("18", "8", "1"), set("18", "8"), set("18", "8")] }];
    const t = mergeCoachPlan(today, plan(["サイドレイズ", [[15, 12], [15, 12]]]), { newExercise });
    expect(t[0].id).toBe("a");
    expect(t[0].sets.slice(0, 2)).toEqual(today[0].sets.slice(0, 2));
    expect(t[0].sets.slice(2)).toEqual([set("15", "12"), set("15", "12")]);
  });

  it("実施済みの行の間にある未実施の行は動かさない(Watch の入力は行番号で届くため)", () => {
    const today = [{ id: "a", name: "サイドレイズ", sets: [set("18", "8", "1"), set("18", "8"), set("18", "8", "0"), set("18", "8")] }];
    const t = mergeCoachPlan(today, plan(["サイドレイズ", [[15, 12]]]), { newExercise });
    expect(t[0].sets.slice(0, 3)).toEqual(today[0].sets.slice(0, 3));
    expect(t[0].sets[3]).toEqual(set("15", "12"));
  });

  it("案に無い種目は、実施済みがあれば残し、無ければ外す。残す種目が先、そのあと案の順", () => {
    const today = [
      { id: "a", name: "ダンベルショルダープレス", sets: [set("24", "10", "2")] },
      { id: "b", name: "リアレイズ", sets: [set("8", "15")] },
      { id: "c", name: "サイドレイズ", sets: [set("18", "8")] },
    ];
    const t = mergeCoachPlan(today, plan(["サイドレイズ", [[18, 8]]], ["フェイスプル", [[20, 15]]]), { newExercise });
    expect(t.map(e => e.name)).toEqual(["ダンベルショルダープレス", "サイドレイズ", "フェイスプル"]);
    expect(t[0]).toBe(today[0]);
    expect(t[1].id).toBe("c");
    expect(t[2].id).toMatch(/^new/);
  });

  it("案のどのセットにも RIR が入らない", () => {
    const today = [{ id: "a", name: "サイドレイズ", sets: [set("18", "8", "1")] }];
    const t = mergeCoachPlan(today, plan(["サイドレイズ", [[18, 8], [15, 10]]], ["リアレイズ", [[8, 15]]]), { newExercise });
    const added = [...t[0].sets.slice(1), ...t[1].sets];
    expect(added.every(s => s.rir === "")).toBe(true);
  });

  it("片割れが外れたスーパーセットの印は外す", () => {
    const today = [
      { id: "a", name: "サイドレイズ", ssGroup: "g", sets: [set("18", "8")] },
      { id: "b", name: "リアレイズ", ssGroup: "g", sets: [set("8", "15")] },
    ];
    const t = mergeCoachPlan(today, plan(["サイドレイズ", [[18, 8]]]), { newExercise });
    expect(t).toHaveLength(1);
    expect(t[0]).not.toHaveProperty("ssGroup");
  });
});

describe("レビューで見つかった穴", () => {
  const { revertCoachPlan } = loadDomainModule("src/domain/aiCoach.js");
  const set = (weight, reps, rir = "") => ({ weight, reps, rir, warmup: false });

  it("説明文に閉じていない { があっても、後ろの正しいブロックを読む", () => {
    const r = extractCoachPlan(`重量は{前回より上げる方針です。\n${BLOCK}`);
    expect(r.ok).toBe(true);
    expect(r.plan.exercises).toHaveLength(2);
  });

  it("相談文の見本ごと貼られても、目印付きの最後のブロック(AIの答え)を採る", () => {
    const example = '{"kurabell":1,"exercises":[{"name":"一覧の種目名","sets":[{"w":40,"r":10}]}]}';
    const r = extractCoachPlan(`相談文…\n${example}\n…\nAIの答え:\n${BLOCK}`);
    expect(r.plan.exercises[0].name).toBe("ダンベルショルダープレス");
  });

  it("目印の無い例より、目印付きのブロックを優先する", () => {
    const r = extractCoachPlan(`${BLOCK}\n例: {"exercises":[{"name":"x","sets":[]}]}`);
    expect(r.plan.kurabell).toBe(1);
  });

  it("並び替えで隣から離れたスーパーセットの印は外す", () => {
    const today = [
      { id: "a", name: "A", ssGroup: "g", sets: [set("10", "10", "1")] },
      { id: "b", name: "B", ssGroup: "g", sets: [set("10", "10")] },
      { id: "c", name: "C", sets: [set("10", "10", "1")] },
    ];
    const t = mergeCoachPlan(today, { exercises: [{ name: "B", sets: [{ w: 10, r: 10, wu: false }] }] }, { newExercise: (n) => ({ id: "n", name: n, sets: [] }) });
    expect(t.map(e => e.name)).toEqual(["A", "C", "B"]);
    expect(t.every(e => !("ssGroup" in e))).toBe(true);
  });

  it("元に戻すとき、その間にセットを終えた種目は今のまま残し、他は当てる前に戻す", () => {
    const before = [
      { id: "a", name: "A", sets: [set("10", "10", "1"), set("10", "10")] },
      { id: "b", name: "B", sets: [set("20", "8")] },
    ];
    const current = [
      { id: "a", name: "A", sets: [set("10", "10", "1"), set("12", "8")] },
      { id: "b", name: "B", sets: [set("18", "10", "2")] }, // 5秒の間に終えた
      { id: "n1", name: "N", sets: [set("5", "15", "0")] }, // 案で入って、もう終えた
      { id: "n2", name: "M", sets: [set("5", "15")] },
    ];
    const r = revertCoachPlan(before, current);
    expect(r.map(e => e.id)).toEqual(["a", "b", "n1"]);
    expect(r[0]).toBe(before[0]);
    expect(r[1]).toBe(current[1]);
  });
});

describe("重量は 1kg 刻み(2026-10-10)", () => {
  it("weightStep を渡すと、その単位に丸めて数える", () => {
    const r = validateCoachPlan({ exercises: [{ name: "サイドレイズ", sets: [{ w: 22.5, r: 8 }, { w: 20, r: 10 }, { w: 17.4, r: 12 }] }] },
      { ...opts, weightStep: 1 });
    expect(r.exercises[0].sets.map(s => s.w)).toEqual([23, 20, 17]);
    expect(r.rounded).toBe(2);
  });
  it("lb は 2.5 刻み", () => {
    const r = validateCoachPlan({ exercises: [{ name: "サイドレイズ", sets: [{ w: 46, r: 8 }] }] }, { ...opts, weightStep: 2.5 });
    expect(r.exercises[0].sets[0].w).toBe(45);
  });
  it("渡さなければ丸めない", () => {
    const r = validateCoachPlan({ exercises: [{ name: "サイドレイズ", sets: [{ w: 22.5, r: 8 }] }] }, opts);
    expect(r.exercises[0].sets[0].w).toBe(22.5);
    expect(r.rounded).toBe(0);
  });
});
