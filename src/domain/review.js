// App Storeの評価ダイアログ(iOS標準の星をつけるシート)を出すためのブリッジ。index.htmlから<script src>で
// 素のグローバルスクリプトとして読み込まれる(importもmodule.exportsも使わない)。
//
// ネイティブ側は ios/App/App/Review/(window.Capacitor.Plugins.Review)。npmのJSラッパーを
// 使わない理由は src/domain/restNotifications.js の冒頭コメントと同じ。
// 実際に表示するかはiOSが決める(1年に3回まで、TestFlightでは出ない)。アプリ側には表示されたかどうかは返らない。
// TestFlight版ではネイティブ側が断る(依頼日時を残さない)。iOSが年の枠などで見送った場合は、依頼したものとして扱う。

// 依頼した日時(ISO文字列)を保存するキー。Preferences止まり(SQLiteには入れない)。
const REVIEW_REQUESTED_KEY = "review-requested-at";
// 前回依頼してから次に依頼するまでの間隔
const REVIEW_INTERVAL_DAYS = 120;
// 前回比較を体験した人にだけ頼む(同じ分割日を2周目に回して初めて比較が出るため)
const REVIEW_MIN_WORKOUTS = 3;

// 保存に成功した直後に依頼するかどうか(テスト対象)。
// beatPrevious: 保存した記録のどれかの種目で、推定1RMが前回までのベストを超えた(記録画面の比較行が緑になる「過去の自分に勝利」と同じ条件)
// workoutsCount: 保存後の記録の件数
// lastRequestedAt: 前回依頼した日時(ISO文字列。未依頼・読めない値は依頼していない扱い)
function shouldRequestReview({ beatPrevious, workoutsCount, lastRequestedAt, now }) {
  if (!beatPrevious || !(workoutsCount >= REVIEW_MIN_WORKOUTS)) return false;
  const last = lastRequestedAt ? Date.parse(lastRequestedAt) : NaN;
  if (Number.isNaN(last)) return true;
  return now - last >= REVIEW_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
}

function capReviewPlugin() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.Review) {
      return c.Plugins.Review;
    }
  } catch { /* ignore */ }
  return null;
}

// 評価ダイアログを依頼する。依頼できたら true(Web版・プラグインの無い古いネイティブ・失敗は false)。
// 例外は外に出さない。
async function requestAppReview() {
  const plugin = capReviewPlugin();
  if (!plugin) return false;
  try {
    await plugin.request();
    return true;
  } catch { return false; }
}

globalThis.REVIEW_REQUESTED_KEY = REVIEW_REQUESTED_KEY;
globalThis.shouldRequestReview = shouldRequestReview;
globalThis.requestAppReview = requestAppReview;
