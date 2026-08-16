import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// sw.js の CACHE と index.html の APP_VERSION は手で同期している。
// 片方だけ上げ忘れると、Service Workerが古いindex.htmlを配り続けて
// 「直したはずの変更が返ってこない」という無症状の不具合になるため、機械的に縛る。
// (1個の定数にまとめられないのは、sw.jsがモジュールを持てない素のスクリプトで、
//  index.html側はBabel前のJSXテキストとして存在するため。ただしindex.html内部では
//  ヘッダーバッジとバックアップのappVersionが同じAPP_VERSION定数を参照するようにしてあるので、
//  「3箇所目」が増えることは防いである。)

const repoRoot = process.cwd();
const swJs = fs.readFileSync(path.join(repoRoot, "sw.js"), "utf-8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf-8");

describe("バージョン文字列の同期", () => {
  it("sw.js から CACHE のバージョンを取り出せる", () => {
    expect(swJs).toMatch(/const CACHE = "kurabell-v\d+";/);
  });

  it("index.html から APP_VERSION 定数を取り出せる", () => {
    expect(indexHtml).toMatch(/const APP_VERSION = "v\d+";/);
  });

  it("ヘッダーバッジはAPP_VERSION定数を参照している(数字がハードコードされ直していない)", () => {
    expect(indexHtml).toMatch(/>\{APP_VERSION\}<\/span>/);
  });

  it("CACHE とAPP_VERSIONの数字が一致する", () => {
    const cache = swJs.match(/const CACHE = "kurabell-v(\d+)";/)[1];
    const appVersion = indexHtml.match(/const APP_VERSION = "v(\d+)";/)[1];
    expect(
      appVersion,
      `sw.js の CACHE は v${cache} ですが、index.html の APP_VERSION は v${appVersion} です。両方を上げてください。`
    ).toBe(cache);
  });
});
