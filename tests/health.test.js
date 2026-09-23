import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// ヘルスケア(HealthKit)連携 src/domain/health.js と、そのネイティブ設定のテスト。
// 設計判断は docs/ヘルスケア連携.md(health.js と HealthManager.swift の冒頭から参照されている)。
//
// なぜ要るか:
// - 体重の同期は「lastSyncedAt より新しいヘルスケアの値だけを反映する」ことで、アプリが書いた体重を
//   次の読み込みで拾い直して上書きするループを防いでいる。この比較(同じ日時は反映しない)が崩れると、
//   アプリで入力した体重が0.1kg丸めの値に化けたり、書き込みと読み込みが往復し続けたりする。
// - 記録とヘルスケアのワークアウトは startAt(ISO文字列)だけで紐づく。キーが揺れると、記録を
//   消してもヘルスケアに残る・二重に書かれる、という形で黙って壊れる。
// - ヘルスケア側の失敗は記録の保存を妨げてはいけない(index.html は healthSaveWorkout を await せずに呼ぶ)。
//   例外が外に出ると未処理のrejectionになる。
// - ネイティブ設定は、抜けてもビルドは通るが機能が黙って動かない種類のもの。RestTimerPlugin で
//   「アプリターゲット直下のプラグインは自動登録されない」ことを踏んでいる(BridgeViewController.swift)。
//   tests/restNotifications.test.js の「休憩タイマーのネイティブ設定」と同じ考え方で、ファイルの中身で縛る。
//
// 対象外:
// - HealthManager.swift の実際の HealthKit 呼び出し(npm test からは実行できない。シミュレータで確認すること)
// - index.html 側の呼び出しタイミング(フォーカスが外れたときだけ書く、前面に戻ったときに読む、など)

function load(initialGlobals = {}) {
  return loadDomainModule("src/domain/health.js", initialGlobals);
}

function sampleWorkout(overrides = {}) {
  return {
    date: "2026-09-20T10:45:00.000Z",
    startAt: "2026-09-20T10:00:00.000Z",
    endAt: "2026-09-20T10:45:00.000Z",
    exercises: [{ name: "ベンチプレス", sets: [{ weight: 60, reps: 8, rir: 2 }] }],
    ...overrides,
  };
}

function sampleBodyMass(overrides = {}) {
  return { kg: 72.34, date: 1_800_000_000_000, ...overrides };
}

// tests/restNotifications.test.js の fakePlugin() と同じ要領で、window.Capacitor.Plugins.Health の偽物を差す。
// overrides.fails: true で全メソッドが reject する。overrides.<メソッド名>Result で戻り値を差し替える。
// latestBodyMassResult だけは null も「応答」として渡したいので、?? ではなくキーの有無で見る。
function fakeHealthPlugin(overrides = {}) {
  const calls = {
    isAvailable: 0, requestAuthorization: 0, authorizationStatus: 0,
    saveWorkout: [], deleteWorkout: [], latestBodyMass: 0, saveBodyMass: [],
  };
  const fail = () => { if (overrides.fails) throw new Error("native failed"); };
  const plugin = {
    async isAvailable() { calls.isAvailable++; fail(); return overrides.isAvailableResult ?? { available: true }; },
    async requestAuthorization() {
      calls.requestAuthorization++; fail();
      return overrides.requestAuthorizationResult ?? { workout: "authorized", bodyMass: "authorized" };
    },
    async authorizationStatus() {
      calls.authorizationStatus++; fail();
      return overrides.authorizationStatusResult ?? { workout: "denied", bodyMass: "notDetermined" };
    },
    async saveWorkout(arg) { calls.saveWorkout.push(arg); fail(); },
    async deleteWorkout(arg) { calls.deleteWorkout.push(arg); fail(); return overrides.deleteWorkoutResult ?? { deleted: 1 }; },
    async latestBodyMass() { calls.latestBodyMass++; fail(); return "latestBodyMassResult" in overrides ? overrides.latestBodyMassResult : sampleBodyMass(); },
    async saveBodyMass(arg) { calls.saveBodyMass.push(arg); fail(); return overrides.saveBodyMassResult ?? { date: 1_800_000_500_000 }; },
  };
  const globals = {
    window: { Capacitor: { isNativePlatform: () => true, Plugins: { Health: plugin } } },
  };
  return { globals, calls };
}

describe("healthWorkoutKey(記録とヘルスケアのワークアウトを紐づけるキー)", () => {
  const { healthWorkoutKey } = load();

  it("正しいISO文字列のstartAtはそのまま返す", () => {
    expect(healthWorkoutKey(sampleWorkout())).toBe("2026-09-20T10:00:00.000Z");
  });

  it("startAtが無い古い記録はnullになる(ヘルスケアに書かない)", () => {
    const w = sampleWorkout();
    delete w.startAt;
    expect(healthWorkoutKey(w)).toBeNull();
  });

  it("startAtが空文字ならnullになる", () => {
    expect(healthWorkoutKey(sampleWorkout({ startAt: "" }))).toBeNull();
  });

  it("日付として読めないstartAtはnullになる", () => {
    expect(healthWorkoutKey(sampleWorkout({ startAt: "not-a-date" }))).toBeNull();
  });

  it("startAtが文字列でなければ(数値のエポックミリ秒でも)nullになる", () => {
    expect(healthWorkoutKey(sampleWorkout({ startAt: 1_800_000_000_000 }))).toBeNull();
    expect(healthWorkoutKey(sampleWorkout({ startAt: null }))).toBeNull();
  });

  it("記録そのものがnull/undefinedでも例外にならずnullを返す", () => {
    expect(healthWorkoutKey(null)).toBeNull();
    expect(healthWorkoutKey(undefined)).toBeNull();
  });
});

describe("pickHealthWeight(ここが崩れると自分の書いた体重を拾い直して上書きする)", () => {
  const { pickHealthWeight } = load();

  it("lastSyncedAtより新しい体重は0.1kgに丸めて、その日時と一緒に返す", () => {
    const sample = sampleBodyMass({ kg: 72.34, date: 2000 });
    expect(pickHealthWeight(sample, 1000)).toEqual({ bodyweight: 72.3, healthBwAt: 2000 });
  });

  it("0.1kg未満の端数は四捨五入する", () => {
    expect(pickHealthWeight(sampleBodyMass({ kg: 72.36, date: 2000 }), 1000).bodyweight).toBe(72.4);
  });

  it("lastSyncedAtと同じ日時の体重は反映しない(アプリが書いた値そのもの)", () => {
    expect(pickHealthWeight(sampleBodyMass({ date: 2000 }), 2000)).toBeNull();
  });

  it("lastSyncedAtより古い体重は反映しない", () => {
    expect(pickHealthWeight(sampleBodyMass({ date: 1999 }), 2000)).toBeNull();
  });

  it("lastSyncedAtがundefined/NaN/nullなら0扱いで、日時のある体重は反映する", () => {
    const sample = sampleBodyMass({ kg: 65, date: 1 });
    expect(pickHealthWeight(sample, undefined)).toEqual({ bodyweight: 65, healthBwAt: 1 });
    expect(pickHealthWeight(sample, NaN)).toEqual({ bodyweight: 65, healthBwAt: 1 });
    expect(pickHealthWeight(sample, null)).toEqual({ bodyweight: 65, healthBwAt: 1 });
  });

  it("20kgちょうどと400kgちょうどは範囲内として反映する", () => {
    expect(pickHealthWeight(sampleBodyMass({ kg: 20, date: 2000 }), 0)).toEqual({ bodyweight: 20, healthBwAt: 2000 });
    expect(pickHealthWeight(sampleBodyMass({ kg: 400, date: 2000 }), 0)).toEqual({ bodyweight: 400, healthBwAt: 2000 });
  });

  it("20kg未満・400kg超の体重は誤入力として反映しない", () => {
    expect(pickHealthWeight(sampleBodyMass({ kg: 19.9, date: 2000 }), 0)).toBeNull();
    expect(pickHealthWeight(sampleBodyMass({ kg: 400.1, date: 2000 }), 0)).toBeNull();
    expect(pickHealthWeight(sampleBodyMass({ kg: 0, date: 2000 }), 0)).toBeNull();
  });

  it("kgやdateが数値として読めなければ反映しない", () => {
    expect(pickHealthWeight(sampleBodyMass({ kg: NaN }), 0)).toBeNull();
    expect(pickHealthWeight(sampleBodyMass({ kg: "72" }), 0)).toBeNull();
    expect(pickHealthWeight(sampleBodyMass({ date: NaN }), 0)).toBeNull();
    expect(pickHealthWeight(sampleBodyMass({ date: undefined }), 0)).toBeNull();
  });

  it("サンプルがnull(ヘルスケアに体重が無い)なら反映しない", () => {
    expect(pickHealthWeight(null, 0)).toBeNull();
    expect(pickHealthWeight(undefined, 0)).toBeNull();
  });
});

describe("healthWeightToWrite(入力欄を触っただけでは書き込まない)", () => {
  const { healthWeightToWrite } = load();

  it("編集前と同じ値なら書かない", () => {
    expect(healthWeightToWrite(72.5, 72.5)).toBeNull();
  });

  it("編集前との差が0.05kg未満なら書かない", () => {
    expect(healthWeightToWrite(72.5, 72.54)).toBeNull();
    expect(healthWeightToWrite(72.5, 72.46)).toBeNull();
  });

  it("編集前と0.1kg違えば編集後の値を書く", () => {
    expect(healthWeightToWrite(72.5, 72.6)).toBe(72.6);
    expect(healthWeightToWrite(72.5, 72.4)).toBe(72.4);
  });

  it("編集前がnull/undefinedなら編集後の値を書く", () => {
    expect(healthWeightToWrite(null, 70)).toBe(70);
    expect(healthWeightToWrite(undefined, 70)).toBe(70);
  });

  it("範囲外(20kg未満・400kg超)や入力途中の値は書かない", () => {
    expect(healthWeightToWrite(70, 7)).toBeNull();
    expect(healthWeightToWrite(70, 0)).toBeNull();
    expect(healthWeightToWrite(70, 400.1)).toBeNull();
    expect(healthWeightToWrite(70, NaN)).toBeNull();
    expect(healthWeightToWrite(null, undefined)).toBeNull();
  });

  it("20kgちょうどと400kgちょうどは書く", () => {
    expect(healthWeightToWrite(70, 20)).toBe(20);
    expect(healthWeightToWrite(70, 400)).toBe(400);
  });
});

describe("プラグインが無い環境(Web版)では何もしない", () => {
  const environments = [
    ["windowが無い", {}],
    ["isNativePlatformがfalse", { window: { Capacitor: { isNativePlatform: () => false, Plugins: { Health: {} } } } }],
    ["ネイティブでもPlugins.Healthが未登録", { window: { Capacitor: { isNativePlatform: () => true, Plugins: {} } } }],
  ];

  for (const [label, globals] of environments) {
    it(`${label}なら、全ての関数が例外を投げずにno-opの値(false/null/0)を返す`, async () => {
      const m = load(globals);
      expect(m.healthAvailable()).toBe(false);
      await expect(m.healthSupported()).resolves.toBe(false);
      await expect(m.healthRequestAuthorization()).resolves.toBeNull();
      await expect(m.healthAuthorizationStatus()).resolves.toBeNull();
      await expect(m.healthSaveWorkout(sampleWorkout())).resolves.toBe(false);
      await expect(m.healthDeleteWorkout(sampleWorkout())).resolves.toBe(0);
      await expect(m.healthLatestBodyMass()).resolves.toBeNull();
      await expect(m.healthSaveBodyMass(70)).resolves.toBeNull();
    });
  }

  it("ネイティブかつPlugins.Healthがあれば使える扱いになる", () => {
    const { globals } = fakeHealthPlugin();
    expect(load(globals).healthAvailable()).toBe(true);
  });
});

describe("healthSupported / 権限", () => {
  it("isAvailableがavailable:trueを返したときだけtrueになる", async () => {
    expect(await load(fakeHealthPlugin().globals).healthSupported()).toBe(true);
    expect(await load(fakeHealthPlugin({ isAvailableResult: { available: false } }).globals).healthSupported()).toBe(false);
    expect(await load(fakeHealthPlugin({ isAvailableResult: {} }).globals).healthSupported()).toBe(false);
  });

  it("権限の要求と状態の取得はネイティブの応答をそのまま返す", async () => {
    const { globals } = fakeHealthPlugin();
    const m = load(globals);
    expect(await m.healthRequestAuthorization()).toEqual({ workout: "authorized", bodyMass: "authorized" });
    expect(await m.healthAuthorizationStatus()).toEqual({ workout: "denied", bodyMass: "notDetermined" });
  });

  it("ネイティブがrejectしても例外にならず、false/nullを返す", async () => {
    const { globals } = fakeHealthPlugin({ fails: true });
    const m = load(globals);
    await expect(m.healthSupported()).resolves.toBe(false);
    await expect(m.healthRequestAuthorization()).resolves.toBeNull();
    await expect(m.healthAuthorizationStatus()).resolves.toBeNull();
  });
});

describe("healthWorkoutRange(実態と違う長さのワークアウトを書かない)", () => {
  const start = Date.parse("2026-09-20T10:00:00.000Z");

  it("開始と終了をエポックミリ秒で返す", () => {
    const { healthWorkoutRange } = load();
    expect(healthWorkoutRange(sampleWorkout())).toEqual({ startAt: start, endAt: start + 45 * 60000 });
  });

  it("ちょうど4時間は書くが、4時間を超えたら書かない(朝に組んだメニューを夜に保存したケース)", () => {
    const { healthWorkoutRange, HEALTH_MAX_WORKOUT_MS } = load();
    const at = (ms) => new Date(start + ms).toISOString();
    expect(healthWorkoutRange(sampleWorkout({ endAt: at(HEALTH_MAX_WORKOUT_MS) }))).not.toBeNull();
    expect(healthWorkoutRange(sampleWorkout({ endAt: at(HEALTH_MAX_WORKOUT_MS + 1) }))).toBeNull();
  });

  it("終了が開始より前なら開始と同じにする(時計のずれ)", () => {
    const { healthWorkoutRange } = load();
    expect(healthWorkoutRange(sampleWorkout({ endAt: "2026-09-20T09:00:00.000Z" }))).toEqual({ startAt: start, endAt: start });
  });

  it("startAtが無ければnull", () => {
    const { healthWorkoutRange } = load();
    expect(healthWorkoutRange(sampleWorkout({ startAt: undefined }))).toBeNull();
  });

  it("4時間を超える記録ではプラグインを呼ばずfalseを返す", async () => {
    const { globals, calls } = fakeHealthPlugin();
    const m = load(globals);
    expect(await m.healthSaveWorkout(sampleWorkout({ endAt: "2026-09-20T20:00:00.000Z" }))).toBe(false);
    expect(calls.saveWorkout ?? []).toEqual([]);
  });
});

describe("healthSaveWorkout", () => {
  it("startAt文字列をkeyに、startAt/endAtをエポックミリ秒にして渡し、trueを返す", async () => {
    const { globals, calls } = fakeHealthPlugin();
    const m = load(globals);

    expect(await m.healthSaveWorkout(sampleWorkout())).toBe(true);
    expect(calls.saveWorkout).toEqual([{
      key: "2026-09-20T10:00:00.000Z",
      startAt: Date.parse("2026-09-20T10:00:00.000Z"),
      endAt: Date.parse("2026-09-20T10:45:00.000Z"),
    }]);
  });

  it("endAtが無い・読めないときはendAtをstartAtと同じにする", async () => {
    const { globals, calls } = fakeHealthPlugin();
    const m = load(globals);
    const start = Date.parse("2026-09-20T10:00:00.000Z");

    await m.healthSaveWorkout(sampleWorkout({ endAt: undefined }));
    await m.healthSaveWorkout(sampleWorkout({ endAt: "garbage" }));

    expect(calls.saveWorkout.map((a) => [a.startAt, a.endAt])).toEqual([[start, start], [start, start]]);
  });

  it("startAtが無い記録ではプラグインを呼ばずfalseを返す", async () => {
    const { globals, calls } = fakeHealthPlugin();
    const m = load(globals);
    const w = sampleWorkout();
    delete w.startAt;

    expect(await m.healthSaveWorkout(w)).toBe(false);
    expect(await m.healthSaveWorkout(sampleWorkout({ startAt: "not-a-date" }))).toBe(false);
    expect(calls.saveWorkout).toEqual([]);
  });

  it("プラグインがrejectしても例外にならずfalseを返す(記録の保存を妨げない)", async () => {
    const { globals, calls } = fakeHealthPlugin({ fails: true });
    const m = load(globals);

    await expect(m.healthSaveWorkout(sampleWorkout())).resolves.toBe(false);
    expect(calls.saveWorkout).toHaveLength(1);
  });
});

describe("healthDeleteWorkout", () => {
  it("保存時と同じkey(startAt文字列)だけを渡し、消した件数を返す", async () => {
    const { globals, calls } = fakeHealthPlugin({ deleteWorkoutResult: { deleted: 2 } });
    const m = load(globals);

    expect(await m.healthDeleteWorkout(sampleWorkout())).toBe(2);
    expect(calls.deleteWorkout).toEqual([{ key: "2026-09-20T10:00:00.000Z" }]);
  });

  it("保存と削除で同じ記録から同じkeyが作られる(ずれるとヘルスケアに残る)", async () => {
    const { globals, calls } = fakeHealthPlugin();
    const m = load(globals);
    const w = sampleWorkout();

    await m.healthSaveWorkout(w);
    await m.healthDeleteWorkout(w);

    expect(calls.deleteWorkout[0].key).toBe(calls.saveWorkout[0].key);
  });

  it("deletedが無い・数値でない応答では0を返す", async () => {
    expect(await load(fakeHealthPlugin({ deleteWorkoutResult: {} }).globals).healthDeleteWorkout(sampleWorkout())).toBe(0);
    expect(await load(fakeHealthPlugin({ deleteWorkoutResult: { deleted: "x" } }).globals).healthDeleteWorkout(sampleWorkout())).toBe(0);
  });

  it("startAtが無い記録ではプラグインを呼ばず0を返す", async () => {
    const { globals, calls } = fakeHealthPlugin();
    const m = load(globals);

    expect(await m.healthDeleteWorkout(sampleWorkout({ startAt: undefined }))).toBe(0);
    expect(calls.deleteWorkout).toEqual([]);
  });

  it("プラグインがrejectしても例外にならず0を返す", async () => {
    const { globals } = fakeHealthPlugin({ fails: true });
    await expect(load(globals).healthDeleteWorkout(sampleWorkout())).resolves.toBe(0);
  });
});

describe("healthLatestBodyMass", () => {
  it("kgとdateをそのまま返す", async () => {
    const { globals } = fakeHealthPlugin({ latestBodyMassResult: { kg: 72.34, date: 1_800_000_000_000 } });
    expect(await load(globals).healthLatestBodyMass()).toEqual({ kg: 72.34, date: 1_800_000_000_000 });
  });

  it("データが無いときの空オブジェクトはnullになる", async () => {
    const { globals } = fakeHealthPlugin({ latestBodyMassResult: {} });
    expect(await load(globals).healthLatestBodyMass()).toBeNull();
  });

  it("文字列・null・数値でないkgやdateの不正な応答はnullになる", async () => {
    for (const bad of ["72.3", null, { kg: "72.3", date: 1 }, { kg: 72.3, date: "2026-09-20" }, { kg: 72.3 }]) {
      const { globals } = fakeHealthPlugin({ latestBodyMassResult: bad });
      expect(await load(globals).healthLatestBodyMass()).toBeNull();
    }
  });

  it("プラグインがrejectしても例外にならずnullを返す", async () => {
    const { globals } = fakeHealthPlugin({ fails: true });
    await expect(load(globals).healthLatestBodyMass()).resolves.toBeNull();
  });
});

describe("healthSaveBodyMass", () => {
  it("kgを渡し、保存したサンプルの日時を返す", async () => {
    const { globals, calls } = fakeHealthPlugin({ saveBodyMassResult: { date: 1_800_000_500_000 } });
    const m = load(globals);

    expect(await m.healthSaveBodyMass(72.5)).toBe(1_800_000_500_000);
    expect(calls.saveBodyMass).toEqual([{ kg: 72.5 }]);
  });

  it("範囲外・数値でない体重ではプラグインを呼ばずnullを返す", async () => {
    const { globals, calls } = fakeHealthPlugin();
    const m = load(globals);

    for (const bad of [19.9, 400.1, 0, NaN, "70", null, undefined]) {
      expect(await m.healthSaveBodyMass(bad)).toBeNull();
    }
    expect(calls.saveBodyMass).toEqual([]);
  });

  it("応答にdateが無ければnullを返す(同期済み日時を壊さない)", async () => {
    const { globals } = fakeHealthPlugin({ saveBodyMassResult: {} });
    expect(await load(globals).healthSaveBodyMass(70)).toBeNull();
  });

  it("プラグインがrejectしても例外にならずnullを返す", async () => {
    const { globals } = fakeHealthPlugin({ fails: true });
    await expect(load(globals).healthSaveBodyMass(70)).resolves.toBeNull();
  });
});

describe("体重の往復(書いた値を次の読み込みで拾い直さない)", () => {
  it("アプリが書いた体重の日時をlastSyncedAtにすると、同じサンプルを読んでも反映しない", async () => {
    const at = 1_800_000_500_000;
    const { globals } = fakeHealthPlugin({
      saveBodyMassResult: { date: at },
      latestBodyMassResult: { kg: 72.54, date: at },
    });
    const m = load(globals);

    const kg = m.healthWeightToWrite(70, 72.54);
    const lastSyncedAt = await m.healthSaveBodyMass(kg);
    const sample = await m.healthLatestBodyMass();

    expect(m.pickHealthWeight(sample, lastSyncedAt)).toBeNull();
  });
});

// ネイティブ側の設定は npm test からは実行できないので、ファイルの中身で縛る。
// どれも「抜けてもビルドは通るが、機能が黙って動かない」か「審査・配布で初めて表面化する」種類の設定。
describe("ヘルスケア連携のネイティブ設定", () => {
  const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf-8");

  it("HealthPluginを明示的に登録している(アプリターゲット直下のプラグインは自動登録されない)", () => {
    expect(read("ios/App/App/BridgeViewController.swift")).toContain("registerPluginInstance(HealthPlugin())");
  });

  it("プラグインのjsNameがJSの参照するPlugins.Healthと一致する", () => {
    expect(read("ios/App/App/Health/HealthPlugin.swift")).toContain('jsName = "Health"');
  });

  // 片方だけにメソッドを足したときも落ちるよう、両方から抜き出して集合として突き合わせる。
  it("health.jsが呼ぶメソッドとネイティブが宣言するCAPPluginMethodが過不足なく一致する", () => {
    const js = read("src/domain/health.js");
    const swift = read("ios/App/App/Health/HealthPlugin.swift");
    const called = new Set([...js.matchAll(/\bplugin\.(\w+)\(/g)].map((m) => m[1]));
    const declared = new Set([...swift.matchAll(/CAPPluginMethod\(name:\s*"(\w+)"/g)].map((m) => m[1]));

    const missingInSwift = [...called].filter((n) => !declared.has(n));
    const unusedInJs = [...declared].filter((n) => !called.has(n));
    expect(missingInSwift, `Swiftに無いメソッド: ${missingInSwift.join(", ")}`).toEqual([]);
    expect(unusedInJs, `JSから呼ばれないメソッド: ${unusedInJs.join(", ")}`).toEqual([]);
    expect([...called].sort()).toEqual([
      "authorizationStatus", "deleteWorkout", "isAvailable", "latestBodyMass",
      "requestAuthorization", "saveBodyMass", "saveWorkout",
    ]);
  });

  it("HealthKitのエンタイトルメントがtrueで付いている", () => {
    expect(read("ios/App/App/App.entitlements")).toMatch(/<key>com\.apple\.developer\.healthkit<\/key>\s*<true\/>/);
  });

  it("Info.plistに読み込み・書き込みの利用目的の文言がある(無いと権限要求の時点でクラッシュする)", () => {
    const plist = read("ios/App/App/Info.plist");
    expect(plist).toMatch(/<key>NSHealthShareUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
    expect(plist).toMatch(/<key>NSHealthUpdateUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  });

  // healthkit を必須にすると、ヘルスケアの無い端末(iPadなど)にインストールできなくなる。
  // 連携は任意の機能で、無い端末では設定の欄ごと出さない設計(healthSupported)。
  it("UIRequiredDeviceCapabilitiesにhealthkitを入れていない(ヘルスケアの無い端末を締め出さない)", () => {
    const plist = read("ios/App/App/Info.plist");
    const m = plist.match(/<key>UIRequiredDeviceCapabilities<\/key>\s*<array>([\s\S]*?)<\/array>/);
    expect(m).not.toBeNull();
    expect(m[1]).not.toMatch(/healthkit/i);
  });

  it("ja.lproj/InfoPlist.stringsに権限ダイアログの2キーの日本語訳がある", () => {
    const strings = read("ios/App/App/ja.lproj/InfoPlist.strings");
    expect(strings).toMatch(/"NSHealthShareUsageDescription"\s*=\s*"[^"]+";/);
    expect(strings).toMatch(/"NSHealthUpdateUsageDescription"\s*=\s*"[^"]+";/);
  });

  it("Xcodeプロジェクトにフレームワーク・ソース・ローカライズ済みリソースが組み込まれている", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx).toContain("HealthKit.framework in Frameworks");
    expect(pbx).toContain("HealthPlugin.swift in Sources");
    expect(pbx).toContain("HealthManager.swift in Sources");
    expect(pbx).toContain("InfoPlist.strings in Resources");
  });

  // Xcodeで追加する手順によっては、Xcode.app内の特定SDK(iPhoneOS18.x.sdkなど)への絶対パスで
  // 参照が入り、Xcodeを更新した環境でビルドが落ちる。
  it("HealthKit.frameworkの参照がSDKROOT基準で、特定SDKのパスに依存していない", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    const ref = pbx.match(/\/\* HealthKit\.framework \*\/ = \{isa = PBXFileReference;[^}]*\}/);
    expect(ref).not.toBeNull();
    expect(ref[0]).toContain("sourceTree = SDKROOT;");
    expect(ref[0]).not.toMatch(/\.sdk\/|Xcode\.app|Platforms\//);
  });

  it("knownRegionsにjaが入っている(無いとja.lprojの文言が使われない)", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    const m = pbx.match(/knownRegions = \(([^)]*)\)/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/\bja\b/);
  });

  // 推定値の消費カロリーをヘルスケアに書くと、Apple Watch等の実測値と混ざって合計を歪める。
  it("HealthManagerは消費カロリーを書かない(activeEnergyBurnedを扱わない)", () => {
    expect(read("ios/App/App/Health/HealthManager.swift")).not.toContain("activeEnergyBurned");
  });
});
