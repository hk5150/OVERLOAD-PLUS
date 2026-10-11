import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { resolveCoefficients, absorbBuiltinNameClash } = loadDomainModule("src/domain/coefficients.js");

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

// absorbBuiltinNameClash: 内蔵種目と同じ名前のカスタム種目を、内蔵種目への上書き(exerciseOverrides)に移す。
// 2026-10 に内蔵へ19種目(ヒップアダクション・チンアップ・片手ケーブルロウなど)を足したことで、
// 同じ名前で作っていたカスタム種目が一覧に2行出て、しかも設定画面の編集はカスタム側を書くのに
// 計算は内蔵側を見るので「直しても効かない」状態になる。それを読み込み・復元・復元の取り消しで解消する。
// 上書きに入れるのは内蔵の既定と違う項目だけ。同じ値まで書くと、以後マスターの更新が届かなくなる
// (上の v102 と同じ自己固定。docs/係数の根拠.md の落とし穴3)。
// 対象外: 記録側(workouts)の種目名・係数のスナップショットは触らない関数なので、ここでも見ない。

// 内蔵種目の定義(index.html の EXERCISE_DB の該当行と同じ値)
const BUILTIN = {
  "片手ケーブルロウ": { n: "片手ケーブルロウ", m: "広背筋", eq: "ケーブル", t: "C", db: true },
  "チンアップ": { n: "チンアップ", m: "広背筋", eq: "自重", t: "C", bw: 1.0 },
  "ヒップスラストマシン": { n: "ヒップスラストマシン", m: "臀部", eq: "マシン", t: "C", rom: 0.7 },
};
const master = (n) => BUILTIN[n] || null;
const sampleCustom = (overrides = {}) => ({ n: "片手ケーブルロウ", m: "広背筋", eq: "ケーブル", ...overrides });

describe("absorbBuiltinNameClash(内蔵と同名のカスタム種目を上書きに移す。漏れると一覧に2行出て、編集が効かない)", () => {
  it("内蔵と同名のカスタム種目は customExercises から消え、同名でないものは元の順序のまま残る", () => {
    const customs = [
      { n: "自作プレスA", m: "大胸筋", eq: "マシン" },
      sampleCustom(),
      { n: "自作ロウB", m: "広背筋", eq: "ケーブル" },
      { n: "チンアップ", m: "広背筋", eq: "自重", bw: 1.0 },
      { n: "自作カールC", m: "上腕二頭筋", eq: "ダンベル", db: true },
    ];
    const out = absorbBuiltinNameClash(customs, {}, master);
    expect(out.customExercises.map(c => c.n)).toEqual(["自作プレスA", "自作ロウB", "自作カールC"]);
  });

  it("カスタムの「片手ケーブルロウ」(ケーブル・db なし)は { db: false } だけを上書きに入れる", () => {
    const out = absorbBuiltinNameClash([sampleCustom()], {}, master);
    expect(out.exerciseOverrides).toEqual({ "片手ケーブルロウ": { db: false } });
  });

  it("内蔵の既定と違う m・eq・db・bw・rom を上書きに入れる", () => {
    const custom = { n: "ヒップスラストマシン", m: "ハムストリングス", eq: "スミス", db: true, bw: 0.3, rom: 0.5 };
    const out = absorbBuiltinNameClash([custom], {}, master);
    expect(out.exerciseOverrides).toEqual({ "ヒップスラストマシン": { m: "ハムストリングス", eq: "スミス", db: true, bw: 0.3, rom: 0.5 } });
  });

  it("内蔵の既定とすべて同じなら、上書きを書かない", () => {
    const out = absorbBuiltinNameClash([{ n: "チンアップ", m: "広背筋", eq: "自重", bw: 1.0 }], {}, master);
    expect(out.customExercises).toEqual([]);
    expect(out.exerciseOverrides).toEqual({});
  });

  it("内蔵が bw を持つ種目で、カスタム側に bw が無ければ bw: 0 を上書きに入れる", () => {
    const out = absorbBuiltinNameClash([{ n: "チンアップ", m: "広背筋", eq: "自重" }], {}, master);
    expect(out.exerciseOverrides).toEqual({ "チンアップ": { bw: 0 } });
  });

  it("rom はカスタム側に無ければ書かず、内蔵が rom を持たないときの 1.0 は既定と同じとみなす", () => {
    const noRom = absorbBuiltinNameClash([{ n: "ヒップスラストマシン", m: "臀部", eq: "マシン" }], {}, master);
    expect(noRom.exerciseOverrides).toEqual({});
    const romOne = absorbBuiltinNameClash([sampleCustom({ db: true, rom: 1.0 })], {}, master);
    expect(romOne.exerciseOverrides).toEqual({});
  });

  it("既存の上書きがある項目は、既存の上書きが勝つ", () => {
    const custom = sampleCustom({ eq: "マシン" }); // eq と db の両方が既定と違う
    const out = absorbBuiltinNameClash([custom], { "片手ケーブルロウ": { db: true, rom: 0.8 } }, master);
    expect(out.exerciseOverrides).toEqual({ "片手ケーブルロウ": { eq: "マシン", db: true, rom: 0.8 } });
  });

  it("ほかの種目の既存の上書きは残る", () => {
    const ovs = { "バーベルシュラッグ": { rom: 0.55 } };
    const out = absorbBuiltinNameClash([sampleCustom()], ovs, master);
    expect(out.exerciseOverrides["バーベルシュラッグ"]).toEqual({ rom: 0.55 });
  });

  it("衝突が無いときは、受け取った配列と上書きをそのまま(同じ参照で)返す", () => {
    const customs = [{ n: "自作プレスA", m: "大胸筋", eq: "マシン" }];
    const ovs = { "バーベルシュラッグ": { rom: 0.55 } };
    const out = absorbBuiltinNameClash(customs, ovs, master);
    expect(out.customExercises).toBe(customs);
    expect(out.exerciseOverrides).toBe(ovs);
  });

  it("2回通しても結果が同じ", () => {
    const customs = [{ n: "自作プレスA", m: "大胸筋", eq: "マシン" }, sampleCustom({ eq: "マシン" })];
    const once = absorbBuiltinNameClash(customs, { "チンアップ": { bw: 0.9 } }, master);
    const twice = absorbBuiltinNameClash(once.customExercises, once.exerciseOverrides, master);
    expect(twice).toEqual(once);
  });

  it("受け取った配列・上書き・種目を書き換えない", () => {
    const customs = [sampleCustom(), { n: "自作プレスA", m: "大胸筋", eq: "マシン" }];
    const ovs = { "片手ケーブルロウ": { rom: 0.8 } };
    const before = JSON.parse(JSON.stringify({ customs, ovs }));
    absorbBuiltinNameClash(customs, ovs, master);
    expect({ customs, ovs }).toEqual(before);
  });

  it("null や undefined を受けても落ちず、空の結果を返す", () => {
    expect(absorbBuiltinNameClash(null, null, master)).toEqual({ customExercises: [], exerciseOverrides: {} });
    expect(absorbBuiltinNameClash(undefined, undefined, master)).toEqual({ customExercises: [], exerciseOverrides: {} });
    expect(absorbBuiltinNameClash([sampleCustom()], null, master).exerciseOverrides).toEqual({ "片手ケーブルロウ": { db: false } });
  });

  it("配列の中に null が混ざっていても落ちない", () => {
    expect(() => absorbBuiltinNameClash([null, sampleCustom()], {}, master)).not.toThrow();
  });
});

// npm test は index.html を実行しないので、どれか1経路で呼び忘れても単体テストは緑のまま。
// 呼び忘れた経路(例えば復元)を通ると、同名のカスタム種目が戻ってきて一覧に2行出る。
describe("absorbBuiltinNameClash の配線(#appsrc)", () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
  const appsrc = indexHtml.slice(indexHtml.indexOf('id="appsrc"'))
    .split("\n").filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");

  it("migrateCustoms が absorbBuiltinNameClash を DB_BY_NAME で呼んでいる", () => {
    expect(appsrc).toMatch(/const migrateCustoms = [^\n]*absorbBuiltinNameClash\([^\n]*DB_BY_NAME/);
  });

  it("読み込み時に migrateCustoms の結果を setCustomExercises と setExerciseOverrides に渡している", () => {
    const m = appsrc.match(/const (\w+) = migrateCustoms\(p\);([\s\S]{0,400})/);
    expect(m).not.toBe(null);
    const [, v, after] = m;
    expect(after).toContain(`setCustomExercises(${v}.customExercises)`);
    expect(after).toContain(`setExerciseOverrides(${v}.exerciseOverrides)`);
  });

  it("復元と復元の取り消しの2経路が migrateCustoms を通している", () => {
    expect([...appsrc.matchAll(/\.\.\.migrateCustoms\(p\)/g)]).toHaveLength(2);
  });

  it("customExercises / exerciseOverrides を p から直接読む経路が残っていない", () => {
    expect(appsrc).not.toMatch(/setCustomExercises\(p\.customExercises/);
    expect(appsrc).not.toMatch(/customExercises: p\.customExercises/);
    expect(appsrc).not.toMatch(/exerciseOverrides: p\.exerciseOverrides/);
  });
});
