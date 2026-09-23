// ヘルスケア(HealthKit)連携のブリッジ。index.htmlから<script src>で
// 素のグローバルスクリプトとして読み込まれる(importもmodule.exportsも使わない)。
//
// ネイティブ側は ios/App/App/Health/(window.Capacitor.Plugins.Health)。npmのJSラッパーを
// 使わない理由は src/domain/restNotifications.js の冒頭コメントと同じ。
// Web版ではプラグインが無いので、どの関数も何もしない(設定画面の欄ごと出さない)。
//
// ヘルスケアへの書き込み・読み込みの失敗は、記録の保存や表示を妨げない(例外を外に出さない)。
// 設計判断は docs/ヘルスケア連携.md。

function capHealthPlugin() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.Health) {
      return c.Plugins.Health;
    }
  } catch { /* ignore */ }
  return null;
}

// ネイティブにプラグインがあるか(Web版では常にfalse)。設定画面の欄を出すかの判定に使う。
function healthAvailable() {
  return capHealthPlugin() != null;
}

// ヘルスケアが使える端末か。プラグインがあっても、ヘルスケアの無い端末(iPadOS 17未満など)ではfalse。
async function healthSupported() {
  const plugin = capHealthPlugin();
  if (!plugin) return false;
  try {
    const r = await plugin.isAvailable();
    return r?.available === true;
  } catch { return false; }
}

// 権限を求める(シートは初回だけ出る)。戻り値は書き込み権限の状態
// { workout, bodyMass }(それぞれ "authorized" / "denied" / "notDetermined")。失敗したらnull。
async function healthRequestAuthorization() {
  const plugin = capHealthPlugin();
  if (!plugin) return null;
  try { return await plugin.requestAuthorization(); } catch { return null; }
}

async function healthAuthorizationStatus() {
  const plugin = capHealthPlugin();
  if (!plugin) return null;
  try { return await plugin.authorizationStatus(); } catch { return null; }
}

// 記録とヘルスケアのワークアウトを紐づけるキー(純粋関数)。記録には一意なIDが無いので、
// 保存後に変わらない startAt(ISO文字列)を使う。古い記録など startAt が無い・読めないものはnull
// (ヘルスケアには書かない)。
function healthWorkoutKey(w) {
  const s = w && w.startAt;
  if (typeof s !== "string" || !s || !Number.isFinite(Date.parse(s))) return null;
  return s;
}

// これより長い記録はヘルスケアに書かない。startAt は最初の種目を追加した時点で、下書きは24時間まで
// 復元されるので、朝にメニューを組んで夜に保存すると「10時間の筋トレ」になる。実態と違う長さの
// ワークアウトをヘルスケアに残すくらいなら書かない(App Store Guideline 2.5.1: 不正確なデータを書かない)。
const HEALTH_MAX_WORKOUT_MS = 4 * 60 * 60 * 1000;

// ヘルスケアに書く時刻 { startAt, endAt }(エポックミリ秒)。書かないならnull(純粋関数)。
// 終了が読めない・開始より前なら開始と同じにする(長さ0はネイティブ側で1分にする)。
function healthWorkoutRange(w) {
  const key = healthWorkoutKey(w);
  if (!key) return null;
  const startAt = Date.parse(key);
  const end = Date.parse(w.endAt);
  const endAt = Number.isFinite(end) && end >= startAt ? end : startAt;
  if (endAt - startAt > HEALTH_MAX_WORKOUT_MS) return null;
  return { startAt, endAt };
}

// 戻り値: 書き込めたらtrue。
async function healthSaveWorkout(w) {
  const plugin = capHealthPlugin();
  const key = healthWorkoutKey(w);
  const range = healthWorkoutRange(w);
  if (!plugin || !key || !range) return false;
  const { startAt, endAt } = range;
  try {
    await plugin.saveWorkout({ key, startAt, endAt });
    return true;
  } catch { return false; }
}

// このアプリが書いたワークアウトだけを消す。戻り値は消した件数(失敗・対象外は0)。
async function healthDeleteWorkout(w) {
  const plugin = capHealthPlugin();
  const key = healthWorkoutKey(w);
  if (!plugin || !key) return 0;
  try {
    const r = await plugin.deleteWorkout({ key });
    return Number(r?.deleted) || 0;
  } catch { return 0; }
}

// 最新の体重 { kg, date(エポックミリ秒) }。無い・読めないときはnull
// (読み込みを拒否されていても、HealthKitの仕様で「データなし」と区別できない)。
async function healthLatestBodyMass() {
  const plugin = capHealthPlugin();
  if (!plugin) return null;
  try {
    const r = await plugin.latestBodyMass();
    if (!r || !Number.isFinite(r.kg) || !Number.isFinite(r.date)) return null;
    return { kg: r.kg, date: r.date };
  } catch { return null; }
}

// 戻り値: 保存したサンプルの日時(エポックミリ秒)。失敗したらnull。
async function healthSaveBodyMass(kg) {
  const plugin = capHealthPlugin();
  if (!plugin || !isValidBodyweight(kg)) return null;
  try {
    const r = await plugin.saveBodyMass({ kg });
    return Number.isFinite(r?.date) ? r.date : null;
  } catch { return null; }
}

// 体重として受け付ける範囲(kg)。ヘルスケアの誤入力や入力途中の値("0." など)を弾く。
function isValidBodyweight(kg) {
  return typeof kg === "number" && Number.isFinite(kg) && kg >= 20 && kg <= 400;
}

// ヘルスケアの最新の体重を、アプリの体重に反映すべきか(純粋関数)。
// 反映するなら { bodyweight(0.1kg に丸めた値), healthBwAt(その日時) }、しないならnull。
//
// lastSyncedAt(profile.healthBwAt)より新しいものだけを反映するのが要点。アプリで入力した体重を
// ヘルスケアに書いたときも、その日時を lastSyncedAt にしているので、自分が書いた値を次の読み込みで
// 拾い直して上書きすることはない(書き戻しのループが起きない)。
function pickHealthWeight(sample, lastSyncedAt) {
  if (!sample || !isValidBodyweight(sample.kg) || !Number.isFinite(sample.date)) return null;
  const last = Number.isFinite(lastSyncedAt) ? lastSyncedAt : 0;
  if (sample.date <= last) return null;
  return { bodyweight: Math.round(sample.kg * 10) / 10, healthBwAt: sample.date };
}

// 設定画面で体重を編集し終えたとき(フォーカスが外れたとき)に、ヘルスケアへ書くべき値(純粋関数)。
// 編集前と同じ値・範囲外ならnull(入力欄を触っただけで書き込まない)。
function healthWeightToWrite(before, after) {
  if (!isValidBodyweight(after)) return null;
  if (Number.isFinite(before) && Math.abs(before - after) < 0.05) return null;
  return after;
}

globalThis.healthAvailable = healthAvailable;
globalThis.healthSupported = healthSupported;
globalThis.healthRequestAuthorization = healthRequestAuthorization;
globalThis.healthAuthorizationStatus = healthAuthorizationStatus;
globalThis.healthWorkoutKey = healthWorkoutKey;
globalThis.HEALTH_MAX_WORKOUT_MS = HEALTH_MAX_WORKOUT_MS;
globalThis.healthWorkoutRange = healthWorkoutRange;
globalThis.healthSaveWorkout = healthSaveWorkout;
globalThis.healthDeleteWorkout = healthDeleteWorkout;
globalThis.healthLatestBodyMass = healthLatestBodyMass;
globalThis.healthSaveBodyMass = healthSaveBodyMass;
globalThis.pickHealthWeight = pickHealthWeight;
globalThis.healthWeightToWrite = healthWeightToWrite;
