// 審査・配信・ビルドの状態を読む(読むだけ)。日次ルーティンからも呼ぶ。
//   node scripts/asc/status.mjs          # 表で出す。前回から変わったことを先頭に
//   node scripts/asc/status.mjs --json   # ルーティン用
// 前回の状態は ~/Library/Caches/kurabell-asc/status.json に残し、変化(審査待ち → 審査中 → 承認/差し戻し など)を拾う。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { api, all, APP_ID, STATE_DIR, has } from "./client.mjs";

const STATE_FILE = `${STATE_DIR}/status.json`;
// Apple の日時は米国時間や UTC で来るので、日本時間に直して出す
const jst = (iso) => iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 16) : "-";

// appVersionState の読み方(Apple の値 → 日本語)
const VERSION_STATE = {
  PREPARE_FOR_SUBMISSION: "提出準備中", READY_FOR_REVIEW: "提出準備完了", WAITING_FOR_REVIEW: "審査待ち", IN_REVIEW: "審査中",
  PENDING_DEVELOPER_RELEASE: "承認済み(手動リリース待ち)", PROCESSING_FOR_DISTRIBUTION: "配信の準備中",
  READY_FOR_DISTRIBUTION: "配信中", REJECTED: "差し戻し", METADATA_REJECTED: "掲載情報の差し戻し",
  DEVELOPER_REJECTED: "取り下げ", REPLACED_WITH_NEW_VERSION: "新しい版に置き換え", INVALID_BINARY: "無効なビルド",
};
const SUBMISSION_STATE = {
  READY_FOR_REVIEW: "提出前", WAITING_FOR_REVIEW: "審査待ち", IN_REVIEW: "審査中", UNRESOLVED_ISSUES: "要対応(差し戻し)",
  CANCELING: "取り消し中", COMPLETING: "完了処理中", COMPLETE: "完了",
};

const versions = (await api(`/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=3&include=build&fields[builds]=version`));
const buildOf = Object.fromEntries((versions.included || []).map(b => [b.id, b.attributes.version]));
const vRows = versions.data.map(v => ({
  version: v.attributes.versionString,
  state: v.attributes.appVersionState,
  label: VERSION_STATE[v.attributes.appVersionState] || v.attributes.appVersionState,
  build: buildOf[v.relationships?.build?.data?.id] || null,
  releaseType: v.attributes.releaseType,
}));
const subs = (await api(`/v1/reviewSubmissions?filter[app]=${APP_ID}&limit=3`)).data.map(s => ({
  id: s.id, state: s.attributes.state, label: SUBMISSION_STATE[s.attributes.state] || s.attributes.state, submittedDate: s.attributes.submittedDate,
}));
const builds = (await all(`/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=5&include=preReleaseVersion&fields[builds]=version,processingState,uploadedDate,expired,preReleaseVersion&fields[preReleaseVersions]=version`)).slice(0, 5);
const pre = {};
// include は all() で落ちるので、版は別に引く(5件だけ)
for (const b of builds) {
  const id = b.relationships?.preReleaseVersion?.data?.id;
  if (id && !pre[id]) pre[id] = (await api(`/v1/preReleaseVersions/${id}?fields[preReleaseVersions]=version`)).data.attributes.version;
}
const bRows = builds.map(b => ({
  build: `${pre[b.relationships?.preReleaseVersion?.data?.id] || "?"} (${b.attributes.version})`,
  processingState: b.attributes.processingState, uploadedDate: b.attributes.uploadedDate, expired: b.attributes.expired,
}));

const now = { checkedAt: new Date().toISOString(), versions: vRows, submissions: subs, builds: bRows };
const prev = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
const changes = [];
if (prev) {
  for (const v of vRows) {
    const p = prev.versions.find(x => x.version === v.version);
    if (!p) changes.push(`${v.version} が新しく作られた(${v.label})`);
    else if (p.state !== v.state) changes.push(`${v.version}: ${VERSION_STATE[p.state] || p.state} → ${v.label}`);
  }
  for (const b of bRows) {
    const p = prev.builds.find(x => x.build === b.build);
    if (!p) changes.push(`ビルド ${b.build} が届いた(${b.processingState})`);
    else if (p.processingState !== b.processingState) changes.push(`ビルド ${b.build}: ${p.processingState} → ${b.processingState}`);
  }
  for (const s of subs) {
    const p = prev.submissions.find(x => x.id === s.id);
    if (p && p.state !== s.state) changes.push(`審査の提出(${jst(s.submittedDate).slice(0, 10)}): ${SUBMISSION_STATE[p.state] || p.state} → ${s.label}`);
  }
}
writeFileSync(STATE_FILE, JSON.stringify(now, null, 2));

if (has("--json")) {
  console.log(JSON.stringify({ ...now, changesSinceLastCheck: prev ? changes : null, lastCheckedAt: prev?.checkedAt ?? null }, null, 2));
} else {
  console.log(prev ? `■ 前回(${jst(prev.checkedAt)})から変わったこと` : "■ 初回(比べる前回が無い)");
  console.log(changes.length ? changes.map(c => `  - ${c}`).join("\n") : "  (なし)");
  console.log("\n■ 版");
  vRows.forEach(v => console.log(`  ${v.version.padEnd(6)} ${v.label}${v.build ? `  ビルド ${v.build}` : ""}`));
  console.log("\n■ 審査の提出(新しい順、日本時間)");
  subs.forEach(s => console.log(`  ${jst(s.submittedDate)}  ${s.label}`));
  console.log("\n■ ビルド(新しい順、アップロード日時は日本時間)");
  bRows.forEach(b => console.log(`  ${b.build.padEnd(10)} ${b.processingState}${b.expired ? "(期限切れ)" : ""}  ${jst(b.uploadedDate)}`));
}
