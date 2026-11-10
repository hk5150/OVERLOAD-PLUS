import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// src/domain/insight.js は「前回の実績をそのまま見せて判断はユーザーに委ねる」の中心にある
// 判断材料(前回のトップセット・連続回数・推移・そろそろ上げどきか)を組み立てる。
//
// なぜテストが要るか: このファイルは #appsrc の中にあったため、誤りが実データでしか
// 露見せず、実際にユーザーの実記録で2件の不具合を出した。移設の動機がその2件なので、
// ここを最優先で縛る。
//   (1) 同じ日に 15kg×8 / 15kg×9 / 15kg×8 をやっているのに、先頭優先で代表を採っていたため
//       推移に「15×8」と出て、達成した 15×9 が消えていた
//   (2) 15kg が3セッション続き、トップ回数が 13 → 8 → 9 と落ちている最中に
//       「そろそろ上げどき」と出ていた(回数が後退している間に重量を上げるのは順序が逆)
// あわせて、比較範囲を直近3セッションに限る意図(ずっと前の突出した1回が「上げどき」を
// 無期限にブロックしないこと)と、文字列で保存された weight/reps の辞書順比較事故も縛る。
// 辞書順は "9" > "15" になるため、旧データやバックアップ復元経由の記録でトップセットを
// 取り違える。これは実データで踏み得るのに画面上は「ただの別の行」に見えて気づけない。
//
// streak を停滞アラートに流用している経緯は docs/vite移行.md の「5. 停滞アラート(7番、新機能)」、
// 同名種目を1日に2枚持てないようにした経緯は docs/AppStore提出準備.md の
// 「6. 種目名の重複防止」に対応する。
//
// 対象外: 画面表示(#appsrc側)と、isDbOf の中身(種目マスターの解決は coefficients.js の責務)。
// workouts は保存順(古い順)に並んでいる前提。この前提自体は #appsrc の saveWorkout の責務。

const { exerciseInsight, topSetOf, workoutScore } = loadDomainModule("src/domain/insight.js");

const NAME = "ラットプルダウン";

const sampleSet = (overrides = {}) => ({ weight: 15, reps: 8, rir: 2, warmup: false, assisted: false, ...overrides });

// 1日分の記録。sets には {weight, reps} の組を並べる。
const sampleWorkout = (overrides = {}) => {
  const { date = "2026-09-01", name = NAME, sets = [sampleSet()], ...exOverrides } = overrides;
  return { date, exercises: [{ name, sets, ...exOverrides }] };
};

// 「その日のトップセットが weight×reps だった日」を並べるための省略記法(古い順に渡す)。
const sessions = (tops) => tops.map(([weight, reps], i) =>
  sampleWorkout({ date: `2026-09-0${i + 1}`, sets: [sampleSet({ weight, reps })] }));

describe("topSetOf (その日を代表する1セット。ここが崩れると推移とPRの見え方が丸ごとずれる)", () => {
  // 実データで踏んだ不具合(1)。
  it("同じ重量なら回数が多いセットを代表にする(15×8 / 15×9 / 15×8 の日は15×9)", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ reps: 8 }), sampleSet({ reps: 9 }), sampleSet({ reps: 8 })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: 15, reps: 9 });
  });

  it("重量が違えば重い方を代表にする(回数が少なくても)", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ weight: 15, reps: 12 }), sampleSet({ weight: 20, reps: 5 })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: 20, reps: 5 });
  });

  it("ウォームアップは代表にしない", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ weight: 40, reps: 15, warmup: true }), sampleSet({ weight: 15, reps: 8 })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: 15, reps: 8 });
  });

  it("補助ありセットは代表にしない(自力で挙げた実力を表さないため)", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ weight: 40, reps: 10, assisted: true }), sampleSet({ weight: 15, reps: 8 })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: 15, reps: 8 });
  });

  it("回数0のセットは代表にしない(まだやっていないセット)", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ weight: 40, reps: 0 }), sampleSet({ weight: 15, reps: 8 })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: 15, reps: 8 });
  });

  it("回数が未入力・空文字のセットも代表にしない", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ weight: 40, reps: "" }), sampleSet({ weight: 50, reps: undefined }), sampleSet({ weight: 15, reps: 8 })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: 15, reps: 8 });
  });

  it("全セットが除外対象ならnull", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ warmup: true }), sampleSet({ assisted: true }), sampleSet({ reps: 0 })] }).exercises[0];
    expect(topSetOf(ex)).toBe(null);
  });

  it("セットが空、setsが無い種目もnull", () => {
    expect(topSetOf({ name: NAME, sets: [] })).toBe(null);
    expect(topSetOf({ name: NAME })).toBe(null);
  });

  // 辞書順だと "9" > "15" になり、9kgの方をトップセットに採ってしまう。
  it("文字列で保存された重量を数値として比べる(\"9\"と\"15\"を辞書順で比べない)", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ weight: "9", reps: "10" }), sampleSet({ weight: "15", reps: "5" })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: "15", reps: "5" });
  });

  it("文字列で保存された回数も数値として比べる(\"8\"と\"10\"を辞書順で比べない)", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ weight: "15", reps: "8" }), sampleSet({ weight: "15", reps: "10" })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: "15", reps: "10" });
  });

  it("小数の重量も数値として比べる(2.5と10を辞書順で比べない)", () => {
    const ex = sampleWorkout({ sets: [sampleSet({ weight: "2.5", reps: 12 }), sampleSet({ weight: "10", reps: 12 })] }).exercises[0];
    expect(topSetOf(ex)).toMatchObject({ weight: "10" });
  });
});

describe("exerciseInsight の境界(記録が無いときに画面へ出すものが無いこと)", () => {
  it("記録が0件ならnull", () => {
    expect(exerciseInsight([], NAME)).toBe(null);
  });

  it("workoutsがnull/undefinedでも落ちずにnull", () => {
    expect(exerciseInsight(null, NAME)).toBe(null);
    expect(exerciseInsight(undefined, NAME)).toBe(null);
  });

  it("その種目の記録が1件も無ければnull", () => {
    expect(exerciseInsight(sessions([[15, 8]]), "ベンチプレス")).toBe(null);
  });

  it("種目名は完全一致で探す(部分一致で別種目を拾わない)", () => {
    const ws = [sampleWorkout({ name: "ダンベルカール" })];
    expect(exerciseInsight(ws, "カール")).toBe(null);
    expect(exerciseInsight(ws, "ダンベルカール")).not.toBe(null);
  });

  // 代表セットが取れない日でも、前回の日付とセット内容は返す。
  // ここでnullを返していた頃は、その日の全セットに「補助あり」を付けただけで
  // セット行のゴースト表示まで消え、「前回の実績をそのまま見せる」中心機能が働かなかった。
  // 補助ありは保存時のフィルタ(!s.warmup)を通るので、通常操作で到達する。
  it("直近セッションが全て補助ありでも、前回の日付とセットは返す", () => {
    const ws = [
      sampleWorkout({ date: "2026-09-01", sets: [sampleSet({ weight: 15, reps: 8 })] }),
      sampleWorkout({ date: "2026-09-02", sets: [sampleSet({ weight: 0, reps: 12, assisted: true })] }),
    ];
    const ins = exerciseInsight(ws, NAME);
    expect(ins).not.toBe(null);
    expect(ins.date).toBe("2026-09-02");
    expect(ins.sets).toHaveLength(1); // ゴースト表示の入力。補助ありは実施した事実として残す
    expect(ins.sets[0].assisted).toBe(true);
  });

  it("代表セットが取れない日は、重量まわりの判断材料をnull・0で返す", () => {
    const ws = [
      sampleWorkout({ date: "2026-09-01", sets: [sampleSet({ weight: 15, reps: 8 })] }),
      sampleWorkout({ date: "2026-09-02", sets: [sampleSet({ weight: 0, reps: 12, assisted: true })] }),
    ];
    const ins = exerciseInsight(ws, NAME);
    expect(ins.topWeight).toBe(null);
    expect(ins.topReps).toBe(null);
    expect(ins.streak).toBe(0);
    expect(ins.readyToProgress).toBe(false);
  });

  it("直近が全て補助ありでも、それ以前のセッションの推移は出す", () => {
    const ws = [
      sampleWorkout({ date: "2026-09-01", sets: [sampleSet({ weight: 15, reps: 8 })] }),
      sampleWorkout({ date: "2026-09-03", sets: [sampleSet({ weight: 15, reps: 10 })] }),
      sampleWorkout({ date: "2026-09-05", sets: [sampleSet({ weight: 0, reps: 12, assisted: true })] }),
    ];
    const ins = exerciseInsight(ws, NAME);
    expect(ins.trend).toEqual([{ weight: 15, reps: 8 }, { weight: 15, reps: 10 }]);
  });

  // 直近セッションが全てウォームアップの場合(保存時のフィルタで潰されるので通常は到達しない)。
  it("直近セッションが全てウォームアップでも、日付は返す(セットは空になる)", () => {
    const ws = [
      sampleWorkout({ date: "2026-09-01", sets: [sampleSet({ weight: 15, reps: 8 })] }),
      sampleWorkout({ date: "2026-09-02", sets: [sampleSet({ weight: 15, reps: 8, warmup: true })] }),
    ];
    const ins = exerciseInsight(ws, NAME);
    expect(ins).not.toBe(null);
    expect(ins.date).toBe("2026-09-02");
    expect(ins.sets).toEqual([]);
    expect(ins.topWeight).toBe(null);
  });

  // docs/AppStore提出準備.md の「6. 種目名の重複防止」の前提。同名2枚目は死蔵する。
  it("同じ日に同名の種目が2枚あると1枚目しか見ない", () => {
    const ws = [{
      date: "2026-09-01",
      exercises: [
        { name: NAME, sets: [sampleSet({ weight: 15, reps: 8 })] },
        { name: NAME, sets: [sampleSet({ weight: 30, reps: 3 })] },
      ],
    }];
    expect(exerciseInsight(ws, NAME).topWeight).toBe(15);
  });
});

describe("前回の記録として返す内容", () => {
  it("直近のセッションの日付・トップ重量・トップ回数・トップのRIRを返す", () => {
    const ws = [
      sampleWorkout({ date: "2026-09-01", sets: [sampleSet({ weight: 12.5, reps: 10, rir: 3 })] }),
      sampleWorkout({ date: "2026-09-03", sets: [sampleSet({ weight: 15, reps: 9, rir: 1 })] }),
    ];
    const ins = exerciseInsight(ws, NAME);
    expect(ins.date).toBe("2026-09-03");
    expect(ins.topWeight).toBe(15);
    expect(ins.topReps).toBe(9);
    expect(ins.topRir).toBe(1);
  });

  it("RIRは先頭セットではなくトップセットのものを返す", () => {
    const ws = [sampleWorkout({ sets: [sampleSet({ weight: 15, reps: 8, rir: 3 }), sampleSet({ weight: 15, reps: 9, rir: 0 })] })];
    expect(exerciseInsight(ws, NAME).topRir).toBe(0);
  });

  it("文字列で保存された重量・回数は数値にして返す", () => {
    const ws = [sampleWorkout({ sets: [sampleSet({ weight: "15", reps: "9" })] })];
    const ins = exerciseInsight(ws, NAME);
    expect(ins.topWeight).toBe(15);
    expect(ins.topReps).toBe(9);
  });

  it("setsはウォームアップだけを除いて返す(補助ありは実施した事実として残す)", () => {
    const ws = [sampleWorkout({ sets: [
      sampleSet({ weight: 5, reps: 15, warmup: true }),
      sampleSet({ weight: 15, reps: 8, assisted: true }),
      sampleSet({ weight: 15, reps: 8 }),
    ] })];
    expect(exerciseInsight(ws, NAME).sets).toHaveLength(2);
  });
});

describe("isDb (ダンベル判定は種目マスターの解決結果を使う)", () => {
  it("第3引数のisDbOfに種目名と保存値を渡し、その結果を入れる", () => {
    const calls = [];
    const isDbOf = (name, stored) => { calls.push([name, stored]); return true; };
    const ws = [sampleWorkout({ isDb: false })];
    expect(exerciseInsight(ws, NAME, isDbOf).isDb).toBe(true);
    expect(calls).toContainEqual([NAME, false]);
  });

  it("isDbOfを渡さなければ記録側のisDbにフォールバックする", () => {
    expect(exerciseInsight([sampleWorkout({ isDb: true })], NAME).isDb).toBe(true);
    expect(exerciseInsight([sampleWorkout({ isDb: false })], NAME).isDb).toBe(false);
    expect(exerciseInsight([sampleWorkout({})], NAME).isDb).toBe(false);
  });
});

describe("streak (同じトップ重量が何回続いたか。停滞アラートの根拠)", () => {
  it("同じ重量が続いた回数を直近から数える", () => {
    expect(exerciseInsight(sessions([[15, 8], [15, 9], [15, 10]]), NAME).streak).toBe(3);
  });

  it("重量が変わった時点で止まる(それ以前に同じ重量があっても数え直さない)", () => {
    expect(exerciseInsight(sessions([[15, 8], [12.5, 10], [15, 8], [15, 9]]), NAME).streak).toBe(2);
  });

  it("直近で重量を上げた直後は1", () => {
    expect(exerciseInsight(sessions([[15, 10], [15, 12], [17.5, 6]]), NAME).streak).toBe(1);
  });

  it("間にトップセットの無い日(全てウォームアップ)が挟まると、そこで止まる", () => {
    const ws = [
      sampleWorkout({ date: "2026-09-01", sets: [sampleSet({ weight: 15, reps: 8 })] }),
      sampleWorkout({ date: "2026-09-02", sets: [sampleSet({ weight: 15, reps: 8, warmup: true })] }),
      sampleWorkout({ date: "2026-09-03", sets: [sampleSet({ weight: 15, reps: 9 })] }),
    ];
    expect(exerciseInsight(ws, NAME).streak).toBe(1);
  });

  it("文字列で保存された重量でも同じ重量として数える", () => {
    const ws = sessions([["15", 8], [15, 9], ["15", 10]]);
    expect(exerciseInsight(ws, NAME).streak).toBe(3);
  });
});

describe("trend (推移。重量だけだと回数の後退が横ばいに見える)", () => {
  it("古い順に{weight, reps}を並べる", () => {
    const ins = exerciseInsight(sessions([[12.5, 10], [15, 8], [15, 9]]), NAME);
    expect(ins.trend).toEqual([
      { weight: 12.5, reps: 10 },
      { weight: 15, reps: 8 },
      { weight: 15, reps: 9 },
    ]);
  });

  it("最大4件までで、それより古いセッションは落とす", () => {
    const ins = exerciseInsight(sessions([[5, 12], [7.5, 12], [10, 12], [12.5, 12], [15, 12], [17.5, 12]]), NAME);
    expect(ins.trend).toEqual([
      { weight: 10, reps: 12 },
      { weight: 12.5, reps: 12 },
      { weight: 15, reps: 12 },
      { weight: 17.5, reps: 12 },
    ]);
  });

  it("記録が1件だけなら1件だけ返す", () => {
    expect(exerciseInsight(sessions([[15, 8]]), NAME).trend).toEqual([{ weight: 15, reps: 8 }]);
  });

  // 実データで踏んだ不具合(1)が推移に出る形。15×9 を達成した日は 15×9 と出る。
  it("同じ日に15×8 / 15×9 / 15×8 をやった日は15×9として推移に出る", () => {
    const ws = [sampleWorkout({ sets: [sampleSet({ reps: 8 }), sampleSet({ reps: 9 }), sampleSet({ reps: 8 })] })];
    expect(exerciseInsight(ws, NAME).trend).toEqual([{ weight: 15, reps: 9 }]);
  });

  it("文字列で保存された重量・回数も数値に直して並べる", () => {
    const ins = exerciseInsight(sessions([["9", "10"], ["15", "8"]]), NAME);
    expect(ins.trend).toEqual([{ weight: 9, reps: 10 }, { weight: 15, reps: 8 }]);
  });
});

describe("readyToProgress / bestRecentReps (回数が落ちている最中に「上げどき」と言わない)", () => {
  // 実データで踏んだ不具合(2)。15kgのまま 13 → 8 → 9 と後退している最中だった。
  it("回数が落ちている間は上げどきにしない(15kgで13回→8回→9回)", () => {
    const ins = exerciseInsight(sessions([[15, 13], [15, 8], [15, 9]]), NAME);
    expect(ins.streak).toBe(3);
    expect(ins.bestRecentReps).toBe(13);
    expect(ins.readyToProgress).toBe(false);
  });

  it("前回が直近の最高以上なら上げどきにする(9回→9回→14回)", () => {
    const ins = exerciseInsight(sessions([[15, 9], [15, 9], [15, 14]]), NAME);
    expect(ins.bestRecentReps).toBe(14);
    expect(ins.readyToProgress).toBe(true);
  });

  it("最高と同じ回数でも上げどきにする(伸びが止まっただけで後退ではない)", () => {
    const ins = exerciseInsight(sessions([[15, 10], [15, 10]]), NAME);
    expect(ins.readyToProgress).toBe(true);
  });

  // 比較範囲を直近3セッションに限る意図。ずっと前の突出した1回が上げどきを無期限に
  // ブロックしないこと(実データの13回は、その重量を1セットしかやらなかった日の値だった)。
  it("4回前の突出した回数はbestRecentRepsに入らない(20回→9回→9回→9回で上げどきになる)", () => {
    const ins = exerciseInsight(sessions([[15, 20], [15, 9], [15, 9], [15, 9]]), NAME);
    expect(ins.streak).toBe(4);
    expect(ins.bestRecentReps).toBe(9);
    expect(ins.readyToProgress).toBe(true);
  });

  it("直近3セッション以内の落ち込みはブロックする(9回→20回→9回→9回)", () => {
    const ins = exerciseInsight(sessions([[15, 9], [15, 20], [15, 9], [15, 9]]), NAME);
    expect(ins.bestRecentReps).toBe(20);
    expect(ins.readyToProgress).toBe(false);
  });

  it("重量が違う日の回数は比較に混ぜない(streakで切れるため)", () => {
    // 12.5kgで20回できていても、15kgに上げた後の回数比較には影響しない
    const ins = exerciseInsight(sessions([[12.5, 20], [15, 8]]), NAME);
    expect(ins.bestRecentReps).toBe(8);
    expect(ins.readyToProgress).toBe(true);
  });

  it("記録が1件だけなら前回自身が最高なので上げどきになる", () => {
    const ins = exerciseInsight(sessions([[15, 8]]), NAME);
    expect(ins.bestRecentReps).toBe(8);
    expect(ins.readyToProgress).toBe(true);
  });

  it("文字列で保存された回数でも数値として比べる(\"9\"と\"13\"を辞書順で比べない)", () => {
    const ins = exerciseInsight(sessions([[15, "13"], [15, "8"], [15, "9"]]), NAME);
    expect(ins.bestRecentReps).toBe(13);
    expect(ins.readyToProgress).toBe(false);
  });
});

describe("canAddWeight (加重できない種目に重量の助言をしない)", () => {
  it("トップ重量が0なら加重の余地なしとする(腕立てなど)", () => {
    expect(exerciseInsight(sessions([[0, 20]]), NAME).canAddWeight).toBe(false);
  });

  it("重量が未入力・空文字でも加重の余地なしとする", () => {
    const ws = [sampleWorkout({ sets: [sampleSet({ weight: "", reps: 20 })] })];
    expect(exerciseInsight(ws, NAME).canAddWeight).toBe(false);
    expect(exerciseInsight(ws, NAME).topWeight).toBe(0);
  });

  it("加重があればtrue(自重種目に5kg足した日を含む)", () => {
    expect(exerciseInsight(sessions([[15, 8]]), NAME).canAddWeight).toBe(true);
    expect(exerciseInsight(sessions([[5, 12]]), NAME).canAddWeight).toBe(true);
    expect(exerciseInsight(sessions([[2.5, 12]]), NAME).canAddWeight).toBe(true);
  });

  // 前回1回だけで判断すると、加重できる種目を「できない」と誤判定する。
  it("前回がたまたま自重だけでも、推移の中に加重した日があればtrue", () => {
    expect(exerciseInsight(sessions([[15, 8], [0, 12]]), NAME).canAddWeight).toBe(true);
  });

  it("推移の全ての日が自重だけならfalse", () => {
    expect(exerciseInsight(sessions([[0, 20], [0, 22], [0, 25]]), NAME).canAddWeight).toBe(false);
  });

  // 代表セットが取れない日(全セット補助あり)でも、過去の加重から判定できる。
  it("直近が全て補助ありでも、それ以前に加重した日があればtrue", () => {
    const ws = [
      sampleWorkout({ date: "2026-09-01", sets: [sampleSet({ weight: 15, reps: 8 })] }),
      sampleWorkout({ date: "2026-09-02", sets: [sampleSet({ weight: 0, reps: 12, assisted: true })] }),
    ];
    expect(exerciseInsight(ws, NAME).canAddWeight).toBe(true);
  });
});

// ディロードの知らせ(1.4)。同じ重量が3回続き、3回ともトップセットが余力0で、直近の回数が伸びていないときだけ。
// 2026-08-23 に見送った「全体の RIR0 の割合」(docs/vite移行.md)とは別物。記録に見えている事実だけで決まる。
describe("stalledAtFailure(限界で止まっている)", () => {
  const withRir = (tops) => tops.map(([weight, reps, rir], i) =>
    sampleWorkout({ date: `2026-09-0${i + 1}`, sets: [sampleSet({ weight, reps, rir })] }));

  it("3回とも余力0で同じ回数なら真。このとき「上げどき」は出さない", () => {
    const ins = exerciseInsight(withRir([[24, 8, 0], [24, 8, 0], [24, 8, 0]]), NAME);
    expect(ins.stalledAtFailure).toBe(true);
    expect(ins.readyToProgress).toBe(false);
  });

  it("回数が落ちていても真(限界のまま後退している)", () => {
    expect(exerciseInsight(withRir([[24, 9, 0], [24, 8, 0], [24, 7, 0]]), NAME).stalledAtFailure).toBe(true);
  });

  it("1回でも余力が残っていれば偽", () => {
    expect(exerciseInsight(withRir([[24, 8, 0], [24, 8, 1], [24, 8, 0]]), NAME).stalledAtFailure).toBe(false);
  });

  it("直近の回数が伸びていれば偽(限界でも前に進んでいる)", () => {
    const ins = exerciseInsight(withRir([[24, 7, 0], [24, 8, 0], [24, 9, 0]]), NAME);
    expect(ins.stalledAtFailure).toBe(false);
    expect(ins.readyToProgress).toBe(true);
  });

  it("同じ重量が2回だけなら偽", () => {
    expect(exerciseInsight(withRir([[22, 8, 0], [24, 8, 0], [24, 8, 0]]), NAME).stalledAtFailure).toBe(false);
  });

  it("余力が未入力の回があれば偽(限界だったかは分からない)", () => {
    expect(exerciseInsight(withRir([[24, 8, 0], [24, 8, ""], [24, 8, 0]]), NAME).stalledAtFailure).toBe(false);
  });

  it("3回より前の回は見ない(4回前に余力があっても、直近3回が限界なら真)", () => {
    expect(exerciseInsight(withRir([[24, 8, 2], [24, 8, 0], [24, 8, 0], [24, 8, 0]]), NAME).stalledAtFailure).toBe(true);
  });
});

// ---- workoutScore(今日のスコア、100点満点。Instagram 用の画像に出す) ----
// 配点は北村さんと合意したもの(2026-10-11、src/domain/insight.js の関数上のコメント):
//   前回超え 60 + ボリューム 25 + 自己ベスト 15、Math.round。
// なぜテストが要るか: 画像に出て人に見せる数字なので、試作で見せた「84点」が実装で
// 再現しないと合意が崩れる。また「重量を落として回数を稼いだ日」を前回超えに数えると
// 漸進性過負荷の考え方と逆の点が付く。文字列の重量・回数(旧データ・復元経由)で
// 辞書順比較すると "9" > "15" になる事故も、topSetOf と同じく縛る。
// 比べる相手が無い日(prevVolume が無い・0、または now と prev の両方がある種目が0)は null。
// 後者は reviewer 指摘で足した仕様(「前回超え 0/0」で最高40点が出ていた)。
// 対象外: items の組み立て(どのセットを now/prev にするか、pr の判定)と volume の計算。
// それらは呼び出し側(#appsrc)の責務。

// 1種目分。now/prev は {weight, reps}。prev: null で「前回が無い種目」。
const sampleScoreItem = (overrides = {}) => ({
  now: { weight: 20, reps: 10 },
  prev: { weight: 20, reps: 10 },
  pr: false,
  ...overrides,
});

const item = (nw, nr, pw, pr_, pr = false) =>
  sampleScoreItem({ now: { weight: nw, reps: nr }, prev: pw == null ? null : { weight: pw, reps: pr_ }, pr });

describe("workoutScore (今日のスコア。人に見せる数字なので試作の点数と一致させる)", () => {
  it("試作で見せた5種目の例は84点になる(前回超え4・同点1・自己ベスト1・ボリューム増)", () => {
    const items = [
      item(72, 8, 70, 8, true),
      item(26, 12, 26, 11),
      item(22, 12, 22, 12),
      item(11, 15, 10, 15),
      item(33, 12, 32.5, 12),
    ];
    expect(workoutScore({ items, volume: 6730, prevVolume: 6412 })).toEqual({ score: 84, beaten: 4, withPrev: 5, prCount: 1 });
  });

  it("prevVolume が無い日(その Day を初めてやった日)は null を返す", () => {
    expect(workoutScore({ items: [item(72, 8, 70, 8)], volume: 1000, prevVolume: undefined })).toBeNull();
  });

  it("prevVolume が0の日も null を返す(比べる相手が無いのに点を付けない)", () => {
    expect(workoutScore({ items: [item(72, 8, 70, 8)], volume: 1000, prevVolume: 0 })).toBeNull();
  });
});

describe("workoutScore の前回超え(60点。重量を落として回数を稼いだ日を超えた扱いにしない)", () => {
  it("同じ重量・同じ回数は0.5として数え、1種目だけなら30点になる", () => {
    expect(workoutScore({ items: [item(22, 12, 22, 12)], volume: 1000, prevVolume: 1000 })).toEqual({ score: 55, beaten: 0, withPrev: 1, prCount: 0 });
  });

  it("重量が下がって回数が増えた(70×8 → 65×12)は0点で、beaten に数えない", () => {
    expect(workoutScore({ items: [item(65, 12, 70, 8)], volume: 1000, prevVolume: 1000 })).toEqual({ score: 25, beaten: 0, withPrev: 1, prCount: 0 });
  });

  // 「前回超え 0/0」で点を付けると、種目を全部入れ替えた日に最高40点が出る(reviewer 指摘で仕様変更)。
  it("前回と比べられる種目が1つも無い日は null(スコアを出さない)", () => {
    const items = [item(72, 8, null, null, true), item(26, 12, null, null)];
    expect(workoutScore({ items, volume: 1000, prevVolume: 1000 })).toBeNull();
  });

  it("重量が文字列でも数として比べる(\"15\" は \"9\" より重い)", () => {
    expect(workoutScore({ items: [item("15", "8", "9", "8")], volume: 1000, prevVolume: 1000 })).toMatchObject({ score: 85, beaten: 1 });
  });

  it("回数が文字列でも数として比べる(同じ重量で \"12\" 回は \"9\" 回より多い)", () => {
    expect(workoutScore({ items: [item("20", "12", "20", "9")], volume: 1000, prevVolume: 1000 })).toMatchObject({ score: 85, beaten: 1 });
  });

  it("文字列と数値が混ざっていても、同じ重量・同じ回数なら0.5として数える", () => {
    expect(workoutScore({ items: [item("22", "12", 22, 12)], volume: 1000, prevVolume: 1000 })).toMatchObject({ score: 55, beaten: 0 });
  });
});

describe("workoutScore のボリューム(25点。境界ちょうどの扱い)", () => {
  // 前回超えは同点1種目(30点)、自己ベストなしに固定して、ボリューム分だけを見る。
  const scoreAt = (volume) => workoutScore({ items: [item(22, 12, 22, 12)], volume, prevVolume: 1000 }).score;

  it("前回とちょうど同じボリュームは25点", () => {
    expect(scoreAt(1000)).toBe(55);
  });

  it("前回の90%ちょうどは15点", () => {
    expect(scoreAt(900)).toBe(45);
  });

  it("前回の89%は5点", () => {
    expect(scoreAt(890)).toBe(35);
  });
});

describe("workoutScore の自己ベスト(15点。1つ5点で3つで頭打ち)", () => {
  it("自己ベストが5つあっても15点で頭打ちになり、prCount は5のまま返す", () => {
    // 前回超えは全種目同点(30点)、ボリューム25点に固定して、自己ベスト分だけを見る。
    const items = Array.from({ length: 5 }, () => item(20, 10, 20, 10, true));
    expect(workoutScore({ items, volume: 1000, prevVolume: 1000 })).toEqual({ score: 70, beaten: 0, withPrev: 5, prCount: 5 });
  });
});

// ---- setDelta / compareWithPrevious(前回の同じ番手のセットとの差。1.4.8) ----
// docs/続ける理由_2026-11.md の「1. お疲れ様の画面で「前回と比べた結果」を見せる」と「実装計画」の 1・5 に対応する。
// なぜテストが要るか: セット行の右に出る「+2.5kg / +1回 / RIR+1 / 同じ」と、お疲れ様の画面の「前回と比べて ▲6 =7 ▼2」が
// この1つの規則を共用する。画面で緑だったセットの数と「前回超え」の数が1件でも食い違うと信用されないので、
// 規則そのものをここで縛る。規則は index.html のセット行(5958c28 より前は #appsrc に直書き)から移したもので、
// 移した時点の挙動(重量は表示単位の数字どうしで差を取り0.1に丸める → 回数 → RIR、補助の種別が違えば比べない)を固定する。
// lb の扱いは units.js と同じく「保存は kg、比べるのは画面に出ている数字」。kg で記録した 77.5kg は lb で 171 と出て、
// 171 を打ち直すと 77.56kg で保存される。保存値どうしで比べると「同じ重量なのに RIR を比べない」「+0lb」が出る
// (UIレビュー 2026-10 で自己ベスト側に出た不具合と同じ形。units.js の snapKg のコメント)。
// 対象外: 差の文言(setDeltaText)と色、exerciseInsight(...).sets の組み立て(前回のどのセットが相手になるか)は #appsrc 側。

const { setDelta, compareWithPrevious } = loadDomainModule("src/domain/insight.js");

// 表示単位を lb にした units.js。換算関数は index.html の UNIT_CONV と同じ組み合わせで渡す。
const lbUnits = loadDomainModule("src/domain/units.js");
lbUnits.setUnit("lb");
const LB_CONV = { toDisplay: lbUnits.wU, fromDisplay: lbUnits.fromU, snap: lbUnits.snapKg };

// 今日のセット(weight は表示単位の数字。入力欄の値なので文字列のこともある)と、前回のセット(保存値、weight は kg)。
const sampleCurSet = (overrides = {}) => ({ weight: 60, reps: 8, rir: 2, warmup: false, assisted: false, ...overrides });
const samplePrevSet = (overrides = {}) => ({ weight: 60, reps: 8, rir: 2, assisted: false, ...overrides });

describe("setDelta の決め方(重量 → 回数 → RIR の順に、最初に違うところで決める)", () => {
  it("重量だけ増えたら重量の超えになり、値は表示単位の差", () => {
    expect(setDelta(sampleCurSet({ weight: 62.5 }), samplePrevSet())).toEqual({ kind: "up", by: "weight", value: 2.5 });
  });

  it("重量が増えて回数が減ったセットも、重量で決まって超えになる", () => {
    expect(setDelta(sampleCurSet({ weight: 62.5, reps: 6 }), samplePrevSet())).toEqual({ kind: "up", by: "weight", value: 2.5 });
  });

  it("重量が減ったら回数が増えていても重量の下回りになり、値は負になる", () => {
    expect(setDelta(sampleCurSet({ weight: 57.5, reps: 12 }), samplePrevSet())).toEqual({ kind: "down", by: "weight", value: -2.5 });
  });

  it("重量が同じで回数だけ増えたら回数の超えになる", () => {
    expect(setDelta(sampleCurSet({ reps: 9 }), samplePrevSet())).toEqual({ kind: "up", by: "reps", value: 1 });
  });

  it("重量が同じで回数だけ減ったら回数の下回りになる(RIRが増えていても回数で決まる)", () => {
    expect(setDelta(sampleCurSet({ reps: 6, rir: 4 }), samplePrevSet())).toEqual({ kind: "down", by: "reps", value: -2 });
  });

  it("重量・回数が同じでRIRだけ増えたら(余力が増えたら)RIRの超えになる", () => {
    expect(setDelta(sampleCurSet({ rir: 3 }), samplePrevSet())).toEqual({ kind: "up", by: "rir", value: 1 });
  });

  it("重量・回数が同じでRIRだけ減ったらRIRの下回りになる", () => {
    expect(setDelta(sampleCurSet({ rir: 0 }), samplePrevSet())).toEqual({ kind: "down", by: "rir", value: -2 });
  });

  it("重量・回数・RIRが全部同じなら、RIRで決まる「同じ」になる", () => {
    expect(setDelta(sampleCurSet(), samplePrevSet())).toEqual({ kind: "same", by: "rir", value: 0 });
  });

  it("入力欄の文字列のままの重量・回数・RIRも数として比べる", () => {
    expect(setDelta(sampleCurSet({ weight: "60", reps: "8", rir: "1" }), samplePrevSet())).toEqual({ kind: "down", by: "rir", value: -1 });
  });

  it("自重種目(重量0)でも回数があれば比べる", () => {
    expect(setDelta(sampleCurSet({ weight: 0, reps: 12 }), samplePrevSet({ weight: 0, reps: 10 }))).toEqual({ kind: "up", by: "reps", value: 2 });
  });

  it("加重を外して重量0にしたときも重量の差を出す", () => {
    expect(setDelta(sampleCurSet({ weight: 0, reps: 12 }), samplePrevSet({ weight: 10 }))).toEqual({ kind: "down", by: "weight", value: -10 });
  });

  it("換算を省略すると kg のまま比べ、62.3kg のような端数も丸めない", () => {
    expect(setDelta(sampleCurSet({ weight: 62.4 }), samplePrevSet({ weight: 62.3 }))).toEqual({ kind: "up", by: "weight", value: 0.1 });
  });
});

describe("setDelta が比べないセット(null。お疲れ様の画面の数にも入らない)", () => {
  it("補助ありと補助なしは比べない(補助で増えた回数が伸びに見えるため)", () => {
    expect(setDelta(sampleCurSet({ assisted: true, reps: 12 }), samplePrevSet())).toBe(null);
    expect(setDelta(sampleCurSet({ reps: 12 }), samplePrevSet({ assisted: true }))).toBe(null);
  });

  it("補助ありどうしなら比べる", () => {
    expect(setDelta(sampleCurSet({ assisted: true, reps: 10 }), samplePrevSet({ assisted: true }))).toEqual({ kind: "up", by: "reps", value: 2 });
  });

  it("ウォームアップは比べない", () => {
    expect(setDelta(sampleCurSet({ warmup: true, weight: 80 }), samplePrevSet())).toBe(null);
  });

  it("RIRが未入力(空文字・null・undefined)のセットは未実施なので比べない", () => {
    expect(setDelta(sampleCurSet({ rir: "", weight: 80 }), samplePrevSet())).toBe(null);
    expect(setDelta(sampleCurSet({ rir: null, weight: 80 }), samplePrevSet())).toBe(null);
    expect(setDelta(sampleCurSet({ rir: undefined, weight: 80 }), samplePrevSet())).toBe(null);
  });

  it("RIRが0のセットは実施済みとして比べる(未入力と取り違えない)", () => {
    expect(setDelta(sampleCurSet({ rir: 0 }), samplePrevSet({ rir: 0 }))).toEqual({ kind: "same", by: "rir", value: 0 });
  });

  it("重量も回数も0の空の行は比べない", () => {
    expect(setDelta(sampleCurSet({ weight: 0, reps: 0 }), samplePrevSet())).toBe(null);
    expect(setDelta(sampleCurSet({ weight: "", reps: "" }), samplePrevSet())).toBe(null);
  });

  it("前回のセットが無ければ比べない", () => {
    expect(setDelta(sampleCurSet(), undefined)).toBe(null);
    expect(setDelta(sampleCurSet(), null)).toBe(null);
  });

  it("前回のRIRが無く、重量・回数が同じなら比べない(同じとも言えない)", () => {
    expect(setDelta(sampleCurSet(), samplePrevSet({ rir: null }))).toBe(null);
    expect(setDelta(sampleCurSet(), samplePrevSet({ rir: undefined }))).toBe(null);
  });

  it("前回のRIRが無くても、重量や回数が違えばそこで決まる", () => {
    expect(setDelta(sampleCurSet({ weight: 62.5 }), samplePrevSet({ rir: null }))).toEqual({ kind: "up", by: "weight", value: 2.5 });
    expect(setDelta(sampleCurSet({ reps: 9 }), samplePrevSet({ rir: null }))).toEqual({ kind: "up", by: "reps", value: 1 });
  });
});

describe("setDelta の重量は画面に出ている数字どうしで比べる(lb 表示で kg の前回と比べる)", () => {
  it("kg で記録した 77.5kg は lb で 171 と出て、171 を打てば重量は同じ扱いになり RIR で決まる", () => {
    expect(lbUnits.wU(77.5)).toBe(171);
    expect(setDelta(sampleCurSet({ weight: "171", rir: 3 }), samplePrevSet({ weight: 77.5 }), LB_CONV)).toEqual({ kind: "up", by: "rir", value: 1 });
    expect(setDelta(sampleCurSet({ weight: "171" }), samplePrevSet({ weight: 77.5 }), LB_CONV)).toEqual({ kind: "same", by: "rir", value: 0 });
  });

  it("lb 表示の重量の差は lb の数字で出す(+0lb や端数の差にならない)", () => {
    expect(setDelta(sampleCurSet({ weight: "176" }), samplePrevSet({ weight: 77.5 }), LB_CONV)).toEqual({ kind: "up", by: "weight", value: 5 });
  });

  it("lb で記録した前回(171lb = 77.56kg 保存)と同じ 171 を打っても同じ扱いになる", () => {
    const savedKg = lbUnits.fromU(171);
    expect(setDelta(sampleCurSet({ weight: "171" }), samplePrevSet({ weight: savedKg }), LB_CONV)).toEqual({ kind: "same", by: "rir", value: 0 });
  });

  it("重量の差が0.1未満(保存値の浮動小数の誤差)は同じ重量として回数へ進む", () => {
    expect(setDelta(sampleCurSet({ weight: "62.3", reps: 9 }), samplePrevSet({ weight: 62.300000000000004 }))).toEqual({ kind: "up", by: "reps", value: 1 });
  });
});

// compareWithPrevious の1種目分。sets は今日のセット(ウォームアップ込み、記録中の並びのまま)。
const sampleExercise = (overrides = {}) => ({ name: NAME, sets: [sampleCurSet()], ...overrides });

// 種目名 → 前回のワーキングセットの並び(exerciseInsight(...).sets に相当。ウォームアップは入っていない)。
const prevSetsFrom = (table) => (name) => table[name];

describe("compareWithPrevious の数え方(セット行の色と1件も食い違わないこと)", () => {
  it("超え・同じ・下回りをセットごとに数える", () => {
    const exercises = [sampleExercise({ sets: [
      sampleCurSet({ weight: 62.5 }),
      sampleCurSet(),
      sampleCurSet({ reps: 6 }),
    ] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet(), samplePrevSet(), samplePrevSet()] });
    expect(compareWithPrevious(exercises, prev)).toMatchObject({ up: 1, same: 1, down: 1 });
  });

  it("ウォームアップは数えず、前回の番手もウォームアップを除いた通し番号で合わせる", () => {
    const exercises = [sampleExercise({ sets: [
      sampleCurSet({ warmup: true, weight: 20, reps: 15 }),
      sampleCurSet({ weight: 100 }),
      sampleCurSet({ weight: 50 }),
    ] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet({ weight: 100 }), samplePrevSet({ weight: 50 })] });
    expect(compareWithPrevious(exercises, prev)).toMatchObject({ up: 0, same: 2, down: 0 });
  });

  it("未実施(RIR未入力)の行は数えないが番号は取るので、後ろの行は前回の同じ番手と比べる", () => {
    const exercises = [sampleExercise({ sets: [
      sampleCurSet({ weight: 100, rir: "" }),
      sampleCurSet({ weight: 50 }),
    ] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet({ weight: 100 }), samplePrevSet({ weight: 50 })] });
    expect(compareWithPrevious(exercises, prev)).toMatchObject({ up: 0, same: 1, down: 0 });
  });

  it("前回の番手が足りない分(今日だけ多くやったセット)は数えない", () => {
    const exercises = [sampleExercise({ sets: [sampleCurSet(), sampleCurSet(), sampleCurSet({ weight: 80 })] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet(), samplePrevSet()] });
    expect(compareWithPrevious(exercises, prev)).toEqual({ up: 0, same: 2, down: 0, best: null });
  });

  it("前回が無い種目(初めての種目)は数えない", () => {
    const exercises = [sampleExercise({ name: "ベンチプレス" }), sampleExercise()];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet({ reps: 6 })] });
    expect(compareWithPrevious(exercises, prev)).toMatchObject({ up: 1, same: 0, down: 0 });
  });

  it("補助ありと補助なしの組は数えない", () => {
    const exercises = [sampleExercise({ sets: [sampleCurSet({ assisted: true, reps: 12 })] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet()] });
    expect(compareWithPrevious(exercises, prev)).toEqual({ up: 0, same: 0, down: 0, best: null });
  });

  it("比べられるセットが1つも無ければ全部0で best は null", () => {
    expect(compareWithPrevious([], prevSetsFrom({}))).toEqual({ up: 0, same: 0, down: 0, best: null });
    expect(compareWithPrevious(null, null)).toEqual({ up: 0, same: 0, down: 0, best: null });
    expect(compareWithPrevious([sampleExercise()], prevSetsFrom({}))).toEqual({ up: 0, same: 0, down: 0, best: null });
  });

  it("換算を渡すとセット行と同じく画面の数字で比べる(lb 表示で kg の前回 77.5kg に 171 を打てば同じ)", () => {
    const exercises = [sampleExercise({ sets: [sampleCurSet({ weight: "171" })] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet({ weight: 77.5 })] });
    expect(compareWithPrevious(exercises, prev, LB_CONV)).toEqual({ up: 0, same: 1, down: 0, best: null });
  });
});

describe("compareWithPrevious の best(今日いちばん伸びた種目)", () => {
  it("重量が増えた種目のうち、増えた割合が最大のものを選ぶ(増えた量ではなく割合)", () => {
    const exercises = [
      sampleExercise({ name: "スクワット", sets: [sampleCurSet({ weight: 105 })] }),
      sampleExercise({ name: "サイドレイズ", sets: [sampleCurSet({ weight: 6 })] }),
    ];
    const prev = prevSetsFrom({ "スクワット": [samplePrevSet({ weight: 100 })], "サイドレイズ": [samplePrevSet({ weight: 5 })] });
    expect(compareWithPrevious(exercises, prev).best).toEqual({ name: "サイドレイズ", by: "weight", value: 1 });
  });

  it("重量が増えた種目があれば、回数の増えがどれだけ大きくても重量の方を選ぶ", () => {
    const exercises = [
      sampleExercise({ name: "懸垂", sets: [sampleCurSet({ weight: 0, reps: 15 })] }),
      sampleExercise({ name: "スクワット", sets: [sampleCurSet({ weight: 101 })] }),
    ];
    const prev = prevSetsFrom({ "懸垂": [samplePrevSet({ weight: 0, reps: 8 })], "スクワット": [samplePrevSet({ weight: 100 })] });
    expect(compareWithPrevious(exercises, prev).best).toEqual({ name: "スクワット", by: "weight", value: 1 });
  });

  it("重量が増えた種目が無ければ、回数の増えが最大のものを選ぶ", () => {
    const exercises = [
      sampleExercise({ name: "スクワット", sets: [sampleCurSet({ reps: 9 })] }),
      sampleExercise({ name: "懸垂", sets: [sampleCurSet({ weight: 0, reps: 11 })] }),
    ];
    const prev = prevSetsFrom({ "スクワット": [samplePrevSet()], "懸垂": [samplePrevSet({ weight: 0 })] });
    expect(compareWithPrevious(exercises, prev).best).toEqual({ name: "懸垂", by: "reps", value: 3 });
  });

  it("重量の増えの割合が同じなら並びが先の種目を選ぶ", () => {
    const exercises = [
      sampleExercise({ name: "スクワット", sets: [sampleCurSet({ weight: 110 })] }),
      sampleExercise({ name: "ベンチプレス", sets: [sampleCurSet({ weight: 55 })] }),
    ];
    const prev = prevSetsFrom({ "スクワット": [samplePrevSet({ weight: 100 })], "ベンチプレス": [samplePrevSet({ weight: 50 })] });
    expect(compareWithPrevious(exercises, prev).best).toEqual({ name: "スクワット", by: "weight", value: 10 });
  });

  it("回数の増えが同じなら並びが先の種目を選ぶ", () => {
    const exercises = [
      sampleExercise({ name: "スクワット", sets: [sampleCurSet({ reps: 10 })] }),
      sampleExercise({ name: "ベンチプレス", sets: [sampleCurSet({ reps: 10 })] }),
    ];
    const prev = prevSetsFrom({ "スクワット": [samplePrevSet()], "ベンチプレス": [samplePrevSet()] });
    expect(compareWithPrevious(exercises, prev).best).toEqual({ name: "スクワット", by: "reps", value: 2 });
  });

  it("前回の重量0から加重したセットは割合100%として扱う", () => {
    const zeroFirst = [
      sampleExercise({ name: "懸垂", sets: [sampleCurSet({ weight: 5 })] }),
      sampleExercise({ name: "スクワット", sets: [sampleCurSet({ weight: 150 })] }),
    ];
    const prev = prevSetsFrom({ "懸垂": [samplePrevSet({ weight: 0 })], "スクワット": [samplePrevSet({ weight: 100 })] });
    // 懸垂は 100%、スクワットは 50%
    expect(compareWithPrevious(zeroFirst, prev).best).toEqual({ name: "懸垂", by: "weight", value: 5 });
    // スクワットが 100% を超えれば(100 → 250 で 150%)スクワット
    const bigger = [zeroFirst[0], sampleExercise({ name: "スクワット", sets: [sampleCurSet({ weight: 250 })] })];
    expect(compareWithPrevious(bigger, prev).best).toEqual({ name: "スクワット", by: "weight", value: 150 });
    // ちょうど 100%(100 → 200)なら並びが先の懸垂
    const tie = [zeroFirst[0], sampleExercise({ name: "スクワット", sets: [sampleCurSet({ weight: 200 })] })];
    expect(compareWithPrevious(tie, prev).best).toEqual({ name: "懸垂", by: "weight", value: 5 });
  });

  it("同じ種目の中でも、いちばん伸びたセットの値を返す", () => {
    const exercises = [sampleExercise({ sets: [sampleCurSet({ reps: 9 }), sampleCurSet({ reps: 11 })] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet(), samplePrevSet()] });
    expect(compareWithPrevious(exercises, prev).best).toEqual({ name: NAME, by: "reps", value: 3 });
  });

  it("RIRだけの超えは best にしない(数には入る)", () => {
    const exercises = [sampleExercise({ sets: [sampleCurSet({ rir: 3 })] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet()] });
    expect(compareWithPrevious(exercises, prev)).toEqual({ up: 1, same: 0, down: 0, best: null });
  });

  it("下回りと同じしか無い日は best が null", () => {
    const exercises = [sampleExercise({ sets: [sampleCurSet({ weight: 57.5 }), sampleCurSet()] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet(), samplePrevSet()] });
    expect(compareWithPrevious(exercises, prev)).toEqual({ up: 0, same: 1, down: 1, best: null });
  });

  it("lb 表示のときの best の値は lb の数字", () => {
    const exercises = [sampleExercise({ sets: [sampleCurSet({ weight: "176" })] })];
    const prev = prevSetsFrom({ [NAME]: [samplePrevSet({ weight: 77.5 })] });
    expect(compareWithPrevious(exercises, prev, LB_CONV).best).toEqual({ name: NAME, by: "weight", value: 5 });
  });
});

// ---- weekProgress / suggestWeeklyGoal / normalizeWeeklyGoal(週の目標と続いた週。1.4.8) ----
// docs/続ける理由_2026-11.md の「2. 週の目標と、続いた週の数」と「決めたこと」2(週は月曜始まり)に対応する。
// なぜテストが要るか: 分割タブの「今週 1 / 3回 ●○○ 3週連続」とお疲れ様の画面に毎回出る数で、
// 週の区切りを1日ずらすだけで「連続が途切れた」と見える。とくに「届いていない今週を、切れたことにしない」
// 「目標を変えたら過去の週も数え直す」は文章だけだと崩れやすいので、ここで縛る。
// 日付はすべて new Date(年, 月, 日, 時, 分) のローカル時刻で作る(実装が端末の時刻で区切るため。
// テストも端末のタイムゾーンで走る)。記録の date は保存時と同じく ISO 文字列にする。
// 対象外: profile.weeklyGoal の保存・バックアップからの読み込み・型ごとの初期値(#appsrc 側)。

const { weekProgress, suggestWeeklyGoal, normalizeWeeklyGoal } = loadDomainModule("src/domain/insight.js");

// ローカル時刻。月は1始まりで書く(new Date の月は0始まり)。
const at = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi);
const workoutAt = (date) => sampleWorkout({ date: date.toISOString() });

// 「今」は 2026-11-11(水)12:00。今週は 11-09(月)から。
const NOW = at(2026, 11, 11, 12, 0).getTime();
// weeksAgo 週前(0 = 今週)の週に count 回。月曜から1日ずつ並べ、7回を超えたら時刻をずらして同じ日に重ねる。
const weekOf = (weeksAgo, count) => Array.from({ length: count }, (_, i) =>
  workoutAt(at(2026, 11, 9 - 7 * weeksAgo + (i % 7), 6 + Math.floor(i / 7))));

describe("normalizeWeeklyGoal(1〜7 の整数か null。バックアップから入る値もここで正す)", () => {
  it("1〜7 の整数はそのまま返す", () => {
    expect(normalizeWeeklyGoal(1)).toBe(1);
    expect(normalizeWeeklyGoal(7)).toBe(7);
  });

  it("数字の文字列は数にして返す(\"3\" は 3)", () => {
    expect(normalizeWeeklyGoal("3")).toBe(3);
  });

  it("範囲外・小数・未設定・数でないものは null", () => {
    expect(normalizeWeeklyGoal(0)).toBe(null);
    expect(normalizeWeeklyGoal(8)).toBe(null);
    expect(normalizeWeeklyGoal(-1)).toBe(null);
    expect(normalizeWeeklyGoal(2.5)).toBe(null);
    expect(normalizeWeeklyGoal(null)).toBe(null);
    expect(normalizeWeeklyGoal(undefined)).toBe(null);
    expect(normalizeWeeklyGoal("")).toBe(null);
    expect(normalizeWeeklyGoal("abc")).toBe(null);
    expect(normalizeWeeklyGoal(NaN)).toBe(null);
  });

  it("true は Number で 1 になるが、目標1にしない(数と数字の文字列だけを受ける)", () => {
    expect(normalizeWeeklyGoal(true)).toBe(null);
    expect(normalizeWeeklyGoal(false)).toBe(null);
    expect(normalizeWeeklyGoal([3])).toBe(null);
  });
});

describe("weekProgress の週の区切り(月曜0時。ここがずれると連続が途切れて見える)", () => {
  it("日曜23:59の記録は先週、月曜0:00の記録は今週に入る", () => {
    const monday0 = at(2026, 11, 9, 0, 0).getTime();
    expect(weekProgress([workoutAt(at(2026, 11, 8, 23, 59))], 3, monday0).thisWeek).toBe(0);
    expect(weekProgress([workoutAt(at(2026, 11, 9, 0, 0))], 3, monday0).thisWeek).toBe(1);
  });

  it("「今」が日曜23:59なら、その週の月曜からの記録を今週として数える", () => {
    const sunday = at(2026, 11, 15, 23, 59).getTime();
    const ws = [workoutAt(at(2026, 11, 8, 23, 59)), workoutAt(at(2026, 11, 9, 0, 0)), workoutAt(at(2026, 11, 15, 23, 59))];
    expect(weekProgress(ws, 3, sunday).thisWeek).toBe(2);
  });

  it("年をまたぐ週(2026-12-28 月曜〜2027-01-03 日曜)を1つの週として数える", () => {
    const ws = [
      workoutAt(at(2026, 12, 27, 20, 0)), // 日曜。前の週
      workoutAt(at(2026, 12, 28, 0, 0)),
      workoutAt(at(2026, 12, 31, 23, 0)),
      workoutAt(at(2027, 1, 3, 23, 59)),
      workoutAt(at(2027, 1, 4, 0, 0)), // 月曜。次の週
    ];
    expect(weekProgress(ws, 3, at(2027, 1, 1, 12, 0).getTime())).toMatchObject({ thisWeek: 3, reached: true });
    expect(weekProgress(ws, 3, at(2027, 1, 3, 23, 59).getTime()).thisWeek).toBe(3);
  });

  it("年をまたいで続いた週も切れずに数える", () => {
    const ws = [
      workoutAt(at(2026, 12, 21, 12)), workoutAt(at(2026, 12, 23, 12)),
      workoutAt(at(2026, 12, 29, 12)), workoutAt(at(2027, 1, 2, 12)),
    ];
    expect(weekProgress(ws, 2, at(2027, 1, 6, 12).getTime())).toEqual({ thisWeek: 0, goal: 2, streak: 2, reached: false });
  });

  it("同じ日に2回保存したら2回と数える", () => {
    const ws = [workoutAt(at(2026, 11, 10, 7, 0)), workoutAt(at(2026, 11, 10, 19, 0))];
    expect(weekProgress(ws, 2, NOW)).toMatchObject({ thisWeek: 2, reached: true });
  });

  it("日付の読めない記録は数えない", () => {
    const ws = [sampleWorkout({ date: "not a date" }), sampleWorkout({ date: undefined }), workoutAt(at(2026, 11, 10))];
    expect(weekProgress(ws, 3, NOW).thisWeek).toBe(1);
  });
});

describe("weekProgress の続いた週(届いていない今週は数えず、切れたことにもしない)", () => {
  it("今週が未達でも、先週までの連続は切れずに先週からの数を返す", () => {
    const ws = [...weekOf(3, 2), ...weekOf(2, 2), ...weekOf(1, 2), ...weekOf(0, 1)];
    expect(weekProgress(ws, 2, NOW)).toEqual({ thisWeek: 1, goal: 2, streak: 3, reached: false });
  });

  it("今週が0回でも先週までの連続は残る", () => {
    const ws = [...weekOf(2, 2), ...weekOf(1, 2)];
    expect(weekProgress(ws, 2, NOW)).toEqual({ thisWeek: 0, goal: 2, streak: 2, reached: false });
  });

  it("今週も目標に届いたら今週も連続に入る", () => {
    const ws = [...weekOf(3, 2), ...weekOf(2, 2), ...weekOf(1, 2), ...weekOf(0, 2)];
    expect(weekProgress(ws, 2, NOW)).toEqual({ thisWeek: 2, goal: 2, streak: 4, reached: true });
  });

  it("目標を超えた週も届いた週として数える", () => {
    const ws = [...weekOf(1, 5), ...weekOf(0, 4)];
    expect(weekProgress(ws, 2, NOW)).toMatchObject({ streak: 2, reached: true });
  });

  it("先週が届いていなければ、それより前に届いた週があっても連続は0", () => {
    const ws = [...weekOf(3, 2), ...weekOf(2, 2), ...weekOf(1, 1)];
    expect(weekProgress(ws, 2, NOW).streak).toBe(0);
  });

  it("途中に届かなかった週があれば、そこで止まる", () => {
    const ws = [...weekOf(4, 2), ...weekOf(3, 1), ...weekOf(2, 2), ...weekOf(1, 2)];
    expect(weekProgress(ws, 2, NOW).streak).toBe(2);
  });

  it("記録の無い週が挟まれば、そこで止まる", () => {
    const ws = [...weekOf(3, 2), ...weekOf(1, 2)];
    expect(weekProgress(ws, 2, NOW).streak).toBe(1);
  });

  it("今週だけ届いた(初めて届いた)なら連続は1", () => {
    expect(weekProgress(weekOf(0, 3), 3, NOW)).toEqual({ thisWeek: 3, goal: 3, streak: 1, reached: true });
  });

  it("記録が無ければ0回・連続0", () => {
    expect(weekProgress([], 3, NOW)).toEqual({ thisWeek: 0, goal: 3, streak: 0, reached: false });
    expect(weekProgress(null, 3, NOW)).toEqual({ thisWeek: 0, goal: 3, streak: 0, reached: false });
  });

  it("目標を変えると過去の週も新しい目標で数え直す", () => {
    const ws = [...weekOf(3, 3), ...weekOf(2, 2), ...weekOf(1, 3), ...weekOf(0, 2)];
    expect(weekProgress(ws, 2, NOW)).toMatchObject({ streak: 4, reached: true });
    expect(weekProgress(ws, 3, NOW)).toMatchObject({ streak: 1, reached: false });
    expect(weekProgress(ws, 1, NOW)).toMatchObject({ streak: 4, reached: true });
  });

  it("「今」は Date でもミリ秒でも同じ結果になる", () => {
    const ws = [...weekOf(1, 2), ...weekOf(0, 1)];
    expect(weekProgress(ws, 2, new Date(NOW))).toEqual(weekProgress(ws, 2, NOW));
  });
});

describe("weekProgress の目標の値(null・範囲外は目標なし、文字列は数にする)", () => {
  const ws = [...weekOf(1, 3), ...weekOf(0, 3)];

  it("目標が null なら今週の回数だけ返し、連続は0・未達", () => {
    expect(weekProgress(ws, null, NOW)).toEqual({ thisWeek: 3, goal: null, streak: 0, reached: false });
  });

  it("目標が0や8(1〜7の外)なら目標なしと同じ", () => {
    expect(weekProgress(ws, 0, NOW)).toEqual({ thisWeek: 3, goal: null, streak: 0, reached: false });
    expect(weekProgress(ws, 8, NOW)).toEqual({ thisWeek: 3, goal: null, streak: 0, reached: false });
  });

  it("目標が文字列の \"3\" なら 3 として数える", () => {
    expect(weekProgress(ws, "3", NOW)).toEqual({ thisWeek: 3, goal: 3, streak: 2, reached: true });
  });
});

describe("suggestWeeklyGoal(「週の目標を決めましょう」で最初から選んでおく数)", () => {
  it("今週を除く直近4週の平均を四捨五入する(5週前と今週は入れない)", () => {
    const ws = [...weekOf(5, 7), ...weekOf(4, 3), ...weekOf(3, 2), ...weekOf(2, 3), ...weekOf(1, 4), ...weekOf(0, 7)];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(3);
  });

  it("平均がちょうど .5 なら切り上げる(2.5 → 3)", () => {
    const ws = [...weekOf(5, 1), ...weekOf(4, 2), ...weekOf(3, 3), ...weekOf(2, 2), ...weekOf(1, 3)];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(3);
  });

  it("平均が .5 未満なら切り捨てる(1.25 → 1)", () => {
    const ws = [...weekOf(5, 1), ...weekOf(4, 1), ...weekOf(3, 1), ...weekOf(2, 1), ...weekOf(1, 2)];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(1);
  });

  it("記録の無い週も0回として平均に入れる", () => {
    // 直近4週は 0・0・0・4 回(5週前の4回は範囲外)。4 / 4 で 1
    const ws = [...weekOf(5, 4), ...weekOf(1, 4)];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(1);
  });

  it("7を超える平均は7に収める", () => {
    const ws = [...weekOf(5, 1), ...weekOf(4, 10), ...weekOf(3, 10), ...weekOf(2, 10), ...weekOf(1, 10)];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(7);
  });

  it("直近4週に記録が無ければ1にする(0にしない)", () => {
    expect(suggestWeeklyGoal(weekOf(6, 3), NOW)).toBe(1);
  });

  it("使い始めて4週未満なら、最初の記録の週から先週までの週数で割る(少なく見積もらない)", () => {
    // 2週前から使い始めて 3回・3回。4週で割ると 1.5 → 2 になるが、2週で割って 3
    const ws = [...weekOf(2, 3), ...weekOf(1, 3)];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(3);
  });

  it("使い始めて4週未満でも、最初の記録の週より後の空いた週は0回として入れる", () => {
    const ws = [...weekOf(3, 3), ...weekOf(1, 3)];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(2);
  });

  it("最初の記録が先週の日曜なら、先週1週で割る", () => {
    const ws = [workoutAt(at(2026, 11, 8, 23, 59)), ...weekOf(0, 1)];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(1);
    const ws2 = [...weekOf(1, 4), ...weekOf(0, 1)];
    expect(suggestWeeklyGoal(ws2, NOW)).toBe(4);
  });

  it("先週までに記録が無ければ(今週始めた)今週の回数にする", () => {
    expect(suggestWeeklyGoal(weekOf(0, 2), NOW)).toBe(2);
  });

  it("今週の月曜0:00ちょうどに始めた人も、今週始めた人として今週の回数にする", () => {
    const ws = [workoutAt(at(2026, 11, 9, 0, 0)), workoutAt(at(2026, 11, 10, 12, 0)), workoutAt(at(2026, 11, 11, 8, 0))];
    expect(suggestWeeklyGoal(ws, NOW)).toBe(3);
  });

  it("今週始めた人の今週の回数も7に収める", () => {
    expect(suggestWeeklyGoal(weekOf(0, 9), NOW)).toBe(7);
  });

  it("記録が1つも無ければ1にする", () => {
    expect(suggestWeeklyGoal([], NOW)).toBe(1);
    expect(suggestWeeklyGoal(null, NOW)).toBe(1);
  });
});
