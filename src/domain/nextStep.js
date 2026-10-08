// 「次の一手」(1.4)。種目ごとに、次にやる重量・回数の案と、その理由を出す。
// index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやexportは使わない。ビルド不要の原則を維持するため)。
//
// 数字はここの規則で決める(ダブルプログレッション)。端末内AI(Apple Foundation Models)には
// 理由の文章を書かせるだけ。Apple 自身が端末内モデルで「基本的な算数・論理推論は避けるべき」と
// 書いているため(docs/次の一手.md)。案は並べるだけで、記録を自動で書き換えない。採用はユーザーのタップ。

// 規則。重量は表示単位(kg/lb)の数値で受け取って返す(「この案で入れる」で欄に入る数字とずらさないため)。
// insight: src/domain/insight.js の exerciseInsight の結果(topWeight は kg のまま)
// topWeight / increment: 表示単位に直した前回のトップ重量と、増やす刻み(呼び出し側で wU / incU を通す)
// repLow / repHigh: 種目の目標回数(lastConfig 由来)
// 戻り値: { kind, weight, repsLow, repsHigh, inc, reason: { key, params } } か null(案を出せない)
function suggestNextStep({ insight, topWeight, increment, repLow, repHigh }) {
  if (!insight || insight.topWeight == null || !(insight.topReps > 0)) return null;
  const lo = Math.max(1, Math.round(repLow) || 8);
  const hi = Math.max(lo, Math.round(repHigh) || lo);
  const reps = Math.round(insight.topReps);
  const rir = insight.topRir == null ? null : Number(insight.topRir);
  const w = Number(topWeight) || 0;
  const base = { w, r: reps, rir: rir == null ? "-" : rir, lo, hi };

  // 加重できない種目(腕立てなど)は回数だけ
  if (!insight.canAddWeight) {
    return { kind: "reps", weight: w, repsLow: reps + 1, repsHigh: reps + 1, inc: 0, reason: { key: "next.reason.bodyweight", params: { ...base, target: reps + 1 } } };
  }
  // 回数が落ちている最中に重量を上げるのは順序が逆(insight の readyToProgress と同じ判断)
  if (!insight.readyToProgress && insight.bestRecentReps > reps) {
    const best = Math.round(insight.bestRecentReps);
    return { kind: "recover", weight: w, repsLow: best, repsHigh: best, inc: 0, reason: { key: "next.reason.recover", params: { ...base, best } } };
  }
  if (reps >= hi) {
    const inc = Number(increment) || 0;
    // 上限回数に届いたが余力が無かった。同じ重量・回数で余力を残せるまで据え置く
    if (rir != null && rir < 1) {
      return { kind: "hold", weight: w, repsLow: reps, repsHigh: reps, inc: 0, reason: { key: "next.reason.hold", params: base } };
    }
    if (inc > 0) {
      const next = Math.round((w + inc) * 100) / 100;
      return { kind: "add", weight: next, repsLow: lo, repsHigh: hi, inc, reason: { key: "next.reason.add", params: { ...base, inc, next } } };
    }
  }
  const target = reps + 1;
  // 加重したことはあるが、前回は自重だけだった(懸垂など)。「前回は0kgで」と書かない
  const key = w > 0 ? "next.reason.reps" : "next.reason.repsBw";
  return { kind: "reps", weight: w, repsLow: target, repsHigh: target, inc: 0, reason: { key, params: { ...base, target } } };
}

// 端末内AIの文に、案と根拠に無い数字が混ざっていたら使わない(小さいモデルは数字を作りがち)。
// allowed: 使ってよい数字(案・前回の値・刻み・回数・RIR など)
function aiTextIsConsistent(text, allowed) {
  if (typeof text !== "string" || !text.trim()) return false;
  const ok = new Set((allowed || []).filter(v => v != null && v !== "").map(v => String(Number(v))));
  const nums = text.replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).match(/\d+(?:\.\d+)?/g) || [];
  return nums.every(x => ok.has(String(Number(x))));
}

// ---- 端末内AI(iOS のネイティブ。window.Capacitor.Plugins.Ai、ios/App/App/Ai/)----
// Web 版・プラグインの無い古いネイティブ・対応していない端末では使わない(定型文だけ)。
function capAiPlugin() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.Ai) return c.Plugins.Ai;
  } catch { /* ignore */ }
  return null;
}

// 使えるか。iOS 26 以上・Apple Intelligence 対応機種・オン・モデルのダウンロード済みのときだけ true
async function nextStepAiAvailable() {
  const plugin = capAiPlugin();
  if (!plugin) return false;
  try { const r = await plugin.availability(); return !!(r && r.available); } catch { return false; }
}

// 理由の文章を端末内AIに書かせる。使えない・失敗・時間切れは null(呼び出し側は定型文のまま)
async function explainNextStep(facts, lang, timeoutMs = 10000) {
  const plugin = capAiPlugin();
  if (!plugin) return null;
  try {
    const r = await Promise.race([
      plugin.explain({ facts, lang }),
      new Promise(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return r && typeof r.text === "string" ? r.text.trim() : null;
  } catch { return null; }
}

globalThis.suggestNextStep = suggestNextStep;
globalThis.aiTextIsConsistent = aiTextIsConsistent;
globalThis.nextStepAiAvailable = nextStepAiAvailable;
globalThis.explainNextStep = explainNextStep;
