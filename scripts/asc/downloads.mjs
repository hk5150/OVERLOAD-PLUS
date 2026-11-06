// アプリごとの日次ダウンロード数(売上とトレンドのレポート)を出す。読むだけ。
// 使い方: node scripts/asc/downloads.mjs [--days 7] [--json]
//
// 毎朝のダウンロード報告(KURABELL・HEART HIIT)を、ブラウザのサインイン(2段階認証で止まる)から
// API に移すために作った(2026-11-06)。キーは日次の指標取得と同じ ~/.appstoreconnect/ のもの。
// 売上レポートはチーム(ベンダー番号)単位で1本なので、同じチームのアプリはこのキー1本で全部読める。
// - 初回DL = Product Type Identifier が 1 系、再DL = 3 系(7 系のアップデートは数えない)
// - 日次レポートは太平洋時間の1日ぶん。前日分が出るのは日本時間でおおむね翌日の昼〜夕方。
//   朝の時点では「前日」がまだ 404 のことが多いので、出ている最新の日を明示する
import { gunzipSync } from "node:zlib";
import { cfg, token, has, opt } from "./client.mjs";

const APPS = { "6816090624": "KURABELL", "6821939071": "HEART HIIT" };
const DAYS = +opt("--days", 7);

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

function parseTsv(text) {
  const lines = text.replace(/\r/g, "").trim().split("\n").filter(Boolean);
  const head = lines[0]?.split("\t") || [];
  return lines.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [head[i], v])));
}

async function day(date) {
  const url = `https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${cfg.vendorNumber}&filter[reportDate]=${date}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  if (res.status === 404) return null; // DL が0件の日、またはまだ出ていない日
  if (!res.ok) throw new Error(`salesReports ${date}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const out = Object.fromEntries(Object.keys(APPS).map((id) => [id, { firstDL: 0, reDL: 0 }]));
  for (const r of parseTsv(gunzipSync(Buffer.from(await res.arrayBuffer())).toString())) {
    const o = out[r["Apple Identifier"]];
    const t = r["Product Type Identifier"] || "";
    if (!o) continue;
    if (t.startsWith("1")) o.firstDL += +r.Units || 0;
    else if (t.startsWith("3")) o.reDL += +r.Units || 0;
  }
  return out;
}

const end = addDays(ymd(new Date()), -1);
const days = [];
for (let i = DAYS - 1; i >= 0; i--) { const d = addDays(end, -i); days.push({ date: d, apps: await day(d) }); }
const latest = [...days].reverse().find((d) => d.apps)?.date || null;

if (has("--json")) {
  console.log(JSON.stringify({ apps: APPS, latestDateWithData: latest, days }, null, 2));
} else {
  console.log(`日次ダウンロード(初回DL / 再DL)。最新のデータ: ${latest || "なし"}(太平洋時間の日付)`);
  console.log(["日付", ...Object.values(APPS)].join("\t"));
  for (const d of days) {
    const cells = Object.keys(APPS).map((id) => (d.apps ? `${d.apps[id].firstDL} / ${d.apps[id].reDL}` : "-"));
    console.log([d.date, ...cells].join("\t"));
  }
  console.log("「-」はレポートが無い日(DLが0件か、まだ出ていない)");
}
