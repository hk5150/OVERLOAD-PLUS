import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { est1RM, effWeight } = loadDomainModule("src/domain/oneRm.js");

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
