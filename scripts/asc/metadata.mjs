// 版ごとの掲載情報(説明文・キーワード・プロモーション用テキスト・What's New・審査メモ)を、
// リポジトリの appstore/<版>/ のファイルと App Store Connect の間でやり取りする。
//
//   node scripts/asc/metadata.mjs pull 1.3                  # App Store Connect → appstore/1.3/(今の掲載を写す)
//   node scripts/asc/metadata.mjs push 1.4                  # appstore/1.4/ との差分を見るだけ
//   node scripts/asc/metadata.mjs push 1.4 --apply          # 版が無ければ作り、差分を書き込み、読み戻して確かめる
//   node scripts/asc/metadata.mjs build 1.4 17 [--apply]    # 版にビルドを付ける
//   node scripts/asc/metadata.mjs check 1.4                 # 提出できる状態か(ビルド・文面・スクリーンショット)を確かめる
//   node scripts/asc/metadata.mjs submit 1.4 --apply --yes-submit   # 審査へ提出(北村さんの確認を取ってから)
//
// ファイルの置き方(appstore/<版>/):
//   ja/description.txt  ja/keywords.txt  ja/promotional_text.txt  ja/whats_new.txt
//   en-US/…(同じ4つ)    review_notes.txt(審査メモ。連絡先は App Store Connect 側のまま触らない)
// 無いファイルの項目は触らない。サブタイトル・アプリ名(appInfo 側)は扱わない(変えないと決めている)。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { api, all, APP_ID, REPO, APPLY, has, positional, checkLocks, findVersion, findBuild, dryNote } from "./client.mjs";

const FIELDS = { description: "description.txt", keywords: "keywords.txt", promotionalText: "promotional_text.txt", whatsNew: "whats_new.txt" };
const LIMITS = { description: 4000, keywords: 100, promotionalText: 170, whatsNew: 4000, notes: 4000 };
// App Store Connect が「無効な文字」で保存を拒んだ文字(1.3 の提出で踏んだ。APPSTORE.md)。見つけたら止める
const BAD_CHARS = { "⋯": "⋯ → … に", "✕": "✕ → × に", "♥": "♥ → 文字で書く(1.4 (19) のテスト内容で拒まれた)" };
const LOCALES = ["ja", "en-US"];

const [cmd, ver, buildNo] = positional();
if (!cmd || !ver) { console.error("使い方は、このファイルの先頭のコメントを見てください"); process.exit(1); }
const dir = path.join(REPO, "appstore", ver);
const read = (p) => existsSync(p) ? readFileSync(p, "utf8").replace(/\n+$/, "") : null;

function validate(name, text) {
  const errs = [];
  for (const [ch, fix] of Object.entries(BAD_CHARS)) if (text.includes(ch)) errs.push(`${name}: 保存できない文字(${fix})`);
  const len = [...text].length;
  const limit = LIMITS[name.split("/").pop()];
  if (limit && len > limit) errs.push(`${name}: 長すぎる(${len} / ${limit}字)`);
  // キーワードは App Store Connect の数え方が文字数より厳しいことがある(1.1 で日本語 86 字が入らず、77 字は入った)。止めずに知らせる
  if (name.endsWith("keywords") && /[^\x00-\x7F]/.test(text) && len > 80 && len <= limit) console.warn(`注意 ${name}: ${len}字。80字を超えると入らないことがある`);
  if (/[\u{1F000}-\u{1FFFF}]/u.test(text)) errs.push(`${name}: 絵文字が入っている(保存できないことがある)`);
  return errs;
}

async function localizations(versionId) {
  return all(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
}
async function reviewDetail(versionId) {
  try { return (await api(`/v1/appStoreVersions/${versionId}/appStoreReviewDetail`)).data; }
  catch (e) { if (e.status === 404) return null; throw e; }
}

if (cmd === "pull") {
  const v = await findVersion(ver);
  if (!v) { console.error(`版 ${ver} が App Store Connect に無い`); process.exit(1); }
  for (const l of await localizations(v.id)) {
    const ld = path.join(dir, l.attributes.locale);
    mkdirSync(ld, { recursive: true });
    for (const [f, file] of Object.entries(FIELDS)) if (l.attributes[f] != null) writeFileSync(path.join(ld, file), l.attributes[f] + "\n");
  }
  const rd = await reviewDetail(v.id);
  if (rd?.attributes.notes) writeFileSync(path.join(dir, "review_notes.txt"), rd.attributes.notes + "\n");
  console.log(`${ver}(${v.attributes.appVersionState})の掲載情報を ${path.relative(REPO, dir)}/ に書き出した`);
}

else if (cmd === "push") {
  if (!existsSync(dir)) { console.error(`${path.relative(REPO, dir)}/ が無い`); process.exit(1); }
  // 先に全部の文面を確かめる(途中まで書いてから止まらないように)
  const want = {};
  const errs = [];
  for (const loc of LOCALES) {
    for (const [f, file] of Object.entries(FIELDS)) {
      const t = read(path.join(dir, loc, file));
      if (t == null) continue;
      (want[loc] ||= {})[f] = t;
      errs.push(...validate(`${loc}/${f}`, t));
    }
  }
  const notes = read(path.join(dir, "review_notes.txt"));
  if (notes != null) errs.push(...validate("notes", notes));
  if (errs.length) { console.error("文面に問題がある:\n" + errs.map(e => `  - ${e}`).join("\n")); process.exit(1); }
  checkLocks();

  let v = await findVersion(ver);
  if (!v) {
    console.log(`版 ${ver} はまだ無い → ${APPLY ? "作る" : "(--apply で作る)"}`);
    if (!APPLY) { dryNote(); process.exit(0); }
    v = (await api("/v1/appStoreVersions", { method: "POST", body: { data: {
      type: "appStoreVersions", attributes: { platform: "IOS", versionString: ver },
      relationships: { app: { data: { type: "apps", id: APP_ID } } } } } })).data;
    console.log(`  作った(${v.attributes.appVersionState})。説明文などは前の版から引き継がれ、プロモーション用テキストは空になる`);
  } else {
    console.log(`版 ${ver}: ${v.attributes.appVersionState}`);
  }

  const have = Object.fromEntries((await localizations(v.id)).map(l => [l.attributes.locale, l]));
  for (const [loc, fields] of Object.entries(want)) {
    const cur = have[loc];
    const patch = {};
    for (const [f, t] of Object.entries(fields)) {
      const old = cur?.attributes[f] ?? "";
      if (old.replace(/\n+$/, "") !== t) patch[f] = t;
    }
    const names = Object.keys(patch);
    console.log(`  ${loc}: ${names.length ? `変える → ${names.map(n => `${n}(${[...(cur?.attributes[n] ?? "")].length}→${[...patch[n]].length}字)`).join(", ")}` : "変更なし"}`);
    if (!APPLY || !names.length) continue;
    if (cur) await api(`/v1/appStoreVersionLocalizations/${cur.id}`, { method: "PATCH", body: { data: { type: "appStoreVersionLocalizations", id: cur.id, attributes: patch } } });
    else await api("/v1/appStoreVersionLocalizations", { method: "POST", body: { data: { type: "appStoreVersionLocalizations",
      attributes: { locale: loc, ...patch }, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: v.id } } } } } });
  }

  if (notes != null) {
    const rd = await reviewDetail(v.id);
    const same = (rd?.attributes.notes ?? "").replace(/\n+$/, "") === notes;
    console.log(`  審査メモ: ${same ? "変更なし" : `変える(${[...(rd?.attributes.notes ?? "")].length}→${[...notes].length}字)`}`);
    if (APPLY && !same) {
      if (rd) await api(`/v1/appStoreReviewDetails/${rd.id}`, { method: "PATCH", body: { data: { type: "appStoreReviewDetails", id: rd.id, attributes: { notes } } } });
      else await api("/v1/appStoreReviewDetails", { method: "POST", body: { data: { type: "appStoreReviewDetails", attributes: { notes },
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: v.id } } } } } });
    }
  }

  if (APPLY) {
    // 読み戻して、ファイルと一致するかを確かめる(画面の入力で「保存したはずが残っていない」を何度か踏んだ)
    const after = Object.fromEntries((await localizations(v.id)).map(l => [l.attributes.locale, l.attributes]));
    const bad = [];
    for (const [loc, fields] of Object.entries(want))
      for (const [f, t] of Object.entries(fields)) if ((after[loc]?.[f] ?? "").replace(/\n+$/, "") !== t) bad.push(`${loc}/${f}`);
    if (notes != null && ((await reviewDetail(v.id))?.attributes.notes ?? "").replace(/\n+$/, "") !== notes) bad.push("審査メモ");
    console.log(bad.length ? `\n読み戻すと一致しない: ${bad.join(", ")}` : "\n読み戻して、全部ファイルと一致した");
    if (bad.length) process.exit(1);
  }
  dryNote();
}

else if (cmd === "build") {
  if (!buildNo) { console.error("ビルド番号が要る(例: build 1.4 17)"); process.exit(1); }
  const v = await findVersion(ver);
  const b = await findBuild(buildNo, ver);
  if (!v || !b) { console.error(`${!v ? `版 ${ver}` : `ビルド ${ver} (${buildNo})`} が見つからない`); process.exit(1); }
  if (b.attributes.processingState !== "VALID") { console.error(`ビルドがまだ使えない(${b.attributes.processingState})`); process.exit(1); }
  console.log(`版 ${ver} にビルド ${buildNo} を付ける${APPLY ? "" : "(--apply で実行)"}`);
  checkLocks();
  if (APPLY) await api(`/v1/appStoreVersions/${v.id}/relationships/build`, { method: "PATCH", body: { data: { type: "builds", id: b.id } } });
  dryNote();
}

else if (cmd === "check" || cmd === "submit") {
  const v = await findVersion(ver);
  if (!v) { console.error(`版 ${ver} が無い`); process.exit(1); }
  const problems = [];
  const build = await api(`/v1/appStoreVersions/${v.id}/build?fields[builds]=version,processingState`).catch(() => null);
  if (!build?.data) problems.push("ビルドが付いていない");
  const locs = await localizations(v.id);
  for (const loc of LOCALES) {
    const l = locs.find(x => x.attributes.locale === loc);
    if (!l) { problems.push(`${loc} の掲載情報が無い`); continue; }
    for (const f of ["description", "keywords", "whatsNew"]) if (!l.attributes[f]) problems.push(`${loc}/${f} が空`);
    for (const f of Object.keys(FIELDS)) if (l.attributes[f]) problems.push(...validate(`${loc}/${f}`, l.attributes[f]));
    const sets = await all(`/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets?include=appScreenshots`);
    if (!sets.some(s => s.attributes.screenshotDisplayType === "APP_IPHONE_67" && s.relationships.appScreenshots.data.length > 0)) problems.push(`${loc} の iPhone 6.9インチのスクリーンショットが無い`);
  }
  console.log(`版 ${ver}: ${v.attributes.appVersionState} / ビルド ${build?.data?.attributes.version ?? "なし"} / リリース ${v.attributes.releaseType}`);
  console.log(problems.length ? "提出の前に直すこと:\n" + problems.map(p => `  - ${p}`).join("\n") : "提出できる状態");
  if (cmd === "submit") {
    if (problems.length) process.exit(1);
    if (!APPLY || !has("--yes-submit")) { console.log("\n審査へ出すには --apply --yes-submit の両方を付ける(北村さんの確認を取ってから)"); process.exit(0); }
    checkLocks();
    const sub = (await api("/v1/reviewSubmissions", { method: "POST", body: { data: { type: "reviewSubmissions", attributes: { platform: "IOS" },
      relationships: { app: { data: { type: "apps", id: APP_ID } } } } } })).data;
    await api("/v1/reviewSubmissionItems", { method: "POST", body: { data: { type: "reviewSubmissionItems",
      relationships: { reviewSubmission: { data: { type: "reviewSubmissions", id: sub.id } }, appStoreVersion: { data: { type: "appStoreVersions", id: v.id } } } } } });
    const done = (await api(`/v1/reviewSubmissions/${sub.id}`, { method: "PATCH", body: { data: { type: "reviewSubmissions", id: sub.id, attributes: { submitted: true } } } })).data;
    console.log(`審査へ提出した(${done.attributes.state}、${done.attributes.submittedDate ?? ""})`);
  }
}

else { console.error(`知らないコマンド: ${cmd}`); process.exit(1); }
