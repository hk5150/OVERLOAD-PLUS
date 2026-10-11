import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadDomainModule } from "./helpers/loadDomain.js";

// 人体図(src/domain/bodyMap.js)の形と、塗る部位の決め方を縛る。
// 一番怖いのは「index.html の MUSCLES に部位を足したのに、人体図に形が無い」状態で、
// その部位を鍛えた日も図が灰色のまま、という無症状の欠落になる。ここで MUSCLES と突き合わせる。
// あわせて、座標の打ち間違い(viewBox 100×220 からはみ出す)と、
// 右半身を作る mirrorBodyPath の往復を確かめる。
// 対象外: 形が人体として自然に見えるか(目視でしか判断できない)、SVGとしての描画結果。
// bodyHitMuscles に渡す norm(index.html の normMuscle)そのものは #appsrc の中にあり、ここでは偽物を渡す。

const bm = loadDomainModule("src/domain/bodyMap.js");
const { mirrorBodyPath, BODY_SILHOUETTE, BODY_HEAD, BODY_REGIONS, BODY_DETAILS, bodyHitMuscles } = bm;

// MUSCLES は index.html の #appsrc の中にあるので、文字列から拾う(tests/dayPlan.test.js と同じ拾い方)
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const musclesSrc = html.match(/const MUSCLES = \[([\s\S]*?)\];/)[1];
const MUSCLES = [...musclesSrc.matchAll(/"([^"]+)"/g)].map(m => m[1]);

function sampleExercise(overrides = {}) {
  return {
    name: "バーベルベンチプレス",
    muscle: "大胸筋",
    sets: [{ weight: 60, reps: 8, rir: 2, warmup: false }],
    ...overrides,
  };
}

// vm の別レルムで作られた Set なので、配列にして比べる
const hit = (exercises, norm) => [...bodyHitMuscles(exercises, norm)].sort();

function allPaths() {
  const paths = [["BODY_SILHOUETTE", BODY_SILHOUETTE], ["BODY_HEAD", BODY_HEAD]];
  for (const [muscle, faces] of Object.entries(BODY_REGIONS)) {
    faces.forEach((d, i) => { if (d !== null) paths.push([`${muscle}[${i}]`, d]); });
  }
  BODY_DETAILS.forEach((faces, j) => {
    faces.forEach((d, i) => { if (d !== null) paths.push([`BODY_DETAILS[${j}][${i}]`, d]); });
  });
  return paths;
}

describe("BODY_REGIONS(部位を足したのに人体図に形が無い、を防ぐ)", () => {
  it("キーが index.html の MUSCLES から「全身」を除いたものと過不足なく一致する", () => {
    const expected = MUSCLES.filter(m => m !== "全身");
    const actual = Object.keys(BODY_REGIONS);
    const missing = expected.filter(m => !actual.includes(m));
    const extra = actual.filter(m => !expected.includes(m));
    expect(missing, `人体図に無い部位: ${missing.join(", ")}`).toEqual([]);
    expect(extra, `MUSCLES に無い部位: ${extra.join(", ")}`).toEqual([]);
  });

  it("MUSCLES の拾い方が壊れていない(全身を含めて1つ以上拾えている)", () => {
    expect(MUSCLES).toContain("全身");
    expect(MUSCLES.length).toBeGreaterThan(1);
  });

  it("どの部位も、前か後ろの少なくとも一方に空でない形がある", () => {
    for (const [muscle, faces] of Object.entries(BODY_REGIONS)) {
      expect(faces).toHaveLength(2);
      const drawn = faces.filter(d => typeof d === "string" && d.trim() !== "");
      expect(drawn.length, muscle).toBeGreaterThan(0);
    }
  });
});

describe("パスの座標(打ち間違いで人体の外に飛び出さない)", () => {
  it("すべてのパスが M で始まる", () => {
    for (const [label, d] of allPaths()) {
      expect(typeof d, label).toBe("string");
      expect(d.startsWith("M"), label).toBe(true);
    }
  });

  it("すべての座標が viewBox 100×220 の範囲に収まる", () => {
    for (const [label, d] of allPaths()) {
      const pairs = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)];
      expect(pairs.length, label).toBeGreaterThan(0);
      for (const [, xs, ys] of pairs) {
        const x = Number(xs), y = Number(ys);
        expect(x >= 0 && x <= 100, `${label}: x=${x}`).toBe(true);
        expect(y >= 0 && y <= 220, `${label}: y=${y}`).toBe(true);
      }
    }
  });

  it("右半身に折り返しても範囲に収まる", () => {
    for (const [label, d] of allPaths()) {
      for (const [, xs] of mirrorBodyPath(d).matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
        const x = Number(xs);
        expect(x >= 0 && x <= 100, `${label}: x=${x}`).toBe(true);
      }
    }
  });
});

describe("mirrorBodyPath(右半身の形はここで作る)", () => {
  it("x を 100 で折り返し、y はそのまま残す", () => {
    expect(mirrorBodyPath("M30,40 L45,60")).toBe("M70,40 L55,60");
  });

  it("曲線のコマンドや Z もそのまま残す", () => {
    expect(mirrorBodyPath("M50,4 C43,4 40,10 40,17 Z")).toBe("M50,4 C57,4 60,10 60,17 Z");
  });

  it("小数の x も折り返し、小数の y は書き換えない", () => {
    expect(mirrorBodyPath("M30.5,40.25 L12.75,60.5")).toBe("M69.5,40.25 L87.25,60.5");
  });

  it("2回かけると元に戻る", () => {
    for (const d of ["M30,40 L45,60", "M30.5,40.25 L12.75,60.5 Z", "M0,0 L100,220"]) {
      expect(mirrorBodyPath(mirrorBodyPath(d))).toBe(d);
    }
  });

  it("実際の形も2回かけると元に戻る", () => {
    for (const [label, d] of allPaths()) {
      expect(mirrorBodyPath(mirrorBodyPath(d)), label).toBe(d);
    }
  });
});

describe("bodyHitMuscles(塗る部位の決め方)", () => {
  it("種目の部位を Set にして返す", () => {
    const result = bodyHitMuscles([sampleExercise(), sampleExercise({ name: "ラットプルダウン", muscle: "広背筋" })]);
    expect(result.size).toBe(2);
    expect(hit([sampleExercise(), sampleExercise({ name: "ラットプルダウン", muscle: "広背筋" })])).toEqual(["大胸筋", "広背筋"].sort());
  });

  it("同じ部位の種目が複数あっても1つにまとめる", () => {
    expect(hit([sampleExercise(), sampleExercise({ name: "ケーブルフライ" })])).toEqual(["大胸筋"]);
  });

  it("部位名を norm で正規化してから数える(旧名「胸」は「大胸筋」として塗る)", () => {
    const norm = m => (m === "胸" ? "大胸筋" : m);
    expect(hit([sampleExercise({ muscle: "胸" })], norm)).toEqual(["大胸筋"]);
  });

  it("norm を省略したら muscle をそのまま使う", () => {
    expect(hit([sampleExercise({ muscle: "広背筋" })])).toEqual(["広背筋"]);
    expect(hit([sampleExercise({ muscle: "胸" })])).toEqual([]);
  });

  it("全部のセットがウォームアップの種目は数えない", () => {
    const ex = sampleExercise({ sets: [{ weight: 20, reps: 10, warmup: true }, { weight: 40, reps: 5, warmup: true }] });
    expect(hit([ex])).toEqual([]);
  });

  it("本番セットが1つでもあれば数える", () => {
    const ex = sampleExercise({ sets: [{ weight: 20, reps: 10, warmup: true }, { weight: 60, reps: 8, rir: 2, warmup: false }] });
    expect(hit([ex])).toEqual(["大胸筋"]);
  });

  it("セットが空の種目は数える", () => {
    expect(hit([sampleExercise({ sets: [] })])).toEqual(["大胸筋"]);
  });

  it("「全身」は塗らない", () => {
    expect(hit([sampleExercise({ name: "バーピー", muscle: "全身" })])).toEqual([]);
  });

  it("norm が「全身」に直した場合も塗らない", () => {
    expect(hit([sampleExercise({ muscle: "全身運動" })], m => (m === "全身運動" ? "全身" : m))).toEqual([]);
  });

  it("BODY_REGIONS に無い部位名は入れない", () => {
    expect(hit([sampleExercise({ muscle: "首" }), sampleExercise({ muscle: "toString" }), sampleExercise({ muscle: "" })])).toEqual([]);
  });

  it("exercises が undefined / null でも空の Set を返す", () => {
    expect(hit(undefined)).toEqual([]);
    expect(hit(null)).toEqual([]);
    expect(hit([])).toEqual([]);
  });

  it("null の種目を含んでも落ちず、残りの種目は数える", () => {
    expect(hit([null, undefined, sampleExercise()])).toEqual(["大胸筋"]);
  });

  it("sets や muscle が欠けた種目でも落ちない", () => {
    expect(hit([{ name: "部位なし" }, sampleExercise({ sets: undefined })])).toEqual(["大胸筋"]);
  });
});
