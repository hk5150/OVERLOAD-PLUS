import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

const { resolveCoefficients, absorbBuiltinNameClash, backfillBwFactor, BW_BACKFILL_NAMES, beforeLegBw } = loadDomainModule("src/domain/coefficients.js");

// v102で実際に踏んだ2つのバグクラスを縛る。どちらも「記録として保存されてしまう」種類で、
// 種目マスターの値だけを検査する tests/exerciseCoefficients.test.js では捕まらなかった。

// findExercise 相当。allExercises(内蔵 + カスタム に上書きをマージ済み)を引く。
const makeLookup = ({ builtin = [], custom = [], overrides = {} } = {}) => {
  const all = [...builtin, ...custom].map(e => ({ ...e, ...(overrides[e.n] || {}) }));
  return (name) => all.find(e => e.n === name) || null;
};

const SHRUG = { n: "バーベルシュラッグ", m: "僧帽筋", rom: 0.3 };
const PUSHUP = { n: "プッシュアップ", m: "大胸筋", bw: 0.7 };

describe("係数の解決", () => {
  it("種目マスターの既定値を返す", () => {
    const lookup = makeLookup({ builtin: [SHRUG, PUSHUP] });
    expect(resolveCoefficients("バーベルシュラッグ", lookup).rom).toBe(0.3);
    expect(resolveCoefficients("プッシュアップ", lookup).bwFactor).toBe(0.7);
  });

  it("ユーザーの上書きが種目マスターより優先される", () => {
    const lookup = makeLookup({ builtin: [SHRUG], overrides: { "バーベルシュラッグ": { rom: 0.55 } } });
    expect(resolveCoefficients("バーベルシュラッグ", lookup).rom).toBe(0.55);
  });

  it("カスタム種目の体重係数が失われない", () => {
    // 索引にカスタム種目を含めない実装(dbLookup相当)にすると、自重のカスタム種目が
    // bwFactor:0 になり、実効重量もボリュームも0のまま記録されてしまう。
    const lookup = makeLookup({ builtin: [SHRUG], custom: [{ n: "自作の自重種目", m: "腹筋", bw: 0.45 }] });
    expect(resolveCoefficients("自作の自重種目", lookup).bwFactor).toBe(0.45);
  });

  it("カスタム種目にもユーザーの上書きが効く", () => {
    const lookup = makeLookup({
      custom: [{ n: "自作の自重種目", m: "腹筋", bw: 0.45 }],
      overrides: { "自作の自重種目": { bw: 0.6 } },
    });
    expect(resolveCoefficients("自作の自重種目", lookup).bwFactor).toBe(0.6);
  });

  it("索引に無い種目は素通しの既定値(rom=1.0 / bw=0)", () => {
    const lookup = makeLookup({ builtin: [SHRUG] });
    expect(resolveCoefficients("知らない種目", lookup)).toEqual({ bwFactor: 0, rom: 1.0 });
  });

  it("係数を持たない種目は減点も自重加算もされない", () => {
    const lookup = makeLookup({ builtin: [{ n: "バーベルベンチプレス", m: "大胸筋" }] });
    expect(resolveCoefficients("バーベルベンチプレス", lookup)).toEqual({ bwFactor: 0, rom: 1.0 });
  });

  it("記録側のスナップショットを受け取る口を持たない", () => {
    // 引数は (name, lookup) の2つだけ。過去の記録の値を渡せてしまうと、
    // saveWorkoutが毎回書き戻すのと相まって古い値が自己増殖し、
    // 種目マスターの更新が一度記録した種目に永久に届かなくなる。
    expect(resolveCoefficients.length).toBe(2);
  });
});

// absorbBuiltinNameClash: 内蔵種目と同じ名前のカスタム種目を、内蔵種目への上書き(exerciseOverrides)に移す。
// 2026-10 に内蔵へ19種目(ヒップアダクション・チンアップ・片手ケーブルロウなど)を足したことで、
// 同じ名前で作っていたカスタム種目が一覧に2行出て、しかも設定画面の編集はカスタム側を書くのに
// 計算は内蔵側を見るので「直しても効かない」状態になる。それを読み込み・復元・復元の取り消しで解消する。
// 上書きに入れるのは内蔵の既定と違う項目だけ。同じ値まで書くと、以後マスターの更新が届かなくなる
// (上の v102 と同じ自己固定。docs/係数の根拠.md の落とし穴3)。
// 対象外: 記録側(workouts)の種目名・係数のスナップショットは触らない関数なので、ここでも見ない。

// 内蔵種目の定義(index.html の EXERCISE_DB の該当行と同じ値)
const BUILTIN = {
  "片手ケーブルロウ": { n: "片手ケーブルロウ", m: "広背筋", eq: "ケーブル", t: "C", db: true },
  "チンアップ": { n: "チンアップ", m: "広背筋", eq: "自重", t: "C", bw: 1.0 },
  "ヒップスラストマシン": { n: "ヒップスラストマシン", m: "臀部", eq: "マシン", t: "C", rom: 0.7 },
};
const master = (n) => BUILTIN[n] || null;
const sampleCustom = (overrides = {}) => ({ n: "片手ケーブルロウ", m: "広背筋", eq: "ケーブル", ...overrides });

describe("absorbBuiltinNameClash(内蔵と同名のカスタム種目を上書きに移す。漏れると一覧に2行出て、編集が効かない)", () => {
  it("内蔵と同名のカスタム種目は customExercises から消え、同名でないものは元の順序のまま残る", () => {
    const customs = [
      { n: "自作プレスA", m: "大胸筋", eq: "マシン" },
      sampleCustom(),
      { n: "自作ロウB", m: "広背筋", eq: "ケーブル" },
      { n: "チンアップ", m: "広背筋", eq: "自重", bw: 1.0 },
      { n: "自作カールC", m: "上腕二頭筋", eq: "ダンベル", db: true },
    ];
    const out = absorbBuiltinNameClash(customs, {}, master);
    expect(out.customExercises.map(c => c.n)).toEqual(["自作プレスA", "自作ロウB", "自作カールC"]);
  });

  it("カスタムの「片手ケーブルロウ」(ケーブル・db なし)は { db: false } だけを上書きに入れる", () => {
    const out = absorbBuiltinNameClash([sampleCustom()], {}, master);
    expect(out.exerciseOverrides).toEqual({ "片手ケーブルロウ": { db: false } });
  });

  it("内蔵の既定と違う m・eq・db・bw・rom を上書きに入れる", () => {
    const custom = { n: "ヒップスラストマシン", m: "ハムストリングス", eq: "スミス", db: true, bw: 0.3, rom: 0.5 };
    const out = absorbBuiltinNameClash([custom], {}, master);
    expect(out.exerciseOverrides).toEqual({ "ヒップスラストマシン": { m: "ハムストリングス", eq: "スミス", db: true, bw: 0.3, rom: 0.5 } });
  });

  it("内蔵の既定とすべて同じなら、上書きを書かない", () => {
    const out = absorbBuiltinNameClash([{ n: "チンアップ", m: "広背筋", eq: "自重", bw: 1.0 }], {}, master);
    expect(out.customExercises).toEqual([]);
    expect(out.exerciseOverrides).toEqual({});
  });

  it("内蔵が bw を持つ種目で、カスタム側に bw が無ければ bw: 0 を上書きに入れる", () => {
    const out = absorbBuiltinNameClash([{ n: "チンアップ", m: "広背筋", eq: "自重" }], {}, master);
    expect(out.exerciseOverrides).toEqual({ "チンアップ": { bw: 0 } });
  });

  it("rom はカスタム側に無ければ書かず、内蔵が rom を持たないときの 1.0 は既定と同じとみなす", () => {
    const noRom = absorbBuiltinNameClash([{ n: "ヒップスラストマシン", m: "臀部", eq: "マシン" }], {}, master);
    expect(noRom.exerciseOverrides).toEqual({});
    const romOne = absorbBuiltinNameClash([sampleCustom({ db: true, rom: 1.0 })], {}, master);
    expect(romOne.exerciseOverrides).toEqual({});
  });

  it("既存の上書きがある項目は、既存の上書きが勝つ", () => {
    const custom = sampleCustom({ eq: "マシン" }); // eq と db の両方が既定と違う
    const out = absorbBuiltinNameClash([custom], { "片手ケーブルロウ": { db: true, rom: 0.8 } }, master);
    expect(out.exerciseOverrides).toEqual({ "片手ケーブルロウ": { eq: "マシン", db: true, rom: 0.8 } });
  });

  it("ほかの種目の既存の上書きは残る", () => {
    const ovs = { "バーベルシュラッグ": { rom: 0.55 } };
    const out = absorbBuiltinNameClash([sampleCustom()], ovs, master);
    expect(out.exerciseOverrides["バーベルシュラッグ"]).toEqual({ rom: 0.55 });
  });

  it("衝突が無いときは、受け取った配列と上書きをそのまま(同じ参照で)返す", () => {
    const customs = [{ n: "自作プレスA", m: "大胸筋", eq: "マシン" }];
    const ovs = { "バーベルシュラッグ": { rom: 0.55 } };
    const out = absorbBuiltinNameClash(customs, ovs, master);
    expect(out.customExercises).toBe(customs);
    expect(out.exerciseOverrides).toBe(ovs);
  });

  it("2回通しても結果が同じ", () => {
    const customs = [{ n: "自作プレスA", m: "大胸筋", eq: "マシン" }, sampleCustom({ eq: "マシン" })];
    const once = absorbBuiltinNameClash(customs, { "チンアップ": { bw: 0.9 } }, master);
    const twice = absorbBuiltinNameClash(once.customExercises, once.exerciseOverrides, master);
    expect(twice).toEqual(once);
  });

  it("受け取った配列・上書き・種目を書き換えない", () => {
    const customs = [sampleCustom(), { n: "自作プレスA", m: "大胸筋", eq: "マシン" }];
    const ovs = { "片手ケーブルロウ": { rom: 0.8 } };
    const before = JSON.parse(JSON.stringify({ customs, ovs }));
    absorbBuiltinNameClash(customs, ovs, master);
    expect({ customs, ovs }).toEqual(before);
  });

  it("null や undefined を受けても落ちず、空の結果を返す", () => {
    expect(absorbBuiltinNameClash(null, null, master)).toEqual({ customExercises: [], exerciseOverrides: {} });
    expect(absorbBuiltinNameClash(undefined, undefined, master)).toEqual({ customExercises: [], exerciseOverrides: {} });
    expect(absorbBuiltinNameClash([sampleCustom()], null, master).exerciseOverrides).toEqual({ "片手ケーブルロウ": { db: false } });
  });

  it("配列の中に null が混ざっていても落ちない", () => {
    expect(() => absorbBuiltinNameClash([null, sampleCustom()], {}, master)).not.toThrow();
  });
});

// npm test は index.html を実行しないので、どれか1経路で呼び忘れても単体テストは緑のまま。
// 呼び忘れた経路(例えば復元)を通ると、同名のカスタム種目が戻ってきて一覧に2行出る。
describe("absorbBuiltinNameClash の配線(#appsrc)", () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
  const appsrc = indexHtml.slice(indexHtml.indexOf('id="appsrc"'))
    .split("\n").filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");

  it("migrateCustoms が absorbBuiltinNameClash を DB_BY_NAME で呼んでいる", () => {
    expect(appsrc).toMatch(/const migrateCustoms = [^\n]*absorbBuiltinNameClash\([^\n]*DB_BY_NAME/);
  });

  it("読み込み時に migrateCustoms の結果を setCustomExercises と setExerciseOverrides に渡している", () => {
    const m = appsrc.match(/const (\w+) = migrateCustoms\(p\);([\s\S]{0,400})/);
    expect(m).not.toBe(null);
    const [, v, after] = m;
    expect(after).toContain(`setCustomExercises(${v}.customExercises)`);
    expect(after).toContain(`setExerciseOverrides(${v}.exerciseOverrides)`);
  });

  it("復元と復元の取り消しの2経路が migrateCustoms を通している", () => {
    expect([...appsrc.matchAll(/\.\.\.migrateCustoms\(p\)/g)]).toHaveLength(2);
  });

  it("customExercises / exerciseOverrides を p から直接読む経路が残っていない", () => {
    expect(appsrc).not.toMatch(/setCustomExercises\(p\.customExercises/);
    expect(appsrc).not.toMatch(/customExercises: p\.customExercises/);
    expect(appsrc).not.toMatch(/exerciseOverrides: p\.exerciseOverrides/);
  });
});

// backfillBwFactor: 後から体重係数(bw 0.9)を入れた片脚種目の、それより前の記録に今の係数を入れる。
// docs/係数の根拠.md「片脚種目の推定1RM」の決定(2026-10-26)に対応する。
// 記録には bwFactor: 0 が焼き込まれていて、そのままだと切り替えた日に推定1RMが倍以上に跳ね、
// 自己ベスト・グラフ・ボリュームのゲージが不連続になる。
// これは「記録側の値は当時のまま」(上の resolveCoefficients、v102)の、名前を限った例外。
// 例外が広がると v102 と逆向きの事故(ユーザーが⚙で決めた値や、上書きで 0 にした意思を消す)になるので、
// 「対象外の種目は触らない」「0 より大きい保存値は触らない」「上書きの bw: 0 は尊重する」を縛る。
// どの記録に通すか(この端末で片脚の体重係数の版を初めて開いた時刻より前か)は、下の beforeLegBw が決める。
// 対象外: BW_BACKFILL_NAMES と種目マスターの一致は tests/exerciseCoefficients.test.js が見ている。

// lookup 相当(index.html の builtinWithOverrides と同じ形: 内蔵種目に上書きをマージし、無ければ null)
const LEG_MASTER = {
  "ブルガリアンスクワット": { n: "ブルガリアンスクワット", m: "大腿四頭筋", eq: "ダンベル", db: true, bw: 0.9 },
  "ランジ": { n: "ランジ", m: "大腿四頭筋", eq: "ダンベル", db: true, bw: 0.9 },
  "ステップアップ": { n: "ステップアップ", m: "大腿四頭筋", eq: "ダンベル", db: true, bw: 0.9 },
  "ディップス": { n: "ディップス", m: "大胸筋", eq: "自重", bw: 1.0 },
};
const legLookup = (overrides = {}) => (n) => LEG_MASTER[n] ? { ...LEG_MASTER[n], ...(overrides[n] || {}) } : null;
const sampleExercise = (overrides = {}) => ({
  name: "ブルガリアンスクワット",
  muscle: "大腿四頭筋",
  bwFactor: 0,
  rom: 1.0,
  sets: [{ weight: 12, reps: 10, rir: 2 }],
  ...overrides,
});

describe("backfillBwFactor(片脚種目の古い記録に体重係数を入れる。漏れると切り替えた日に推定1RMが倍以上に跳ねる)", () => {
  it("対象はブルガリアンスクワット・ランジ・ステップアップの3種目", () => {
    expect([...BW_BACKFILL_NAMES].sort()).toEqual(["ステップアップ", "ブルガリアンスクワット", "ランジ"].sort());
  });

  it("対象の3種目とも、bwFactor: 0 の記録に種目マスターの bw が入る", () => {
    for (const name of ["ブルガリアンスクワット", "ランジ", "ステップアップ"]) {
      expect(backfillBwFactor(sampleExercise({ name }), legLookup()).bwFactor).toBe(0.9);
    }
  });

  it("bwFactor が無い記録にも入る", () => {
    const ex = sampleExercise();
    delete ex.bwFactor;
    expect(backfillBwFactor(ex, legLookup()).bwFactor).toBe(0.9);
  });

  it("bwFactor が文字列の \"0\" の記録にも入る", () => {
    expect(backfillBwFactor(sampleExercise({ bwFactor: "0" }), legLookup()).bwFactor).toBe(0.9);
  });

  it("bwFactor 以外の項目(名前・部位・rom・セット)は変えない", () => {
    const ex = sampleExercise();
    const out = backfillBwFactor(ex, legLookup());
    expect(out).toEqual({ ...ex, bwFactor: 0.9 });
  });

  it("入れるのはユーザーの上書き込みの値", () => {
    const out = backfillBwFactor(sampleExercise(), legLookup({ "ブルガリアンスクワット": { bw: 0.8 } }));
    expect(out.bwFactor).toBe(0.8);
  });

  it("書き換えるときは新しいオブジェクトを返し、受け取った記録は変えない", () => {
    const ex = sampleExercise();
    const before = JSON.parse(JSON.stringify(ex));
    const out = backfillBwFactor(ex, legLookup());
    expect(out).not.toBe(ex);
    expect(ex).toEqual(before);
  });

  it("0 より大きい保存値(⚙で自重種目にしていた日の 0.7)は、マスターと違ってもそのまま返す", () => {
    const ex = sampleExercise({ bwFactor: 0.7 });
    expect(backfillBwFactor(ex, legLookup())).toBe(ex);
  });

  it("0 より大きい保存値が文字列(\"0.7\")でもそのまま返す", () => {
    const ex = sampleExercise({ bwFactor: "0.7" });
    expect(backfillBwFactor(ex, legLookup())).toBe(ex);
  });

  it("上書きで bw: 0 にしている人の記録は 0 のまま(同じオブジェクトを返す)", () => {
    const ex = sampleExercise();
    const out = backfillBwFactor(ex, legLookup({ "ブルガリアンスクワット": { bw: 0 } }));
    expect(out).toBe(ex);
    expect(out.bwFactor).toBe(0);
  });

  it("lookup が null を返すときは変えない", () => {
    const ex = sampleExercise();
    expect(backfillBwFactor(ex, () => null)).toBe(ex);
  });

  it("lookup の結果に bw が無いときは変えない", () => {
    const ex = sampleExercise();
    expect(backfillBwFactor(ex, () => ({ n: "ブルガリアンスクワット", m: "大腿四頭筋" }))).toBe(ex);
  });

  it("対象外の種目は、bwFactor: 0 でマスターが bw を持っていても同じオブジェクトをそのまま返す", () => {
    // ディップスなど他の自重種目の古い記録は「当時のまま」の原則どおり触らない
    const ex = sampleExercise({ name: "ディップス", muscle: "大胸筋" });
    expect(backfillBwFactor(ex, legLookup())).toBe(ex);
  });

  it("名前が似ているだけの種目(ブルガリアンスプリットスクワット・カスタムの「ランジ(自作)」)は対象外", () => {
    const lookup = () => ({ bw: 0.9 });
    const a = sampleExercise({ name: "ブルガリアンスプリットスクワット" });
    const b = sampleExercise({ name: "ランジ(自作)" });
    expect(backfillBwFactor(a, lookup)).toBe(a);
    expect(backfillBwFactor(b, lookup)).toBe(b);
  });

  it("2回通しても結果が同じ", () => {
    const lookup = legLookup();
    const exs = [
      sampleExercise(),
      sampleExercise({ name: "ランジ", bwFactor: 0.7 }),
      sampleExercise({ name: "ステップアップ", bwFactor: undefined }),
      sampleExercise({ name: "ディップス", bwFactor: 0 }),
    ];
    const once = exs.map(ex => backfillBwFactor(ex, lookup));
    const twice = once.map(ex => backfillBwFactor(ex, lookup));
    expect(twice).toEqual(once);
  });

  it("null や undefined を受けても落ちず、そのまま返す", () => {
    expect(backfillBwFactor(null, legLookup())).toBe(null);
    expect(backfillBwFactor(undefined, legLookup())).toBe(undefined);
  });
});

// beforeLegBw: 記録の日時が、この端末で片脚の体重係数の版を初めて開いた時刻(LEG_BW_SINCE_KEY)より前か。
// 保存値 0 には「変更前の記録」と「変更後に⚙で自重を外した日の記録」の2つの意味がある。
// 後者まで毎回の読み込みで今の係数に書き換えると、⚙で付け直した日や「元に戻す」の後に、
// 外していた日の1RMが体重の分だけ跳ねる(レビューの指摘で backfillBwFactor の前段に足した)。
// 時刻が無い・読めないときは「前」(=揃える)に倒す。揃え損ねると推定1RMが倍以上に跳ねるほうが被害が大きいため。
const SINCE = "2026-10-26T09:00:00.000Z";

describe("beforeLegBw(どの記録に体重係数を入れるかの線。ずれると⚙で外した日の記録まで書き換わる)", () => {
  it("since より前の記録は true", () => {
    expect(beforeLegBw("2026-10-25T20:00:00.000Z", SINCE)).toBe(true);
    expect(beforeLegBw("2026-10-26T08:59:59.999Z", SINCE)).toBe(true);
  });

  it("since とちょうど同じ時刻の記録は false(後とみなす)", () => {
    expect(beforeLegBw(SINCE, SINCE)).toBe(false);
  });

  it("since より後の記録は false", () => {
    expect(beforeLegBw("2026-10-26T09:00:00.001Z", SINCE)).toBe(false);
    expect(beforeLegBw("2026-11-01T10:00:00.000Z", SINCE)).toBe(false);
  });

  it("タイムゾーンの書き方が違っても、同じ時点どうしで比べる", () => {
    // 2026-10-26T18:30:00+09:00 は 09:30Z なので since より後
    expect(beforeLegBw("2026-10-26T18:30:00+09:00", SINCE)).toBe(false);
    // 2026-10-26T17:30:00+09:00 は 08:30Z なので since より前
    expect(beforeLegBw("2026-10-26T17:30:00+09:00", SINCE)).toBe(true);
  });

  it("since が無い(null・undefined・空文字)ときは、記録の日時によらず true", () => {
    for (const since of [null, undefined, ""]) {
      expect(beforeLegBw("2030-01-01T00:00:00.000Z", since)).toBe(true);
      expect(beforeLegBw("2020-01-01T00:00:00.000Z", since)).toBe(true);
    }
  });

  it("記録の日時が読めない(null・undefined・空文字・壊れた文字列)ときは true", () => {
    for (const date of [null, undefined, "", "not-a-date"]) {
      expect(beforeLegBw(date, SINCE)).toBe(true);
    }
  });

  it("since が読めない文字列のときは true", () => {
    expect(beforeLegBw("2030-01-01T00:00:00.000Z", "broken")).toBe(true);
  });
});

// npm test は index.html を実行しないので、どれか1経路で通し忘れても単体テストは緑のまま。
// 通し忘れた経路(例えば復元)を通ると、その経路から来た記録だけ bwFactor: 0 のまま残り、
// 画面ごと・経路ごとに推定1RMが食い違う。上書きを渡し忘れると、上書きで bw: 0 にした人の記録にも 0.9 が入る。
// since を渡し忘れると beforeLegBw が常に true になり、変更後に⚙で自重を外した日の記録まで毎回書き換わる。
describe("backfillBwFactor の配線(#appsrc)", () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
  const appsrc = indexHtml.slice(indexHtml.indexOf('id="appsrc"'))
    .split("\n").filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
  const migrateBody = () => {
    const m = appsrc.match(/const migrateWorkouts = \(ws, overrides, since\) => \{([\s\S]*?)\n\};/);
    expect(m).not.toBe(null);
    return m[1];
  };
  // 読み込みで LEG_BW_SINCE_KEY から読んだ変数と、それを入れる ref の名前
  const sinceNames = () => {
    const v = appsrc.match(/(\w+) = \(await store\.get\(LEG_BW_SINCE_KEY\)\)/);
    expect(v).not.toBe(null);
    const ref = appsrc.match(new RegExp(`(\\w+)\\.current = ${v[1]};`));
    expect(ref).not.toBe(null);
    return { since: v[1], ref: ref[1] };
  };
  // migrateWorkouts の呼び出し(定義を除く)を、引数の文字列の配列にして返す
  const migrateCalls = () => {
    const calls = [];
    const re = /(?<!const )\bmigrateWorkouts\(/g;
    let m;
    while ((m = re.exec(appsrc))) {
      let depth = 1, i = re.lastIndex, cur = "", args = [];
      for (; i < appsrc.length && depth > 0; i++) {
        const c = appsrc[i];
        if ("([{".includes(c)) depth++;
        if (")]}".includes(c)) depth--;
        if (depth === 0) break;
        if (c === "," && depth === 1) { args.push(cur.trim()); cur = ""; } else cur += c;
      }
      args.push(cur.trim());
      calls.push(args);
    }
    return calls;
  };

  it("LEG_BW_SINCE_KEY は \"leg-bw-since-v1\"", () => {
    expect(indexHtml).toContain('const LEG_BW_SINCE_KEY = "leg-bw-since-v1";');
  });

  it("migrateWorkouts は各記録ごとに beforeLegBw(w.date, since) を見て、true のときだけ backfillBwFactor を通す", () => {
    const body = migrateBody();
    const bf = body.match(/const (\w+) = beforeLegBw\(w\.date, since\);/);
    expect(bf).not.toBe(null);
    expect(body).toMatch(new RegExp(`return ${bf[1]} \\? backfillBwFactor\\((\\w+), \\w+\\) : \\1;`));
  });

  it("migrateWorkouts の中で backfillBwFactor を分岐の外から呼んでいない", () => {
    expect([...migrateBody().matchAll(/backfillBwFactor\(/g)]).toHaveLength(1);
  });

  it("migrateWorkouts は beforeLegBw に通さない記録でも部位の正規化はする", () => {
    expect(migrateBody()).toMatch(/const (\w+) = \{ \.\.\.ex, muscle: normMuscle\(ex\.muscle\) \};/);
  });

  it("migrateWorkouts は受け取った上書き(overrides)から作った lookup を backfillBwFactor に渡している", () => {
    const body = migrateBody();
    const lk = body.match(/const (\w+) = builtinWithOverrides\(overrides\);/);
    expect(lk).not.toBe(null);
    expect(body).toMatch(new RegExp(`backfillBwFactor\\(\\w+, ${lk[1]}\\)`));
  });

  it("読み込みは LEG_BW_SINCE_KEY の時刻を読み、無ければ今の時刻を書いて、ref にも入れる", () => {
    const { since } = sinceNames();
    expect(appsrc).toMatch(new RegExp(`if \\(!${since}\\) \\{ const (\\w+) = new Date\\(\\)\\.toISOString\\(\\); await store\\.set\\(LEG_BW_SINCE_KEY, \\1\\); ${since} = \\1; \\}`));
  });

  it("読み込みで migrateWorkouts に p.workouts・migrateCustoms の上書き・since を渡している", () => {
    const { since } = sinceNames();
    const m = appsrc.match(/const (\w+) = migrateCustoms\(p\);([\s\S]{0,600})/);
    expect(m).not.toBe(null);
    const [, v, after] = m;
    expect(after).toContain(`setWorkouts(migrateWorkouts(p.workouts, ${v}.exerciseOverrides, ${since}))`);
  });

  it("配列形式の旧データの読み込みでも since を渡している", () => {
    const { since } = sinceNames();
    expect(appsrc).toContain(`if (Array.isArray(p)) setWorkouts(migrateWorkouts(p, {}, ${since}));`);
  });

  it("復元と復元の取り消しの2経路が migrateWorkouts に上書きと ref の since を渡している", () => {
    const { ref } = sinceNames();
    const re = new RegExp(`workouts: migrateWorkouts\\(ws, migrateCustoms\\(p\\)\\.exerciseOverrides, ${ref}\\.current\\)`, "g");
    expect([...appsrc.matchAll(re)]).toHaveLength(2);
  });

  it("migrateWorkouts の呼び出しはすべて3引数(上書きと since を渡し忘れた経路が無い)", () => {
    const calls = migrateCalls();
    expect(calls.length).toBeGreaterThanOrEqual(4);
    const short = calls.filter(a => a.length < 3).map(a => `migrateWorkouts(${a.join(", ")})`);
    expect(short, `引数が足りない呼び出し: ${short.join(" / ")}`).toEqual([]);
  });

  it("下書きの復元は draft.startAt(無ければ savedAt)の時刻を beforeLegBw で見て、true のときだけ backfillBwFactor を通す", () => {
    const { since } = sinceNames();
    expect(appsrc).toMatch(/const draftAt = draft\.startAt \|\| draft\.savedAt;/);
    const m = appsrc.match(/setToday\(beforeLegBw\(([^\n]*)\)\s*\?\s*draft\.today\.map\(ex => backfillBwFactor\(ex, (\w+)\)\) : draft\.today\);/);
    expect(m).not.toBe(null);
    const [, args] = m;
    expect(args).toContain("draftAt");
    expect(args).toMatch(new RegExp(`, ${since}$`));
  });

  it("下書きの復元は、読み込んだ上書きから作った lookup を backfillBwFactor に渡している", () => {
    const m = appsrc.match(/const (\w+) = builtinWithOverrides\((\w+)\);[\s\S]{0,300}?draft\.today\.map\(ex => backfillBwFactor\(ex, (\w+)\)\)/);
    expect(m).not.toBe(null);
    const [, lk, ovVar, used] = m;
    expect(used).toBe(lk);
    // 渡しているのは読み込みで migrateCustoms から得た上書き(空のままの変数ではない)
    const mc = appsrc.match(/const (\w+) = migrateCustoms\(p\);/);
    expect(mc).not.toBe(null);
    expect(appsrc).toContain(`${ovVar} = ${mc[1]}.exerciseOverrides;`);
  });

  it("下書きの today を beforeLegBw を見ずに setToday する経路が残っていない", () => {
    expect(appsrc).not.toMatch(/setToday\(draft\.today\)/);
    expect(appsrc).not.toMatch(/setToday\(draft\.today\.map\(ex => backfillBwFactor/);
  });
});
