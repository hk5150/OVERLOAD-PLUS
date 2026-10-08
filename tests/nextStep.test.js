import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { suggestNextStep, aiTextIsConsistent } = loadDomainModule("src/domain/nextStep.js");

// exerciseInsight の結果のうち、規則が使う項目だけ
const ins = (o = {}) => ({ topWeight: 70, topReps: 8, topRir: 1, readyToProgress: true, bestRecentReps: 8, canAddWeight: true, ...o });
const args = (o = {}) => ({ insight: ins(o.insight), topWeight: 70, increment: 2.5, repLow: 8, repHigh: 10, ...o.rest });

describe("suggestNextStep(次の一手の規則)", () => {
  it("前回の記録が無い・回数が無いときは案を出さない", () => {
    expect(suggestNextStep({ insight: null, topWeight: 0, increment: 2.5, repLow: 8, repHigh: 10 })).toBeNull();
    expect(suggestNextStep(args({ insight: { topWeight: null } }))).toBeNull();
    expect(suggestNextStep(args({ insight: { topReps: 0 } }))).toBeNull();
  });

  it("上限回数に届き、余力が1以上なら、刻みだけ増やして下限の回数から", () => {
    const s = suggestNextStep(args({ insight: { topReps: 10, topRir: 1 } }));
    expect(s).toMatchObject({ kind: "add", weight: 72.5, repsLow: 8, repsHigh: 10, inc: 2.5 });
    expect(s.reason.key).toBe("next.reason.add");
  });

  it("上限回数に届いても余力0なら据え置く", () => {
    expect(suggestNextStep(args({ insight: { topReps: 10, topRir: 0 } }))).toMatchObject({ kind: "hold", weight: 70, repsLow: 10 });
  });

  it("上限に届いていなければ、同じ重量で回数を1つ増やす", () => {
    expect(suggestNextStep(args({ insight: { topReps: 8 } }))).toMatchObject({ kind: "reps", weight: 70, repsLow: 9, repsHigh: 9 });
  });

  it("回数が落ちている最中は、重量据え置きで直近の最高回数に戻す", () => {
    const s = suggestNextStep(args({ insight: { topReps: 7, readyToProgress: false, bestRecentReps: 9 } }));
    expect(s).toMatchObject({ kind: "recover", weight: 70, repsLow: 9 });
  });

  it("加重できない種目は回数だけ", () => {
    const s = suggestNextStep(args({ insight: { topWeight: 0, topReps: 15, canAddWeight: false }, rest: { topWeight: 0 } }));
    expect(s).toMatchObject({ kind: "reps", weight: 0, repsLow: 16 });
    expect(s.reason.key).toBe("next.reason.bodyweight");
  });

  it("表示単位(lb)のまま計算する(呼び出し側で換算した値を使う)", () => {
    expect(suggestNextStep(args({ insight: { topReps: 10 }, rest: { topWeight: 155, increment: 5 } }))).toMatchObject({ weight: 160, inc: 5 });
  });

  it("前回が自重だけ(重量0)なら、理由は「前回は0kgで」ではなく自重の文", () => {
    expect(suggestNextStep(args({ insight: { topReps: 8 }, rest: { topWeight: 0 } })).reason.key).toBe("next.reason.repsBw");
  });

  it("刻みが0なら増量の案は出さず、回数の案にする", () => {
    expect(suggestNextStep(args({ insight: { topReps: 10 }, rest: { increment: 0 } }))).toMatchObject({ kind: "reps", repsLow: 11 });
  });
});

describe("aiTextIsConsistent(端末内AIの文に、案に無い数字が無いか)", () => {
  const allowed = [70, 72.5, 8, 10, 2.5, 1];
  it("案と根拠の数字だけなら使う", () => {
    expect(aiTextIsConsistent("前回は70kgで10回、余力1。次は72.5kgで8回から。", allowed)).toBe(true);
    expect(aiTextIsConsistent("Last time 70 × 10 with 1 in reserve.", allowed)).toBe(true);
  });
  it("案に無い数字が混ざっていたら使わない(全角数字も見る)", () => {
    expect(aiTextIsConsistent("次は75kgで8回。", allowed)).toBe(false);
    expect(aiTextIsConsistent("次は７５kg。", allowed)).toBe(false);
  });
  it("空・文字列でないものは使わない", () => {
    expect(aiTextIsConsistent("", allowed)).toBe(false);
    expect(aiTextIsConsistent(null, allowed)).toBe(false);
  });
});
