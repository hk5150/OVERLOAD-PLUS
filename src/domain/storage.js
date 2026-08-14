// 永続化レイヤ。index.htmlから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやmodule.exportsを使わない、ビルド不要の原則を維持するため)。
//
// 保存先の優先順位:
//   1. Capacitor Preferences  … ネイティブ(iOS)のときだけ存在。実体はUserDefaults。
//   2. window.storage         … 一部の埋め込み実行環境が提供するAPI。
//   3. localStorage           … Web版の本命であり、上2つのフォールバックでもある。
//
// なぜPreferencesを最優先にするか: WKWebViewのlocalStorageは、iOSがストレージ逼迫時や
// 長期未使用時に回収する対象で、数年分のトレーニング履歴を預ける先としては信頼できない。
// Preferencesはネイティブ側に載るので回収されず、端末バックアップにも含まれる。
//
// どの経路も例外を握り潰す。保存の失敗でアプリ全体が落ちるのが最悪の結果なので。

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
