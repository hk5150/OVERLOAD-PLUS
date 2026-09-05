import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

/*
 * 推定1RMまわりの計算(est1RM / effWeight / dayBest1RM)を縛る。
 *
 * なぜ必要か:
 * est1RM と effWeight は「前回の実績をそのまま見せる」という中心機能の数値表示に直結する。
 * 式そのものは安定しているが、負の重量や文字列など想定外の入力に対する現状の挙動は
 * 呼び出し側(num()による事前変換)の有無に依存するため、characterization testとして固定してある。
 *
 * dayBest1RM(過去に実際に出たズレ):
 * 「ある日の記録から推定1RMの最大値を出す」reduceが #appsrc 内に4箇所コピーされていて、
 * 前段の除外フィルタが3種類に割れていた。
 *   - prMap:            workingSets + !assisted + reps>=1
 *   - 履歴タブの⚡バッジ: !warmup && !assisted && reps
 *   - chartData:        workingSets のみ(= assisted を含んでしまう)
 *   - 種目カードの日別1RM: workingSets のみ(同上)
 * workingSets()(src/domain/volume.js)は warmup しか除かないので、
 * 「補助ありも除かれている」という思い込みのぶんだけ assisted が混入していた。
 * 補助ありセットは回数が伸びる → est1RM が本番セットを上回りやすく、
 * 同じ日の1RMが画面ごとに食い違う。この関数はその集約先なので、
 * **assisted が除かれること**をここで固定するのが最大の目的。
 *
 * 対象外:
 * どのセットを渡すか(種目マスターの isDb / bwFactor の解決、bwAtLog と現在体重の優先順位)は
 * 呼び出し側 = #appsrc の責務で、npm test は index.html を実行しないためここでは検証しない。
 * 係数そのものの妥当性は tests/coefficients.test.js と docs/係数の根拠.md を参照。
 */

const { est1RM, effWeight, dayBest1RM } = loadDomainModule("src/domain/oneRm.js");

// その日の1セット。既定は「本番セット」(warmupでもassistedでもない)。
const workSet = (overrides = {}) => ({ weight: 60, reps: 5, rir: 2, warmup: false, assisted: false, ...overrides });

describe("est1RM (推定1RM)", () => {
  it("通常の重量・回数", () => {
    expect(est1RM(100, 5)).toBeCloseTo(100 * (1 + 5 / 30));
  });

  it("1回", () => {
    expect(est1RM(100, 1)).toBe(100);
  });

  it("0回", () => {
    expect(est1RM(100, 0)).toBe(0);
  });

  it("0kg", () => {
    expect(est1RM(0, 5)).toBe(0);
  });

  it("12回", () => {
    expect(est1RM(60, 12)).toBeCloseTo(60 * (1 + 12 / 30));
  });

  it("13回以上", () => {
    expect(est1RM(60, 20)).toBeCloseTo(60 * (1 + 20 / 30));
  });

  it("不正値(負の回数)", () => {
    expect(est1RM(100, -3)).toBe(0);
  });

  it("不正値(負の重量) — weightが0未満でも falsy ではないため計算式がそのまま適用される", () => {
    // 現状の実装は `!weight` (0のみtruthy扱いで弾く) なので、負の重量は式に通る。
    // これは仕様変更ではなく、現状の挙動をそのまま固定するcharacterization test。
    expect(est1RM(-50, 5)).toBeCloseTo(-50 * (1 + 5 / 30));
  });

  it("文字列(数値変換できる文字列は * 演算子の型強制で数値として計算される)", () => {
    // est1RM自身は明示的な数値変換を行わないが、`*` は自動的に数値へ型強制するため、
    // "100" は 100 として計算式に乗る。呼び出し側(num())による事前変換は不要な文字列入力もこの通り動く。
    const result = est1RM("100", 5);
    expect(result).toBeCloseTo(100 * (1 + 5 / 30));
  });

  it("nullまたはundefined", () => {
    expect(est1RM(null, 5)).toBe(0);
    expect(est1RM(100, null)).toBe(0);
    expect(est1RM(undefined, 5)).toBe(0);
    expect(est1RM(100, undefined)).toBe(0);
  });

  it("ダンベル種目相当(effWeightで実効重量化してから渡すケース)", () => {
    const eff = effWeight(20, true, 0, 70); // 20kg片手ダンベル → 40kg実効
    expect(est1RM(eff, 8)).toBeCloseTo(40 * (1 + 8 / 30));
  });

  it("自重種目相当(effWeightで実効重量化してから渡すケース)", () => {
    const eff = effWeight(0, false, 0.65, 70); // 自重0.65係数、加重なし
    expect(est1RM(eff, 10)).toBeCloseTo(70 * 0.65 * (1 + 10 / 30));
  });
});

describe("effWeight (実効重量)", () => {
  it("通常種目(自重係数なし・ダンベルでない)はそのまま", () => {
    expect(effWeight(80, false, 0, 70)).toBe(80);
  });

  it("ダンベル種目は2倍(片手入力→両手合計)", () => {
    expect(effWeight(20, true, 0, 70)).toBe(40);
  });

  it("自重種目は 体重×係数+加重", () => {
    expect(effWeight(10, false, 0.95, 80)).toBeCloseTo(80 * 0.95 + 10);
  });

  it("自重かつダンベル(理論上は起きない組み合わせだが、現状の実装順序を固定)", () => {
    // 実装は bwFactor>0 を先に適用し、その後 isDb で2倍する順序。
    const w = effWeight(10, true, 0.95, 80);
    expect(w).toBeCloseTo((80 * 0.95 + 10) * 2);
  });

  it("bwFactorが0または未指定なら加重のみ", () => {
    expect(effWeight(50, false, 0, 70)).toBe(50);
  });

  it("bodyweightが0でもbwFactor=0なら影響しない", () => {
    expect(effWeight(50, false, 0, 0)).toBe(50);
  });
});

describe("dayBest1RMの除外フィルタ(ここが崩れると同じ日の1RMが画面ごとに食い違う)", () => {
  it("ウォームアップのセットは実力を表さないので除外する", () => {
    const sets = [
      workSet({ weight: 100, reps: 10, warmup: true }),
      workSet({ weight: 60, reps: 5 }),
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBeCloseTo(60 * (1 + 5 / 30));
  });

  it("補助あり(assisted)のセットは実力を表さないので除外する", () => {
    const sets = [
      workSet({ weight: 60, reps: 15, assisted: true }),
      workSet({ weight: 60, reps: 5 }),
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBeCloseTo(60 * (1 + 5 / 30));
  });

  it("補助ありセットの方が推定1RMが高くても、本番セットの値が勝つ", () => {
    // 補助ありは回数が伸びるため est1RM が本番を上回りやすい。
    // workingSets()相当(warmupだけ除く)の実装だと 90 が返って⚡バッジとズレる。
    const sets = [
      workSet({ weight: 60, reps: 15, assisted: true }), // 90.0
      workSet({ weight: 60, reps: 5 }), // 70.0
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBeCloseTo(70);
  });

  it("warmupとassistedの両方が立っていても除外する", () => {
    const sets = [
      workSet({ weight: 200, reps: 12, warmup: true, assisted: true }),
      workSet({ weight: 60, reps: 5 }),
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBeCloseTo(60 * (1 + 5 / 30));
  });

  it("フラグが未定義の古い記録は本番セットとして数える", () => {
    // warmup/assistedキーを持たない過去の記録が、除外されて0にならないこと。
    expect(dayBest1RM([{ weight: 60, reps: 5 }], false, 0, 70)).toBeCloseTo(60 * (1 + 5 / 30));
  });
});

describe("dayBest1RMの最大値の取り方", () => {
  it("最重量のセットではなく、推定1RMが最大のセットを採る", () => {
    // 75×10 → 100.0 が、82.5×6 → 99.0 を上回る。
    const sets = [
      workSet({ weight: 82.5, reps: 6 }),
      workSet({ weight: 75, reps: 10 }),
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBeCloseTo(100);
  });

  it("セットの並び順を変えても同じ値を返す", () => {
    const a = workSet({ weight: 82.5, reps: 6 });
    const b = workSet({ weight: 75, reps: 10 });
    expect(dayBest1RM([a, b], false, 0, 70)).toBeCloseTo(dayBest1RM([b, a], false, 0, 70));
  });

  it("1セットだけならそのセットの推定1RMを返す", () => {
    expect(dayBest1RM([workSet({ weight: 100, reps: 1 })], false, 0, 70)).toBe(100);
  });
});

describe("dayBest1RMの実効重量(種目の性質を反映する)", () => {
  it("ダンベル種目は片手入力の重量を2倍して計算する", () => {
    const sets = [workSet({ weight: 20, reps: 8 })];
    expect(dayBest1RM(sets, true, 0, 70)).toBeCloseTo(40 * (1 + 8 / 30));
  });

  it("自重種目は 体重×係数+加重 で計算する", () => {
    const sets = [workSet({ weight: 10, reps: 6 })];
    expect(dayBest1RM(sets, false, 0.95, 80)).toBeCloseTo((80 * 0.95 + 10) * (1 + 6 / 30));
  });

  it("自重種目で加重0でも、体重ぶんの負荷として数える", () => {
    const sets = [workSet({ weight: 0, reps: 10 })];
    expect(dayBest1RM(sets, false, 0.65, 70)).toBeCloseTo(70 * 0.65 * (1 + 10 / 30));
  });

  it("渡された体重で計算する(記録当時のbwAtLogと現在の体重で値が変わる)", () => {
    const sets = [workSet({ weight: 0, reps: 10 })];
    const atLog = dayBest1RM(sets, false, 0.65, 60);
    const now = dayBest1RM(sets, false, 0.65, 70);
    expect(atLog).toBeCloseTo(60 * 0.65 * (1 + 10 / 30));
    expect(now).toBeCloseTo(70 * 0.65 * (1 + 10 / 30));
  });
});

describe("dayBest1RMの境界値(記録が無い日を0で表せること)", () => {
  it("空配列は0", () => {
    expect(dayBest1RM([], false, 0, 70)).toBe(0);
  });

  it("undefinedは0(セット配列を持たない記録でも落ちない)", () => {
    expect(dayBest1RM(undefined, false, 0, 70)).toBe(0);
  });

  it("nullは0", () => {
    expect(dayBest1RM(null, false, 0, 70)).toBe(0);
  });

  it("全セットがwarmupなら0", () => {
    const sets = [
      workSet({ weight: 100, reps: 10, warmup: true }),
      workSet({ weight: 120, reps: 5, warmup: true }),
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBe(0);
  });

  it("全セットがassistedなら0", () => {
    const sets = [
      workSet({ weight: 0, reps: 12, assisted: true }),
      workSet({ weight: 0, reps: 10, assisted: true }),
    ];
    expect(dayBest1RM(sets, false, 0.95, 80)).toBe(0);
  });

  it("repsが0のセット(まだやっていない行)は0扱いで、他のセットの最大を壊さない", () => {
    const sets = [
      workSet({ weight: 100, reps: 0 }),
      workSet({ weight: 60, reps: 5 }),
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBeCloseTo(60 * (1 + 5 / 30));
  });

  it("repsが未入力のセットも0扱いで、他のセットの最大を壊さない", () => {
    const sets = [
      workSet({ weight: 100, reps: undefined }),
      workSet({ weight: 60, reps: 5 }),
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBeCloseTo(60 * (1 + 5 / 30));
  });

  it("全セットのrepsが未入力なら0(重量だけ入れた行が1RMとして表示されない)", () => {
    const sets = [
      workSet({ weight: 100, reps: 0 }),
      workSet({ weight: 120, reps: undefined }),
    ];
    expect(dayBest1RM(sets, false, 0, 70)).toBe(0);
  });

  it("重量0・回数ありの本番セットだけなら0(自重係数なしの種目)", () => {
    expect(dayBest1RM([workSet({ weight: 0, reps: 10 })], false, 0, 70)).toBe(0);
  });
});
