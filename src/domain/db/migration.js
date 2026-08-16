// 旧形式(Preferences/localStorageの1個のJSON文字列)とSQLite正規化テーブルの間の変換。
// 純粋関数のみ(DB接続を持たない)。index.htmlから<script src>で素のグローバルスクリプトとして
// 読み込まれる(importもmodule.exportsも使わない)。src/domain/backupValidation.js より後に読み込むこと
// (extractWorkoutsArray / validateWorkoutsShape のグローバルを使うため)。
//
// workoutStore.js が「SQLに書く/SQLから読む」の橋渡しにこのファイルの関数を使う。
// テスト(tests/db/migration.test.js)は実DBなしでこのファイル単体を検証する。

// SQLite側の行IDはAUTOINCREMENTに頼らず、書き込み側でここのgenId()を使って発行する。
// 複数テーブルへのINSERTを1回のトランザクションでまとめて送るには、
// 外部キー(workout_id / workout_exercise_id)を事前に確定させておく必要があるため。
let __idCounter = 0;
function genId(prefix) {
  __idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${__idCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// 保存されていたJSON文字列(旧: 配列そのもの / 新: {workouts,...}のオブジェクト)を、
// アプリが期待する正規化済みの状態オブジェクトへ変換する。
// index.html側の読み込み処理(migrateWorkouts/migrateSplit/defaultProfileの適用)とは別レイヤ:
// ここでは構造の受け渡しだけを行い、種目名の正規化などのアプリ固有ルールはapp.bundle.js側に任せる。
function legacyBlobToState(rawJsonString) {
  let parsed;
  try { parsed = JSON.parse(rawJsonString); }
  catch (e) { throw new Error(`legacyBlobToStateのJSON.parseに失敗: raw=${JSON.stringify(String(rawJsonString).slice(0, 200))} err=${e.message}`); }
  const workouts = extractWorkoutsArray(parsed);
  validateWorkoutsShape(workouts);
  if (Array.isArray(parsed)) {
    return {
      workouts, split: null, profile: {}, recentNames: [], customExercises: [],
      exerciseNotes: {}, exerciseOverrides: {}, lastBackupAt: null, guideSeen: false,
    };
  }
  return {
    workouts,
    split: parsed.split ?? null,
    profile: parsed.profile ?? {},
    recentNames: parsed.recentNames ?? [],
    customExercises: parsed.customExercises ?? [],
    exerciseNotes: parsed.exerciseNotes ?? {},
    exerciseOverrides: parsed.exerciseOverrides ?? {},
    lastBackupAt: parsed.lastBackupAt ?? null,
    guideSeen: !!parsed.guideSeen,
  };
}

// state.workouts のみを行の配列(workoutRows/workoutExerciseRows/setRows)へ展開する。
function workoutsToRows(workouts) {
  const workoutRows = [];
  const workoutExerciseRows = [];
  const setRows = [];
  (workouts || []).forEach((w) => {
    const workoutId = genId("w");
    workoutRows.push({
      id: workoutId,
      date: w.date, session: w.session ?? null,
      start_at: w.startAt ?? null, end_at: w.endAt ?? null,
      duration_min: w.durationMin ?? null, total_volume: w.totalVolume ?? null,
      kcal: w.kcal ?? null,
    });
    (w.exercises || []).forEach((ex, exPos) => {
      const exId = genId("we");
      workoutExerciseRows.push({
        id: exId, workout_id: workoutId, position: exPos, name: ex.name,
        muscle: ex.muscle ?? null, bw_factor: ex.bwFactor ?? null,
        bw_at_log: ex.bwAtLog ?? null, rom: ex.rom ?? null,
        is_db: ex.isDb ? 1 : 0,
        rep_low: ex.repLow ?? null, rep_high: ex.repHigh ?? null,
        target_rir_low: ex.targetRirLow ?? null, target_rir_high: ex.targetRirHigh ?? null,
        increment: ex.increment ?? null,
        form_broke: ex.formBroke ? 1 : 0, pain: ex.pain ? 1 : 0,
        ss_group: ex.ssGroup ?? null,
      });
      (ex.sets || []).forEach((s, sPos) => {
        setRows.push({
          id: genId("s"), workout_exercise_id: exId, position: sPos,
          weight: s.weight ?? null, reps: s.reps ?? null,
          warmup: s.warmup ? 1 : 0, assisted: s.assisted ? 1 : 0,
          rir: s.rir ?? null,
        });
      });
    });
  });
  return { workoutRows, workoutExerciseRows, setRows };
}

function customExercisesToRows(customExercises) {
  return (customExercises || []).map((ex) => ({ name: ex.n, data: JSON.stringify(ex) }));
}

// settings系フィールドをsettingsテーブルの行(key/value)へ。値はJSON文字列化して1個ずつ保存する
// (形の決まっていない小さな設定値をカラム分割すると、フィールド追加のたびにDDL変更が要るため)。
function settingsToRows(state) {
  return [
    { key: "split", value: JSON.stringify(state.split ?? null) },
    { key: "profile", value: JSON.stringify(state.profile ?? {}) },
    { key: "recentNames", value: JSON.stringify(state.recentNames ?? []) },
    { key: "exerciseNotes", value: JSON.stringify(state.exerciseNotes ?? {}) },
    { key: "exerciseOverrides", value: JSON.stringify(state.exerciseOverrides ?? {}) },
    { key: "lastBackupAt", value: JSON.stringify(state.lastBackupAt ?? null) },
    { key: "guideSeen", value: JSON.stringify(!!state.guideSeen) },
  ];
}

// workouts系3テーブルを丸ごと入れ替えるステートメント列(1回のトランザクションで送る前提)。
function buildWorkoutsReplaceStatements(workouts) {
  const { workoutRows, workoutExerciseRows, setRows } = workoutsToRows(workouts);
  const stmts = [
    { statement: "DELETE FROM sets", values: [] },
    { statement: "DELETE FROM workout_exercises", values: [] },
    { statement: "DELETE FROM workouts", values: [] },
  ];
  workoutRows.forEach((r) => stmts.push({
    statement: "INSERT INTO workouts (id, date, session, start_at, end_at, duration_min, total_volume, kcal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    values: [r.id, r.date, r.session, r.start_at, r.end_at, r.duration_min, r.total_volume, r.kcal],
  }));
  workoutExerciseRows.forEach((r) => stmts.push({
    statement: "INSERT INTO workout_exercises (id, workout_id, position, name, muscle, bw_factor, bw_at_log, rom, is_db, rep_low, rep_high, target_rir_low, target_rir_high, increment, form_broke, pain, ss_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    values: [r.id, r.workout_id, r.position, r.name, r.muscle, r.bw_factor, r.bw_at_log, r.rom, r.is_db, r.rep_low, r.rep_high, r.target_rir_low, r.target_rir_high, r.increment, r.form_broke, r.pain, r.ss_group],
  }));
  setRows.forEach((r) => stmts.push({
    statement: "INSERT INTO sets (id, workout_exercise_id, position, weight, reps, warmup, assisted, rir) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    values: [r.id, r.workout_exercise_id, r.position, r.weight, r.reps, r.warmup, r.assisted, r.rir],
  }));
  return stmts;
}

function buildCustomExercisesReplaceStatements(customExercises) {
  const rows = customExercisesToRows(customExercises);
  const stmts = [{ statement: "DELETE FROM custom_exercises", values: [] }];
  rows.forEach((r) => stmts.push({
    statement: "INSERT INTO custom_exercises (name, data) VALUES (?, ?)",
    values: [r.name, r.data],
  }));
  return stmts;
}

function buildSettingsUpsertStatements(state) {
  return settingsToRows(state).map((r) => ({
    statement: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    values: [r.key, r.value],
  }));
}

// マイグレーション(旧データ→SQLite)を1回のトランザクションで実行するための全ステートメント。
function buildFullReplaceStatements(state) {
  return [
    ...buildWorkoutsReplaceStatements(state.workouts),
    ...buildCustomExercisesReplaceStatements(state.customExercises),
    ...buildSettingsUpsertStatements(state),
  ];
}

// SQLiteから読み出した行(query結果)を、アプリが期待する状態オブジェクトへ復元する。
function rowsToState({ workoutRows, workoutExerciseRows, setRows, customExerciseRows, settingsRows }) {
  const setsByExercise = new Map();
  (setRows || []).slice().sort((a, b) => a.position - b.position).forEach((r) => {
    const list = setsByExercise.get(r.workout_exercise_id) || [];
    const set = { weight: r.weight, reps: r.reps, warmup: !!r.warmup };
    if (r.assisted) set.assisted = true;
    if (r.rir !== null && r.rir !== undefined) set.rir = r.rir;
    list.push(set);
    setsByExercise.set(r.workout_exercise_id, list);
  });

  const exercisesByWorkout = new Map();
  (workoutExerciseRows || []).slice().sort((a, b) => a.position - b.position).forEach((r) => {
    const ex = {
      name: r.name, muscle: r.muscle ?? "", bwFactor: r.bw_factor ?? 0,
      bwAtLog: r.bw_at_log, rom: r.rom ?? 1.0, isDb: !!r.is_db,
      repLow: r.rep_low, repHigh: r.rep_high,
      targetRirLow: r.target_rir_low, targetRirHigh: r.target_rir_high,
      increment: r.increment, formBroke: !!r.form_broke, pain: !!r.pain,
      sets: setsByExercise.get(r.id) || [],
    };
    if (r.ss_group) ex.ssGroup = r.ss_group;
    const list = exercisesByWorkout.get(r.workout_id) || [];
    list.push(ex);
    exercisesByWorkout.set(r.workout_id, list);
  });

  const workouts = (workoutRows || []).map((r) => ({
    date: r.date,
    ...(r.session ? { session: r.session } : {}),
    startAt: r.start_at, endAt: r.end_at,
    durationMin: r.duration_min, totalVolume: r.total_volume, kcal: r.kcal,
    exercises: exercisesByWorkout.get(r.id) || [],
  }));

  const customExercises = (customExerciseRows || []).map((r) => {
    try { return JSON.parse(r.data); }
    catch (e) { throw new Error(`customExercises行のJSON.parseに失敗: row=${JSON.stringify(r)} err=${e.message}`); }
  });

  const settings = {};
  (settingsRows || []).forEach((r) => {
    try { settings[r.key] = JSON.parse(r.value); }
    catch (e) { throw new Error(`settings行のJSON.parseに失敗: row=${JSON.stringify(r)} err=${e.message}`); }
  });

  return {
    workouts,
    split: settings.split ?? null,
    profile: settings.profile ?? {},
    recentNames: settings.recentNames ?? [],
    customExercises,
    exerciseNotes: settings.exerciseNotes ?? {},
    exerciseOverrides: settings.exerciseOverrides ?? {},
    lastBackupAt: settings.lastBackupAt ?? null,
    guideSeen: !!settings.guideSeen,
  };
}

globalThis.legacyBlobToState = legacyBlobToState;
globalThis.buildWorkoutsReplaceStatements = buildWorkoutsReplaceStatements;
globalThis.buildCustomExercisesReplaceStatements = buildCustomExercisesReplaceStatements;
globalThis.buildSettingsUpsertStatements = buildSettingsUpsertStatements;
globalThis.buildFullReplaceStatements = buildFullReplaceStatements;
globalThis.rowsToState = rowsToState;
