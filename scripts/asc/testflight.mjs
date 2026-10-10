// アップロードしたビルドの、TestFlight 側の後処理。
//   node scripts/asc/testflight.mjs 17               # 状態と「テスト内容」を見る
//   node scripts/asc/testflight.mjs 17 --wait        # 処理が終わる(VALID になる)まで待つ(最大30分)
//   node scripts/asc/testflight.mjs 17 --wait --apply  # 待ってから「テスト内容」を入れる
// 「テスト内容」は appstore/<版>/testflight_ja.txt と testflight_en-US.txt から読む(無ければ入れない)。
// 内部テストのグループ(「内部テスト」)は全ビルドを自動で受け取る設定なので、グループへの追加はしない。
// 輸出コンプライアンスは Info.plist の ITSAppUsesNonExemptEncryption=false で答えてある。
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { api, all, APP_ID, REPO, APPLY, has, positional, findBuild, sleep, dryNote } from "./client.mjs";

const [buildNo] = positional();
if (!buildNo) { console.error("ビルド番号が要る(例: 17)"); process.exit(1); }

let b = await findBuild(buildNo);
const deadline = Date.now() + 30 * 60000;
// アップロード直後は、ビルドが API に出てくるまで数分かかる
while (has("--wait") && (!b || b.attributes.processingState === "PROCESSING") && Date.now() < deadline) {
  console.log(`  ${new Date().toLocaleTimeString("ja-JP")} ${b ? "処理中" : "まだ見えない"}…`);
  await sleep(30000);
  b = await findBuild(buildNo);
}
if (!b) { console.error(`ビルド ${buildNo} が見つからない`); process.exit(1); }
const ver = (await api(`/v1/builds/${b.id}/preReleaseVersion?fields[preReleaseVersions]=version`)).data.attributes.version;
console.log(`ビルド ${ver} (${buildNo}): ${b.attributes.processingState}${b.attributes.expired ? "(期限切れ)" : ""}`);
if (b.attributes.processingState !== "VALID") { if (has("--wait")) process.exit(1); else process.exit(0); }

const groups = await all(`/v1/builds/${b.id}/betaGroups?fields[betaGroups]=name,isInternalGroup`).catch(() => []);
const internal = await all(`/v1/apps/${APP_ID}/betaGroups?fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds`);
console.log(`テスター: ${[...groups.map(g => g.attributes.name), ...internal.filter(g => g.attributes.hasAccessToAllBuilds).map(g => `${g.attributes.name}(全ビルド)`)].join(", ") || "なし"}`);

const locs = await all(`/v1/builds/${b.id}/betaBuildLocalizations`);
for (const loc of ["ja", "en-US"]) {
  const cur = locs.find(l => l.attributes.locale === loc);
  const file = path.join(REPO, "appstore", ver, `testflight_${loc}.txt`);
  const want = existsSync(file) ? readFileSync(file, "utf8").replace(/\n+$/, "") : null;
  const now = cur?.attributes.whatsNew ?? "";
  if (want == null) { console.log(`  テスト内容 ${loc}: ${now ? `「${now.slice(0, 40)}…」` : "(空)"}(${path.relative(REPO, file)} が無いので触らない)`); continue; }
  if (now.replace(/\n+$/, "") === want) { console.log(`  テスト内容 ${loc}: 変更なし`); continue; }
  // App Store Connect が「無効な文字」で拒んだ文字(1.4 (19) の「♥」、1.3 の「⋯」「✕」)。先に止める
  const bad = ["♥", "⋯", "✕"].filter(c => want.includes(c));
  if (bad.length) { console.error(`  テスト内容 ${loc}: 使えない文字 ${bad.join(" ")} がある(${path.relative(REPO, file)})`); process.exitCode = 1; continue; }
  console.log(`  テスト内容 ${loc}: 入れる(${[...want].length}字)`);
  if (!APPLY) continue;
  if (cur) await api(`/v1/betaBuildLocalizations/${cur.id}`, { method: "PATCH", body: { data: { type: "betaBuildLocalizations", id: cur.id, attributes: { whatsNew: want } } } });
  else await api("/v1/betaBuildLocalizations", { method: "POST", body: { data: { type: "betaBuildLocalizations", attributes: { locale: loc, whatsNew: want },
    relationships: { build: { data: { type: "builds", id: b.id } } } } } });
}
dryNote();
