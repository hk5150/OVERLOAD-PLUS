import { describe, it, expect } from "vitest";
import { loadDomainModules } from "../helpers/loadDomain.js";

const {
  legacyBlobToState,
  buildWorkoutsReplaceStatements,
  buildCustomExercisesReplaceStatements,
  buildSettingsUpsertStatements,
  buildFullReplaceStatements,
  rowsToState,
} = loadDomainModules(["src/domain/backupValidation.js", "src/domain/db/migration.js"]);

const sampleWorkout = (overrides = {}) => ({
  date: "2026-08-01T00:00:00.000Z",
  startAt: "2026-08-01T00:00:00.000Z",
  endAt: "2026-08-01T00:45:00.000Z",
  durationMin: 45,
  totalVolume: 1200,
  kcal: 300,
  exercises: [
    {
      name: "バーベルベンチプレス", muscle: "胸", bwFactor: 0, bwAtLog: 70, rom: 1.0, isDb: false,
      repLow: 8, repHigh: 12, targetRirLow: 1, targetRirHigh: 3, increment: 2.5,
      formBroke: false, pain: false,
      sets: [
        { weight: 60, reps: 8, warmup: false, rir: 2 },
        { weight: 60, reps: 7, warmup: false, assisted: true, rir: 1 },
      ],
    },
  ],
  ...overrides,
});

describe("legacyBlobToState", () => {
  it("新形式({workouts, split, profile, ...})を正しく読む", () => {
    const raw = JSON.stringify({
      workouts: [sampleWorkout()],
      split: { name: "全身", days: [], cursor: 0 },
      profile: { bodyweight: 70 },
      recentNames: ["懸垂"],
      customExercises: [{ n: "自作種目" }],
      exerciseNotes: { "懸垂": "肩幅より広め" },
      exerciseOverrides: {},
      lastBackupAt: "2026-08-01T00:00:00.000Z",
      guideSeen: true,
    });
    const state = legacyBlobToState(raw);
    expect(state.workouts).toHaveLength(1);
    expect(state.split.name).toBe("全身");
    expect(state.profile.bodyweight).toBe(70);
    expect(state.recentNames).toEqual(["懸垂"]);
    expect(state.customExercises).toEqual([{ n: "自作種目" }]);
    expect(state.guideSeen).toBe(true);
  });

  it("旧形式(配列そのもの)も読める", () => {
    const raw = JSON.stringify([sampleWorkout()]);
    const state = legacyBlobToState(raw);
    expect(state.workouts).toHaveLength(1);
    expect(state.split).toBeNull();
    expect(state.guideSeen).toBe(false);
  });

  it("壊れたJSONは例外を投げる(呼び出し側が握り潰さないよう)", () => {
    expect(() => legacyBlobToState("{not json")).toThrow();
  });

  it("workoutsの形状が不正なら例外を投げる(validateWorkoutsShapeを再利用)", () => {
    const raw = JSON.stringify({ workouts: [{ noDate: true }] });
    expect(() => legacyBlobToState(raw)).toThrow(/日付がありません/);
  });
});

describe("buildWorkoutsReplaceStatements", () => {
  it("DELETE 3件 + 各テーブルへのINSERTを生成する", () => {
    const stmts = buildWorkoutsReplaceStatements([sampleWorkout()]);
    const deletes = stmts.filter((s) => s.statement.startsWith("DELETE"));
    expect(deletes.map((s) => s.statement)).toEqual([
      "DELETE FROM sets", "DELETE FROM workout_exercises", "DELETE FROM workouts",
    ]);
    const workoutInserts = stmts.filter((s) => s.statement.startsWith("INSERT INTO workouts"));
    const exInserts = stmts.filter((s) => s.statement.startsWith("INSERT INTO workout_exercises"));
    const setInserts = stmts.filter((s) => s.statement.startsWith("INSERT INTO sets"));
    expect(workoutInserts).toHaveLength(1);
    expect(exInserts).toHaveLength(1);
    expect(setInserts).toHaveLength(2);
  });

  it("空配列を渡すとDELETEのみになる(全削除)", () => {
    const stmts = buildWorkoutsReplaceStatements([]);
    expect(stmts).toHaveLength(3);
    expect(stmts.every((s) => s.statement.startsWith("DELETE"))).toBe(true);
  });

  it("各workout/exerciseに発行されるIDが一意で、外部キーが正しく繋がる", () => {
    const stmts = buildWorkoutsReplaceStatements([sampleWorkout(), sampleWorkout()]);
    const workoutIds = stmts.filter((s) => s.statement.startsWith("INSERT INTO workouts")).map((s) => s.values[0]);
    expect(new Set(workoutIds).size).toBe(2);
    const exStmt = stmts.find((s) => s.statement.startsWith("INSERT INTO workout_exercises"));
    const exWorkoutId = exStmt.values[1]; // workout_id
    expect(workoutIds).toContain(exWorkoutId);
  });
});

describe("buildFullReplaceStatements + rowsToState 往復", () => {
  it("stateをSQL文へ変換して、疑似的にrows形式に戻すと元のstateへ復元できる", () => {
    const state = {
      workouts: [sampleWorkout()],
      split: { name: "全身", days: [{ name: "Day 1", muscles: ["胸"] }], cursor: 0 },
      profile: { bodyweight: 70, soundOn: true },
      recentNames: ["懸垂"],
      customExercises: [{ n: "自作種目", muscle: "胸" }],
      exerciseNotes: { "懸垂": "メモ" },
      exerciseOverrides: { "懸垂": { increment: 1 } },
      lastBackupAt: "2026-08-01T00:00:00.000Z",
      guideSeen: true,
    };
    const stmts = buildFullReplaceStatements(state);

    // INSERT文からrows形式(SELECT * の結果と同じ形)を素朴に再構成する
    const workoutRows = stmts
      .filter((s) => s.statement.startsWith("INSERT INTO workouts"))
      .map((s) => ({ id: s.values[0], date: s.values[1], session: s.values[2], start_at: s.values[3], end_at: s.values[4], duration_min: s.values[5], total_volume: s.values[6], kcal: s.values[7] }));
    const workoutExerciseRows = stmts
      .filter((s) => s.statement.startsWith("INSERT INTO workout_exercises"))
      .map((s) => ({
        id: s.values[0], workout_id: s.values[1], position: s.values[2], name: s.values[3],
        muscle: s.values[4], bw_factor: s.values[5], bw_at_log: s.values[6], rom: s.values[7],
        is_db: s.values[8], rep_low: s.values[9], rep_high: s.values[10],
        target_rir_low: s.values[11], target_rir_high: s.values[12], increment: s.values[13],
        form_broke: s.values[14], pain: s.values[15], ss_group: s.values[16],
      }));
    const setRows = stmts
      .filter((s) => s.statement.startsWith("INSERT INTO sets"))
      .map((s) => ({ id: s.values[0], workout_exercise_id: s.values[1], position: s.values[2], weight: s.values[3], reps: s.values[4], warmup: s.values[5], assisted: s.values[6], rir: s.values[7] }));
    const customExerciseRows = stmts
      .filter((s) => s.statement.startsWith("INSERT INTO custom_exercises"))
      .map((s) => ({ name: s.values[0], data: s.values[1] }));
    const settingsRows = stmts
      .filter((s) => s.statement.startsWith("INSERT INTO settings"))
      .map((s) => ({ key: s.values[0], value: s.values[1] }));

    const restored = rowsToState({ workoutRows, workoutExerciseRows, setRows, customExerciseRows, settingsRows });

    expect(restored.workouts).toEqual(state.workouts);
    expect(restored.split).toEqual(state.split);
    expect(restored.profile).toEqual(state.profile);
    expect(restored.recentNames).toEqual(state.recentNames);
    expect(restored.customExercises).toEqual(state.customExercises);
    expect(restored.exerciseNotes).toEqual(state.exerciseNotes);
    expect(restored.exerciseOverrides).toEqual(state.exerciseOverrides);
    expect(restored.lastBackupAt).toBe(state.lastBackupAt);
    expect(restored.guideSeen).toBe(state.guideSeen);
  });

  it("setsの順序(position)が保たれる", () => {
    const w = sampleWorkout({
      exercises: [{
        name: "スクワット", muscle: "大腿四頭筋", bwFactor: 0, bwAtLog: 70, rom: 1.0,
        isDb: false, repLow: 5, repHigh: 5, increment: 2.5, formBroke: false, pain: false,
        sets: [
          { weight: 100, reps: 5, warmup: false, rir: 3 },
          { weight: 110, reps: 5, warmup: false, rir: 2 },
          { weight: 120, reps: 5, warmup: false, rir: 1 },
        ],
      }],
    });
    const stmts = buildWorkoutsReplaceStatements([w]);
    const setRows = stmts.filter((s) => s.statement.startsWith("INSERT INTO sets"))
      .map((s, i) => ({ id: s.values[0], workout_exercise_id: s.values[1], position: i, weight: s.values[3], reps: s.values[4], warmup: s.values[5], assisted: s.values[6], rir: s.values[7] }));
    const exRow = stmts.filter((s) => s.statement.startsWith("INSERT INTO workout_exercises"))
      .map((s) => ({
        id: s.values[0], workout_id: s.values[1], position: 0, name: s.values[3],
        muscle: s.values[4], bw_factor: s.values[5], bw_at_log: s.values[6], rom: s.values[7],
        is_db: s.values[8], rep_low: s.values[9], rep_high: s.values[10],
        target_rir_low: s.values[11], target_rir_high: s.values[12], increment: s.values[13],
        form_broke: s.values[14], pain: s.values[15], ss_group: s.values[16],
      }));
    const workoutRows = [{ id: exRow[0].workout_id, date: w.date, session: null, start_at: w.startAt, end_at: w.endAt, duration_min: w.durationMin, total_volume: w.totalVolume, kcal: w.kcal }];
    const restored = rowsToState({ workoutRows, workoutExerciseRows: exRow, setRows, customExerciseRows: [], settingsRows: [] });
    expect(restored.workouts[0].exercises[0].sets.map((s) => s.weight)).toEqual([100, 110, 120]);
  });
});

describe("buildCustomExercisesReplaceStatements / buildSettingsUpsertStatements", () => {
  it("customExercisesはDELETE + 種目数ぶんのINSERT", () => {
    const stmts = buildCustomExercisesReplaceStatements([{ n: "A" }, { n: "B" }]);
    expect(stmts[0].statement).toBe("DELETE FROM custom_exercises");
    expect(stmts).toHaveLength(3);
  });

  it("settingsは常に7キー分のUPSERT文になる", () => {
    const stmts = buildSettingsUpsertStatements({ split: null, profile: {}, recentNames: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false });
    expect(stmts).toHaveLength(7);
    expect(stmts.every((s) => s.statement.includes("ON CONFLICT(key) DO UPDATE"))).toBe(true);
  });
});
