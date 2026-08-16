// テスト専用のSQLiteドライバ。src/domain/db/workoutStore.js が要求する契約
// (exec / runBatch / all)を、Node組み込みの node:sqlite (DatabaseSync) で実装する。
// 手書きのモックではなく本物のSQLiteエンジンを使うことで、スキーマDDL・外部キー・
// トランザクションのロールバックまで含めてドメインロジックを検証できる。
//
// 本番(iOS)では src/domain/db/capacitorSqliteDriver.js が同じ契約を
// @capacitor-community/sqlite 経由で実装する(Xcode環境がないためこのテストでは検証できない側)。
import { DatabaseSync } from "node:sqlite";

export function makeFakeSqliteDriver() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  let failNext = false;

  return {
    db, // テストから直接検査したい場合用
    // 次のrunBatch()呼び出し1回だけを失敗させる。スキーマ初期化(ensureSchema)自体もrunBatchを
    // 使うため、テストでは意図した書き込みの直前でこれを呼ぶこと(でないと初期化側が失敗を消費してしまう)。
    armFailure() { failNext = true; },
    async exec(sql) {
      db.exec(sql);
    },
    async runBatch(statements) {
      if (failNext) {
        failNext = false;
        throw new Error("simulated failure mid-transaction");
      }
      db.exec("BEGIN");
      try {
        for (const s of statements) {
          db.prepare(s.statement).run(...(s.values || []));
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async all(sql, params) {
      return db.prepare(sql).all(...(params || []));
    },
  };
}
