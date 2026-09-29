import { describe, it, expect } from "vitest";
import { loadDomainModule } from "../helpers/loadDomain.js";

// window.Capacitor が無い(=ネイティブでない)状態で読み込む。normalizeRows はグローバル関数
// なので、プラグインが取れない場合でも検証できる。
const { normalizeRows } = loadDomainModule("src/domain/db/capacitorSqliteDriver.js", { window: {} });

describe("normalizeRows — iOS実機で確認したCapacitorSQLiteのquery()戻り値の形を吸収する", () => {
  it("先頭要素が {ios_columns:[...]} というメタデータ行の場合、それを取り除いて残りをそのまま返す", () => {
    // 実機で実際に観測した形: [{ios_columns:["key","value"]}, {key:"split",value:"null"}, ...]
    const values = [
      { ios_columns: ["key", "value"] },
      { key: "split", value: "null" },
      { key: "profile", value: "{\"bodyweight\":70}" },
    ];
    expect(normalizeRows(values)).toEqual([
      { key: "split", value: "null" },
      { key: "profile", value: "{\"bodyweight\":70}" },
    ]);
  });

  it("データが0件(メタデータ行のみ)なら空配列を返す", () => {
    expect(normalizeRows([{ ios_columns: ["key", "value"] }])).toEqual([]);
  });

  it("valuesが空配列なら空配列を返す", () => {
    expect(normalizeRows([])).toEqual([]);
  });

  it("先頭要素がios_columnsを持たない通常の行オブジェクトなら、そのまま全件返す(メタ行なしのケース)", () => {
    const values = [{ key: "split", value: "null" }];
    expect(normalizeRows(values)).toEqual(values);
  });

  it("nullやundefinedを渡しても例外を投げず空配列を返す", () => {
    expect(normalizeRows(null)).toEqual([]);
    expect(normalizeRows(undefined)).toEqual([]);
  });
});

/*
 * 接続を開く処理(ensureOpen)のテスト。
 *
 * なぜ要るか: iOS が WebView の描画プロセスを止めると、Capacitor はページを再読み込みする。
 * JS 側はモジュールごと作り直しになるが、ネイティブ側には前のページの SQLite 接続が残っていて、
 * 修正前は createConnection が「Connection kurabellplus already exists」で失敗し、
 * アプリを終了するまで読み書きが全部失敗していた(2026-09-29、実機で記録が失われた)。
 * 同じ形で、起動直後に読み込みと書き込みが同時に来ると createConnection が2回呼ばれて2本目が落ちる、
 * 1回開くのに失敗するとそのページでは二度と開けない、という壊れ方もあり得たので併せて縛る。
 *
 * ネイティブ側はフェイク(fakeNativeSqlite)で、実プラグイン(6.0.2)の次の振る舞いだけを再現する:
 *   - 同名の接続があると createConnection は already exists で reject する
 *   - closeConnection は接続が無ければ何もせず resolve する
 *   - open していない接続には query / execute / executeSet できない
 * ページの作り直しは、同じフェイクを渡したまま capacitorSqliteDriver.js を読み込み直すことで再現する。
 *
 * 対象外: 実プラグインが本当にこう振る舞うか(特に closeConnection の no-op)は、
 * CLAUDE.md のとおりこのテストでは何も保証しない。シミュレータ/実機での確認が要る。
 */

function fakeNativeSqlite({ openFailures = 0 } = {}) {
  const connections = new Map(); // database -> { opened }
  const calls = [];
  let openFailuresLeft = openFailures;
  const requireOpened = (database) => {
    const c = connections.get(database);
    if (!c || !c.opened) throw new Error(`No available connection for ${database}`);
  };
  return {
    calls,
    connections,
    count: (name) => calls.filter((c) => c === name).length,
    plugin: {
      async closeConnection({ database }) {
        calls.push("closeConnection");
        connections.delete(database);
      },
      async createConnection({ database }) {
        calls.push("createConnection");
        if (connections.has(database)) throw new Error(`Connection ${database} already exists`);
        connections.set(database, { opened: false });
      },
      async open({ database }) {
        calls.push("open");
        if (openFailuresLeft > 0) {
          openFailuresLeft -= 1;
          throw new Error("open failed");
        }
        const c = connections.get(database);
        if (!c) throw new Error(`No available connection for ${database}`);
        c.opened = true;
      },
      async execute({ database }) {
        calls.push("execute");
        requireOpened(database);
        return { changes: { changes: 0 } };
      },
      async executeSet({ database }) {
        calls.push("executeSet");
        requireOpened(database);
        return { changes: { changes: 1 } };
      },
      async query({ database }) {
        calls.push("query");
        requireOpened(database);
        return { values: [{ ios_columns: ["key", "value"] }, { key: "split", value: "null" }] };
      },
    },
  };
}

// ページの読み込み1回分。同じ native を渡せば「ネイティブ側の状態を引き継いだまま JS だけ作り直した」状態になる。
function loadPage(native) {
  const Capacitor = { isNativePlatform: () => true, Plugins: { CapacitorSQLite: native.plugin } };
  const { makeCapacitorSqliteDriver } = loadDomainModule("src/domain/db/capacitorSqliteDriver.js", { window: { Capacitor } });
  return makeCapacitorSqliteDriver();
}

describe("ensureOpen — ページが作り直されても接続を開き直せる(ここが崩れるとアプリを終了するまで保存が全部失敗する)", () => {
  it("前のページで開いた接続がネイティブ側に残っていても、新しいページのドライバでqueryとexecuteSetが成功する", async () => {
    const native = fakeNativeSqlite();
    const before = loadPage(native);
    await before.all("SELECT key, value FROM settings");

    const after = loadPage(native);
    expect(await after.all("SELECT key, value FROM settings")).toEqual([{ key: "split", value: "null" }]);
    await expect(after.runBatch([{ statement: "INSERT INTO settings VALUES (?, ?)", values: ["k", "v"] }])).resolves.toBeUndefined();
  });

  it("exec・all・runBatchを同時に呼んでもcreateConnectionとopenは1回だけ", async () => {
    const native = fakeNativeSqlite();
    const driver = loadPage(native);
    await Promise.all([
      driver.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)"),
      driver.all("SELECT key, value FROM settings"),
      driver.runBatch([{ statement: "INSERT INTO settings VALUES (?, ?)", values: ["k", "v"] }]),
    ]);
    expect(native.count("createConnection")).toBe(1);
    expect(native.count("open")).toBe(1);
  });

  it("一度開けたら、以降の呼び出しでは接続を閉じたり作り直したりしない", async () => {
    const native = fakeNativeSqlite();
    const driver = loadPage(native);
    await driver.all("SELECT 1");
    await driver.exec("SELECT 1");
    await driver.runBatch([{ statement: "SELECT 1" }]);
    expect(native.count("closeConnection")).toBe(1);
    expect(native.count("createConnection")).toBe(1);
    expect(native.count("open")).toBe(1);
  });

  it("openが1回失敗しても、次の呼び出しで開き直して成功する(1回の失敗でそのページの読み書きが止まらない)", async () => {
    const native = fakeNativeSqlite({ openFailures: 1 });
    const driver = loadPage(native);
    await expect(driver.all("SELECT key, value FROM settings")).rejects.toThrow("open failed");
    expect(await driver.all("SELECT key, value FROM settings")).toEqual([{ key: "split", value: "null" }]);
  });

  it("開く処理の失敗は、同時に待っていた呼び出しすべてに伝わる(誰かだけ開いていない接続で走らない)", async () => {
    const native = fakeNativeSqlite({ openFailures: 1 });
    const driver = loadPage(native);
    const results = await Promise.allSettled([driver.all("SELECT 1"), driver.exec("SELECT 1")]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(native.count("query")).toBe(0);
    expect(native.count("execute")).toBe(0);
  });
});
