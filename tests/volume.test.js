import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// effWeightは実装(src/domain/oneRm.js)をそのまま使う。resolveIsDb/resolveRomはまだ
// #appsrc内にあり種目マスタ全体に依存するため、setVolume/exVolume自身のロジックだけを
// テストする目的で、保存値をそのまま返す簡易版に差し替える(名前ベースの上書き解決は対象外)。
const { effWeight } = loadDomainModule("src/domain/oneRm.js");
const resolveIsDb = (name, storedIsDb) => !!storedIsDb;
const resolveRom = (name, storedRom) => storedRom ?? 1;
const deps = { effWeight, resolveIsDb, resolveRom };

const { workingSets, setVolume, exVolume } = loadDomainModule("src/domain/volume.js");

const ex = (overrides = {}) => ({ name: "テスト種目", isDb: false, bwFactor: 0, rom: 1, ...overrides });
const set = (overrides = {}) => ({ weight: 20, reps: 10, warmup: false, ...overrides });

describe("workingSets", () => {
  it("ウォームアップを除外する", () => {
    const e = ex({ sets: [set({ warmup: true }), set(), set()] });
    expect(workingSets(e)).toHaveLength(2);
  });

  it("補助ありセットは除外しない(実施した事実として評価する仕様。要検討事項として残っている点はdocs/vite移行.md参照)", () => {
    const e = ex({ sets: [set({ assisted: true }), set()] });
    expect(workingSets(e)).toHaveLength(2);
  });

  it("setsが無い種目は空配列", () => {
    expect(workingSets(ex({ sets: undefined }))).toEqual([]);
  });
});

describe("setVolume (1セットの集計ボリューム)", () => {
  it("通常種目: 実効重量 × 回数 × ROM(1.0)", () => {
    const e = ex({ isDb: false, bwFactor: 0, rom: 1 });
    const s = set({ weight: 60, reps: 8 });
    expect(setVolume(e, s, 70, deps)).toBe(60 * 8 * 1);
  });

  it("ダンベル種目: 実効重量が2倍になる(片手入力→両手)", () => {
    const e = ex({ isDb: true, bwFactor: 0, rom: 1 });
    const s = set({ weight: 20, reps: 10 });
    expect(setVolume(e, s, 70, deps)).toBe(40 * 10 * 1);
  });

  it("自重種目: 実効重量は 体重×係数+加重", () => {
    const e = ex({ isDb: false, bwFactor: 0.95, rom: 1 });
    const s = set({ weight: 5, reps: 12 });
    const bodyweight = 80;
    expect(setVolume(e, s, bodyweight, deps)).toBeCloseTo((80 * 0.95 + 5) * 12 * 1);
  });

  it("ROM係数あり(シュラッグ等0.5): ボリュームだけ半分になる", () => {
    const e = ex({ isDb: false, bwFactor: 0, rom: 0.5 });
    const s = set({ weight: 100, reps: 10 });
    expect(setVolume(e, s, 70, deps)).toBe(100 * 10 * 0.5);
  });

  it("ROM係数なし(既定1.0)は等倍", () => {
    const e = ex({ rom: 1 });
    const s = set({ weight: 50, reps: 5 });
    expect(setVolume(e, s, 70, deps)).toBe(50 * 5 * 1);
  });

  it("bwAtLog(記録時点の体重)があれば、現在のprofile.bodyweightより優先される", () => {
    const e = ex({ isDb: false, bwFactor: 1, rom: 1, bwAtLog: 65 });
    const s = set({ weight: 0, reps: 10 });
    // 呼び出し側から渡すbodyweight(80)ではなく、記録時点のbwAtLog(65)が使われる
    expect(setVolume(e, s, 80, deps)).toBe(65 * 10 * 1);
  });

  it("RIRの有無はsetVolume自身の関知するところではない(呼び出し側の責務)", () => {
    // saveWorkoutが保存前にRIR未入力の非ウォームアップセットを除外する前提のため、
    // setVolume/exVolumeはRIRを一切見ない。保存済みデータにRIR無しのセットが
    // 混入していても(異常系として)そのまま計算に含める、という現状の挙動を固定する。
    const e = ex();
    const s = set({ rir: "" });
    expect(setVolume(e, s, 70, deps)).toBe(20 * 10 * 1);
  });
});

describe("exVolume (1種目分の合計ボリューム)", () => {
  it("通常種目・複数セットの合計", () => {
    const e = ex({ sets: [set({ weight: 60, reps: 8 }), set({ weight: 60, reps: 8 }), set({ weight: 62.5, reps: 6 })] });
    expect(exVolume(e, 70, deps)).toBeCloseTo(60 * 8 + 60 * 8 + 62.5 * 6);
  });

  it("ウォームアップは合計から除外される", () => {
    const e = ex({ sets: [set({ weight: 20, reps: 10, warmup: true }), set({ weight: 60, reps: 8 })] });
    expect(exVolume(e, 70, deps)).toBe(60 * 8);
  });

  it("補助ありセットは合計に含まれる", () => {
    const e = ex({ sets: [set({ weight: 60, reps: 8, assisted: true })] });
    expect(exVolume(e, 70, deps)).toBe(60 * 8);
  });

  it("片手ダンベル種目の合計は2倍換算される", () => {
    const e = ex({ isDb: true, sets: [set({ weight: 20, reps: 10 }), set({ weight: 20, reps: 8 })] });
    expect(exVolume(e, 70, deps)).toBe(40 * 10 + 40 * 8);
  });

  it("セットが1つも無ければ0", () => {
    expect(exVolume(ex({ sets: [] }), 70, deps)).toBe(0);
  });

  it("全セットがウォームアップなら0", () => {
    const e = ex({ sets: [set({ warmup: true }), set({ warmup: true })] });
    expect(exVolume(e, 70, deps)).toBe(0);
  });
});
