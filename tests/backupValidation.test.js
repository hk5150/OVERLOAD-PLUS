import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { extractWorkoutsArray, validateWorkoutsShape, validateBackupPayload, CURRENT_BACKUP_FORMAT_VERSION } = loadDomainModule("src/domain/backupValidation.js");

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

const validBackup = (overrides = {}) => ({
  app: "KURABELL+", formatVersion: CURRENT_BACKUP_FORMAT_VERSION, appVersion: "v81", platform: "ios",
  exportedAt: "2026-08-01T00:00:00.000Z",
  workouts: [validWorkout()],
  split: { name: "全身", days: [], cursor: 0 },
  profile: { bodyweight: 70 },
  recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {},
  lastBackupAt: null,
  ...overrides,
});

describe("validateBackupPayload — 正常系", () => {
  it("現行フォーマットのバックアップは通り、workouts配列を返す", () => {
    const ws = validateBackupPayload(validBackup());
    expect(ws).toHaveLength(1);
  });

  it("formatVersion未記載の旧バックアップも通す(導入前の形式として許容)", () => {
    const p = validBackup();
    delete p.formatVersion;
    expect(() => validateBackupPayload(p)).not.toThrow();
  });

  it("旧形式(配列そのもの)も通す", () => {
    expect(() => validateBackupPayload([validWorkout()])).not.toThrow();
  });
});

describe("validateBackupPayload — 破損・異常値の拒否", () => {
  it("JSONとして壊れている(呼び出し側でJSON.parseした結果がそもそも来ない想定なので、ここでは不正な形状を渡す)", () => {
    expect(() => validateBackupPayload(undefined)).toThrow();
  });

  it("重量が異常な値(負数)は拒否する", () => {
    const p = validBackup({ workouts: [validWorkout({ exercises: [{ name: "懸垂", sets: [{ weight: -5, reps: 8, warmup: false }] }] })] });
    expect(() => validateBackupPayload(p)).toThrow(/重量が異常/);
  });

  it("重量が異常な値(現実的でないほど巨大)は拒否する", () => {
    const p = validBackup({ workouts: [validWorkout({ exercises: [{ name: "懸垂", sets: [{ weight: 999999, reps: 8, warmup: false }] }] })] });
    expect(() => validateBackupPayload(p)).toThrow(/重量が異常/);
  });

  it("回数が異常な値(負数)は拒否する", () => {
    const p = validBackup({ workouts: [validWorkout({ exercises: [{ name: "懸垂", sets: [{ weight: 60, reps: -1, warmup: false }] }] })] });
    expect(() => validateBackupPayload(p)).toThrow(/回数が異常/);
  });

  it("RIRが異常な値は拒否する", () => {
    const p = validBackup({ workouts: [validWorkout({ exercises: [{ name: "懸垂", sets: [{ weight: 60, reps: 8, warmup: false, rir: 999 }] }] })] });
    expect(() => validateBackupPayload(p)).toThrow(/RIRが異常/);
  });

  it("日付が解釈できない記録は拒否する", () => {
    const p = validBackup({ workouts: [validWorkout({ date: "not-a-date" })] });
    expect(() => validateBackupPayload(p)).toThrow(/日付を解釈できません/);
  });

  it("splitの形式が不正(オブジェクトでない)なら拒否する", () => {
    const p = validBackup({ split: "broken" });
    expect(() => validateBackupPayload(p)).toThrow(/splitの形式が不正/);
  });

  it("customExercisesの形式が不正(配列でない)なら拒否する", () => {
    const p = validBackup({ customExercises: "broken" });
    expect(() => validateBackupPayload(p)).toThrow(/customExercisesの形式が不正/);
  });
});

describe("validateBackupPayload — 未知のformatVersionの拒否", () => {
  it("このアプリが理解できるより新しいformatVersionは拒否する", () => {
    const p = validBackup({ formatVersion: CURRENT_BACKUP_FORMAT_VERSION + 1 });
    expect(() => validateBackupPayload(p)).toThrow(/新しいバージョン/);
  });

  it("formatVersionが数値でない/0以下なら拒否する", () => {
    expect(() => validateBackupPayload(validBackup({ formatVersion: "1" }))).toThrow(/formatVersionが不正/);
    expect(() => validateBackupPayload(validBackup({ formatVersion: 0 }))).toThrow(/formatVersionが不正/);
    expect(() => validateBackupPayload(validBackup({ formatVersion: 1.5 }))).toThrow(/formatVersionが不正/);
  });
});
