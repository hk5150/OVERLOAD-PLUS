// SQLiteドライバ(capacitorSqliteDriver.js / テスト用のfakeSqliteDriver)を使って、
// schema.js のテーブルを読み書きするオーケストレーション層。index.htmlから<script src>で
// 素のグローバルスクリプトとして読み込まれる(importもmodule.exportsも使わない)。
//
// ドライバの契約(duck typing、型は強制しない):
//   - async exec(sql: string): void                        … DDLなど、副作用のみのバッチ実行
//   - async runBatch(statements: {statement, values}[]): void … 1トランザクションとして原子的に実行
//   - async all(sql: string, params?: any[]): object[]     … SELECT結果を行オブジェクトの配列で返す
//
// workouts配列だけは「毎回全部書き直す」と、Preferencesに巨大JSONを書き続けていた元の問題を
// SQLiteへ移しただけになる。そこで直前に書いたworkouts配列への参照(===)を覚えておき、
// 参照が変わっていなければworkouts関連3テーブルへは触れない(profileやsplitだけの保存が
// 履歴全体の書き直しを引き起こさないようにするための最適化)。Reactのstateは不変更新なので、
// 変更されていない配列は同じ参照のまま渡ってくる、という前提に乗っている。

function createWorkoutStore(driver) {
  let ready = false;
  let lastWorkoutsRef;

  async function ensureSchema() {
    if (ready) return;
    for (const stmt of SCHEMA_STATEMENTS) {
      await driver.exec(stmt);
    }
    const versionRows = await driver.all("SELECT version FROM schema_version LIMIT 1", []);
    if (versionRows.length === 0) {
      await driver.runBatch([{ statement: "INSERT INTO schema_version (version) VALUES (?)", values: [SCHEMA_VERSION] }]);
    }
    const migrationRows = await driver.all("SELECT status FROM legacy_migration WHERE id = 1", []);
    if (migrationRows.length === 0) {
      await driver.runBatch([{ statement: "INSERT INTO legacy_migration (id, status) VALUES (1, 'pending')", values: [] }]);
    }
    ready = true;
  }

  // 旧データ(Preferences等)からの一括移行。legacyJsonGetter() は生のJSON文字列 or null/undefinedを返す
  // 非同期関数(呼び出し側がPreferencesなどから読む)。成功するまで legacy_migration.status は
  // 'pending' のままなので、失敗しても次回起動時に安全に再試行できる(旧データはここでは削除しない)。
  async function migrateLegacyIfNeeded(legacyJsonGetter) {
    await ensureSchema();
    const rows = await driver.all("SELECT status FROM legacy_migration WHERE id = 1", []);
    const status = rows[0] && rows[0].status;
    if (status === "done") return { migrated: false, alreadyDone: true };

    const raw = await legacyJsonGetter();
    if (raw == null) {
      await driver.runBatch([{ statement: "UPDATE legacy_migration SET status = 'done', completed_at = ? WHERE id = 1", values: [new Date().toISOString()] }]);
      return { migrated: false, alreadyDone: false, reason: "no-legacy-data" };
    }

    const state = legacyBlobToState(raw); // 壊れていれば例外(呼び出し側は握り潰さないこと)
    const statements = buildFullReplaceStatements(state);
    statements.push({ statement: "UPDATE legacy_migration SET status = 'done', completed_at = ? WHERE id = 1", values: [new Date().toISOString()] });
    await driver.runBatch(statements); // 全体が1トランザクション。失敗すれば何も反映されない
    lastWorkoutsRef = state.workouts;
    return { migrated: true };
  }

  async function getAll() {
    await ensureSchema();
    // Promise.allで並列に投げると、CapacitorSQLiteの単一コネクションに対する
    // 同時アクセスでレスポンスが取り違えられる不具合が実機で確認されたため、
    // 意図的に1本ずつ順番に実行する(並列化による速度向上より正しさを優先)。
    const workoutRows = await driver.all("SELECT * FROM workouts", []);
    const workoutExerciseRows = await driver.all("SELECT * FROM workout_exercises", []);
    const setRows = await driver.all("SELECT * FROM sets", []);
    const customExerciseRows = await driver.all("SELECT * FROM custom_exercises", []);
    const settingsRows = await driver.all("SELECT * FROM settings", []);
    const state = rowsToState({ workoutRows, workoutExerciseRows, setRows, customExerciseRows, settingsRows });
    lastWorkoutsRef = state.workouts;
    return state;
  }

  // next: {workouts, split, profile, recentNames, customExercises, exerciseNotes, exerciseOverrides, lastBackupAt, guideSeen}
  async function setAll(next) {
    await ensureSchema();
    const statements = [];
    if (next.workouts !== lastWorkoutsRef) {
      statements.push(...buildWorkoutsReplaceStatements(next.workouts));
    }
    statements.push(...buildCustomExercisesReplaceStatements(next.customExercises));
    statements.push(...buildSettingsUpsertStatements(next));
    await driver.runBatch(statements); // profile/splitだけの保存でもworkoutsを書き直さない
    lastWorkoutsRef = next.workouts;
  }

  async function migrationStatus() {
    await ensureSchema();
    const rows = await driver.all("SELECT status, completed_at FROM legacy_migration WHERE id = 1", []);
    return rows[0] || { status: "pending", completed_at: null };
  }

  // 「すべての履歴を削除」用。schema_version/legacy_migrationは触らない
  // (削除後に旧Preferences値が万一残っていても、再移行で復活させたくないため)。
  async function clearAll() {
    await ensureSchema();
    await driver.runBatch([
      { statement: "DELETE FROM sets", values: [] },
      { statement: "DELETE FROM workout_exercises", values: [] },
      { statement: "DELETE FROM workouts", values: [] },
      { statement: "DELETE FROM custom_exercises", values: [] },
      { statement: "DELETE FROM settings", values: [] },
    ]);
    lastWorkoutsRef = undefined;
  }

  return { ensureSchema, migrateLegacyIfNeeded, getAll, setAll, migrationStatus, clearAll };
}

globalThis.createWorkoutStore = createWorkoutStore;
