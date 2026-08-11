// index.html を含む静的ファイル一式を www/ にコピーする。
// GitHub Pages配信用のルート直下のファイル構成は変えず、Capacitorのwebディレクトリ用にコピーだけ作る。
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEST = path.join(ROOT, "www");

const FILES = [
  "index.html",
  "manifest.json",
  "sw.js",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
];
const DIRS = ["vendor"];

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

for (const file of FILES) {
  fs.copyFileSync(path.join(ROOT, file), path.join(DEST, file));
}
for (const dir of DIRS) {
  fs.cpSync(path.join(ROOT, dir), path.join(DEST, dir), { recursive: true });
}

console.log(`synced ${FILES.length} files and ${DIRS.length} dir(s) into www/`);
