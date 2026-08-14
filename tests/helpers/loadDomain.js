import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// src/domain/*.js はindex.htmlから<script src>で素のグローバルスクリプトとして
// 読み込まれる(importやmodule.exportsを使わない、ビルド不要の原則を維持するため)。
// テストでも本番と同じファイルをそのまま実行し、生成されたグローバルを読み取る。
export function loadDomainModule(relPathFromRepoRoot) {
  const absPath = path.resolve(process.cwd(), relPathFromRepoRoot);
  const code = fs.readFileSync(absPath, "utf-8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: absPath });
  return sandbox;
}
