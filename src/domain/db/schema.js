// iOS(SQLite)側の永続化スキーマ定義。index.htmlから<script src>で素のグローバルスクリプトとして読み込まれる
// (importもmodule.exportsも使わない、ビルド不要の原則を維持するため)。
//
// workouts / workout_exercises / sets は年々増え続ける本体データなので正規化してSQLiteに置く。
// profile・split・recentNames・exerciseNotes・exerciseOverrides・lastBackupAt・guideSeen は
// 形の決まっていない小さな設定値なので、settingsテーブルに「キー1行=JSON文字列1個」で入れる
// (無理にカラム分割すると、フィールドが増えるたびにマイグレーションが必要になるため)。
// custom_exercises も同じ理由でJSON文字列を1行1種目で持つ。
//
// id は SQLite の AUTOINCREMENT に頼らず、書き込み側(migration.js / workoutStore.js)が
// 文字列IDを生成して埋める。理由: 複数テーブルへのINSERTを1回のexecuteSet(1トランザクション)で
// まとめて送るには、事前に外部キー(workout_id / workout_exercise_id)が分かっている必要があるため。

const SCHEMA_VERSION = 1;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS legacy_migration (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL DEFAULT 'pending',
    completed_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    session TEXT,
    start_at TEXT,
    end_at TEXT,
    duration_min REAL,
    total_volume REAL,
    kcal REAL
  );`,
  `CREATE TABLE IF NOT EXISTS workout_exercises (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    muscle TEXT,
    bw_factor REAL,
    bw_at_log REAL,
    rom REAL,
    is_db INTEGER NOT NULL DEFAULT 0,
    rep_low INTEGER,
    rep_high INTEGER,
    target_rir_low REAL,
    target_rir_high REAL,
    increment REAL,
    form_broke INTEGER NOT NULL DEFAULT 0,
    pain INTEGER NOT NULL DEFAULT 0,
    ss_group TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_id ON workout_exercises(workout_id);`,
  `CREATE INDEX IF NOT EXISTS idx_workout_exercises_name ON workout_exercises(name);`,
  `CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY,
    workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    weight REAL,
    reps INTEGER,
    warmup INTEGER NOT NULL DEFAULT 0,
    assisted INTEGER NOT NULL DEFAULT 0,
    rir REAL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise_id ON sets(workout_exercise_id);`,
  `CREATE TABLE IF NOT EXISTS custom_exercises (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
];

globalThis.SCHEMA_VERSION = SCHEMA_VERSION;
globalThis.SCHEMA_STATEMENTS = SCHEMA_STATEMENTS;
