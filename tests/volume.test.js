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

// nextSetType: セット種別ボタン(通常 → W → 補 → 通常)の巡回。
// 今日の記録画面と履歴の編集画面の両方から `{ ...s, ...nextSetType(s) }` で当てる。
// #appsrc 内にあった頃はテストが無く、両画面で別々に書かれていたため、片方だけ変えると
// warmup と assisted が両方立ったセットが保存されうる状態だった。両方立ったセットは
// addSet / applyWatchOps が直前の行を複製するときに「見えない補助セット」として増殖する。
// ここでは種別の遷移だけを縛る。ボタンの表示(W / 補 の文字)や、集計側が W・補助を
// どう扱うか(上の workingSets / exVolume)は対象外。
const { nextSetType } = loadDomainModule("src/domain/volume.js");

// 保存データでは補助でないセットは assisted キー自体を持たない
const normalSet = (overrides = {}) => ({ weight: 60, reps: 8, rir: 2, warmup: false, ...overrides });
const warmupSet = (overrides = {}) => normalSet({ warmup: true, ...overrides });
const assistedSet = (overrides = {}) => normalSet({ assisted: true, ...overrides });
const apply = (s) => ({ ...s, ...nextSetType(s) });
const typeOf = (s) => ({ warmup: !!s.warmup, assisted: !!s.assisted });

describe("nextSetType(Wと補助が両方立つと、行の複製で見えない補助セットが増える)", () => {
  it("通常の次はウォームアップ", () => {
    expect(nextSetType(normalSet({ assisted: false }))).toEqual({ warmup: true, assisted: false });
  });

  it("ウォームアップの次は補助あり", () => {
    expect(nextSetType(warmupSet())).toEqual({ warmup: false, assisted: true });
  });

  it("補助ありの次は通常", () => {
    expect(nextSetType(assistedSet())).toEqual({ warmup: false, assisted: false });
  });

  it("assistedキーが無いセットは通常として扱い、次はウォームアップ", () => {
    const s = normalSet();
    expect("assisted" in s).toBe(false);
    expect(nextSetType(s)).toEqual({ warmup: true, assisted: false });
  });

  it("過去データでWと補助が両方立っているセットは、W扱いで補助ありへ進む", () => {
    expect(nextSetType(normalSet({ warmup: true, assisted: true }))).toEqual({ warmup: false, assisted: true });
  });

  it("戻り値はwarmupとassistedの2フィールドだけで、重量・回数・RIRを上書きしない", () => {
    for (const s of [normalSet(), warmupSet(), assistedSet(), normalSet({ warmup: true, assisted: true })]) {
      expect(Object.keys(nextSetType(s)).sort()).toEqual(["assisted", "warmup"]);
      const next = apply(s);
      expect(next.weight).toBe(60);
      expect(next.reps).toBe(8);
      expect(next.rir).toBe(2);
    }
  });

  it("どの入力からでも、戻り値でwarmupとassistedが両方trueになることは無い", () => {
    const values = [true, false, undefined];
    for (const warmup of values) {
      for (const assisted of values) {
        const s = { weight: 60, reps: 8 };
        if (warmup !== undefined) s.warmup = warmup;
        if (assisted !== undefined) s.assisted = assisted;
        const r = nextSetType(s);
        expect(r.warmup && r.assisted).toBe(false);
      }
    }
  });

  it("通常・W・補のどこから始めても、3回適用すると元の種別に戻る", () => {
    for (const s of [normalSet(), normalSet({ assisted: false }), warmupSet(), assistedSet()]) {
      expect(typeOf(apply(apply(apply(s))))).toEqual(typeOf(s));
    }
  });

  it("両方立った過去データも、1回切り替えた後は通常→W→補の巡回に乗る", () => {
    const first = apply(normalSet({ warmup: true, assisted: true }));
    const seen = [first, apply(first), apply(apply(first))].map(typeOf);
    expect(seen).toEqual([
      { warmup: false, assisted: true },
      { warmup: false, assisted: false },
      { warmup: true, assisted: false },
    ]);
  });

  it("引数のセットを変更しない", () => {
    for (const s of [normalSet(), warmupSet(), assistedSet(), normalSet({ warmup: true, assisted: true })]) {
      const before = structuredClone(s);
      Object.freeze(s);
      nextSetType(s);
      expect(s).toEqual(before);
    }
  });

  it("戻り値は毎回新しいオブジェクトで、呼び出し間で共有されない", () => {
    const a = nextSetType(normalSet());
    const b = nextSetType(normalSet());
    expect(a).not.toBe(b);
  });
});

const { volumeGoalKey } = loadDomainModule("src/domain/volume.js");

describe("volumeGoalKey(ボリュームの基準の文言)", () => {
  it("同じ Day の記録が2回以上なら「過去N回平均」", () => {
    expect(volumeGoalKey({ n: 3, sameDay: true }, false)).toBe("log.volumeToGoDay");
    expect(volumeGoalKey({ n: 2, sameDay: true }, true)).toBe("log.volumeOverDay");
  });

  it("Day を問わず取ったときは「直近N回平均」", () => {
    expect(volumeGoalKey({ n: 3, sameDay: false }, false)).toBe("log.volumeToGoRecent");
    expect(volumeGoalKey({ n: 3, sameDay: false }, true)).toBe("log.volumeOverRecent");
  });

  it("基準が1回だけなら平均と呼ばずに「前回」(Day を問わない場合も)", () => {
    expect(volumeGoalKey({ n: 1, sameDay: true }, false)).toBe("log.volumeToGoPrev");
    expect(volumeGoalKey({ n: 1, sameDay: false }, true)).toBe("log.volumeOverPrev");
  });
});
