// 非消耗型IAP(買い切りフル解除)のブリッジ。index.htmlから<script src>で
// 素のグローバルスクリプトとして読み込まれる(importもmodule.exportsも使わない)。
//
// npmパッケージのJSラッパーを使わず window.Capacitor.Plugins.Iap への生のブリッジ
// 呼び出しで足りる理由は src/domain/restNotifications.js の冒頭コメントと同じ。
//
// 決定事項の詳細は docs/IAP実装方針.md を参照。ここでは値の列挙は書かない
// (実装より先に腐るため、CLAUDE.md参照)。

// 試用上限。この件数を保存済みの状態で次の保存をしようとするとブロックする
// (0件目〜9件目は保存できる=10回まで無料、10件目の保存済み=11回目でブロック)。
const TRIAL_WORKOUT_LIMIT = 10;

// App Store Connect側で登録する商品ID。ASC登録後にここだけ差し替える
// (Swift側にはハードコードしない設計なので、変更箇所はこの1行のみ)。
const IAP_PRODUCT_ID = "com.hajime5150.kurabellplus.unlock";

// 購入フラグの保存キー。store.get/set/del経由でPreferences止まり(SQLiteは通らない)。
// DRAFT_KEYと同じ独立キーの枠組みで、workouts系のclearAll()の影響を受けない。
// 理由: 非消耗型IAPの真実の情報源はAppleのTransactionで、ローカル値は単なるキャッシュ。
// 「記録を全削除したら購入済みも消えた」という直感に反する不具合を避けるため、
// persist()経由のsettings行き(SQLite化・clearAll対象)にはしていない。
const PURCHASE_FLAG_KEY = "iap-unlocked-v1";

function capIapPlugin() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.Iap) {
      return c.Plugins.Iap;
    }
  } catch { /* ignore */ }
  return null;
}

// IAPが使える環境か(Web版では常にfalse)。呼び出し側はこれを見て試用制限自体を
// 発動させるかどうかを決める(Web版は常にフル解除扱い)。
function iapAvailable() {
  return capIapPlugin() != null;
}

// 試用上限に達しているかどうかの純粋関数(テスト対象)。
// isNative=false(Web版)またはpurchased=trueなら常にfalse。
function isTrialLimitReached(workoutsCount, purchased, isNative) {
  if (!isNative || purchased) return false;
  return workoutsCount >= TRIAL_WORKOUT_LIMIT;
}

// 起動時の権利再確認。Transaction.currentEntitlementsのみを見る(AppStore.syncは呼ばない)。
// AppStore.syncを起動時に自動で呼ぶとApple IDパスワード確認が入りUXを損なうため、
// それは restorePurchase() 経由(ユーザーが「購入を復元」を押したとき)専用にしてある。
async function refreshPurchaseState() {
  const plugin = capIapPlugin();
  if (!plugin) return false;
  const r = await plugin.refreshEntitlements();
  const purchased = Array.isArray(r?.purchasedProductIds) && r.purchasedProductIds.includes(IAP_PRODUCT_ID);
  await store.set(PURCHASE_FLAG_KEY, purchased ? "1" : "0");
  return purchased;
}

// ネイティブ呼び出しの往復を待たず、直近保存したキャッシュ値で先に画面を出すための読み出し。
async function readCachedPurchaseFlag() {
  try {
    const r = await store.get(PURCHASE_FLAG_KEY);
    return r?.value === "1";
  } catch { return false; }
}

// ペイウォール表示用の価格情報取得。呼び出し元(index.html)がwindow.Capacitor.Pluginsを
// 直接触らずに済むよう、他の関数と同じくここでプラグイン呼び出しを閉じる。
async function fetchUnlockProduct() {
  const plugin = capIapPlugin();
  if (!plugin) return null;
  const r = await plugin.getProducts({ productIds: [IAP_PRODUCT_ID] });
  return r?.products?.[0] ?? null;
}

async function purchaseUnlock() {
  const plugin = capIapPlugin();
  if (!plugin) throw new Error("iap.unavailable");
  const r = await plugin.purchase({ productId: IAP_PRODUCT_ID });
  if (r?.purchased) {
    await store.set(PURCHASE_FLAG_KEY, "1");
    return true;
  }
  return false; // ユーザーキャンセル、またはFamily承認待ち等のpending
}

// 「購入を復元」ボタン専用。AppStore.syncを呼んでよいのはここだけ。
async function restorePurchase() {
  const plugin = capIapPlugin();
  if (!plugin) throw new Error("iap.unavailable");
  const r = await plugin.restorePurchases();
  const purchased = Array.isArray(r?.purchasedProductIds) && r.purchasedProductIds.includes(IAP_PRODUCT_ID);
  await store.set(PURCHASE_FLAG_KEY, purchased ? "1" : "0");
  return purchased;
}

globalThis.TRIAL_WORKOUT_LIMIT = TRIAL_WORKOUT_LIMIT;
globalThis.IAP_PRODUCT_ID = IAP_PRODUCT_ID;
globalThis.iapAvailable = iapAvailable;
globalThis.isTrialLimitReached = isTrialLimitReached;
globalThis.refreshPurchaseState = refreshPurchaseState;
globalThis.readCachedPurchaseFlag = readCachedPurchaseFlag;
globalThis.fetchUnlockProduct = fetchUnlockProduct;
globalThis.purchaseUnlock = purchaseUnlock;
globalThis.restorePurchase = restorePurchase;
