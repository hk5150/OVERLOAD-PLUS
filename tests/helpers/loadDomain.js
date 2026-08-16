import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// src/domain/*.js はindex.htmlから<script src>で素のグローバルスクリプトとして
// 読み込まれる(importやmodule.exportsを使わない、ビルド不要の原則を維持するため)。
// テストでも本番と同じファイルをそのまま実行し、生成されたグローバルを読み取る。
// initialGlobals を渡すと、スクリプト実行前にサンドボックスへ流し込む。
// storage.js のように window / localStorage を参照するモジュールに、
// 偽の実行環境(ネイティブ判定やストレージの失敗)を与えてテストするために使う。
export function loadDomainModule(relPathFromRepoRoot, initialGlobals = {}) {
  const absPath = path.resolve(process.cwd(), relPathFromRepoRoot);
  const code = fs.readFileSync(absPath, "utf-8");
  const sandbox = { ...initialGlobals };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: absPath });
  return sandbox;
}

// db/migration.js や db/workoutStore.js のように、他のドメインファイルが定義したグローバル
// (extractWorkoutsArray, SCHEMA_STATEMENTS など)に依存するファイルをまとめて読み込むための版。
// index.html の<script src>の読み込み順と同じ順に相対パスを並べて渡すこと。
export function loadDomainModules(relPathsFromRepoRoot, initialGlobals = {}) {
  const sandbox = { ...initialGlobals };
  vm.createContext(sandbox);
  for (const relPath of relPathsFromRepoRoot) {
    const absPath = path.resolve(process.cwd(), relPath);
    const code = fs.readFileSync(absPath, "utf-8");
    vm.runInContext(code, sandbox, { filename: absPath });
  }
  return sandbox;
}
