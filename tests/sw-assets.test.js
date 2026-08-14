import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// P0-3: index.html が<script src>で読み込むローカルファイルが、
// sw.jsのAPP_ASSETSから漏れていないかを静的に検証する(回帰防止)。
// 「本番ファイルを追加したのにキャッシュ対象への追加を忘れる」という
// 今回の不具合(P0-1: src/domain/*.js の欠落)と同種の再発を防ぐのが目的。

const repoRoot = process.cwd();
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf-8");
const swJs = fs.readFileSync(path.join(repoRoot, "sw.js"), "utf-8");

function extractAppAssets(src) {
  const m = src.match(/const APP_ASSETS = \[([\s\S]*?)\];/);
  if (!m) throw new Error("sw.js から APP_ASSETS 配列を抽出できません");
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

// 起動時ロード対象のLIBS配列(vendor/*.js と src/domain/*.js)を抽出する。
// LIBSはurls:['...']の形で複数配信元を持てる構造だが、現状は各1件。
function extractLibsUrls(src) {
  const m = src.match(/var LIBS = \[([\s\S]*?)\];/);
  if (!m) throw new Error("index.html から LIBS 配列を抽出できません");
  return [...m[1].matchAll(/urls:\s*\[\s*["']([^"']+)["']\s*\]/g)].map((x) => x[1]);
}

describe("sw.js APP_ASSETS のキャッシュ対象整合性(P0-3)", () => {
  const appAssets = extractAppAssets(swJs);
  const libsUrls = extractLibsUrls(indexHtml);

  it("APP_ASSETSにindex.htmlが含まれる", () => {
    expect(appAssets).toContain("./index.html");
  });

  it("APP_ASSETSにmanifest.jsonが含まれる", () => {
    expect(appAssets).toContain("./manifest.json");
  });

  it("index.htmlが起動時に読み込むローカルファイルを1件以上検出できる(テスト自体の前提確認)", () => {
    expect(libsUrls.length).toBeGreaterThan(0);
  });

  it("index.htmlが起動時に読み込むローカルファイルはすべてAPP_ASSETSに含まれる", () => {
    const missing = libsUrls
      .map((u) => `./${u}`)
      .filter((u) => !appAssets.includes(u));
    expect(missing).toEqual([]);
  });

  it("APP_ASSETSにsrc/domain/oneRm.jsが含まれる", () => {
    expect(appAssets).toContain("./src/domain/oneRm.js");
  });

  it("APP_ASSETSに列挙したファイルがすべて実在する", () => {
    const missingFiles = appAssets
      .filter((u) => u !== "./") // ルートはindex.html相当なのでファイルとしては存在しなくてよい
      .filter((u) => !fs.existsSync(path.join(repoRoot, u)));
    expect(missingFiles).toEqual([]);
  });
});
