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

const { exerciseInsight, topSetOf } = loadDomainModule("src/domain/insight.js");

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
