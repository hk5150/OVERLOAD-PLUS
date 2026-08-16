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
// query()がSwift側で [[String: Any]] (= 行オブジェクトの配列) を返すことは
// CapacitorSQLitePlugin.swift の実装を直接確認済み(型定義のコメントは古い記載で誤解を招くため)。
// ただし実機/シミュレータでの動作確認はまだ行っていない(Xcodeが無い環境で作業しているため)。

const DB_NAME = "kurabellplus";

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
      return res && res.values ? res.values : [];
    },
  };
}

globalThis.makeCapacitorSqliteDriver = makeCapacitorSqliteDriver;
