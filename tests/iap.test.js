import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// store(src/domain/storage.js)の偽物。tests/restNotifications.test.js の fakePlugin() と
// 同じ要領で、iap.jsが依存する window.Capacitor と store の両方を注入する。
function fakeStore() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? { value: data.get(key) } : null; },
    async set(key, value) { data.set(key, value); },
    async del(key) { data.delete(key); },
    _data: data,
  };
}

function load(initialGlobals = {}) {
  return loadDomainModule("src/domain/iap.js", initialGlobals);
}

describe("isTrialLimitReached", () => {
  it("Web版(isNative=false)では常にfalse", () => {
    const { isTrialLimitReached } = load();
    expect(isTrialLimitReached(999, false, false)).toBe(false);
  });

  it("購入済みなら常にfalse", () => {
    const { isTrialLimitReached } = load();
    expect(isTrialLimitReached(999, true, true)).toBe(false);
  });

  it("9件保存済みまでは制限に達しない", () => {
    const { isTrialLimitReached } = load();
    expect(isTrialLimitReached(9, false, true)).toBe(false);
  });

  it("10件保存済み(=11回目の保存)で制限に達する", () => {
    const { isTrialLimitReached } = load();
    expect(isTrialLimitReached(10, false, true)).toBe(true);
  });

  it("10件を超えても制限は変わらずtrue", () => {
    const { isTrialLimitReached } = load();
    expect(isTrialLimitReached(50, false, true)).toBe(true);
  });
});

describe("iapAvailable", () => {
  it("windowが無い環境(ビルド検証など)では使わない", () => {
    const { iapAvailable } = load();
    expect(iapAvailable()).toBe(false);
  });

  it("Web版(isNativePlatformがfalse)では使わない", () => {
    const { iapAvailable } = load({
      window: { Capacitor: { isNativePlatform: () => false, Plugins: { Iap: {} } } },
    });
    expect(iapAvailable()).toBe(false);
  });

  it("ネイティブでもプラグインが未登録なら使わない", () => {
    const { iapAvailable } = load({
      window: { Capacitor: { isNativePlatform: () => true, Plugins: {} } },
    });
    expect(iapAvailable()).toBe(false);
  });

  it("ネイティブかつプラグインがあれば使える", () => {
    const { iapAvailable } = load({
      window: { Capacitor: { isNativePlatform: () => true, Plugins: { Iap: {} } } },
    });
    expect(iapAvailable()).toBe(true);
  });
});

describe("readCachedPurchaseFlag", () => {
  it("未保存なら false", async () => {
    const store = fakeStore();
    const m = load({ store });
    expect(await m.readCachedPurchaseFlag()).toBe(false);
  });

  it("保存済みの \"1\" を true として読む", async () => {
    const store = fakeStore();
    store._data.set("iap-unlocked-v1", "1");
    const m = load({ store });
    expect(await m.readCachedPurchaseFlag()).toBe(true);
  });

  it("store.getが例外を投げても false にフォールバックする(起動を止めない)", async () => {
    const store = { async get() { throw new Error("boom"); } };
    const m = load({ store });
    expect(await m.readCachedPurchaseFlag()).toBe(false);
  });
});

function fakeIapPlugin(overrides = {}) {
  const calls = { purchase: [], restorePurchases: 0, refreshEntitlements: 0, getProducts: [] };
  const plugin = {
    async getProducts(arg) {
      calls.getProducts.push(arg);
      return overrides.productsResult ?? { products: [{ id: arg.productIds[0], displayPrice: "¥980" }] };
    },
    async purchase(arg) {
      calls.purchase.push(arg);
      return overrides.purchaseResult ?? { purchased: true };
    },
    async restorePurchases() {
      calls.restorePurchases++;
      return overrides.restoreResult ?? { purchasedProductIds: [] };
    },
    async refreshEntitlements() {
      calls.refreshEntitlements++;
      return overrides.refreshResult ?? { purchasedProductIds: [] };
    },
  };
  const globals = {
    window: { Capacitor: { isNativePlatform: () => true, Plugins: { Iap: plugin } } },
  };
  return { globals, calls };
}

describe("refreshPurchaseState", () => {
  it("プラグインが無い環境ではfalseを返す(呼び出せない)", async () => {
    const store = fakeStore();
    const m = load({ store });
    expect(await m.refreshPurchaseState()).toBe(false);
  });

  it("商品IDが権利に含まれていればtrueを返し、キャッシュに書く", async () => {
    const store = fakeStore();
    const { globals } = fakeIapPlugin({
      refreshResult: { purchasedProductIds: ["com.hajime5150.kurabellplus.unlock"] },
    });
    const m = load({ store, ...globals });
    expect(await m.refreshPurchaseState()).toBe(true);
    expect(store._data.get("iap-unlocked-v1")).toBe("1");
  });

  it("権利に含まれていなければfalseを返し、キャッシュを\"0\"に更新する", async () => {
    const store = fakeStore();
    store._data.set("iap-unlocked-v1", "1"); // 古いキャッシュが残っているケース
    const { globals } = fakeIapPlugin({ refreshResult: { purchasedProductIds: [] } });
    const m = load({ store, ...globals });
    expect(await m.refreshPurchaseState()).toBe(false);
    expect(store._data.get("iap-unlocked-v1")).toBe("0");
  });
});

describe("fetchUnlockProduct", () => {
  it("プラグインが無い環境ではnullを返す(呼び出せない)", async () => {
    const store = fakeStore();
    const m = load({ store });
    expect(await m.fetchUnlockProduct()).toBe(null);
  });

  it("商品情報を取得し、IAP_PRODUCT_IDで問い合わせる", async () => {
    const store = fakeStore();
    const { globals, calls } = fakeIapPlugin({
      productsResult: { products: [{ id: "com.hajime5150.kurabellplus.unlock", displayPrice: "¥980" }] },
    });
    const m = load({ store, ...globals });
    const product = await m.fetchUnlockProduct();
    expect(product).toEqual({ id: "com.hajime5150.kurabellplus.unlock", displayPrice: "¥980" });
    expect(calls.getProducts[0]).toEqual({ productIds: ["com.hajime5150.kurabellplus.unlock"] });
  });

  it("productsが空配列でもnullを返す(未定義アクセスにならない)", async () => {
    const store = fakeStore();
    const { globals } = fakeIapPlugin({ productsResult: { products: [] } });
    const m = load({ store, ...globals });
    expect(await m.fetchUnlockProduct()).toBe(null);
  });

  it("productsフィールド自体が無くてもnullを返す", async () => {
    const store = fakeStore();
    const { globals } = fakeIapPlugin({ productsResult: {} });
    const m = load({ store, ...globals });
    expect(await m.fetchUnlockProduct()).toBe(null);
  });
});

describe("purchaseUnlock", () => {
  it("プラグインが無い環境では例外を投げる", async () => {
    const store = fakeStore();
    const m = load({ store });
    await expect(m.purchaseUnlock()).rejects.toThrow("iap.unavailable");
  });

  it("購入成功でtrueを返し、キャッシュに\"1\"を書く", async () => {
    const store = fakeStore();
    const { globals, calls } = fakeIapPlugin({ purchaseResult: { purchased: true } });
    const m = load({ store, ...globals });
    expect(await m.purchaseUnlock()).toBe(true);
    expect(store._data.get("iap-unlocked-v1")).toBe("1");
    expect(calls.purchase[0]).toEqual({ productId: "com.hajime5150.kurabellplus.unlock" });
  });

  it("ユーザーキャンセル等ではfalseを返し、キャッシュは書き換えない", async () => {
    const store = fakeStore();
    const { globals } = fakeIapPlugin({ purchaseResult: { purchased: false } });
    const m = load({ store, ...globals });
    expect(await m.purchaseUnlock()).toBe(false);
    expect(store._data.has("iap-unlocked-v1")).toBe(false);
  });
});

describe("restorePurchase", () => {
  it("プラグインが無い環境では例外を投げる", async () => {
    const store = fakeStore();
    const m = load({ store });
    await expect(m.restorePurchase()).rejects.toThrow("iap.unavailable");
  });

  it("復元した権利に商品IDが含まれていればtrueを返す", async () => {
    const store = fakeStore();
    const { globals, calls } = fakeIapPlugin({
      restoreResult: { purchasedProductIds: ["com.hajime5150.kurabellplus.unlock"] },
    });
    const m = load({ store, ...globals });
    expect(await m.restorePurchase()).toBe(true);
    expect(store._data.get("iap-unlocked-v1")).toBe("1");
    expect(calls.restorePurchases).toBe(1);
  });

  it("購入履歴が無ければfalseを返す", async () => {
    const store = fakeStore();
    const { globals } = fakeIapPlugin({ restoreResult: { purchasedProductIds: [] } });
    const m = load({ store, ...globals });
    expect(await m.restorePurchase()).toBe(false);
  });
});

describe("定数の公開", () => {
  it("TRIAL_WORKOUT_LIMITとIAP_PRODUCT_IDがglobalThisに公開されている", () => {
    const m = load();
    expect(m.TRIAL_WORKOUT_LIMIT).toBe(10);
    expect(typeof m.IAP_PRODUCT_ID).toBe("string");
    expect(m.IAP_PRODUCT_ID.length).toBeGreaterThan(0);
  });
});
