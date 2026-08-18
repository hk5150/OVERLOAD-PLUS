import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// www/(Capacitor向けの生成物)を一時ディレクトリへ実際にビルドして検証する。
//
// なぜ生成物まで見るのか: sw-assets.test.js はリポジトリ直下の index.html / sw.js しか
// 検証しないため、「ルートでは整合しているが www/ では壊れている」という状態を素通りさせる。
// 実際に、sw.js の APP_ASSETS が www/ に同梱しない babel.min.js を要求していたせいで
// cache.addAll() が必ず reject し、iOS版のService Workerが永久にactivateしない
// (しかも登録失敗を握り潰しているので画面上は無症状)という不具合をこれで見逃していた。

const require = createRequire(import.meta.url);
const { build } = require("../scripts/sync-www.js");

let dest;

beforeAll(() => {
  dest = fs.mkdtempSync(path.join(os.tmpdir(), "kurabell-www-"));
  build(dest);
});

afterAll(() => {
  fs.rmSync(dest, { recursive: true, force: true });
});

const read = (rel) => fs.readFileSync(path.join(dest, rel), "utf-8");

describe("www/ ビルド生成物", () => {
  it("index.html と app.bundle.js が生成される", () => {
    expect(fs.existsSync(path.join(dest, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "app.bundle.js"))).toBe(true);
  });

  it("<script src>で参照するファイルがすべて実在する", () => {
    const html = read("index.html");
    const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    const missing = srcs.filter((s) => !fs.existsSync(path.join(dest, s)));
    expect(missing).toEqual([]);
  });

  // 逆方向の検証。「参照しているファイルが実在するか」だけを見ていたため、
  // www/ に置いただけで <script src> に足し忘れたファイルを素通りさせていた。
  // 実際に i18n.js と units.js がこれで抜け、iOS版が t() 未定義で起動しない状態になっていた
  // (ルート配信のWeb版は LIBS 経由で読むので無症状だった)。
  it("www/ にコピーしたドメインファイルがすべて<script src>で読み込まれる", () => {
    const html = read("index.html");
    const srcs = new Set([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]));
    const copied = [];
    for (const f of fs.readdirSync(path.join(dest, "src", "domain"))) {
      if (f.endsWith(".js")) copied.push(`src/domain/${f}`);
    }
    for (const f of fs.readdirSync(path.join(dest, "src", "domain", "db"))) {
      if (f.endsWith(".js")) copied.push(`src/domain/db/${f}`);
    }
    const unreferenced = copied.filter((f) => !srcs.has(f));
    expect(
      unreferenced,
      `www/ に置かれているのに読み込まれていません: ${unreferenced.join(", ")}`
    ).toEqual([]);
  });

  it("読み込み順がindex.htmlのLIBSと同じ(ドメインファイル間の依存が崩れないように)", () => {
    const rootHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
    const libsOrder = [...rootHtml.matchAll(/urls:\['(src\/domain\/[^']+)'\]/g)].map((m) => m[1]);
    const wwwOrder = [...read("index.html").matchAll(/<script src="(src\/domain\/[^"]+)"/g)].map((m) => m[1]);
    expect(wwwOrder).toEqual(libsOrder);
  });

  it("Service Workerを同梱も登録もしない(Capacitorはバンドル内から配信するため不要)", () => {
    expect(fs.existsSync(path.join(dest, "sw.js"))).toBe(false);
    expect(read("index.html")).not.toContain("serviceWorker");
  });

  it("ランタイムBabelを積まない(JSXは事前トランスパイル済み)", () => {
    expect(fs.existsSync(path.join(dest, "vendor", "babel.min.js"))).toBe(false);
    const html = read("index.html");
    expect(html).not.toContain("babel.min.js");
    expect(html).not.toContain('id="appsrc"');
  });

  it("app.bundle.js にJSXが残っていない(esbuildの変換が実際に効いている)", () => {
    const bundle = read("app.bundle.js");
    expect(bundle).toContain("React.createElement");
    expect(bundle).not.toMatch(/<div style=\{\{/);
  });

  it("外部ホストへの参照が残っていない(オフラインで起動するため)", () => {
    const html = read("index.html");
    const externals = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(externals).toEqual([]);
  });

  // 上の検査は src= / href= 属性しか見ておらず、fetch や CSS の url() は素通りしていた。
  // 電波の無いジムで動くことに加えて、App Storeの「Data Not Collected」申告の根拠でもあるので、
  // 目視ではなく機械的に縛る。現状これらは1件も無いので、今のうちに空で固定しておく。
  // 唯一の意図的な外部遷移は種目名でのYouTube検索(window.open)で、これは検索語を渡すだけで
  // アプリからの通信ではないため対象外。
  it("実行時に外部へ通信するコードが無い(App Storeのプライバシー申告の根拠)", () => {
    const bundle = read("app.bundle.js");
    const html = read("index.html");
    const patterns = [
      [/\bfetch\s*\(\s*["'`]https?:/g, "fetch()での外部URL"],
      [/new\s+XMLHttpRequest\b/g, "XMLHttpRequest"],
      [/new\s+WebSocket\b/g, "WebSocket"],
      [/new\s+EventSource\b/g, "EventSource"],
      [/\bimport\s*\(\s*["'`]https?:/g, "動的import()での外部URL"],
      [/url\(\s*["']?https?:/g, "CSSのurl()での外部URL"],
      [/@import\s+["']?https?:/g, "CSSの@importでの外部URL"],
    ];
    const hits = [];
    for (const source of [html, bundle]) {
      for (const [re, label] of patterns) {
        if (source.match(re)) hits.push(label);
      }
    }
    expect([...new Set(hits)], `外部通信の経路が増えている: ${hits.join(", ")}`).toEqual([]);
  });
});
