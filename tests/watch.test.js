import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// window を渡さない = 非ネイティブ環境。ブリッジ側は全て no-op になる。
const load = (g = {}) => loadDomainModule("src/domain/watch.js", g);

const LABELS = { rest: "インターバル", restBody: "{n}分経過", prev: "前回", same: "→ 同じ", reps: "回",
  startOnPhone: "iPhoneで開始", warmup: "W", addSet: "セットを追加", assisted: "補助" };
const fmtW = (kg) => String(kg);

const bench = (sets, prevSets = null) => ({
  id: "e1", name: "ベンチプレス", weightLabel: "重量", unit: "kg", step: 2.5, restAfter: true, sets, prevSets,
});

describe("buildWatchSnapshot", () => {
  it("記録中なら active、記録前でメニューがあれば menu、どちらもなければ idle", () => {
    const { buildWatchSnapshot } = load();
    const base = { now: 1, labels: LABELS, fmtW };
    expect(buildWatchSnapshot({ ...base, exercises: [bench([])] }).state).toBe("active");
    expect(buildWatchSnapshot({ ...base, menu: [{ name: "a", detail: "" }] }).state).toBe("menu");
    expect(buildWatchSnapshot(base).state).toBe("idle");
  });

  it("記録中でなければ休憩の開始時刻を送らない", () => {
    const { buildWatchSnapshot } = load();
    expect(buildWatchSnapshot({ now: 1, labels: LABELS, fmtW, restStartAt: 100 }).restStartAt).toBeNull();
    expect(buildWatchSnapshot({ now: 1, labels: LABELS, fmtW, restStartAt: 100, exercises: [bench([])] }).restStartAt).toBe(100);
  });

  it("前回の同じ番手は、ウォームアップを数えないワーキングセットの通し番号で対応させる", () => {
    const { buildWatchSnapshot } = load();
    const snap = buildWatchSnapshot({
      now: 1, labels: LABELS, fmtW,
      exercises: [bench(
        [
          { weight: "40", reps: "10", rir: "", warmup: true },
          { weight: "80", reps: "8", rir: 2, warmup: false },
          { weight: "80", reps: "8", rir: "", warmup: false },
        ],
        [{ weight: 80, reps: 8, rir: 1 }, { weight: 77.5, reps: 8 }],
      )],
    });
    const rows = snap.exercises[0].sets;
    expect(rows[0].prev).toBeNull();
    expect(rows[0].rir).toBeNull();
    expect(rows[1].prev).toEqual({ text: "80kg×8 RIR1", weight: "80", reps: "8", rir: 1 });
    expect(rows[2].prev).toEqual({ text: "77.5kg×8", weight: "77.5", reps: "8", rir: null });
    expect(rows[1].rir).toBe(2);
    expect(rows[2].rir).toBeNull(); // 未入力は「まだやっていない」であって0ではない
  });

  it("前回の rir が空文字でも Watch には null で送る(Swift 側は Int? なので文字列だとデコードごと失敗する)", () => {
    const { buildWatchSnapshot } = load();
    const snap = buildWatchSnapshot({
      now: 1, labels: LABELS, fmtW,
      exercises: [bench([{ weight: "80", reps: "8", rir: "", warmup: false }], [{ weight: 80, reps: 8, rir: "" }])],
    });
    expect(snap.exercises[0].sets[0].prev.rir).toBeNull();
  });

  it("前回の補助付きセットは補助の印を付ける", () => {
    const { buildWatchSnapshot } = load();
    const snap = buildWatchSnapshot({
      now: 1, labels: LABELS, fmtW,
      exercises: [bench([{ weight: "0", reps: "8", rir: "", warmup: false }], [{ weight: 0, reps: 8, rir: 0, assisted: true }])],
    });
    expect(snap.exercises[0].sets[0].prev.text).toBe("補助0kg×8 RIR0");
  });

  it("前回の重量は表示単位に換算してから載せる(Watch 側では換算しない)", () => {
    const { buildWatchSnapshot } = load();
    const lb = (kg) => String(Math.round((kg / 0.45359237) * 2) / 2);
    const ex = { ...bench([{ weight: "135", reps: "5", rir: "", warmup: false }], [{ weight: 61.235, reps: 5, rir: 1 }]), unit: "lb" };
    const snap = buildWatchSnapshot({ now: 1, labels: LABELS, fmtW: lb, exercises: [ex] });
    expect(snap.exercises[0].sets[0].prev.weight).toBe("135");
    expect(snap.exercises[0].sets[0].prev.text).toBe("135lb×5 RIR1");
  });

  it("合流済みの opId は直近の分だけ載せる", () => {
    const { buildWatchSnapshot, WATCH_APPLIED_KEEP } = load();
    const applied = Array.from({ length: WATCH_APPLIED_KEEP + 5 }, (_, i) => `op${i}`);
    const snap = buildWatchSnapshot({ now: 1, labels: LABELS, fmtW, applied });
    expect(snap.applied).toHaveLength(WATCH_APPLIED_KEEP);
    expect(snap.applied.at(-1)).toBe(`op${WATCH_APPLIED_KEEP + 4}`);
  });
});

describe("Watch のワークアウトとの対応付け", () => {
  it("recordStartAt は記録(startAt)が続く間は種目が0件でも載せる。lastSaved はいつでも載せる", () => {
    const { buildWatchSnapshot } = load();
    const lastSaved = { key: "2026-09-28T00:00:00.000Z", startAt: 1, endAt: 2 };
    const active = buildWatchSnapshot({ now: 1, labels: LABELS, fmtW, exercises: [bench([])], recordStartAt: 100, lastSaved });
    expect(active.recordStartAt).toBe(100);
    expect(active.lastSaved).toEqual(lastSaved);
    // 最後の種目を消して差し替える途中: Watch がワークアウトを破棄しないよう、記録は続いていると伝える
    const emptied = buildWatchSnapshot({ now: 1, labels: LABELS, fmtW, recordStartAt: 100, lastSaved });
    expect(emptied.state).toBe("idle");
    expect(emptied.recordStartAt).toBe(100);
    // 保存・破棄の後(startAt が null): Watch に「記録は終わった」と分かる
    expect(buildWatchSnapshot({ now: 1, labels: LABELS, fmtW, lastSaved }).recordStartAt).toBeNull();
  });

  it("watchWorkoutFromOps は開始の知らせのうち一番新しい記録を返す", () => {
    const { watchWorkoutFromOps } = load();
    expect(watchWorkoutFromOps([])).toBeNull();
    expect(watchWorkoutFromOps([
      { opId: "a", kind: "set", exId: "e1", setIndex: 0, at: 5 },
      { opId: "b", kind: "workout", status: "started", recordStartAt: 100, at: 1 },
      { opId: "c", kind: "workout", status: "started", recordStartAt: 200, at: 2 },
    ])).toBe(200);
    expect(watchWorkoutFromOps([{ opId: "d", kind: "workout", status: "failed", recordStartAt: 300, at: 3 }])).toBeNull();
  });

  it("watchWorkoutStopped はその記録の破棄の知らせだけを拾う", () => {
    const { watchWorkoutStopped } = load();
    const discarded = (r) => ({ opId: "x" + r, kind: "workout", status: "discarded", recordStartAt: r, at: 1 });
    expect(watchWorkoutStopped([discarded(100)], 100)).toBe(true);
    // 前の記録の破棄(遅れて届いた)では、今の記録を止めたことにしない
    expect(watchWorkoutStopped([discarded(50)], 100)).toBe(false);
    // 開始・保存の知らせ、セットの操作は破棄ではない
    expect(watchWorkoutStopped([
      { opId: "s", kind: "workout", status: "started", recordStartAt: 100, at: 1 },
      { opId: "v", kind: "workout", status: "saved", recordStartAt: 100, at: 2 },
      { opId: "a", kind: "set", exId: "e1", setIndex: 0, at: 3 },
    ], 100)).toBe(false);
    // 記録していない(startAt が null)
    expect(watchWorkoutStopped([discarded(100)], null)).toBe(false);
    expect(watchWorkoutStopped(undefined, 100)).toBe(false);
  });

  it("applyWatchOps はワークアウトの知らせで行を触らず、合流済みにだけ数える", () => {
    const { applyWatchOps } = load();
    const t = [{ id: "e1", name: "x", sets: [{ weight: "80", reps: "8", rir: "", warmup: false }] }];
    const r = applyWatchOps(t, [{ opId: "w", kind: "workout", status: "started", recordStartAt: 1, exId: "", setIndex: 0, at: 1 }]);
    expect(r.today).toBe(t);
    expect(r.applied).toEqual(["w"]);
    expect(r.restStartAt).toBeNull();
  });
});

describe("settleWatchHealth(Watch に任せたヘルスケアの書き込みを締める)", () => {
  const pend = (o) => ({ recordStartAt: 100, startAt: "2026-09-28T00:00:00.000Z", endAt: "2026-09-28T00:40:00.000Z", savedAt: 1000, ...o });
  const op = (status, recordStartAt = 100) => ({ opId: status, kind: "workout", status, recordStartAt, at: 1 });

  it("Watch が保存できたら外すだけ(iPhone は書かない)", () => {
    const { settleWatchHealth } = load();
    expect(settleWatchHealth([pend()], [op("saved")], 2000)).toEqual({ keep: [], write: [] });
  });

  it("Watch が破棄した(保存に失敗した)ら iPhone が時刻だけ書く", () => {
    const { settleWatchHealth } = load();
    const r = settleWatchHealth([pend()], [op("discarded")], 2000);
    expect(r.keep).toEqual([]);
    expect(r.write).toEqual([{ startAt: "2026-09-28T00:00:00.000Z", endAt: "2026-09-28T00:40:00.000Z" }]);
  });

  it("返事が無いうちは残し、1時間を過ぎたら iPhone が書く(Watch のアプリが落ちた・届かない)", () => {
    const { settleWatchHealth, WATCH_HEALTH_CONFIRM_MS } = load();
    expect(settleWatchHealth([pend()], [], 1000 + WATCH_HEALTH_CONFIRM_MS).keep).toHaveLength(1);
    const late = settleWatchHealth([pend()], [], 1000 + WATCH_HEALTH_CONFIRM_MS + 1);
    expect(late.keep).toEqual([]);
    expect(late.write).toHaveLength(1);
  });

  it("別の記録の知らせでは締めない", () => {
    const { settleWatchHealth } = load();
    const r = settleWatchHealth([pend()], [op("saved", 999), op("discarded", 998)], 2000);
    expect(r.keep).toHaveLength(1);
    expect(r.write).toEqual([]);
  });
});

describe("watchWeightStep", () => {
  it("Watch の重量の刻みは種目によらず kg なら 1、lb なら 2.5", () => {
    const { watchWeightStep } = load();
    expect(watchWeightStep("kg")).toBe(1);
    expect(watchWeightStep("lb")).toBe(2.5);
    expect(watchWeightStep(undefined)).toBe(1);
  });
});

describe("applyWatchOps", () => {
  const today = () => [
    { id: "e1", name: "ベンチプレス", sets: [
      { weight: "40", reps: "10", rir: "", warmup: true },
      { weight: "80", reps: "8", rir: "", warmup: false, assisted: true },
    ] },
    { id: "e2", name: "ディップス", sets: [{ weight: "10", reps: "8", rir: "", warmup: false }] },
  ];
  const op = (o) => ({ opId: "x", kind: "set", exId: "e1", setIndex: 1, weight: "80", reps: "8", rir: 2, restStartAt: null, at: 1, ...o });

  it("既存のセットを書き換え、ほかのフィールドは残す", () => {
    const { applyWatchOps } = load();
    const t = today();
    const r = applyWatchOps(t, [op({ weight: "82.5", reps: "7" })]);
    expect(r.today[0].sets[1]).toEqual({ weight: "82.5", reps: "7", rir: 2, warmup: false, assisted: true });
    expect(r.applied).toEqual(["x"]);
    expect(t[0].sets[1].rir).toBe(""); // 元の配列は書き換えない(setToday の関数形式で使うため)
    expect(r.today[1]).toBe(t[1]); // 触っていない種目は同じ参照
  });

  it("行の追加は直前の行を複製する(補助の印を引き継ぐ)。RIR 未入力は空文字(未実施)にする", () => {
    const { applyWatchOps } = load();
    const r = applyWatchOps(today(), [op({ kind: "add", setIndex: 2, rir: null })]);
    expect(r.today[0].sets).toHaveLength(3);
    expect(r.today[0].sets[2]).toEqual({ weight: "80", reps: "8", rir: "", warmup: false, assisted: true });
  });

  it("消えた種目への op は捨てて合流済みに数え、行が飛んでいる op は保留にする", () => {
    const { applyWatchOps } = load();
    const t = today();
    const r = applyWatchOps(t, [op({ opId: "a", setIndex: 5 }), op({ opId: "b", exId: "gone" })]);
    expect(r.today).toBe(t);
    expect(r.applied).toEqual(["b"]); // ack してキューから消す
    expect(r.deferred).toEqual(["a"]); // キューに残し、間の行が届いてから適用する
  });

  // Watch は届けば sendMessage、届かなければ transferUserInfo で送るので、到着順は入れ替わる
  it("追加より先に確定が届いても、RIR が消えない", () => {
    const { applyWatchOps } = load();
    const add = op({ opId: "A", kind: "add", setIndex: 2, rir: null, at: 1 });
    const set = op({ opId: "B", kind: "set", setIndex: 2, rir: 1, at: 2 });
    // 別々の読み込みで B → A の順に届いた
    const r1 = applyWatchOps(today(), [set]);
    const r2 = applyWatchOps(r1.today, [add], r1.applied);
    expect(r2.today[0].sets).toHaveLength(3);
    expect(r2.today[0].sets[2].rir).toBe(1);
  });

  it("同じ読み込みの中では作成時刻順に適用する(追加2回 → 2行目を確定、が逆順に届いても)", () => {
    const { applyWatchOps } = load();
    const ops = [
      op({ opId: "C", kind: "set", setIndex: 3, rir: 0, at: 3 }),
      op({ opId: "B", kind: "add", setIndex: 3, rir: null, at: 2 }),
      op({ opId: "A", kind: "add", setIndex: 2, rir: null, at: 1 }),
    ];
    const r = applyWatchOps(today(), ops);
    expect(r.today[0].sets).toHaveLength(4);
    expect(r.today[0].sets[3].rir).toBe(0);
    expect(r.deferred).toEqual([]);
  });

  it("別の読み込みで先に届いた確定は、保留の後で適用される", () => {
    const { applyWatchOps } = load();
    const late = op({ opId: "C", kind: "set", setIndex: 3, rir: 0, at: 3 });
    const r1 = applyWatchOps(today(), [late]);
    expect(r1.deferred).toEqual(["C"]);
    // 合流済みには数えないので、次の読み込みでも C はキューから渡される
    const r2 = applyWatchOps(r1.today, [
      op({ opId: "A", kind: "add", setIndex: 2, rir: null, at: 1 }),
      op({ opId: "B", kind: "add", setIndex: 3, rir: null, at: 2 }),
      late,
    ], r1.applied);
    expect(r2.today[0].sets).toHaveLength(4);
    expect(r2.today[0].sets[3].rir).toBe(0);
  });

  it("捨てた・保留にした op の休憩は返さない", () => {
    const { applyWatchOps } = load();
    const r = applyWatchOps(today(), [op({ opId: "a", exId: "gone", restStartAt: 500 }), op({ opId: "b", setIndex: 9, restStartAt: 600 })]);
    expect(r.restStartAt).toBeNull();
  });

  it("下書きに記録済みの op と、同じ呼び出し内の重複は二度適用しない", () => {
    const { applyWatchOps } = load();
    const r = applyWatchOps(today(), [op({ opId: "old", rir: 0 }), op({ opId: "new", setIndex: 2 }), op({ opId: "new", setIndex: 2 })], ["old"]);
    expect(r.today[0].sets[1].rir).toBe("");
    expect(r.today[0].sets).toHaveLength(3);
    expect(r.applied).toEqual(["new"]);
    // (old は既知、new の2つ目は同じ呼び出し内の重複)
  });

  it("休憩は一番新しい開始時刻を返す。休憩を始める op が無ければ null", () => {
    const { applyWatchOps } = load();
    expect(applyWatchOps(today(), [op({ opId: "a", restStartAt: 200 }), op({ opId: "b", restStartAt: 100 })]).restStartAt).toBe(200);
    expect(applyWatchOps(today(), [op({})]).restStartAt).toBeNull();
  });

  it("順に適用する(同じセットへの後の op が勝つ)", () => {
    const { applyWatchOps } = load();
    const r = applyWatchOps(today(), [op({ opId: "a", rir: 1 }), op({ opId: "b", rir: 3 })]);
    expect(r.today[0].sets[1].rir).toBe(3);
  });
});

describe("Web 版では何もしない", () => {
  it("プラグインが無ければ peek は空、他は例外を出さない", async () => {
    const m = load();
    expect(await m.peekWatchOps()).toEqual([]);
    await expect(m.syncWatchSnapshot({})).resolves.toBeUndefined();
    await expect(m.ackWatchOps(["a"])).resolves.toBeUndefined();
    expect(() => m.onWatchOps(() => {}).remove()).not.toThrow();
  });
});

describe("ネイティブ版", () => {
  const native = (plugin) => load({ window: { Capacitor: { isNativePlatform: () => true, Plugins: { Watch: plugin } } } });

  it("キューの JSON を読み、壊れた行は捨てる", async () => {
    const m = native({ pendingOps: async () => ({ ops: ['{"opId":"a"}', "not json"] }) });
    expect(await m.peekWatchOps()).toEqual([{ opId: "a" }]);
  });

  it("スナップショットは JSON 文字列で渡す", async () => {
    const calls = [];
    const m = native({ updateSnapshot: async (a) => { calls.push(a); } });
    await m.syncWatchSnapshot({ v: 1 });
    expect(calls).toEqual([{ snapshot: '{"v":1}' }]);
  });

  it("ack は空なら呼ばない", async () => {
    const calls = [];
    const m = native({ ackOps: async (a) => { calls.push(a); } });
    await m.ackWatchOps([]);
    await m.ackWatchOps(["a"]);
    expect(calls).toEqual([{ opIds: ["a"] }]);
  });
});

// Archive・アップロード・実機で初めて表面化する設定(Watch ターゲットは xcodeproj gem で追加した)。
// 版番号の一致は restNotifications.test.js の「拡張の版番号がAppと一致」が全ターゲットまとめて縛っている。
describe("Watch アプリのネイティブ設定", () => {
  const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf-8");

  it("WatchPlugin を明示的に登録し、WCSession は WebView を待たずに起動時に有効化する", () => {
    expect(read("ios/App/App/BridgeViewController.swift")).toContain("registerPluginInstance(WatchPlugin())");
    expect(read("ios/App/App/AppDelegate.swift")).toContain("WatchSessionManager.shared.activate()");
  });

  it("Bundle ID が iPhone アプリの接頭辞を持ち、companion が iPhone アプリを指す", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx).toContain("PRODUCT_BUNDLE_IDENTIFIER = com.hajime5150.kurabellplus.watchkitapp;");
    expect(pbx).toContain("INFOPLIST_KEY_WKCompanionAppBundleIdentifier = com.hajime5150.kurabellplus;");
    expect(pbx).toContain("SDKROOT = watchos;");
  });

  it("App の Watch フォルダに埋め込み、[CP] Embed Pods Frameworks より前に置く", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx).toContain("KurabellWatch.app in Embed Watch Content");
    expect(pbx).toMatch(/dstPath = "\$\(CONTENTS_FOLDER_PATH\)\/Watch";/);
    const phases = pbx.match(/buildPhases = \(([^)]*Embed Watch Content[^)]*)\)/)[1];
    expect(phases.indexOf("Embed Watch Content")).toBeLessThan(phases.indexOf("[CP] Embed Pods Frameworks"));
  });

  it("入力に Digital Crown を使わない(ジムで回しにくく、誤って回るため。docs/Watchアプリ.md)", () => {
    expect(read("ios/App/KurabellWatch/Views.swift")).not.toContain("digitalCrownRotation");
  });

  it("Watch のボタンは面全体を押せる(.plain に外から background を付けると線しか反応しない)", () => {
    const views = read("ios/App/KurabellWatch/Views.swift");
    expect(views).not.toMatch(/\.buttonStyle\(\.plain\)\s*\n\s*\.background/);
    expect(views).toContain(".contentShape(shape)");
  });

  it("−/+ は触れた瞬間に反応し、入力画面はスクロールで包まない(包むとボタンの反応が遅れる)", () => {
    const views = read("ios/App/KurabellWatch/Views.swift");
    const pad = views.slice(views.indexOf("private struct StepPad"));
    expect(pad).toContain("DragGesture(minimumDistance: 0)");
    expect(pad).toContain("@GestureState private var pressed"); // 取り消されても押しっぱなしにならない
    const editor = views.slice(views.indexOf("private var editor: some View"), views.indexOf(".onAppear {", views.indexOf("private var editor: some View")));
    expect(editor).not.toMatch(/ScrollView\s*\{/); // コメントで名前を挙げるのは可
  });

  it("iPhone から起動されたワークアウトを受けられる(HealthKit・バックグラウンド・利用目的の文言)", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx).toContain("CODE_SIGN_ENTITLEMENTS = KurabellWatch/KurabellWatch.entitlements;");
    expect(read("ios/App/KurabellWatch/KurabellWatch.entitlements")).toMatch(/<key>com\.apple\.developer\.healthkit<\/key>\s*<true\/>/);
    // WKBackgroundModes はビルド設定(INFOPLIST_KEY_*)では入らないので、Info.plist に書いている
    expect(pbx).toContain("INFOPLIST_FILE = KurabellWatch/Info.plist;");
    expect(read("ios/App/KurabellWatch/Info.plist")).toMatch(/<key>WKBackgroundModes<\/key>\s*<array>\s*<string>workout-processing<\/string>/);
    // 利用目的の文言が無いと、権限を求めた時点でクラッシュする
    expect(pbx).toContain("INFOPLIST_KEY_NSHealthShareUsageDescription");
    expect(pbx).toContain("INFOPLIST_KEY_NSHealthUpdateUsageDescription");
    const ja = read("ios/App/KurabellWatch/ja.lproj/InfoPlist.strings");
    expect(ja).toContain('"NSHealthShareUsageDescription"');
    expect(ja).toContain('"NSHealthUpdateUsageDescription"');
    // 起動の受け口
    expect(read("ios/App/KurabellWatch/KurabellWatchApp.swift")).toContain("func handle(_ workoutConfiguration: HKWorkoutConfiguration)");
  });

  it("Watch が保存するワークアウトの syncIdentifier は iPhone と同じ形(履歴の削除で iPhone から消せるように)", () => {
    const wm = read("ios/App/KurabellWatch/WorkoutManager.swift");
    const hm = read("ios/App/App/Health/HealthManager.swift");
    expect(wm).toContain('"kurabell-workout-\\(key)"');
    expect(hm).toContain('"kurabell-workout-\\(key)"');
  });

  it("pbxproj が特定の SDK のパスに依存していない(Xcode の更新で参照が壊れる)", () => {
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx).not.toMatch(/SDKs\/\w+\d+\.\d+\.sdk/);
  });

  it("Watch と iPhone で op・スナップショットのキー名がそろっている", () => {
    const store = read("ios/App/KurabellWatch/SessionStore.swift");
    const mgr = read("ios/App/App/Watch/WatchSessionManager.swift");
    expect(store).toContain('let payload: [String: Any] = ["op": json, "opId": op.opId]');
    expect(mgr).toContain('payload["op"]');
    expect(mgr).toContain('payload["opId"]');
    // sendMessage と transferUserInfo のどちらで届いても同じ受け口に入る
    expect(mgr).toContain("didReceiveMessage message: [String: Any]) {\n        receiveOp(message)");
    expect(mgr).toContain("didReceiveUserInfo userInfo: [String: Any] = [:]) {\n        receiveOp(userInfo)");
    expect(mgr).toContain('updateApplicationContext(["snapshot": json])');
    expect(store).toContain('context["snapshot"]');
  });
});

// index.html(#appsrc)はテストで実行されないので、「宣言より前でrefを使う」TDZは起動するまで分からない
// (v122の実装中に「Cannot access 'startAtRef' before initialization」で起動できなくなった)。
// コンポーネント直下(2字下げ)の `xxxRef.current = ...` は、その ref の宣言より後に書かれていること。
describe("index.html のrefの宣言順", () => {
  it("コンポーネント直下で ref に代入する行は、その ref の useRef 宣言より後にある", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
    const assigns = [...html.matchAll(/^ {2}(\w+Ref)\.current = /gm)];
    expect(assigns.length).toBeGreaterThan(0);
    for (const m of assigns) {
      const decl = html.search(new RegExp(`^ {2}const ${m[1]} = useRef\\(`, "m"));
      expect(decl, `${m[1]} の宣言が見つからない`).toBeGreaterThanOrEqual(0);
      expect(decl, `${m[1]} を宣言より前で使っている`).toBeLessThan(m.index);
    }
  });
});
