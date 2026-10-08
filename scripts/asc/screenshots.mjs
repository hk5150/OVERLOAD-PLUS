// 版のスクリーンショットを、フォルダの画像で丸ごと入れ替える。
//   node scripts/asc/screenshots.mjs 1.4 --dir ~/Desktop/KURABELL-appstore-screenshots/v5 --exclude 08
//   (同じものに --apply を付けると実行)
//   node scripts/asc/screenshots.mjs 1.4                 # 今入っているものを見るだけ
//
// --dir の下に ja/ と en/(または en-US/)を置く。ファイル名の順(01-…, 02-…)に並べる。
// --exclude 08 のように、ファイル名の先頭が一致するものを外せる(料金の画面は載せない、と決めている)。
// --type は既定で APP_IPHONE_67(6.9インチ、1320×2868 / 1290×2796)。Watch は APP_WATCH_SERIES_10。
// 入れ替えは「その種類の画像を全部消してから、新しいものを入れる」。途中で失敗したら、画面か再実行で直す。
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { homedir } from "node:os";
import { api, all, APPLY, opt, positional, checkLocks, findVersion, sleep, dryNote } from "./client.mjs";

const [ver] = positional();
if (!ver) { console.error("版が要る(例: 1.4)"); process.exit(1); }
const TYPE = opt("--type", "APP_IPHONE_67");
const SIZES = { APP_IPHONE_67: [[1320, 2868], [1290, 2796]], APP_WATCH_SERIES_10: [[416, 496], [422, 514]] };
const dirArg = opt("--dir");
const exclude = (opt("--exclude") || "").split(",").filter(Boolean);
const LOCALE_DIRS = { ja: ["ja"], "en-US": ["en-US", "en"] };

const v = await findVersion(ver);
if (!v) { console.error(`版 ${ver} が無い(先に metadata.mjs push ${ver} --apply で作る)`); process.exit(1); }
const locs = await all(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);

async function currentSet(loc) {
  const sets = await all(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
  return sets.find(s => s.attributes.screenshotDisplayType === TYPE) || null;
}
async function shotsOf(set) {
  return set ? all(`/v1/appScreenshotSets/${set.id}/appScreenshots?fields[appScreenshots]=fileName,assetDeliveryState`) : [];
}

// 今の状態
for (const loc of locs) {
  const shots = await shotsOf(await currentSet(loc));
  console.log(`${loc.attributes.locale} ${TYPE}: ${shots.length}枚 ${shots.map(s => s.attributes.fileName).join(", ")}`);
}
if (!dirArg) process.exit(0);

const base = dirArg.replace(/^~/, homedir());
const plan = {};
for (const loc of locs) {
  const sub = (LOCALE_DIRS[loc.attributes.locale] || [loc.attributes.locale]).map(d => path.join(base, d)).find(existsSync);
  if (!sub) { console.log(`${loc.attributes.locale}: ${base} の下にフォルダが無いので触らない`); continue; }
  const files = readdirSync(sub).filter(f => /\.(png|jpe?g)$/i.test(f) && !exclude.some(x => f.startsWith(x))).sort();
  for (const f of files) {
    // 大きさが合わない画像は Apple 側で弾かれる。先に止める
    const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path.join(sub, f)], { encoding: "utf8" });
    const w = +out.match(/pixelWidth: (\d+)/)[1], h = +out.match(/pixelHeight: (\d+)/)[1];
    if (SIZES[TYPE] && !SIZES[TYPE].some(([a, b]) => a === w && b === h)) { console.error(`${f}: ${w}×${h} は ${TYPE} に入らない`); process.exit(1); }
  }
  if (files.length > 10) { console.error(`${loc.attributes.locale}: ${files.length}枚。上限は10枚`); process.exit(1); }
  plan[loc.attributes.locale] = { loc, sub, files };
  console.log(`→ ${loc.attributes.locale}: ${files.length}枚に入れ替える ${files.join(", ")}`);
}
if (!APPLY) { dryNote(); process.exit(0); }
checkLocks();

for (const { loc, sub, files } of Object.values(plan)) {
  let set = await currentSet(loc);
  if (!set) set = (await api("/v1/appScreenshotSets", { method: "POST", body: { data: { type: "appScreenshotSets",
    attributes: { screenshotDisplayType: TYPE }, relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } } } } } })).data;
  for (const s of await shotsOf(set)) await api(`/v1/appScreenshots/${s.id}`, { method: "DELETE" });

  const ids = [];
  for (const f of files) {
    const buf = readFileSync(path.join(sub, f));
    // 1. 枠を予約する → 2. 指示された URL に分けて PUT → 3. チェックサムを付けて「上げ終わった」と知らせる
    const shot = (await api("/v1/appScreenshots", { method: "POST", body: { data: { type: "appScreenshots",
      attributes: { fileName: f, fileSize: statSync(path.join(sub, f)).size },
      relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } } } } } })).data;
    for (const op of shot.attributes.uploadOperations) {
      const res = await fetch(op.url, { method: op.method, headers: Object.fromEntries(op.requestHeaders.map(hd => [hd.name, hd.value])),
        body: buf.subarray(op.offset, op.offset + op.length) });
      if (!res.ok) throw new Error(`${f} のアップロードに失敗(${res.status})`);
    }
    await api(`/v1/appScreenshots/${shot.id}`, { method: "PATCH", body: { data: { type: "appScreenshots", id: shot.id,
      attributes: { uploaded: true, sourceFileChecksum: createHash("md5").update(buf).digest("hex") } } } });
    ids.push(shot.id);
    console.log(`  ${loc.attributes.locale}: ${f} を上げた`);
  }
  // 並びをファイル名の順に揃える
  await api(`/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { method: "PATCH", body: { data: ids.map(id => ({ type: "appScreenshots", id })) } });

  // Apple 側の処理(assetDeliveryState が COMPLETE)を待つ
  for (let i = 0; i < 40; i++) {
    const shots = await shotsOf(set);
    const states = shots.map(s => s.attributes.assetDeliveryState?.state);
    if (states.some(s => s === "FAILED")) { console.error(`  ${loc.attributes.locale}: 処理に失敗した画像がある`, shots.filter(s => s.attributes.assetDeliveryState?.state === "FAILED").map(s => s.attributes.fileName)); process.exit(1); }
    if (shots.length === files.length && states.every(s => s === "COMPLETE")) { console.log(`  ${loc.attributes.locale}: ${files.length}枚とも処理済み`); break; }
    await sleep(5000);
  }
}
