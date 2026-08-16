import { describe, it, expect } from "vitest";
import { loadDomainModules } from "../helpers/loadDomain.js";
import { makeFakeSqliteDriver } from "../helpers/fakeSqliteDriver.js";

const { createWorkoutStore } = loadDomainModules([
  "src/domain/backupValidation.js",
  "src/domain/db/schema.js",
  "src/domain/db/migration.js",
  "src/domain/db/workoutStore.js",
]);

const sampleWorkout = (overrides = {}) => ({
  date: "2026-08-01T00:00:00.000Z",
  startAt: "2026-08-01T00:00:00.000Z",
  endAt: "2026-08-01T00:45:00.000Z",
  durationMin: 45, totalVolume: 1200, kcal: 300,
  exercises: [{
    name: "バーベルベンチプレス", muscle: "胸", bwFactor: 0, bwAtLog: 70, rom: 1.0, isDb: false,
    repLow: 8, repHigh: 12, targetRirLow: 1, targetRirHigh: 3, increment: 2.5,
    formBroke: false, pain: false,
    sets: [{ weight: 60, reps: 8, warmup: false, rir: 2 }],
  }],
  ...overrides,
});

const legacyJson = (workouts) => JSON.stringify({
  workouts, split: { name: "全身", days: [], cursor: 0 }, profile: { bodyweight: 70 },
  recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {},
  lastBackupAt: null, guideSeen: true,
});

describe("workoutStore — 空データからの初期化", () => {
  it("何も無い状態でgetAll()すると空のデフォルト形状を返す", async () => {
    const store = createWorkoutStore(makeFakeSqliteDriver());
    const state = await store.getAll();
    expect(state.workouts).toEqual([]);
    expect(state.customExercises).toEqual([]);
    expect(state.split).toBeNull();
    expect(state.guideSeen).toBe(false);
  });

  it("ensureSchemaは複数回呼んでも安全(CREATE TABLE IF NOT EXISTS)", async () => {
    const store = createWorkoutStore(makeFakeSqliteDriver());
    await store.ensureSchema();
    await expect(store.ensureSchema()).resolves.not.toThrow();
  });
});

describe("workoutStore — 旧JSONからの移行", () => {
  it("正常に移行できる(workoutsとsettingsの両方が反映される)", async () => {
    const store = createWorkoutStore(makeFakeSqliteDriver());
    const result = await store.migrateLegacyIfNeeded(async () => legacyJson([sampleWorkout()]));
    expect(result.migrated).toBe(true);

    const state = await store.getAll();
    expect(state.workouts).toHaveLength(1);
    expect(state.workouts[0].exercises[0].sets[0].weight).toBe(60);
    expect(state.split.name).toBe("全身");
    expect(state.profile.bodyweight).toBe(70);
    expect(state.guideSeen).toBe(true);

    const status = await store.migrationStatus();
    expect(status.status).toBe("done");
    expect(status.completed_at).toBeTruthy();
  });

  it("旧データが無い(新規インストール)場合はdoneにするだけで何も作らない", async () => {
    const store = createWorkoutStore(makeFakeSqliteDriver());
    const result = await store.migrateLegacyIfNeeded(async () => null);
    expect(result).toEqual({ migrated: false, alreadyDone: false, reason: "no-legacy-data" });
    const status = await store.migrationStatus();
    expect(status.status).toBe("done");
  });

  it("二重移行されない(2回目はalreadyDone: trueで何もしない)", async () => {
    const driver = makeFakeSqliteDriver();
    const store = createWorkoutStore(driver);
    let calls = 0;
    const getter = async () => { calls += 1; return legacyJson([sampleWorkout()]); };
    await store.migrateLegacyIfNeeded(getter);
    const second = await store.migrateLegacyIfNeeded(getter);
    expect(second).toEqual({ migrated: false, alreadyDone: true });
    // 2回目はlegacyJsonGetterを呼ぶ前にstatus==='done'で早期returnするため、旧データへは触れない
    expect(calls).toBe(1);
    const state = await store.getAll();
    expect(state.workouts).toHaveLength(1); // 重複挿入されていない
  });

  it("移行途中で失敗すると何も反映されず、statusはpendingのまま(次回再試行できる)", async () => {
    const driver = makeFakeSqliteDriver();
    const store = createWorkoutStore(driver);
    await store.ensureSchema(); // スキーマ初期化を先に完了させ、失敗を実データ移行の書き込みに当てる
    driver.armFailure();
    await expect(store.migrateLegacyIfNeeded(async () => legacyJson([sampleWorkout()]))).rejects.toThrow(/simulated failure/);

    const status = await store.migrationStatus();
    expect(status.status).toBe("pending");
    const state = await store.getAll();
    expect(state.workouts).toEqual([]); // 中途半端なデータが残っていない
  });

  it("失敗後、次回起動時(再試行)には成功できる", async () => {
    const driver = makeFakeSqliteDriver();
    const store = createWorkoutStore(driver);
    await store.ensureSchema();
    driver.armFailure();
    const getter = async () => legacyJson([sampleWorkout()]);
    await expect(store.migrateLegacyIfNeeded(getter)).rejects.toThrow();

    // 「再起動」を模して、同じstoreで再度呼ぶ(armFailure()は1回きりなので今度は成功する)
    const retry = await store.migrateLegacyIfNeeded(getter);
    expect(retry.migrated).toBe(true);
    const state = await store.getAll();
    expect(state.workouts).toHaveLength(1);
  });

  it("移行に失敗しても旧データ取得元(legacyJsonGetter)は変化しない(旧データを消していない)", async () => {
    const driver = makeFakeSqliteDriver();
    const store = createWorkoutStore(driver);
    await store.ensureSchema();
    const raw = legacyJson([sampleWorkout()]);
    let lastSeen = null;
    const getter = async () => { lastSeen = raw; return raw; };
    driver.armFailure();
    await expect(store.migrateLegacyIfNeeded(getter)).rejects.toThrow();
    expect(lastSeen).toBe(raw); // getter自体は素通しなので、workoutStore側は一切書き換えていない

    const retry = await store.migrateLegacyIfNeeded(getter);
    expect(retry.migrated).toBe(true); // 同じ生データからもう一度、正常に移行できる
  });

  it("壊れたJSONは例外を投げ、statusはpendingのまま", async () => {
    const store = createWorkoutStore(makeFakeSqliteDriver());
    await expect(store.migrateLegacyIfNeeded(async () => "{not json")).rejects.toThrow();
    const status = await store.migrationStatus();
    expect(status.status).toBe("pending");
  });
});

describe("workoutStore — setAll / getAll", () => {
  it("保存した内容をそのまま読み戻せる", async () => {
    const store = createWorkoutStore(makeFakeSqliteDriver());
    const next = {
      workouts: [sampleWorkout()], split: { name: "上下", days: [], cursor: 0 },
      profile: { bodyweight: 68 }, recentNames: ["スクワット"],
      customExercises: [{ n: "自作種目" }], exerciseNotes: {}, exerciseOverrides: {},
      lastBackupAt: null, guideSeen: true,
    };
    await store.setAll(next);
    const state = await store.getAll();
    expect(state.workouts).toEqual(next.workouts);
    expect(state.split).toEqual(next.split);
    expect(state.profile).toEqual(next.profile);
    expect(state.customExercises).toEqual(next.customExercises);
  });

  it("workouts配列の参照が変わっていなければworkoutsテーブルへは書き込まない(profileだけの保存が履歴全体を書き直さない)", async () => {
    const driver = makeFakeSqliteDriver();
    const store = createWorkoutStore(driver);
    const workouts = [sampleWorkout()];
    await store.setAll({ workouts, split: null, profile: { bodyweight: 70 }, recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false });

    const before = await driver.all("SELECT id FROM workouts", []);
    // 同じworkouts参照のまま、profileだけ変える
    await store.setAll({ workouts, split: null, profile: { bodyweight: 71 }, recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false });
    const after = await driver.all("SELECT id FROM workouts", []);
    expect(after).toEqual(before); // workoutsの行(id含む)が一切変わっていない = 書き直されていない

    const state = await store.getAll();
    expect(state.profile.bodyweight).toBe(71); // それでもprofileはちゃんと更新されている
  });

  it("workouts配列を新しい参照(内容が同じでも)に差し替えると書き直される", async () => {
    const driver = makeFakeSqliteDriver();
    const store = createWorkoutStore(driver);
    await store.setAll({ workouts: [sampleWorkout()], split: null, profile: {}, recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false });
    const before = await driver.all("SELECT id FROM workouts", []);

    await store.setAll({ workouts: [sampleWorkout(), sampleWorkout()], split: null, profile: {}, recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false });
    const after = await driver.all("SELECT id FROM workouts", []);
    expect(after).toHaveLength(2);
    expect(after.map((r) => r.id)).not.toEqual(before.map((r) => r.id));
  });

  it("SQLite書き込み失敗はエラーとして伝播する(握り潰さない)", async () => {
    const driver = makeFakeSqliteDriver();
    const store = createWorkoutStore(driver);
    await store.ensureSchema();
    driver.armFailure();
    await expect(store.setAll({ workouts: [sampleWorkout()], split: null, profile: {}, recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false }))
      .rejects.toThrow(/simulated failure/);
  });

  it("書き込み失敗時は何も反映されない(部分的な行が残らない)", async () => {
    const driver = makeFakeSqliteDriver();
    const store = createWorkoutStore(driver);
    await store.ensureSchema();
    driver.armFailure();
    await expect(store.setAll({ workouts: [sampleWorkout()], split: null, profile: {}, recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false }))
      .rejects.toThrow();
    const rows = await driver.all("SELECT * FROM workouts", []);
    expect(rows).toEqual([]);
  });
});

describe("workoutStore — clearAll(全データ削除)", () => {
  it("workouts/customExercises/settingsのすべての行が消える", async () => {
    const store = createWorkoutStore(makeFakeSqliteDriver());
    await store.setAll({
      workouts: [sampleWorkout()], split: { name: "全身", days: [], cursor: 0 },
      profile: { bodyweight: 70 }, recentNames: ["懸垂"], customExercises: [{ n: "自作種目" }],
      exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: true,
    });
    await store.clearAll();
    const state = await store.getAll();
    expect(state.workouts).toEqual([]);
    expect(state.customExercises).toEqual([]);
    expect(state.split).toBeNull();
    expect(state.profile).toEqual({});
    expect(state.guideSeen).toBe(false);
  });

  it("削除後にsetAllすると、参照最適化に引っかからず正しく書き込める", async () => {
    const store = createWorkoutStore(makeFakeSqliteDriver());
    const workouts = [sampleWorkout()];
    await store.setAll({ workouts, split: null, profile: {}, recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false });
    await store.clearAll();
    // clearAll後、"同じworkouts参照"のままsetAllしても、参照キャッシュがリセットされているので書き直される
    await store.setAll({ workouts, split: null, profile: {}, recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false });
    const state = await store.getAll();
    expect(state.workouts).toEqual(workouts);
  });
});
