// 毎朝 Gmail に送る詳しい報告(KURABELL・HEART HIIT)の本文をプレーンテキストで出す。読むだけ。
// 使い方: node scripts/asc/daily-detail.mjs [--days 14]
//
// 2026-11-06 北村さんの「もうちょっと詳細データ送れる?」から。ミューズ(Meta AI)が Gmail で読む前提なので、
// Markdown を使わず、表は「|」区切りの素の文字にする。
// - 売上レポート(両アプリ): 初回DL・再DL・アップデート・課金、国別・端末別。太平洋時間の日付
// - 分析レポート(アプリごと): 表示・閲覧・初回DL・閲覧率・CVR、流入元別。依頼はアプリから API でたどる
//   (HEART HIIT の依頼は 2026-11-06 に出した。最初のデータが出るまで1〜2日かかる)
//   分析は数え方の閾値で少ない行が落ちるので、空でも0とは限らない
import { gunzipSync } from "node:zlib";
import { cfg, token, all, opt } from "./client.mjs";

const APPS = { "6816090624": "KURABELL", "6821939071": "HEART HIIT" };
const DAYS = +opt("--days", 14);
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "-");

function parseTsv(text) {
  const lines = text.replace(/\r/g, "").trim().split("\n").filter(Boolean);
  const head = lines[0]?.split("\t") || [];
  return lines.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [head[i], v])));
}

// Apple 側の 500 がときどき続けて出る(2026-11-06)。5xx は間をあけて4回まで取り直す
async function get(url, auth = true) {
  let res;
  for (let i = 0; i < 4; i++) {
    res = await fetch(url, auth ? { headers: { Authorization: `Bearer ${token()}` } } : {});
    if (res.status < 500) return res;
    await sleep(4000 * (i + 1));
  }
  return res;
}

// ---- 売上 ----
const kind = (t) => (/^IA/.test(t) ? "iap" : t.startsWith("1") ? "firstDL" : t.startsWith("3") ? "reDL" : t.startsWith("7") ? "updates" : "other");
const blank = () => ({ firstDL: 0, reDL: 0, updates: 0, iap: 0, proceeds: {}, country: {}, device: {} });

async function salesDay(date) {
  const res = await get(`https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${cfg.vendorNumber}&filter[reportDate]=${date}`);
  if (res.status === 404) return null;
  if (!res.ok) return { error: `${res.status}` };
  const rows = parseTsv(gunzipSync(Buffer.from(await res.arrayBuffer())).toString());
  const out = Object.fromEntries(Object.keys(APPS).map((id) => [id, blank()]));
  for (const r of rows) {
    const k = kind(r["Product Type Identifier"] || "");
    // 課金の行は親アプリの ID が「Parent Identifier」側(SKU)に入るので、KURABELL に寄せる(HEART HIIT に課金は無い)
    const id = k === "iap" ? "6816090624" : r["Apple Identifier"];
    const o = out[id];
    if (!o) continue;
    const u = +r.Units || 0;
    o[k] = (o[k] || 0) + u;
    if (k === "firstDL" || k === "reDL") {
      o.country[r["Country Code"]] = (o.country[r["Country Code"]] || 0) + u;
      o.device[r.Device] = (o.device[r.Device] || 0) + u;
    }
    const p = (+r["Developer Proceeds"] || 0) * u;
    if (p) o.proceeds[r["Currency of Proceeds"]] = (o.proceeds[r["Currency of Proceeds"]] || 0) + p;
  }
  return out;
}

// ---- 分析(KURABELL) ----
async function dailyRows(appId, reportName) {
  const instances = [];
  for (const req of await all(`/v1/apps/${appId}/analyticsReportRequests`)) {
    const reqId = req.id;
    const reports = await all(`/v1/analyticsReportRequests/${reqId}/reports?filter[name]=${encodeURIComponent(reportName)}`);
    for (const rep of reports) instances.push(...await all(`/v1/analyticsReports/${rep.id}/instances?filter[granularity]=DAILY&limit=200`));
  }
  instances.sort((a, b) => (a.attributes.processingDate < b.attributes.processingDate ? -1 : 1));
  const byDate = new Map();
  for (const inst of instances.slice(-(DAYS + 5))) {
    const rows = [];
    for (const seg of await all(`/v1/analyticsReportInstances/${inst.id}/segments`)) {
      const res = await get(seg.attributes.url, false);
      rows.push(...parseTsv(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()));
    }
    const fresh = new Map();
    for (const r of rows) { const d = r.Date || inst.attributes.processingDate; if (!fresh.has(d)) fresh.set(d, []); fresh.get(d).push(r); }
    for (const [d, rs] of fresh) byDate.set(d, rs); // 同じ日は新しいインスタンスで上書き(kurabell-metrics.mjs と同じ数え方)
  }
  return byDate;
}

async function analytics(appId) {
  const eng = await dailyRows(appId, "App Store Discovery and Engagement Standard");
  const dl = await dailyRows(appId, "App Downloads Standard");
  const dates = [...new Set([...eng.keys(), ...dl.keys()])].sort();
  if (!dates.length) return null;
  const last = dates.at(-1);
  const start = addDays(last, -(DAYS - 1));
  const daily = {};
  const src = { view: {}, dl: {} };
  for (let d = start; d <= last; d = addDays(d, 1)) daily[d] = { imp: 0, view: 0, dl: 0 };
  for (const [d, rows] of eng) {
    if (d < start) continue;
    for (const r of rows) {
      const n = +r.Counts || 0;
      if (r.Event === "Impression") daily[d].imp += n;
      if (r.Event === "Page view") { daily[d].view += n; src.view[r["Source Type"]] = (src.view[r["Source Type"]] || 0) + n; }
    }
  }
  for (const [d, rows] of dl) {
    if (d < start) continue;
    for (const r of rows) {
      if (r["Download Type"] !== "First-time download") continue;
      const n = +r.Counts || 0;
      daily[d].dl += n;
      src.dl[r["Source Type"]] = (src.dl[r["Source Type"]] || 0) + n;
    }
  }
  return { start, last, daily, src };
}

// ---- 本文 ----
const end = addDays(ymd(new Date()), -1);
const sales = [];
for (let i = DAYS - 1; i >= 0; i--) { const d = addDays(end, -i); sales.push({ date: d, apps: await salesDay(d) }); }
const latest = [...sales].reverse().find((s) => s.apps && !s.apps.error)?.date || "なし";
const failed = sales.filter((s) => s.apps?.error).map((s) => s.date);

const L = [];
L.push(`App Store 日次レポート(KURABELL・HEART HIIT) 作成: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);
L.push(`売上レポートの最新の日: ${latest}(太平洋時間。朝の時点では2日前までのことが多い)`);
if (failed.length) L.push(`Apple 側のエラーで取れなかった日: ${failed.join(", ")}(翌日の報告で埋まる)`);
L.push("");

const sum = (id) => {
  const t = blank();
  for (const s of sales) {
    const o = s.apps?.[id];
    if (!o || s.apps.error) continue;
    for (const k of ["firstDL", "reDL", "updates", "iap"]) t[k] += o[k] || 0;
    for (const f of ["country", "device", "proceeds"]) for (const [k, v] of Object.entries(o[f])) t[f][k] = (t[f][k] || 0) + v;
  }
  return t;
};
const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("、") || "なし";

L.push(`■ 1. ダウンロード(売上レポート、直近${DAYS}日)`);
for (const [id, name] of Object.entries(APPS)) {
  const t = sum(id);
  const proceeds = Object.entries(t.proceeds).map(([c, v]) => `${Math.round(v * 100) / 100} ${c}`).join("、") || "0";
  L.push(`${name}: 初回DL ${t.firstDL} / 再DL ${t.reDL} / アップデート ${t.updates}${id === "6816090624" ? ` / 課金 ${t.iap}件(収益 ${proceeds})` : ""}`);
  L.push(`  国別(初回+再DL): ${top(t.country)}`);
  L.push(`  端末別(初回+再DL): ${top(t.device)}`);
}
L.push("");
L.push("日付 | KURABELL 初回/再/更新 | HEART HIIT 初回/再/更新");
for (const s of sales) {
  const cell = (id) => (!s.apps ? "-" : s.apps.error ? "取得失敗" : `${s.apps[id].firstDL}/${s.apps[id].reDL}/${s.apps[id].updates}`);
  L.push(`${s.date} | ${cell("6816090624")} | ${cell("6821939071")}`);
}
L.push("「-」はレポートが無い日(0件か、まだ出ていない)");
L.push("");

let n = 2;
for (const [id, name] of Object.entries(APPS)) {
  L.push(`■ ${n++}. ${name} の App Store 入口(分析レポート)`);
  try {
    const a = await analytics(id);
    if (!a) L.push("まだデータがありません(依頼から最初のデータまで1〜2日かかる)");
    else {
      let ti = 0, tv = 0, td = 0;
      L.push(`期間: ${a.start} 〜 ${a.last}`);
      L.push("日付 | 表示 | 閲覧 | 初回DL | 閲覧率 | CVR");
      for (const [d, v] of Object.entries(a.daily)) {
        ti += v.imp; tv += v.view; td += v.dl;
        L.push(`${d} | ${v.imp} | ${v.view} | ${v.dl} | ${pct(v.view, v.imp)} | ${pct(v.dl, v.view)}`);
      }
      L.push(`合計 | ${ti} | ${tv} | ${td} | ${pct(tv, ti)} | ${pct(td, tv)}`);
      L.push(`閲覧の流入元: ${top(a.src.view)}`);
      L.push(`初回DLの流入元: ${top(a.src.dl)}`);
    }
  } catch (e) {
    L.push(`取得に失敗: ${String(e.message || e).split("\n")[0].slice(0, 150)}`);
  }
  L.push("");
}
L.push("閲覧率 = 閲覧 ÷ 表示、CVR = 初回DL ÷ 閲覧。分析レポートは少ない行が落ちることがあり、売上レポートとは日付が1日ずれることがある");

console.log(L.join("\n"));
