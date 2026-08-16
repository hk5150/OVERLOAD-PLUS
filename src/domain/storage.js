// 永続化レイヤ。index.htmlから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやmodule.exportsを使わない、ビルド不要の原則を維持するため)。
//
// 保存先の優先順位:
//   1. SQLite(workoutStore経由) … ネイティブ(iOS)かつ SQLITE_BACKED_KEY のときだけ。
//      トレーニング履歴は年々増え続けるため、UserDefaultsに1個のJSON文字列として
//      毎回まるごと書き直すと性能・破損・保存失敗のリスクがある。db/schema.js 以下を参照。
//   2. Capacitor Preferences     … ネイティブ(iOS)のときだけ存在。実体はUserDefaults。
//      SQLiteが使えない鍵(下書き・設定値など)や、SQLite自体が使えない環境でのフォールバック。
//   3. window.storage            … 一部の埋め込み実行環境が提供するAPI。
//   4. localStorage              … Web版の本命であり、上のフォールバックでもある。
//
// なぜPreferencesを(SQLite以外は)優先するか: WKWebViewのlocalStorageは、iOSがストレージ逼迫時や
// 長期未使用時に回収する対象で、数年分のトレーニング履歴を預ける先としては信頼できない。
// Preferences/SQLiteはネイティブ側に載るので回収されず、端末バックアップにも含まれる。
//
// どの経路も例外を握り潰す……が、SQLite経路(SQLITE_BACKED_KEYの get/set)だけは例外。
// 保存失敗を握り潰すと「保存できたと見せかけて実は消えていた」になるため、
// SQLiteが使える環境ではSQLiteの失敗をそのまま呼び出し側(index.htmlのpersist()の
// 既存のsaveStatus="error"表示)へ伝える。SQLiteが使えない環境(Web/古いネイティブ)では
// 従来どおりPreferences→localStorageのフォールバックへ進む。

// index.html の STORAGE_KEY ("workout-log-v1") と同じ文字列。トレーニング履歴本体だけを
// SQLiteへ振り分け、下書き(DRAFT_KEY)やインポート前スナップショットはPreferencesのままにする
// (「設定値のような小さなデータはPreferencesに残して構わない」という前提に合わせている)。
const SQLITE_BACKED_KEY = "workout-log-v1";

let workoutStoreSingleton = null;
let migrationPromise = null;

function nativeSqliteDriver() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    if (w && typeof globalThis.makeCapacitorSqliteDriver === "function") {
      return globalThis.makeCapacitorSqliteDriver(); // ネイティブでない/プラグイン未登録ならnull
    }
  } catch { /* ignore */ }
  return null;
}

// db/workoutStore.js は1回作れば使い回せる(ensureSchema/移行は内部で1回だけ実行される)。
function getWorkoutStore() {
  if (workoutStoreSingleton) return workoutStoreSingleton;
  const driver = nativeSqliteDriver();
  if (!driver || typeof globalThis.createWorkoutStore !== "function") return null;
  workoutStoreSingleton = globalThis.createWorkoutStore(driver);
  return workoutStoreSingleton;
}

// 旧Preferences値の読み取り専用ヘルパー(移行元)。既存のPreferences→localStorageの
// フォールバック経路をそのまま流用する(下のcapPrefs/lsGetと同じ考え方)。
async function legacyPrefsGet(key) {
  const prefs = capPrefs();
  if (prefs) {
    try {
      const r = await prefs.get({ key });
      if (r && r.value != null) return r.value;
    } catch { /* fallthrough */ }
  }
  return lsGet(key);
}

// 移行はアプリ起動(モジュール読み込み)ごとに1回だけ試みる。失敗してもここでは再試行せず、
// 次回起動時(=モジュールが再読み込みされた時)にまた1回だけ試みる
// (「移行途中で失敗しても、次回起動時に再試行できる」を、1セッション内で無限リトライしない形で満たす)。
function ensureMigrated(ws) {
  if (!migrationPromise) {
    migrationPromise = ws.migrateLegacyIfNeeded(() => legacyPrefsGet(SQLITE_BACKED_KEY));
  }
  return migrationPromise;
}

function capPrefs() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.Preferences) {
      return c.Plugins.Preferences;
    }
  } catch { /* ignore */ }
  return null;
}

function hostStorage() {
  try {
    if (typeof window !== "undefined" && window.storage) return window.storage;
  } catch { /* ignore */ }
  return null;
}

function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const store = {
  async get(key) {
    if (key === SQLITE_BACKED_KEY) {
      const ws = getWorkoutStore();
      if (ws) {
        await ensureMigrated(ws); // 失敗すればここで投げる(呼び出し側の既存エラー表示に乗る)
        const state = await ws.getAll();
        return { value: JSON.stringify(state) };
      }
      // SQLiteが使えない(Web/プラグイン未登録)環境では、下の従来経路へそのまま進む。
    }

    const prefs = capPrefs();
    if (prefs) {
      try {
        const r = await prefs.get({ key });
        if (r && r.value != null) return { value: r.value };
        // localStorageに保存していた頃のデータを一度だけ引き上げる。
        // これをやらないと、保存先の切り替えが既存ユーザーには「履歴が全部消えた」に見える。
        const legacy = lsGet(key);
        if (legacy != null) {
          try { await prefs.set({ key, value: legacy }); } catch { /* 次回また試す */ }
          return { value: legacy };
        }
        return null;
      } catch { /* 読めなければ下のフォールバックへ */ }
    }

    const host = hostStorage();
    if (host) {
      try { const r = await host.get(key); if (r) return r; } catch { /* fallthrough */ }
    }

    const v = lsGet(key);
    return v != null ? { value: v } : null;
  },

  async set(key, value) {
    if (key === SQLITE_BACKED_KEY) {
      const ws = getWorkoutStore();
      if (ws) {
        await ensureMigrated(ws);
        await ws.setAll(JSON.parse(value)); // 失敗すればそのまま投げる(保存失敗を握り潰さない)
        return;
      }
    }

    let ok = false;

    const prefs = capPrefs();
    if (prefs) {
      try { await prefs.set({ key, value }); ok = true; } catch { /* fallthrough */ }
    }

    const host = hostStorage();
    if (host) {
      try { await host.set(key, value); ok = true; } catch { /* fallthrough */ }
    }

    // Preferencesに書けていてもlocalStorageには書いておく(片方が失われても読み戻せるように)
    if (lsSet(key, value)) ok = true;

    if (!ok) throw new Error("no storage available");
  },

  async del(key) {
    if (key === SQLITE_BACKED_KEY) {
      const ws = getWorkoutStore();
      if (ws) {
        try { await ensureMigrated(ws); } catch { /* 削除操作なので移行失敗は無視してよい */ }
        try { await ws.clearAll(); } catch { /* ignore */ }
      }
      // SQLite側を消しても、下で旧Preferences/localStorageの値も必ず消す
      // (「PreferencesとSQLiteの両方から削除される」を満たすため)。
    }

    const prefs = capPrefs();
    if (prefs) {
      try { await prefs.remove({ key }); } catch { /* ignore */ }
    }
    const host = hostStorage();
    if (host) {
      try { await host.delete(key); } catch { /* ignore */ }
    }
    lsRemove(key);
  },
};

globalThis.store = store;
