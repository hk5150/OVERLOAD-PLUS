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

// ---- 意見・不具合の報告(設定タブの「ご意見・不具合の報告」) ----
// アプリからは何も送らない。メールアプリを開くだけで、送るかどうか・何を書くかは利用者が決める
// (App Storeの「Data Not Collected」申告と、privacy.html の「記録を外部へ送信しない」を崩さないため)。
// 本文の末尾に添えるのは、問い合わせの返事に要る環境の情報だけ(support.html の「書いていただけるとスムーズ」と同じ項目)。
// トレーニング記録・体重は入れない。
const FEEDBACK_EMAIL = "hajime5150@gmail.com";
// App Storeの「レビューを書く」画面を直接開く(iOSではApp Storeアプリが開く)
const APP_STORE_REVIEW_URL = "https://apps.apple.com/app/id6816090624?action=write-review";

// userAgent から iOS の版("18.0" など)を読む。iPad は「Macintosh」を名乗ることがあり、読めなければ null。
function iosVersionFromUa(ua) {
  const m = /\b(?:iPhone|CPU) OS (\d+)[_.](\d+)(?:[_.](\d+))?/.exec(String(ua || ""));
  if (!m) return null;
  return m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`;
}

// 件名で受信側(Gmail)が振り分けられるよう、件名の頭は言語によらず [KURABELL] で揃える。
// subject / bodyLead / envLabel は表示言語の文言(i18n.js の feedback.mailSubject / mailLead / mailEnv)を呼び出し側から渡す。
// iOS の行は platform が "Web" のときは出さない。
function buildFeedbackMailUrl({ subject, bodyLead, envLabel, appVersion, platform, userAgent, lang, unit }) {
  const ios = iosVersionFromUa(userAgent);
  const env = [
    `App: ${appVersion || "?"}${platform ? ` (${platform})` : ""}`,
    ...(platform === "Web" ? [] : [`iOS: ${ios || "?"}`]),
    `Lang: ${lang || "?"} / Unit: ${unit || "?"}`,
  ];
  const body = `${bodyLead}\n\n\n\n-- ${envLabel} --\n${env.join("\n")}\n`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`[KURABELL] ${subject}`)}&body=${encodeURIComponent(body)}`;
}

globalThis.FEEDBACK_EMAIL = FEEDBACK_EMAIL;
globalThis.APP_STORE_REVIEW_URL = APP_STORE_REVIEW_URL;
globalThis.iosVersionFromUa = iosVersionFromUa;
globalThis.buildFeedbackMailUrl = buildFeedbackMailUrl;
