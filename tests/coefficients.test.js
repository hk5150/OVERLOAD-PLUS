import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { resolveCoefficients } = loadDomainModule("src/domain/coefficients.js");

// v102で実際に踏んだ2つのバグクラスを縛る。どちらも「記録として保存されてしまう」種類で、
// 種目マスターの値だけを検査する tests/exerciseCoefficients.test.js では捕まらなかった。

// findExercise 相当。allExercises(内蔵 + カスタム に上書きをマージ済み)を引く。
const makeLookup = ({ builtin = [], custom = [], overrides = {} } = {}) => {
  const all = [...builtin, ...custom].map(e => ({ ...e, ...(overrides[e.n] || {}) }));
  return (name) => all.find(e => e.n === name) || null;
};

const SHRUG = { n: "バーベルシュラッグ", m: "僧帽筋", rom: 0.3 };
const PUSHUP = { n: "プッシュアップ", m: "大胸筋", bw: 0.7 };

describe("係数の解決", () => {
  it("種目マスターの既定値を返す", () => {
    const lookup = makeLookup({ builtin: [SHRUG, PUSHUP] });
    expect(resolveCoefficients("バーベルシュラッグ", lookup).rom).toBe(0.3);
    expect(resolveCoefficients("プッシュアップ", lookup).bwFactor).toBe(0.7);
  });

  it("ユーザーの上書きが種目マスターより優先される", () => {
    const lookup = makeLookup({ builtin: [SHRUG], overrides: { "バーベルシュラッグ": { rom: 0.55 } } });
    expect(resolveCoefficients("バーベルシュラッグ", lookup).rom).toBe(0.55);
  });

  it("カスタム種目の体重係数が失われない", () => {
    // 索引にカスタム種目を含めない実装(dbLookup相当)にすると、自重のカスタム種目が
    // bwFactor:0 になり、実効重量もボリュームも0のまま記録されてしまう。
    const lookup = makeLookup({ builtin: [SHRUG], custom: [{ n: "自作の自重種目", m: "腹筋", bw: 0.45 }] });
    expect(resolveCoefficients("自作の自重種目", lookup).bwFactor).toBe(0.45);
  });

  it("カスタム種目にもユーザーの上書きが効く", () => {
    const lookup = makeLookup({
      custom: [{ n: "自作の自重種目", m: "腹筋", bw: 0.45 }],
      overrides: { "自作の自重種目": { bw: 0.6 } },
    });
    expect(resolveCoefficients("自作の自重種目", lookup).bwFactor).toBe(0.6);
  });

  it("索引に無い種目は素通しの既定値(rom=1.0 / bw=0)", () => {
    const lookup = makeLookup({ builtin: [SHRUG] });
    expect(resolveCoefficients("知らない種目", lookup)).toEqual({ bwFactor: 0, rom: 1.0 });
  });

  it("係数を持たない種目は減点も自重加算もされない", () => {
    const lookup = makeLookup({ builtin: [{ n: "バーベルベンチプレス", m: "大胸筋" }] });
    expect(resolveCoefficients("バーベルベンチプレス", lookup)).toEqual({ bwFactor: 0, rom: 1.0 });
  });

  it("記録側のスナップショットを受け取る口を持たない", () => {
    // 引数は (name, lookup) の2つだけ。過去の記録の値を渡せてしまうと、
    // saveWorkoutが毎回書き戻すのと相まって古い値が自己増殖し、
    // 種目マスターの更新が一度記録した種目に永久に届かなくなる。
    expect(resolveCoefficients.length).toBe(2);
  });
});
