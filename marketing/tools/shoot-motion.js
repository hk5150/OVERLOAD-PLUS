#!/usr/bin/env node
// 動きのある場面を 30fps で1コマずつ撮る(TikTok 13、2026-10-18)。
// reel.html に window.renderAt(場面, 秒, 場面の長さ) があり、時刻を渡すとその瞬間の絵になる前提(motion-prompt の見本と同じ考え方)。
// 場面の長さは build-reel-cta.sh と同じ決め方: 場面1〜(N-1) は「audio/sK.mp3 の長さ + 0.45秒」、
// 最後の場面は audio/sN.mp3 があれば max(3秒, 声 + 0.5秒)、無ければ3秒。決めた長さは <フォルダ>/durations.txt に書く。
// 出力: <フォルダ>/motion/sK/00001.png …(組み立ては build-reel-motion.sh)
// 確認用の静止画だけ撮るとき: --at 1:0,1:0.3,2:0.6 … → <フォルダ>/check/at-<場面>-<秒>.png(フルの動画の時刻で撮るなら --at-video 2.0)
// Chrome のヘッドレスを1コマずつ起動すると遅いので、Playwright を Node から直接動かし、executablePath に Google Chrome を渡す。
// Playwright は npx のキャッシュにあるもの(~/.npm/_npx/*/node_modules/playwright)を使う。PLAYWRIGHT_DIR で場所を指定してもよい。
// 使い方: node shoot-motion.js <リールのフォルダ> [--at 場面:秒,…] [--at-video 秒,…]
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

function loadPlaywright() {
  const cands = [];
  if (process.env.PLAYWRIGHT_DIR) cands.push(process.env.PLAYWRIGHT_DIR);
  const npx = path.join(os.homedir(), ".npm/_npx");
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) cands.push(path.join(npx, d, "node_modules/playwright"));
  for (const c of cands) if (fs.existsSync(path.join(c, "package.json"))) return require(c);
  throw new Error("playwright が見つからない(npx playwright --version を一度動かすとキャッシュに入る)");
}

const FPS = 30;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dir = path.resolve(process.argv[2] || "");
const argv = process.argv.slice(3);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const html = fs.readFileSync(path.join(dir, "reel.html"), "utf8");
const n = (html.match(/class="scene/g) || []).length;
const durs = [];
for (let k = 1; k <= n; k++) {
  const a = path.join(dir, `audio/s${k}.mp3`);
  if (k < n) durs.push(probe(a) + 0.45);
  else durs.push(fs.existsSync(a) ? Math.max(3, probe(a) + 0.5) : 3);
}
// コマ数で丸めた長さにそろえる(映像と音のずれを1コマ未満にする)
const frames = durs.map(d => Math.round(d * FPS));
fs.writeFileSync(path.join(dir, "durations.txt"), frames.map(f => (f / FPS).toFixed(4)).join("\n") + "\n");

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--allow-file-access-from-files", "--hide-scrollbars"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(dir, "reel.html") + "?s=1&t=0");
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  // 背景画像(CSS の background-image)も読み込みを待つ
  await page.waitForTimeout(800);
  const shot = async (s, t, file) => {
    await page.evaluate(([s, t, d]) => window.renderAt(s, t, d), [s, t, frames[s - 1] / FPS]);
    await page.screenshot({ path: file });
  };

  const at = opt("--at"), atVideo = opt("--at-video");
  if (at || atVideo) {
    const out = path.join(dir, "check"); fs.mkdirSync(out, { recursive: true });
    const list = [];
    if (at) for (const x of at.split(",")) { const [s, t] = x.split(":"); list.push([+s, +t, `at-s${s}-${t}.png`]); }
    if (atVideo) for (const x of atVideo.split(",")) {
      let t = +x, s = 1;
      while (s < n && t >= frames[s - 1] / FPS) { t -= frames[s - 1] / FPS; s++; }
      list.push([s, t, `at-${x}s.png`]);
    }
    for (const [s, t, f] of list) await shot(s, t, path.join(out, f));
    console.log(list.map(l => path.join(out, l[2])).join("\n"));
  } else {
    const out = path.join(dir, "motion"); fs.rmSync(out, { recursive: true, force: true });
    for (let s = 1; s <= n; s++) {
      const sd = path.join(out, `s${s}`); fs.mkdirSync(sd, { recursive: true });
      for (let i = 0; i < frames[s - 1]; i++) await shot(s, i / FPS, path.join(sd, String(i + 1).padStart(5, "0") + ".png"));
      console.log(`s${s}: ${frames[s - 1]} コマ (${(frames[s - 1] / FPS).toFixed(2)}秒)`);
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
