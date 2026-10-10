import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { normalizeSupersets } = loadDomainModule("src/domain/superset.js");
const ex = (name, ssGroup) => (ssGroup === undefined ? { name } : { name, ssGroup });

describe("スーパーセットの片割れを外す", () => {
  it("2種目のうち下を解除して残った上の印を外す(1.4 (18) の不具合)", () => {
    const r = normalizeSupersets([ex("A", "g"), ex("B", null)]);
    expect(r[0]).not.toHaveProperty("ssGroup");
  });
  it("隣り合う同じ印はそのまま。変わらなければ同じ配列を返す", () => {
    const list = [ex("A", "g"), ex("B", "g"), ex("C")];
    expect(normalizeSupersets(list)).toBe(list);
  });
  it("並べ替えで離れた同じ印は両方外す", () => {
    const r = normalizeSupersets([ex("A", "g"), ex("C"), ex("B", "g")]);
    expect(r.every(e => !("ssGroup" in e))).toBe(true);
  });
  it("3種目の真ん中を外した後の両端も外す", () => {
    const r = normalizeSupersets([ex("A", "g"), ex("B", null), ex("C", "g")]);
    expect(r.filter(e => "ssGroup" in e && e.ssGroup)).toHaveLength(0);
  });
  it("配列でないものはそのまま返す", () => {
    expect(normalizeSupersets(undefined)).toBe(undefined);
  });
});
