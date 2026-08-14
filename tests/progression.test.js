import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { roundToIncrement } = loadDomainModule("src/domain/progression.js");

describe("roundToIncrement (重量丸め)", () => {
  it("2.5kg刻み", () => {
    expect(roundToIncrement(61.3, 2.5)).toBe(62.5);
    expect(roundToIncrement(60, 2.5)).toBe(60);
  });

  it("1.25kg刻み", () => {
    expect(roundToIncrement(21, 1.25)).toBe(21.25);
  });

  it("1kg刻み", () => {
    expect(roundToIncrement(20.4, 1)).toBe(20);
    expect(roundToIncrement(20.6, 1)).toBe(21);
  });

  it("0.5kg刻み", () => {
    expect(roundToIncrement(12.2, 0.5)).toBe(12);
    expect(roundToIncrement(12.3, 0.5)).toBe(12.5);
  });

  it("増加幅0 — 現状の実装ではゼロ除算経由でNaNになる(analyzeExercise呼び出し元は増加幅>0を保証しているため実運用では到達しないが、単体では固定しておく)", () => {
    expect(Number.isNaN(roundToIncrement(60, 0))).toBe(true);
  });

  it("負数の重量 — 丸めた結果が負になってもMath.maxで0未満にはならない", () => {
    expect(roundToIncrement(-10, 2.5)).toBe(0);
  });

  it("負数の増加幅 — 現状の実装をそのまま固定(符号反転した丸めになる)", () => {
    const result = roundToIncrement(60, -2.5);
    expect(result).toBe(Math.max(0, Math.round(60 / -2.5) * -2.5));
  });

  it("小数誤差が出うる入力でも丸め結果は増加幅の整数倍になる", () => {
    const result = roundToIncrement(23.333333, 2.5);
    expect(result % 2.5).toBeCloseTo(0);
  });

  it("非数値(NaN)を渡すとNaNのまま", () => {
    expect(Number.isNaN(roundToIncrement(NaN, 2.5))).toBe(true);
  });
});
