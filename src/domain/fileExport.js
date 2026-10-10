// バックアップ(JSON)・CSVを、iOSの共有シートで書き出すためのブリッジ。index.htmlから<script src>で
// 素のグローバルスクリプトとして読み込まれる(importもmodule.exportsも使わない)。
//
// ネイティブ側は ios/App/App/FileExport/(window.Capacitor.Plugins.FileExport)。npmのJSラッパーを
// 使わない理由は src/domain/restNotifications.js の冒頭コメントと同じ。
// Web版ではプラグインが無いので使えない(index.html は従来どおり <a download> でダウンロードさせる)。
// iOSでは <a download> を誰も処理せず、ファイルが作られていなかった(2026-09-29)。

function capFileExportPlugin() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.FileExport) {
      return c.Plugins.FileExport;
    }
  } catch { /* ignore */ }
  return null;
}

// 共有シートで書き出せるか(Web版・プラグインの無い古いネイティブでは false)
function fileExportAvailable() {
  return capFileExportPlugin() != null;
}

// 共有シートを出して、テキストをファイルとして渡す。
// 戻り値: { completed }。completed は保存やAirDropを最後まで行ったときだけ true(キャンセルは false)。
// 書き出せなかったら null(例外は外に出さない)。
async function shareTextFile(filename, text) {
  const plugin = capFileExportPlugin();
  if (!plugin) return null;
  try {
    const r = await plugin.share({ filename, text });
    return { completed: r?.completed === true };
  } catch { return null; }
}

// 共有シートで画像(PNG の base64、"data:" の前置きは付けない)を渡す(お疲れ様の画面の「Instagram 用の画像」、1.4)。
// 戻り値は shareTextFile と同じ。プラグインが無い・古いネイティブ(shareImage が無い)・失敗は null。
async function shareImageFile(base64) {
  const plugin = capFileExportPlugin();
  if (!plugin || typeof plugin.shareImage !== "function") return null;
  try {
    const r = await plugin.shareImage({ base64 });
    return { completed: r?.completed === true };
  } catch { return null; }
}

globalThis.fileExportAvailable = fileExportAvailable;
globalThis.shareImageFile = shareImageFile;
globalThis.shareTextFile = shareTextFile;
