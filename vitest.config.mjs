import { defineConfig } from "vitest/config";

// index.html本体はビルド不要のまま(vendor同梱・ランタイムBabel)を維持する設計原則のため、
// テスト対象はsrc/domain/以下に抽出した純粋関数のみ。index.html自体はここでは読み込まない。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
