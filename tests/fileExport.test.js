import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// iOSの共有シートでバックアップ(JSON)・CSVを書き出すブリッジ src/domain/fileExport.js のテスト。
// ネイティブ側は ios/App/App/FileExport/(window.Capacitor.Plugins.FileExport)。
//
// なぜ要るか:
// - iOSでは <a download> を誰も処理せず、書き出したつもりのファイルが作られていなかった(2026-09-29)。
//   Web版は従来どおり <a download> を使うので、「共有シートを使うかどうか」の判定
//   (fileExportAvailable)がWebで true になると、Web版の書き出しが壊れる。逆にネイティブで false だと
//   iOSで再び何も起きなくなる。
// - completed は「保存やAirDropを最後まで行った」ときだけ true でなければならない。ネイティブの応答が
//   崩れていたときに true 側へ倒れると、キャンセルしたのに「書き出した」扱いになり、
//   ユーザーはバックアップが無いことに気づけない。
// - プラグインの失敗を例外として外に出すと、呼び出し側で未処理のrejectionになる。
//
// 対象外:
// - FileExportPlugin.swift の実際の共有シート表示(npm test からは実行できない。シミュレータで確認すること)
// - index.html 側の呼び出し(Web/iOSの分岐、戻り値に応じたメッセージ表示)

function load(initialGlobals = {}) {
  return loadDomainModule("src/domain/fileExport.js", initialGlobals);
}

// window.Capacitor.Plugins.FileExport の偽物。
// overrides.fails: true で share が reject する。overrides.shareResult で戻り値を差し替える
// (undefined も「応答」として渡したいので、?? ではなくキーの有無で見る)。
function fakeFileExportPlugin(overrides = {}) {
  const calls = { share: [] };
  const plugin = {
    async share(arg) {
      calls.share.push(arg);
      if (overrides.fails) throw new Error("native failed");
      return "shareResult" in overrides ? overrides.shareResult : { completed: true, activityType: "com.apple.DocumentManagerUICore.SaveToFiles" };
    },
  };
  const globals = {
    window: { Capacitor: { isNativePlatform: () => true, Plugins: { FileExport: plugin } } },
  };
  return { globals, calls };
}

function sampleExport(overrides = {}) {
  return {
    filename: "kurabell-backup-2026-09-30.json",
    text: '{"workouts":[{"date":"2026-09-30","exercises":[]}]}',
    ...overrides,
  };
}

describe("Web版では共有シートを使わない(ここが崩れるとWeb版の<a download>が動かなくなる)", () => {
  it("windowが無い環境ではfileExportAvailableがfalseになる", () => {
    const { fileExportAvailable } = load();
    expect(fileExportAvailable()).toBe(false);
  });

  it("window.Capacitorが無ければfileExportAvailableがfalseになる", () => {
    const { fileExportAvailable } = load({ window: {} });
    expect(fileExportAvailable()).toBe(false);
  });

  it("isNativePlatform()がfalseならプラグインがあってもfileExportAvailableがfalseになる", () => {
    const { globals } = fakeFileExportPlugin();
    globals.window.Capacitor.isNativePlatform = () => false;
    const { fileExportAvailable } = load(globals);
    expect(fileExportAvailable()).toBe(false);
  });

  it("ネイティブでもFileExportプラグインが無ければ(古いネイティブ)fileExportAvailableがfalseになる", () => {
    const { fileExportAvailable } = load({
      window: { Capacitor: { isNativePlatform: () => true, Plugins: {} } },
    });
    expect(fileExportAvailable()).toBe(false);
  });

  it("window.Capacitorが無ければshareTextFileはnullを返す", async () => {
    const { shareTextFile } = load({ window: {} });
    const { filename, text } = sampleExport();
    expect(await shareTextFile(filename, text)).toBeNull();
  });

  it("isNativePlatform()がfalseならshareTextFileはプラグインを呼ばずにnullを返す", async () => {
    const { globals, calls } = fakeFileExportPlugin();
    globals.window.Capacitor.isNativePlatform = () => false;
    const { shareTextFile } = load(globals);
    const { filename, text } = sampleExport();
    expect(await shareTextFile(filename, text)).toBeNull();
    expect(calls.share).toEqual([]);
  });

  it("ネイティブでもFileExportプラグインが無ければshareTextFileはnullを返す", async () => {
    const { shareTextFile } = load({
      window: { Capacitor: { isNativePlatform: () => true, Plugins: {} } },
    });
    const { filename, text } = sampleExport();
    expect(await shareTextFile(filename, text)).toBeNull();
  });
});

describe("ネイティブ+プラグインありでは共有シートに渡す", () => {
  it("fileExportAvailableがtrueになる", () => {
    const { globals } = fakeFileExportPlugin();
    const { fileExportAvailable } = load(globals);
    expect(fileExportAvailable()).toBe(true);
  });

  it("shareTextFileはファイル名と本文を{ filename, text }としてそのままプラグインに渡す", async () => {
    const { globals, calls } = fakeFileExportPlugin();
    const { shareTextFile } = load(globals);
    const { filename, text } = sampleExport();
    await shareTextFile(filename, text);
    expect(calls.share).toEqual([{ filename, text }]);
  });

  it("CSVの改行や日本語を含む本文も加工せずに渡す", async () => {
    const { globals, calls } = fakeFileExportPlugin();
    const { shareTextFile } = load(globals);
    const { filename, text } = sampleExport({
      filename: "kurabell-2026-09-30.csv",
      text: "date,exercise,weight,reps,rir\r\n2026-09-30,ベンチプレス,60,8,2\r\n",
    });
    await shareTextFile(filename, text);
    expect(calls.share[0].text).toBe(text);
    expect(calls.share[0].filename).toBe(filename);
  });
});

describe("completedの解釈(ここが崩れるとキャンセルしたのに書き出した扱いになる)", () => {
  async function shareWith(shareResult) {
    const { globals } = fakeFileExportPlugin({ shareResult });
    const { shareTextFile } = load(globals);
    const { filename, text } = sampleExport();
    return shareTextFile(filename, text);
  }

  it("プラグインがcompleted: trueを返したら{ completed: true }になる", async () => {
    expect(await shareWith({ completed: true, activityType: "com.apple.UIKit.activity.AirDrop" })).toEqual({ completed: true });
  });

  it("プラグインがcompleted: falseを返したら(キャンセル){ completed: false }になる", async () => {
    expect(await shareWith({ completed: false, activityType: null })).toEqual({ completed: false });
  });

  it("completedが無い応答は{ completed: false }になる(保存したことにしない)", async () => {
    expect(await shareWith({ activityType: "com.apple.UIKit.activity.AirDrop" })).toEqual({ completed: false });
  });

  it("completedが真偽値でない(文字列の\"true\"や1)応答は{ completed: false }になる", async () => {
    expect(await shareWith({ completed: "true" })).toEqual({ completed: false });
    expect(await shareWith({ completed: 1 })).toEqual({ completed: false });
  });

  it("応答そのものがundefined/nullでも例外にならず{ completed: false }になる", async () => {
    expect(await shareWith(undefined)).toEqual({ completed: false });
    expect(await shareWith(null)).toEqual({ completed: false });
  });

  it("戻り値にactivityTypeなどプラグインの他の項目を含めない", async () => {
    const r = await shareWith({ completed: true, activityType: "com.apple.UIKit.activity.AirDrop" });
    expect(Object.keys(r)).toEqual(["completed"]);
  });
});

describe("プラグインの失敗(例外を外に出さない)", () => {
  it("プラグインがrejectしたらshareTextFileは例外を投げずにnullを返す", async () => {
    const { globals, calls } = fakeFileExportPlugin({ fails: true });
    const { shareTextFile } = load(globals);
    const { filename, text } = sampleExport();
    await expect(shareTextFile(filename, text)).resolves.toBeNull();
    expect(calls.share).toHaveLength(1);
  });

  it("isNativePlatformの呼び出し自体が例外を投げてもfileExportAvailableはfalseになる", () => {
    const { fileExportAvailable } = load({
      window: { Capacitor: { isNativePlatform: () => { throw new Error("bridge broken"); }, Plugins: {} } },
    });
    expect(fileExportAvailable()).toBe(false);
  });
});

// 記録の画像(1.4、お疲れ様の画面の「Instagram 用の画像」)
describe("shareImageFile(画像を共有シートで渡す)", () => {
  const nativeWith = (plugin) => ({ window: { Capacitor: { isNativePlatform: () => true, Plugins: { FileExport: plugin } } } });

  it("base64 をそのままネイティブに渡し、completed を返す", async () => {
    const calls = [];
    const { shareImageFile } = load(nativeWith({ share: async () => ({}), shareImage: async (a) => { calls.push(a); return { completed: true }; } }));
    expect(await shareImageFile("iVBORw0KGgo=")).toEqual({ completed: true });
    expect(calls).toEqual([{ base64: "iVBORw0KGgo=" }]);
  });
  it("Web 版(プラグイン無し)では null", async () => {
    const { shareImageFile } = load();
    expect(await shareImageFile("x")).toBe(null);
  });
  it("shareImage を持たない古いネイティブでは null(例外にしない)", async () => {
    const { shareImageFile } = load(nativeWith({ share: async () => ({}) }));
    expect(await shareImageFile("x")).toBe(null);
  });
  it("ネイティブの失敗は null(例外を外に出さない)", async () => {
    const { shareImageFile } = load(nativeWith({ share: async () => ({}), shareImage: async () => { throw new Error("busy"); } }));
    expect(await shareImageFile("x")).toBe(null);
  });
});
