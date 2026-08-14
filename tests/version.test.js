import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// sw.js の CACHE とヘッダーのバージョンバッジは手で同期している。
// 片方だけ上げ忘れると、Service Workerが古いindex.htmlを配り続けて
// 「直したはずの変更が返ってこない」という無症状の不具合になるため、機械的に縛る。
// (単一の定数にまとめられないのは、sw.jsがモジュールを持てない素のスクリプトで、
//  index.html側はBabel前のJSXテキストとして存在するため。)

const repoRoot = process.cwd();
const swJs = fs.readFileSync(path.join(repoRoot, "sw.js"), "utf-8");
const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf-8");

describe("バージョン文字列の同期", () => {
  it("sw.js から CACHE のバージョンを取り出せる", () => {
    expect(swJs).toMatch(/const CACHE = "overload-v\d+";/);
  });

  it("index.html からヘッダーのバージョンバッジを取り出せる", () => {
    expect(indexHtml).toMatch(/>v\d+<\/span>/);
  });

  it("CACHE とヘッダーバッジのバージョンが一致する", () => {
    const cache = swJs.match(/const CACHE = "overload-v(\d+)";/)[1];
    const badge = indexHtml.match(/>v(\d+)<\/span>/)[1];
    expect(
      badge,
      `sw.js の CACHE は v${cache} ですが、index.html のバッジは v${badge} です。両方を上げてください。`
    ).toBe(cache);
  });
});
