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
//
// iOSでは予約だけを自前プラグイン(window.Capacitor.Plugins.RestTimer、
// ios/App/App/RestTimer/)に任せる。LocalNotificationsはinterruptionLevelを扱えず、
// Time Sensitiveにできない(集中モードで止まる)ため。IDは同じ文字列("4201"等)で積むので、
// キャンセル・配信済みの削除・許可の確認はLocalNotifications経由のままでよい。
// 同じプラグインでLive Activity(ロック画面・Dynamic Islandの経過表示)も同期する。
// 設計判断は docs/休憩タイマー通知.md。

// 通知を出す経過分の初期値。既存のbeep()が鳴るタイミング・下部ゲージの3分割と揃えてある。
// 1.3 から設定で選べる(改善要望 4c。profile.restNotifyMinutes)。選べるのは REST_NOTIFY_CHOICES だけ。
const REST_NOTIFY_MINUTES = [1, 2, 3];
const REST_NOTIFY_CHOICES = [1, 1.5, 2, 2.5, 3, 4, 5];
// 他の通知と衝突しない固定ID。確実にキャンセルするために動的採番にはしない。
const REST_NOTIFICATION_ID_BASE = 4200;
// 通知センターで束ねるためのグループ識別子。
const REST_NOTIFICATION_THREAD = "kurabell-rest";

// 分ちょうどは今までと同じ 4200+分(1.2 までに予約された通知も同じIDで取り消せる)。
// 30秒刻みは 4210+分の整数部(1:30 → 4211)
const restNotifyId = (min) => REST_NOTIFICATION_ID_BASE + (Number.isInteger(min) ? min : 10 + Math.floor(min));
const REST_NOTIFICATION_IDS = REST_NOTIFY_CHOICES.map(restNotifyId);

// 保存値を選べる時間だけに揃える(並び替え・重複除去)。未設定なら初期値。空の配列は「通知しない」
function normalizeRestNotifyMinutes(list) {
  if (!Array.isArray(list)) return REST_NOTIFY_MINUTES.slice();
  return REST_NOTIFY_CHOICES.filter((m) => list.includes(m));
}

// 予約する通知の配列を組み立てる純粋関数(テスト対象)。
// texts: { title: string, body: (min:number) => string }
//
// now より後のものだけを返すのが要点。下書き復元でタイマーが途中から再開したとき
// (例: 90秒経過した状態で復元)、既に過ぎた1分の通知を積むと即座に発火してしまう。
// minutes: 通知する経過分(normalizeRestNotifyMinutes 済み)。省略すると初期値
function buildRestNotifications(restStartAt, now, texts, minutes = REST_NOTIFY_MINUTES) {
  if (restStartAt == null) return [];
  const out = [];
  for (const min of minutes) {
    const at = restStartAt + min * 60000;
    if (at <= now) continue;
    out.push({
      id: restNotifyId(min),
      title: texts.title,
      body: texts.body(min),
      threadIdentifier: REST_NOTIFICATION_THREAD,
      schedule: { at: new Date(at) },
      // iOSはsoundを省略すると無音の通知になる(プラグインの公式仕様。Androidは既定音)。
      // 通知を許可した端末ではbeep()を止めて通知に一本化しているので、ここが無音だと
      // 音が一切出なくなる(v96〜v108で実際にそうなっていた)。
      // 存在しないファイル名を渡すとシステムの既定通知音にフォールバックすることも
      // 公式仕様に明記されているため、音源ファイルは同梱しない。
      // (RestTimerプラグイン経由のときは使わない。ネイティブ側で正式なUNNotificationSound.defaultを
      //  設定する。これはRestTimerが無い・失敗したときにLocalNotificationsへ切り戻す用)
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

function capRestTimer() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.RestTimer) {
      return c.Plugins.RestTimer;
    }
  } catch { /* ignore */ }
  return null;
}

// RestTimerプラグインへ渡す形に変換する純粋関数(テスト対象)。
// idはキャンセル側(LocalNotificationsがNumberを文字列化する)と同じ文字列にそろえる。
// Dateはブリッジを通すと扱いが曖昧になるのでミリ秒で渡す。
function toNativeRestNotifications(list) {
  return list.map((n) => ({
    id: String(n.id),
    title: n.title,
    body: n.body,
    threadIdentifier: n.threadIdentifier,
    at: n.schedule.at.getTime(),
  }));
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
async function scheduleRestNotifications(restStartAt, now, texts, minutes = REST_NOTIFY_MINUTES) {
  const plugin = capLocalNotifications();
  if (!plugin) return;
  await cancelRestNotifications();
  const notifications = buildRestNotifications(restStartAt, now, texts, minutes);
  if (notifications.length === 0) return;
  const restTimer = capRestTimer();
  if (restTimer) {
    try {
      await restTimer.scheduleNotifications({ notifications: toNativeRestNotifications(notifications) });
      return;
    } catch { /* 下のLocalNotificationsへ切り戻す(Time Sensitiveにはならないが通知は届く) */ }
  }
  try {
    await plugin.schedule({ notifications });
  } catch { /* 通知を出せなくても記録の継続を妨げない */ }
}

// Live Activityを「表示しておくべき状態」に合わせる。
// 放置対策: Live Activityはアプリが動いていないと自分では終われない(システム上限は8時間)。
// 開始から30分でstale(ネイティブ側で灰色の固定表示)にし、それ以降にsyncされたら終了させる。
const REST_ACTIVITY_STALE_MINUTES = 30;

// syncActivityに渡す状態を決める純粋関数(テスト対象)。表示しないならnull。
function buildRestActivityState(restStartAt, now, title) {
  if (restStartAt == null) return null;
  const staleAt = restStartAt + REST_ACTIVITY_STALE_MINUTES * 60000;
  if (now >= staleAt) return null;
  return { startedAt: restStartAt, staleAt, title };
}

// 何度呼んでも同じ結果になる(ネイティブ側が差分だけ反映する)ので、effectから気軽に呼んでよい。
async function syncRestActivity(restStartAt, now, title) {
  const restTimer = capRestTimer();
  if (!restTimer) return;
  try {
    await restTimer.syncActivity(buildRestActivityState(restStartAt, now, title) ?? { startedAt: null });
  } catch { /* Live Activityを出せなくても記録の継続を妨げない */ }
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

// ---- トレーニング日のお知らせ(UI レビュー A3、2026-10-18) ----
// 選んだ曜日・時刻に「今日は Pull の日」と知らせる、端末内のローカル通知。アプリからは何も送らない。
// 繰り返しの通知(schedule.on)にしないのは、本文に「次の Day」と前回の数字を入れるため。次の Day は保存するたびに変わるので、
// 先の分を1回ずつ予約しておき、起動・保存・設定の変更のたびに取り消して積み直す。開かないまま28日たつと止まる。
// その日にもう記録を保存していたら、その日の分は積まない(やった後に「今日は…の日」と来ないように)。
const WORKOUT_REMINDER_ID_BASE = 5100;
const WORKOUT_REMINDER_DAYS_AHEAD = 28;
const WORKOUT_REMINDER_IDS = Array.from({ length: WORKOUT_REMINDER_DAYS_AHEAD }, (_, i) => WORKOUT_REMINDER_ID_BASE + i);
const WORKOUT_REMINDER_THREAD = "kurabell-workout-reminder";
const WORKOUT_REMINDER_DEFAULT_DAYS = [1, 3, 5]; // 月・水・金(Date#getDay の 0=日曜)
const WORKOUT_REMINDER_DEFAULT_TIME = "19:00";

const isReminderTime = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// 保存値をそろえる。未設定・壊れた値はオフ(既定の曜日・時刻)
function normalizeWorkoutReminder(r) {
  const days = Array.isArray(r && r.days) ? [0, 1, 2, 3, 4, 5, 6].filter((d) => r.days.includes(d)) : WORKOUT_REMINDER_DEFAULT_DAYS.slice();
  return {
    on: !!(r && r.on === true),
    days,
    time: isReminderTime(r && r.time) ? r.time : WORKOUT_REMINDER_DEFAULT_TIME,
  };
}

// オンにしたときの最初の曜日と時刻を、直近28日の記録から決める(テスト対象)。
// 2回以上やった曜日、時刻は一番多く始めた時(00分)。記録が足りなければ既定(月・水・金の19時)
function suggestWorkoutReminder(workouts, now) {
  const since = now - 28 * 86400000;
  const recent = (workouts || []).filter((w) => {
    const t = Date.parse(w && (w.startAt || w.date));
    return Number.isFinite(t) && t >= since && t <= now;
  });
  const byDay = new Map(), byHour = new Map();
  recent.forEach((w) => {
    const d = new Date(Date.parse(w.startAt || w.date));
    byDay.set(d.getDay(), (byDay.get(d.getDay()) || 0) + 1);
    byHour.set(d.getHours(), (byHour.get(d.getHours()) || 0) + 1);
  });
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => (byDay.get(d) || 0) >= 2);
  const hour = [...byHour.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return {
    on: true,
    days: days.length ? days : WORKOUT_REMINDER_DEFAULT_DAYS.slice(),
    time: hour ? `${String(hour[0]).padStart(2, "0")}:00` : WORKOUT_REMINDER_DEFAULT_TIME,
  };
}

// 予約する通知の配列(テスト対象)。lastWorkoutAt: 最後に保存した記録の時刻(ミリ秒、無ければ null)。
// texts: { title: string, body: string }
function buildWorkoutReminders(settings, now, lastWorkoutAt, texts) {
  const r = normalizeWorkoutReminder(settings);
  if (!r.on || r.days.length === 0) return [];
  const [hh, mm] = r.time.split(":").map(Number);
  const base = new Date(now);
  const out = [];
  for (let i = 0; i < WORKOUT_REMINDER_DAYS_AHEAD; i++) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, hh, mm, 0, 0);
    if (!r.days.includes(day.getDay())) continue;
    if (day.getTime() <= now) continue;
    if (lastWorkoutAt != null) {
      const last = new Date(lastWorkoutAt);
      if (last.getFullYear() === day.getFullYear() && last.getMonth() === day.getMonth() && last.getDate() === day.getDate()) continue;
    }
    out.push({
      id: WORKOUT_REMINDER_ID_BASE + out.length,
      title: texts.title,
      body: texts.body,
      threadIdentifier: WORKOUT_REMINDER_THREAD,
      schedule: { at: day },
      sound: "default", // 省略すると無音(buildRestNotifications の注記と同じ)
    });
  }
  return out;
}

async function cancelWorkoutReminders() {
  const plugin = capLocalNotifications();
  if (!plugin) return;
  try {
    await plugin.cancel({ notifications: WORKOUT_REMINDER_IDS.map((id) => ({ id })) });
  } catch { /* 取り消せなくても記録には関係しない */ }
}

// 取り消してから積み直す。休憩の通知と違って Time Sensitive にはしない(LocalNotifications で予約する)
async function scheduleWorkoutReminders(settings, now, lastWorkoutAt, texts) {
  const plugin = capLocalNotifications();
  if (!plugin) return;
  await cancelWorkoutReminders();
  const notifications = buildWorkoutReminders(settings, now, lastWorkoutAt, texts);
  if (notifications.length === 0) return;
  try {
    await plugin.schedule({ notifications });
  } catch { /* 通知を出せなくても記録には関係しない */ }
}

globalThis.REST_NOTIFY_MINUTES = REST_NOTIFY_MINUTES;
globalThis.REST_NOTIFY_CHOICES = REST_NOTIFY_CHOICES;
globalThis.restNotifyId = restNotifyId;
globalThis.normalizeRestNotifyMinutes = normalizeRestNotifyMinutes;
globalThis.buildRestNotifications = buildRestNotifications;
globalThis.restNotificationsAvailable = restNotificationsAvailable;
globalThis.ensureRestNotificationPermission = ensureRestNotificationPermission;
globalThis.checkRestNotificationPermission = checkRestNotificationPermission;
globalThis.scheduleRestNotifications = scheduleRestNotifications;
globalThis.cancelRestNotifications = cancelRestNotifications;
globalThis.clearDeliveredRestNotifications = clearDeliveredRestNotifications;
globalThis.toNativeRestNotifications = toNativeRestNotifications;
globalThis.REST_ACTIVITY_STALE_MINUTES = REST_ACTIVITY_STALE_MINUTES;
globalThis.buildRestActivityState = buildRestActivityState;
globalThis.syncRestActivity = syncRestActivity;

globalThis.WORKOUT_REMINDER_IDS = WORKOUT_REMINDER_IDS;
globalThis.normalizeWorkoutReminder = normalizeWorkoutReminder;
globalThis.suggestWorkoutReminder = suggestWorkoutReminder;
globalThis.buildWorkoutReminders = buildWorkoutReminders;
globalThis.cancelWorkoutReminders = cancelWorkoutReminders;
globalThis.scheduleWorkoutReminders = scheduleWorkoutReminders;
