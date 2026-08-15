import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { extractWorkoutsArray, validateWorkoutsShape } = loadDomainModule("src/domain/backupValidation.js");

const validWorkout = (overrides = {}) => ({
  date: "2026-08-01T00:00:00.000Z",
  exercises: [{ name: "バーベルベンチプレス", sets: [{ weight: 60, reps: 8, warmup: false, rir: 1 }] }],
  ...overrides,
});

describe("extractWorkoutsArray", () => {
  it("新形式({ workouts: [...] })から取り出せる", () => {
    expect(extractWorkoutsArray({ workouts: [validWorkout()] })).toHaveLength(1);
  });

  it("旧形式(配列そのもの)もそのまま返す", () => {
    const arr = [validWorkout()];
    expect(extractWorkoutsArray(arr)).toBe(arr);
  });

  it("workoutsが無いオブジェクトはundefinedを返す", () => {
    expect(extractWorkoutsArray({})).toBeUndefined();
  });

  it("nullを渡すとエラーにならずundefinedを返す", () => {
    expect(extractWorkoutsArray(null)).toBeUndefined();
  });
});

describe("validateWorkoutsShape", () => {
  it("正常な現行形式は例外を投げない", () => {
    expect(() => validateWorkoutsShape([validWorkout()])).not.toThrow();
  });

  it("複数件・複数種目でも正常に通る", () => {
    const ws = [validWorkout(), validWorkout({ exercises: [
      { name: "ダンベルフライ", sets: [] },
      { name: "サイドレイズ", sets: [{ weight: 8, reps: 12, warmup: true, rir: "" }] },
    ] })];
    expect(() => validateWorkoutsShape(ws)).not.toThrow();
  });

  it("workoutsが配列でない", () => {
    expect(() => validateWorkoutsShape({})).toThrow(/配列ではありません/);
    expect(() => validateWorkoutsShape(undefined)).toThrow(/配列ではありません/);
    expect(() => validateWorkoutsShape("not an array")).toThrow(/配列ではありません/);
  });

  it("exerciseが配列でない(1件目の記録)", () => {
    expect(() => validateWorkoutsShape([validWorkout({ exercises: "broken" })]))
      .toThrow(/1件目の記録の種目データが配列ではありません/);
  });

  it("setsが配列でない(1件目の記録・1種目目)", () => {
    const ws = [validWorkout({ exercises: [{ name: "懸垂", sets: "broken" }] })];
    expect(() => validateWorkoutsShape(ws)).toThrow(/1件目の記録・1種目目のセットデータが配列ではありません/);
  });

  it("重量が文字列でも(sets自体の型は見ないため)スキーマ検証は通る", () => {
    // このバリデーションは形状のみを見る。値の型強制(num())は保存経路が別途担当するため、
    // ここでは文字列の重量が入っていてもスキーマ違反として弾かない現状の挙動を固定する。
    const ws = [validWorkout({ exercises: [{ name: "懸垂", sets: [{ weight: "60", reps: "8" }] }] })];
    expect(() => validateWorkoutsShape(ws)).not.toThrow();
  });

  it("必須キー不足(dateが無い)", () => {
    const ws = [{ exercises: [] }];
    expect(() => validateWorkoutsShape(ws)).toThrow(/1件目の記録に日付がありません/);
  });

  it("種目名が不正(2件目の記録・2種目目)", () => {
    const ws = [
      validWorkout(),
      validWorkout({ exercises: [{ name: "懸垂", sets: [] }, { name: 123, sets: [] }] }),
    ];
    expect(() => validateWorkoutsShape(ws)).toThrow(/2件目の記録・2種目目の名前が不正です/);
  });

  it("記録そのものがオブジェクトでない", () => {
    expect(() => validateWorkoutsShape([null])).toThrow(/1件目の記録の形式が不正です/);
    expect(() => validateWorkoutsShape(["broken"])).toThrow(/1件目の記録の形式が不正です/);
  });

  it("異常に巨大な配列でも(件数自体は制限しない)形状が正しければ通る", () => {
    const ws = Array.from({ length: 5000 }, () => validWorkout());
    expect(() => validateWorkoutsShape(ws)).not.toThrow();
  });

  it("空配列は正常(記録0件のバックアップ)", () => {
    expect(() => validateWorkoutsShape([])).not.toThrow();
  });
});

describe("extractWorkoutsArray + validateWorkoutsShape (importBackup/起動読み込みでの実際の使い方)", () => {
  it("未知のトップレベル形式(workoutsもArrayでもない)は取り出した時点でundefinedになり、検証でエラーになる", () => {
    const p = { foo: "bar" };
    expect(() => validateWorkoutsShape(extractWorkoutsArray(p))).toThrow();
  });
});
