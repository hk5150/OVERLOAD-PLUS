// @capacitor-community/sqlite への薄いラッパー。index.htmlから<script src>で
// 素のグローバルスクリプトとして読み込まれる(importもmodule.exportsも使わない)。
//
// なぜnpmパッケージのJSラッパー(SQLiteConnection/SQLiteDBConnectionクラス)を使わないか:
// scripts/sync-www.js のesbuildは #appsrc のJSX変換だけを行い、node_modulesのimportは
// バンドルしない(CLAUDE.md: ビルド不要の原則)。そのため、既存のsrc/domain/storage.jsが
// Preferencesを呼ぶのと同じ方法 ― window.Capacitor.Plugins.<PluginName> への生のブリッジ
// 呼び出し ― でCapacitorSQLiteプラグインを叩く。ネイティブ側のプラグイン登録さえ済んでいれば
// (npm installしてnpx cap syncすれば自動)、JS側のラッパーパッケージを読み込まなくても
// Capacitor.Plugins.CapacitorSQLite.execute(...) のようにメソッドを直接呼び出せる。
//
// query()の戻り値(values配列)は、iOS実機で実際に確認したところ
// 「先頭要素だけが {"ios_columns": [列名, ...]} という特殊なメタデータ行で、
//  2番目以降は既に {列名: 値, ...} という正しい行オブジェクト」という形式だった。
// 型定義ファイルの "iOS the first row is the returned ios_columns name list" という
// コメントの通り(先頭行だけ特別、という意味だった)。当初「先頭行が列名の配列で、
// 以降は値だけの配列」と誤解して実装し、実機で「settings行のJSON.parseに失敗」という
// エラーを引き起こしたため、normalizeRows()で先頭のios_columnsメタ行だけを取り除く。

const DB_NAME = "kurabellplus";

// 先頭要素が {"ios_columns": [...]} という形のメタデータ行なら取り除く。
// それ以外の要素は既に {列名: 値, ...} という行オブジェクトなのでそのまま使う。
function normalizeRows(values) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const first = values[0];
  if (first && typeof first === "object" && !Array.isArray(first) && Array.isArray(first.ios_columns)) {
    return values.slice(1);
  }
  return values;
}

function capSqlitePlugin() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.CapacitorSQLite) {
      return c.Plugins.CapacitorSQLite;
    }
  } catch { /* ignore */ }
  return null;
}

function makeCapacitorSqliteDriver() {
  const plugin = capSqlitePlugin();
  if (!plugin) return null;

  let opened = false;
  async function ensureOpen() {
    if (opened) return;
    await plugin.createConnection({ database: DB_NAME, encrypted: false, mode: "no-encryption", version: 1, readonly: false });
    await plugin.open({ database: DB_NAME });
    opened = true;
  }

  return {
    async exec(sql) {
      await ensureOpen();
      // DDL(CREATE TABLE等)はトランザクション不要かつ副作用のみ。
      await plugin.execute({ database: DB_NAME, statements: sql, transaction: false });
    },
    async runBatch(statements) {
      await ensureOpen();
      if (statements.length === 0) return;
      // executeSetはデフォルトでtransaction: true(1回のトランザクションとしてまとめて実行される)。
      // 途中で失敗すれば全体がロールバックされ、中途半端な状態が残らない。
      const set = statements.map((s) => ({ statement: s.statement, values: s.values || [] }));
      await plugin.executeSet({ database: DB_NAME, set, transaction: true });
    },
    async all(sql, params) {
      await ensureOpen();
      const res = await plugin.query({ database: DB_NAME, statement: sql, values: params || [] });
      return normalizeRows(res && res.values ? res.values : []);
    },
  };
}

globalThis.makeCapacitorSqliteDriver = makeCapacitorSqliteDriver;
globalThis.normalizeRows = normalizeRows; // テスト用に公開(実機で踏んだ変換バグの回帰防止)
