import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";

// index.html の起動ローダーは、LIBS の src/domain 要素ごとに globals:[...] を持ち、
// 各ファイルを読み込んだ直後に `typeof globalThis[name] === 'undefined'` なら起動エラーにする。
// Service Worker が制御していないとき(localhost、初回訪問、SW解除直後)に古い domain ファイルが
// HTTPキャッシュから出ると、新しい #appsrc が参照する関数が無いまま起動してしまい、
// 画面は出るのに「そのボタンを押した時点で落ちる」という形で表面化する。
// globals はそれを起動エラー→再読み込みの経路に乗せるための一覧。
// 検出できるのは「公開名が増減した」ファイルだけ。i18n.js にキーを足しただけのような、公開名の
// 変わらない更新は古い版でも素通りする(CLAUDE.md の HTTP キャッシュの項の「キーが生のまま出た」
// 事例はこの検査では防げない)。
//
// ただしこの一覧は手で並べたものなので、ファイル側で公開名を足した/消したのに LIBS を直し忘れると
// 「検査していないので古い版でも素通りする」か「存在しない名前を要求して常に起動エラーになる」に崩れる。
// 後者は本番の全利用者が起動できなくなる。このテストはその両方向のずれを縛る。
//
// 対象外: ローダーが実際にブラウザで起動エラー画面を出すか、再読み込みが1回だけ走るかは見ない
// (npm test は index.html を実行しない。vitest.config.mjs を参照)。
// また、ファイル内で const/let で宣言しただけの名前は vm の global オブジェクトに載らないので、
// 5番目の「#appsrc が参照しているのに検査していない名前」の検出は function 宣言と var と
// globalThis.X = ... に限られる。

const repoRoot = process.cwd();
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf-8");

// LIBS 配列の要素を { url, globals } に分解する。globals を持たない要素は globals: null。
// tests/sw-assets.test.js の extractLibsUrls と同じく `var LIBS = [...]` を正規表現で切り出す。
function extractLibsEntries(src) {
  const m = src.match(/var LIBS = \[([\s\S]*?)\];/);
  if (!m) throw new Error("index.html から LIBS 配列を抽出できません");
  return [...m[1].matchAll(/\{\s*key:[\s\S]*?\}/g)].map((x) => {
    const el = x[0];
    const u = el.match(/urls:\s*\[\s*["']([^"']+)["']\s*\]/);
    const g = el.match(/globals:\s*\[([^\]]*)\]/);
    return {
      url: u ? u[1] : null,
      globals: g ? [...g[1].matchAll(/["']([^"']+)["']/g)].map((y) => y[1]) : null,
    };
  });
}

function extractAppSrc(src) {
  const m = src.match(/<script type="text\/plain" id="appsrc">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("index.html から #appsrc を抽出できません");
  return m[1];
}

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf-8");
}

// ファイルが行頭の `globalThis.X =` で公開している名前
function exportedNames(code) {
  return [...code.matchAll(/^globalThis\.(\w+)\s*=/gm)].map((x) => x[1]);
}

function duplicates(list) {
  return list.filter((x, i) => list.indexOf(x) !== i);
}

const domainEntries = extractLibsEntries(indexHtml).filter(
  (e) => e.url && e.url.startsWith("src/domain/"),
);
const appSrc = extractAppSrc(indexHtml);

// tests/helpers/loadDomain.js の loadDomainModules と同じ要領で、LIBS の順に1つのサンドボックスで
// 実行する(db/migration.js が backupValidation.js の extractWorkoutsArray を使う等、順序依存がある)。
// 各ファイルの実行直後に、ローダーと同じ判定で globals の欠落を記録し、
// 実行前後で増えたキー(そのファイルがグローバルに置いた名前)も記録しておく。
function runInLibsOrder(entries) {
  const sandbox = {};
  vm.createContext(sandbox);
  return entries.map((e) => {
    const before = new Set(Object.keys(sandbox));
    vm.runInContext(readRepoFile(e.url), sandbox, { filename: path.join(repoRoot, e.url) });
    const added = Object.keys(sandbox).filter((k) => !before.has(k));
    const undefinedAtLoad = (e.globals || []).filter((name) => typeof sandbox[name] === "undefined");
    return { url: e.url, globals: e.globals || [], added, undefinedAtLoad };
  });
}

describe("LIBS の src/domain 要素の抽出(ここが空振りすると以下の検査が全部素通りする)", () => {
  it("LIBS に src/domain のファイルが1件以上並んでいる", () => {
    expect(domainEntries.length).toBeGreaterThan(0);
  });

  it("globals を持たない src/domain 要素は無い", () => {
    const withoutGlobals = domainEntries.filter((e) => e.globals === null).map((e) => e.url);
    expect(withoutGlobals).toEqual([]);
  });

  it("LIBS に並ぶ src/domain のファイルはすべて実在する", () => {
    const missing = domainEntries
      .map((e) => e.url)
      .filter((u) => !fs.existsSync(path.join(repoRoot, u)));
    expect(missing).toEqual([]);
  });
});

describe("globals とファイルの公開名の一致(ずれると古い版が素通りするか、全員が起動できなくなる)", () => {
  for (const entry of domainEntries) {
    describe(entry.url, () => {
      it("globals に同じ名前が重複していない", () => {
        expect(duplicates(entry.globals || [])).toEqual([]);
      });

      it("ファイルが globalThis に公開している名前は、すべて globals に載っている", () => {
        const exported = exportedNames(readRepoFile(entry.url));
        const missing = exported.filter((n) => !(entry.globals || []).includes(n));
        expect(missing, `globals に足りない名前: ${missing.join(", ")}`).toEqual([]);
      });

      it("globals に載っている名前は、すべてファイルが globalThis に公開している", () => {
        const exported = exportedNames(readRepoFile(entry.url));
        const extra = (entry.globals || []).filter((n) => !exported.includes(n));
        expect(extra, `ファイルが公開していない名前: ${extra.join(", ")}`).toEqual([]);
      });
    });
  }
});

describe("LIBS の順に実行したときのローダー判定(ここで落ちる名前があると本番で常に起動エラーになる)", () => {
  const results = runInLibsOrder(domainEntries);

  for (const r of results) {
    it(`${r.url} を読み込んだ直後に、globals がすべて undefined でない`, () => {
      expect(r.undefinedAtLoad, `読み込み直後に undefined の名前: ${r.undefinedAtLoad.join(", ")}`).toEqual([]);
    });
  }

  it("#appsrc が参照している domain のグローバル名は、すべてどれかのファイルの globals で検査されている", () => {
    const unchecked = results.flatMap((r) =>
      r.added
        .filter((name) => !r.globals.includes(name))
        .filter((name) => new RegExp(`\\b${name}\\b`).test(appSrc))
        .map((name) => `${r.url}: ${name}`),
    );
    expect(unchecked, `#appsrc が参照しているが globals に無い名前: ${unchecked.join(", ")}`).toEqual([]);
  });
});
