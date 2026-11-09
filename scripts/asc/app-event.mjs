// App Store の「App 内イベント」を作る(下書きまで。審査への提出は metadata.mjs submit で版と一緒に出す)。
//
//   node scripts/asc/app-event.mjs              # 作る内容を見るだけ
//   node scripts/asc/app-event.mjs --apply      # 無ければ作り、文面と画像を入れる(同じ referenceName があれば文面と画像だけ入れ直す)
//
// 2026-11-10、北村さん「全て対応して」(docs/ダウンロード改善提案_2026-11.md の A2)。
// 1.4.6 の「週に何回?」から今日のメニューまで組む流れを、大型アップデート(MAJOR_UPDATE)として載せる。
// 文面は appstore/events/<referenceName>/{ja,en-US}.json、画像は同じフォルダの card.png(1920×1080)と details.png(1080×1920)。
// 属性名と列挙値は 2026-11-10 に API の検証エラーで確かめた(Apple の文書ページは表が読めなかった)。
import { readFileSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { api, all, APP_ID, REPO, APPLY, checkLocks, dryNote, sleep } from "./client.mjs";

const REF = "週に何回?で今日のメニュー(1.4.6)";
const DIR = path.join(REPO, "appstore", "events", "1.4.6-weekly-menu");
const EVENT = {
  referenceName: REF,
  badge: "MAJOR_UPDATE",
  purpose: "ATTRACT_NEW_USERS",
  purchaseRequirement: "NO_COST_ASSOCIATED",
  primaryLocale: "ja",
  priority: "NORMAL",
};
// 日本時間。イベントの期間は最大31日、宣伝はイベントの開始より前から出せる(上限14日)
const SCHEDULE = { publishStart: "2026-11-10T12:00:00+09:00", eventStart: "2026-11-13T00:00:00+09:00", eventEnd: "2026-12-12T23:59:00+09:00" };
const LIMITS = { name: 30, shortDescription: 50, longDescription: 120 };
const ASSETS = [["EVENT_CARD", "card.png"], ["EVENT_DETAILS_PAGE", "details.png"]];

const locs = {};
for (const l of ["ja", "en-US"]) {
  const t = JSON.parse(readFileSync(path.join(DIR, `${l}.json`), "utf8"));
  for (const [k, max] of Object.entries(LIMITS)) {
    const n = [...(t[k] || "")].length;
    if (!n || n > max) { console.error(`${l}.${k}: ${n}字(1〜${max}字)`); process.exit(1); }
  }
  locs[l] = t;
}
for (const [, f] of ASSETS) if (!existsSync(path.join(DIR, f))) { console.error(`画像が無い: ${f}`); process.exit(1); }

const existing = (await all(`/v1/apps/${APP_ID}/appEvents`)).find((e) => e.attributes.referenceName === REF);
console.log(existing ? `イベント「${REF}」はある(${existing.attributes.eventState})` : `イベント「${REF}」は無い → 作る`);
for (const [l, t] of Object.entries(locs)) console.log(`  ${l}: ${t.name} / ${t.shortDescription} / ${t.longDescription}`);
console.log(`  期間: 宣伝 ${SCHEDULE.publishStart} 〜 イベント ${SCHEDULE.eventStart} 〜 ${SCHEDULE.eventEnd}`);
if (!APPLY) { dryNote(); process.exit(0); }
checkLocks();

const territories = (await all("/v1/territories?limit=200")).map((t) => t.id);
const attrs = { ...EVENT, territorySchedules: [{ territories, ...SCHEDULE }] };
const ev = existing
  ? (await api(`/v1/appEvents/${existing.id}`, { method: "PATCH", body: { data: { type: "appEvents", id: existing.id, attributes: attrs } } })).data
  : (await api("/v1/appEvents", { method: "POST", body: { data: { type: "appEvents", attributes: attrs, relationships: { app: { data: { type: "apps", id: APP_ID } } } } } })).data;
console.log(`イベント ${ev.id}(${ev.attributes.eventState})`);

const have = await all(`/v1/appEvents/${ev.id}/localizations`);
for (const [l, t] of Object.entries(locs)) {
  const text = { name: t.name, shortDescription: t.shortDescription, longDescription: t.longDescription };
  let loc = have.find((x) => x.attributes.locale === l);
  loc = loc
    ? (await api(`/v1/appEventLocalizations/${loc.id}`, { method: "PATCH", body: { data: { type: "appEventLocalizations", id: loc.id, attributes: text } } })).data
    : (await api("/v1/appEventLocalizations", { method: "POST", body: { data: { type: "appEventLocalizations", attributes: { locale: l, ...text },
        relationships: { appEvent: { data: { type: "appEvents", id: ev.id } } } } } })).data;
  console.log(`  ${l}: 文面を入れた`);
  // 画像は入れ直す(同じ種類の古いものを消してから)
  const old = await all(`/v1/appEventLocalizations/${loc.id}/appEventScreenshots`);
  for (const [type, f] of ASSETS) {
    for (const o of old.filter((o) => o.attributes.appEventAssetType === type)) await api(`/v1/appEventScreenshots/${o.id}`, { method: "DELETE" });
    const file = path.join(DIR, f);
    const buf = readFileSync(file);
    const shot = (await api("/v1/appEventScreenshots", { method: "POST", body: { data: { type: "appEventScreenshots",
      attributes: { fileName: f, fileSize: statSync(file).size, appEventAssetType: type },
      relationships: { appEventLocalization: { data: { type: "appEventLocalizations", id: loc.id } } } } } })).data;
    for (const op of shot.attributes.uploadOperations) {
      const res = await fetch(op.url, { method: op.method, headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])),
        body: buf.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`${f} のアップロードに失敗(${res.status})`);
    }
    await api(`/v1/appEventScreenshots/${shot.id}`, { method: "PATCH", body: { data: { type: "appEventScreenshots", id: shot.id,
      attributes: { uploaded: true } } } });
    console.log(`  ${l}: ${type} に ${f} を上げた`);
  }
}

// Apple 側の画像処理を待つ
for (let i = 0; i < 30; i++) {
  const states = [];
  for (const loc of await all(`/v1/appEvents/${ev.id}/localizations`))
    for (const s of await all(`/v1/appEventLocalizations/${loc.id}/appEventScreenshots`)) states.push(s.attributes.assetDeliveryState?.state);
  if (states.includes("FAILED")) { console.error("処理に失敗した画像がある"); process.exit(1); }
  if (states.length && states.every((s) => s === "COMPLETE")) { console.log(`画像 ${states.length}枚とも処理済み`); break; }
  await sleep(5000);
}
console.log(`イベント ${ev.id} の下書きができた。審査には版と一緒に出す(metadata.mjs submit が appEvents も足す)`);
