// App Store Connect API の共通部分(scripts/asc/*.mjs)。使い方は docs/AppStoreConnect_API.md
//
// キーはリポジトリに置かない。~/.appstoreconnect/kurabell.json(keyId / issuerId / appId)と
// ~/.appstoreconnect/private_keys/AuthKey_<keyId>.p8 を読む(日次の指標取得・TestFlight へのアップロードと同じキー)。
//
// 書き込む操作は、どのスクリプトも --apply を付けたときだけ行う。付けなければ、何をするかを表示して終わる。
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { createSign, createPrivateKey } from "node:crypto";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ASC_DIR = `${homedir()}/.appstoreconnect`;
// 前回の状態(審査状況・見たレビュー)を覚えておく場所。~/.appstoreconnect はキーの置き場なので、そこには書かない
export const STATE_DIR = `${homedir()}/Library/Caches/kurabell-asc`;
mkdirSync(STATE_DIR, { recursive: true });
export const cfg = JSON.parse(readFileSync(`${ASC_DIR}/kurabell.json`, "utf8"));
export const APP_ID = cfg.appId;
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const key = createPrivateKey(readFileSync(`${ASC_DIR}/private_keys/AuthKey_${cfg.keyId}.p8`));

let cached = { token: null, exp: 0 };
function token() {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - now > 60) return cached.token;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = now + 1100; // 上限は20分
  const data = `${b64({ alg: "ES256", kid: cfg.keyId, typ: "JWT" })}.${b64({ iss: cfg.issuerId, iat: now, exp, aud: "appstoreconnect-v1" })}`;
  const sig = createSign("SHA256").update(data).sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  cached = { token: `${data}.${sig}`, exp };
  return cached.token;
}

// JSON を返す。204 は null。失敗は Apple の errors の detail を添えて投げる
export async function api(p, { method = "GET", body } = {}) {
  const url = p.startsWith("http") ? p : `https://api.appstoreconnect.apple.com${p}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = (json?.errors || []).map(e => `${e.code}: ${e.detail || e.title}`).join(" / ") || text.slice(0, 300);
    const err = new Error(`${method} ${p} → ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// links.next をたどって data を全部集める
export async function all(p) {
  const out = [];
  let next = p;
  while (next) {
    const j = await api(next);
    out.push(...(j.data || []));
    next = j.links?.next || null;
  }
  return out;
}

export const argv = process.argv.slice(2);
export const has = (flag) => argv.includes(flag);
export const opt = (name, def = null) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def; };
// 値を取るオプション(この直後の語は位置引数に数えない)
const VALUE_OPTS = ["--notes", "--dir", "--type", "--exclude", "--days", "--text", "--from"];
export const positional = () => argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && VALUE_OPTS.includes(argv[i - 1])));
export const APPLY = has("--apply");
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 複数セッションの連携(CLAUDE.md): App Store Connect に書き込む前に、他の作業の印が無いかを見る。
// 印があれば止める(--ignore-locks で無視。自分の印なら付けてよい)
export function checkLocks() {
  if (!APPLY || has("--ignore-locks")) return;
  const dir = path.join(REPO, ".claude/locks");
  const locks = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".md")) : [];
  if (locks.length) {
    console.error(`作業中の印があります: ${locks.join(", ")}(${dir})`);
    console.error("他のセッションの作業なら触らない。自分の印なら --ignore-locks を付けて実行する");
    process.exit(2);
  }
}

// 版(1.4 など)を引く。無ければ null
export async function findVersion(versionString) {
  const vs = await all(`/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${encodeURIComponent(versionString)}&limit=5`);
  return vs[0] || null;
}

// ビルド番号(17 など)からビルドを引く。版(1.4)を渡すと、その版のビルドに絞る
export async function findBuild(buildNumber, versionString = null) {
  const q = `/v1/builds?filter[app]=${APP_ID}&filter[version]=${encodeURIComponent(buildNumber)}` +
    (versionString ? `&filter[preReleaseVersion.version]=${encodeURIComponent(versionString)}` : "") + "&limit=5";
  const bs = await all(q);
  return bs[0] || null;
}

export function done(msg) { console.log(msg); }
export function dryNote() { if (!APPLY) console.log("\n(--apply を付けていないので、何も書き込んでいない)"); }
