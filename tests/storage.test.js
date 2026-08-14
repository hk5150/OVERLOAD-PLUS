import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// 偽のlocalStorage。failWrites=trueで容量超過などの書き込み失敗を再現する。
function fakeLocalStorage(seed = {}, { failWrites = false, failReads = false } = {}) {
  const data = { ...seed };
  return {
    data,
    getItem(k) { if (failReads) throw new Error("read blocked"); return k in data ? data[k] : null; },
    setItem(k, v) { if (failWrites) throw new Error("quota exceeded"); data[k] = v; },
    removeItem(k) { delete data[k]; },
  };
}

// 偽のCapacitor Preferences(実体はネイティブのUserDefaults)。
function fakePreferences(seed = {}, { failAll = false } = {}) {
  const data = { ...seed };
  const calls = [];
  return {
    data,
    calls,
    plugin: {
      async get({ key }) { calls.push(["get", key]); if (failAll) throw new Error("bridge down"); return { value: key in data ? data[key] : null }; },
      async set({ key, value }) { calls.push(["set", key]); if (failAll) throw new Error("bridge down"); data[key] = value; },
      async remove({ key }) { calls.push(["remove", key]); if (failAll) throw new Error("bridge down"); delete data[key]; },
    },
  };
}

function loadStore({ localStorage, preferences = null, hostStorage = null, native = false }) {
  const window = {};
  if (preferences) {
    window.Capacitor = { isNativePlatform: () => native, Plugins: { Preferences: preferences } };
  }
  if (hostStorage) window.storage = hostStorage;
  const sandbox = loadDomainModule("src/domain/storage.js", { window, localStorage });
  return sandbox.store;
}

describe("store — Web(Capacitorなし)", () => {
  it("localStorageに読み書きできる", async () => {
    const ls = fakeLocalStorage();
    const store = loadStore({ localStorage: ls });
    await store.set("k", "v");
    expect(await store.get("k")).toEqual({ value: "v" });
    expect(ls.data.k).toBe("v");
  });

  it("未保存のキーはnullを返す", async () => {
    const store = loadStore({ localStorage: fakeLocalStorage() });
    expect(await store.get("missing")).toBeNull();
  });

  it("削除できる", async () => {
    const ls = fakeLocalStorage({ k: "v" });
    const store = loadStore({ localStorage: ls });
    await store.del("k");
    expect(await store.get("k")).toBeNull();
  });

  it("localStorageが書き込み拒否したらthrowする(保存失敗を握り潰して成功に見せない)", async () => {
    const store = loadStore({ localStorage: fakeLocalStorage({}, { failWrites: true }) });
    await expect(store.set("k", "v")).rejects.toThrow("no storage available");
  });

  it("localStorageが読み取りで例外を投げてもnullを返して落ちない", async () => {
    const store = loadStore({ localStorage: fakeLocalStorage({ k: "v" }, { failReads: true }) });
    expect(await store.get("k")).toBeNull();
  });
});

describe("store — ネイティブ(Capacitor Preferences)", () => {
  it("Preferencesを優先して読む", async () => {
    const prefs = fakePreferences({ k: "from-prefs" });
    const store = loadStore({
      localStorage: fakeLocalStorage({ k: "from-localstorage" }),
      preferences: prefs.plugin, native: true,
    });
    expect(await store.get("k")).toEqual({ value: "from-prefs" });
  });

  it("Preferencesとlocalstorageの両方に書く(片方が失われても読み戻せるように)", async () => {
    const prefs = fakePreferences();
    const ls = fakeLocalStorage();
    const store = loadStore({ localStorage: ls, preferences: prefs.plugin, native: true });
    await store.set("k", "v");
    expect(prefs.data.k).toBe("v");
    expect(ls.data.k).toBe("v");
  });

  it("削除するとPreferences側からも消える", async () => {
    const prefs = fakePreferences({ k: "v" });
    const ls = fakeLocalStorage({ k: "v" });
    const store = loadStore({ localStorage: ls, preferences: prefs.plugin, native: true });
    await store.del("k");
    expect(prefs.data.k).toBeUndefined();
    expect(ls.data.k).toBeUndefined();
  });

  it("isNativePlatform()がfalseならPreferencesには触らない(Web版で誤って使わない)", async () => {
    const prefs = fakePreferences({ k: "from-prefs" });
    const store = loadStore({
      localStorage: fakeLocalStorage({ k: "from-localstorage" }),
      preferences: prefs.plugin, native: false,
    });
    expect(await store.get("k")).toEqual({ value: "from-localstorage" });
    expect(prefs.calls).toEqual([]);
  });

  it("Preferencesが落ちていてもlocalStorageで読み書きを続けられる", async () => {
    const prefs = fakePreferences({}, { failAll: true });
    const ls = fakeLocalStorage({ k: "v" });
    const store = loadStore({ localStorage: ls, preferences: prefs.plugin, native: true });
    expect(await store.get("k")).toEqual({ value: "v" });
    await store.set("k2", "v2");
    expect(ls.data.k2).toBe("v2");
  });
});

describe("store — localStorageからPreferencesへの移行", () => {
  it("Preferencesが空でlocalStorageに旧データがあれば、それを返す(履歴が消えたように見せない)", async () => {
    const prefs = fakePreferences();
    const store = loadStore({
      localStorage: fakeLocalStorage({ "workout-log-v1": "legacy-history" }),
      preferences: prefs.plugin, native: true,
    });
    expect(await store.get("workout-log-v1")).toEqual({ value: "legacy-history" });
  });

  it("旧データを読んだ時点でPreferencesへ写す(次回以降はlocalStorageが回収されても残る)", async () => {
    const prefs = fakePreferences();
    const store = loadStore({
      localStorage: fakeLocalStorage({ "workout-log-v1": "legacy-history" }),
      preferences: prefs.plugin, native: true,
    });
    await store.get("workout-log-v1");
    expect(prefs.data["workout-log-v1"]).toBe("legacy-history");
  });

  it("移行後にlocalStorageが空になっても、Preferencesから読める", async () => {
    const prefs = fakePreferences();
    const ls = fakeLocalStorage({ "workout-log-v1": "legacy-history" });
    const store = loadStore({ localStorage: ls, preferences: prefs.plugin, native: true });
    await store.get("workout-log-v1");
    // iOSがWebストレージを回収した状況を再現
    delete ls.data["workout-log-v1"];
    expect(await store.get("workout-log-v1")).toEqual({ value: "legacy-history" });
  });

  it("Preferencesに値があるなら旧データで上書きしない", async () => {
    const prefs = fakePreferences({ "workout-log-v1": "current" });
    const store = loadStore({
      localStorage: fakeLocalStorage({ "workout-log-v1": "stale" }),
      preferences: prefs.plugin, native: true,
    });
    expect(await store.get("workout-log-v1")).toEqual({ value: "current" });
    expect(prefs.data["workout-log-v1"]).toBe("current");
  });

  it("移行時の書き込みに失敗しても、データ自体は返す(次回また移行を試す)", async () => {
    const prefs = fakePreferences();
    prefs.plugin.set = async () => { throw new Error("bridge down"); };
    const store = loadStore({
      localStorage: fakeLocalStorage({ "workout-log-v1": "legacy-history" }),
      preferences: prefs.plugin, native: true,
    });
    expect(await store.get("workout-log-v1")).toEqual({ value: "legacy-history" });
  });
});
