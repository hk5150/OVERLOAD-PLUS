// 休憩(インターバル)タイマーのローカル通知。index.htmlから<script src>で
// 素のグローバルスクリプトとして読み込まれる(importもmodule.exportsも使わない)。
//
// なぜ必要か: 休憩タイマーはsetInterval + AudioContextで動いており、iOSはWebViewが
// バックグラウンドに入るとJSタイマーを止める。スマホをポケットに入れた瞬間にカウントも
// 通知音も止まるため、ジムでの実際の使い方(スマホを置いて次のセットの準備をする)で
// 機能していなかった。ローカル通知はOS側が発火するのでバックグラウンドでも確実に届き、
// ロック中のiPhoneの通知はApple Watchへ自動転送される。
//
// npmパッケージのJSラッパーを使わない理由は src/domain/db/capacitorSqliteDriver.js の
// 冒頭コメントと同じ(esbuildがnode_modulesのimportをバンドルしないため)。
// window.Capacitor.Plugins.LocalNotifications への生のブリッジ呼び出しで足りる。

// 通知を出す経過分。既存のbeep()が鳴るタイミング・下部ゲージの3分割と揃えてある。
// ローカル通知は事前スケジュール制で無限には積めないため3分で打ち切る。
// Apple Watchで3回叩かれるのがうるさければ [1, 3] に減らせばよい。
const REST_NOTIFY_MINUTES = [1, 2, 3];
// 他の通知と衝突しない固定ID。確実にキャンセルするために動的採番にはしない。
const REST_NOTIFICATION_ID_BASE = 4200;
// 通知センターで束ねるためのグループ識別子。
const REST_NOTIFICATION_THREAD = "kurabell-rest";

const REST_NOTIFICATION_IDS = REST_NOTIFY_MINUTES.map((m) => REST_NOTIFICATION_ID_BASE + m);

// 予約する通知の配列を組み立てる純粋関数(テスト対象)。
// texts: { title: string, body: (min:number) => string }
//
// now より後のものだけを返すのが要点。下書き復元でタイマーが途中から再開したとき
// (例: 90秒経過した状態で復元)、既に過ぎた1分の通知を積むと即座に発火してしまう。
function buildRestNotifications(restStartAt, now, texts) {
  if (restStartAt == null) return [];
  const out = [];
  for (const min of REST_NOTIFY_MINUTES) {
    const at = restStartAt + min * 60000;
    if (at <= now) continue;
    out.push({
      id: REST_NOTIFICATION_ID_BASE + min,
      title: texts.title,
      body: texts.body(min),
      threadIdentifier: REST_NOTIFICATION_THREAD,
      schedule: { at: new Date(at) },
      // iOSはsoundを省略すると無音の通知になる(プラグインの公式仕様。Androidは既定音)。
      // 通知を許可した端末ではbeep()を止めて通知に一本化しているので、ここが無音だと
      // 音が一切出なくなる(v96〜v108で実際にそうなっていた)。
      // 存在しないファイル名を渡すとシステムの既定通知音にフォールバックすることも
      // 公式仕様に明記されているため、音源ファイルは同梱しない。
      sound: "default",
    });
  }
  return out;
}

function capLocalNotifications() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.LocalNotifications) {
      return c.Plugins.LocalNotifications;
    }
  } catch { /* ignore */ }
  return null;
}

// 通知が使える環境か(Web版では常にfalse)。呼び出し側がbeepへのフォールバックを判断する。
function restNotificationsAvailable() {
  return capLocalNotifications() != null;
}

// 許可状態を確認し、未確認(prompt)のときだけ要求する。
// deniedで再要求しないのは、iOSが2回目以降のダイアログを出さないため
// (拒否された場合は設定アプリへ誘導するしかない)。
async function ensureRestNotificationPermission() {
  const plugin = capLocalNotifications();
  if (!plugin) return false;
  try {
    const current = await plugin.checkPermissions();
    if (current && current.display === "granted") return true;
    if (current && current.display === "denied") return false;
    const asked = await plugin.requestPermissions();
    return !!(asked && asked.display === "granted");
  } catch {
    return false;
  }
}

// 許可を要求せずに現在の状態だけを見る。
async function checkRestNotificationPermission() {
  const plugin = capLocalNotifications();
  if (!plugin) return "unavailable";
  try {
    const current = await plugin.checkPermissions();
    return (current && current.display) || "prompt";
  } catch {
    return "unavailable";
  }
}

async function cancelRestNotifications() {
  const plugin = capLocalNotifications();
  if (!plugin) return;
  try {
    await plugin.cancel({ notifications: REST_NOTIFICATION_IDS.map((id) => ({ id })) });
  } catch { /* 通知を消せなくても記録の継続を妨げない */ }
}

// 予約し直す。先に必ずキャンセルしてから積む(同じIDで二重に積まれるのを防ぐ)。
async function scheduleRestNotifications(restStartAt, now, texts) {
  const plugin = capLocalNotifications();
  if (!plugin) return;
  await cancelRestNotifications();
  const notifications = buildRestNotifications(restStartAt, now, texts);
  if (notifications.length === 0) return;
  try {
    await plugin.schedule({ notifications });
  } catch { /* 通知を出せなくても記録の継続を妨げない */ }
}

// 配信済みの通知を通知センターから消す(アプリを前面に戻したときに残骸を残さない)。
async function clearDeliveredRestNotifications() {
  const plugin = capLocalNotifications();
  if (!plugin) return;
  try {
    const delivered = await plugin.getDeliveredNotifications();
    const list = (delivered && delivered.notifications) || [];
    const mine = list.filter((n) => REST_NOTIFICATION_IDS.includes(Number(n.id)));
    if (mine.length === 0) return;
    await plugin.removeDeliveredNotifications({ notifications: mine });
  } catch { /* ignore */ }
}

globalThis.REST_NOTIFY_MINUTES = REST_NOTIFY_MINUTES;
globalThis.buildRestNotifications = buildRestNotifications;
globalThis.restNotificationsAvailable = restNotificationsAvailable;
globalThis.ensureRestNotificationPermission = ensureRestNotificationPermission;
globalThis.checkRestNotificationPermission = checkRestNotificationPermission;
globalThis.scheduleRestNotifications = scheduleRestNotifications;
globalThis.cancelRestNotifications = cancelRestNotifications;
globalThis.clearDeliveredRestNotifications = clearDeliveredRestNotifications;
