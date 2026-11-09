// 継続の数字(KURABELL)を出す。読むだけ。
// 使い方: node scripts/asc/usage.mjs
//
// 2026-11-10、北村さん「全て対応して」(docs/ダウンロード改善提案_2026-11.md の C2)。12時のルーティンが報告に添える。
// 出どころは App Store Connect の分析レポート(ONGOING の依頼)。
// - App Sessions Standard: セッション数・セッションの合計時間(秒)・ユニークデバイス
// - App Store Installation and Deletion Standard: 初回DL・アップデート・削除
// ユニークデバイスは版・機種・国ごとの行の合計で、同じ端末が2行に出ると2台に数える(上限の目安)。
// どちらも「分析の共有に同意した人」だけの数字で、人数が少ない日は Apple が行を落とす。
// 2026-11 時点では日別は出ず、月別(セッション)と週別・月別(インストールと削除)だけが出ている。
// だから日別の折れ線にはせず、出ている期間をそのまま並べる。空の期間は「0」ではなく「出ていない」。
import { gunzipSync } from "node:zlib";
import { all, APP_ID } from "./client.mjs";

async function rows(reportName, granularity) {
  const out = new Map(); // 期間の先頭日 → 行
  for (const req of await all(`/v1/apps/${APP_ID}/analyticsReportRequests`)) {
    if (req.attributes.accessType !== "ONGOING") continue;
    for (const rep of await all(`/v1/analyticsReportRequests/${req.id}/reports?filter[name]=${encodeURIComponent(reportName)}`)) {
      const insts = await all(`/v1/analyticsReports/${rep.id}/instances?filter[granularity]=${granularity}&limit=200`);
      insts.sort((a, b) => (a.attributes.processingDate < b.attributes.processingDate ? -1 : 1));
      for (const inst of insts) {
        for (const seg of await all(`/v1/analyticsReportInstances/${inst.id}/segments`)) {
          const res = await fetch(seg.attributes.url);
          const lines = gunzipSync(Buffer.from(await res.arrayBuffer())).toString().trim().split("\n");
          const head = lines[0].split("\t");
          const fresh = new Map();
          for (const l of lines.slice(1)) {
            const c = l.split("\t");
            const o = Object.fromEntries(head.map((k, i) => [k, c[i]]));
            if (!fresh.has(o.Date)) fresh.set(o.Date, []);
            fresh.get(o.Date).push(o);
          }
          for (const [d, rs] of fresh) out.set(d, rs); // 同じ期間は新しいインスタンスで上書き
        }
      }
    }
  }
  return new Map([...out].sort());
}

const n = (v) => +v || 0;

const L = [];
L.push(`KURABELL 継続の数字(分析の共有に同意した人だけ。出ていない期間は 0 ではない)`);

for (const g of ["MONTHLY", "WEEKLY"]) {
  const s = await rows("App Sessions Standard", g);
  if (!s.size) { L.push(`セッション(${g === "MONTHLY" ? "月別" : "週別"}): まだ出ていない`); continue; }
  L.push(`セッション(${g === "MONTHLY" ? "月別" : "週別"}): 期間の先頭 | セッション | 端末(版・機種・国の行の合計なので重なりあり) | 1台あたり(少なめに出る) | 1回の平均`);
  for (const [d, rs] of s) {
    const ses = rs.reduce((a, r) => a + n(r.Sessions), 0);
    const dev = rs.reduce((a, r) => a + n(r["Unique Devices"]), 0);
    const dur = rs.reduce((a, r) => a + n(r["Total Session Duration"]), 0);
    L.push(`  ${d} | ${ses} | ${dev} | ${dev ? (ses / dev).toFixed(1) : "-"}回 | ${ses ? Math.round(dur / ses) : "-"}秒`);
  }
}

for (const g of ["MONTHLY", "WEEKLY"]) {
  const s = await rows("App Store Installation and Deletion Standard", g);
  if (!s.size) { L.push(`インストールと削除(${g === "MONTHLY" ? "月別" : "週別"}): まだ出ていない`); continue; }
  L.push(`インストールと削除(${g === "MONTHLY" ? "月別" : "週別"}): 期間の先頭 | 初回DL | 再DL | アップデート | 削除`);
  for (const [d, rs] of s) {
    const c = (ev, type) => rs.filter((r) => r.Event === ev && (type == null || r["Download Type"] === type)).reduce((a, r) => a + n(r.Counts), 0);
    L.push(`  ${d} | ${c("Install", "First-time download")} | ${c("Install", "Redownload")} | ${c("Install", "Manual update") + c("Install", "Auto-update")} | ${c("Delete")}`);
  }
}

console.log(L.join("\n"));
