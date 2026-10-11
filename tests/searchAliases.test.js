import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// 通称 → 正式名の表(index.html の SEARCH_ALIASES、2026-10 追加)を縛る。
//
// この表は種目検索(src/domain/i18n.js の exSearchText が e.al を含める)と、AIコーチの
// 名前解決(coachResolveName)だけに使う。ALIASES(係数・db の解決にも通る)に入れないのは意図的で、
// 同じ名前のカスタム種目(例: ケーブルで作った「リアレイズ」)が正式名の db を拾って×2になるのを避けるため。
// ここで止めたいのは次の3つ:
//   1. 値が正式名でない(改名・削除で切れる)。検索では無言で何も当たらなくなり、
//      AIコーチでは存在しない名前で記録が作られる
//   2. キーが正式名や ALIASES と被る。正式名と同じ文字列の通称は、別の種目へ誘導する罠になる
//   3. 曖昧な通称を入れる。「フレンチプレス」(オーバーヘッド/ライイング)・「レッグカール」
//      (ライイング/シーテッド)は、どちらに寄せても半分の利用者の前回記録が繋がらない
// 対象外: 通称の網羅性(どの通称を入れるべきか)は縛らない。

const indexHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");

// tests/i18n.test.js の evalLiteral と同じ切り出し方を、オブジェクトリテラル用にしたもの。
function evalLiteral(constName, open = "[", close = "]") {
  const head = indexHtml.indexOf(`const ${constName} = ${open}`);
  if (head < 0) throw new Error(`index.html から ${constName} を取り出せませんでした`);
  const start = indexHtml.indexOf(open, head);
  let depth = 0, end = -1;
  for (let i = start; i < indexHtml.length; i++) {
    const c = indexHtml[i];
    if (c === open) depth++;
    else if (c === close && --depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(`${constName} の閉じ括弧が見つかりません`);
  return vm.runInNewContext("(" + indexHtml.slice(start, end + 1) + ")");
}

const EXERCISE_DB = evalLiteral("EXERCISE_DB");
const SEARCH_ALIASES = evalLiteral("SEARCH_ALIASES", "{", "}");
const ALIASES = evalLiteral("ALIASES", "{", "}");
const dbNames = new Set(EXERCISE_DB.map(e => e.n));

const i18n = loadDomainModule("src/domain/i18n.js");
const { makeCoachNameResolver } = loadDomainModule("src/domain/aiCoach.js");

// index.html の allExercises と同じく、正式名に通称の配列 al を付けた種目
const sampleExercise = (overrides = {}) => ({ n: "リアデルトフライ", m: "三角筋後部", eq: "ダンベル", al: ["リアレイズ"], ...overrides });

describe("SEARCH_ALIASES の整合", () => {
  it("表を取り出せている(抽出が壊れたら以降の検査が空振りするため)", () => {
    expect(Object.keys(SEARCH_ALIASES).length).toBeGreaterThanOrEqual(20);
    expect(SEARCH_ALIASES["リアレイズ"]).toBe("リアデルトフライ");
  });

  it("値はすべて EXERCISE_DB の正式名", () => {
    const broken = Object.entries(SEARCH_ALIASES).filter(([, n]) => !dbNames.has(n)).map(([a, n]) => `${a} → ${n}`);
    expect(broken, `正式名でない: ${broken.join(", ")}`).toEqual([]);
  });

  it("キーは EXERCISE_DB の名前と重ならない", () => {
    const clash = Object.keys(SEARCH_ALIASES).filter(a => dbNames.has(a));
    expect(clash, `正式名と同じ通称: ${clash.join(", ")}`).toEqual([]);
  });

  it("キーは既存の ALIASES のキーと重ならない", () => {
    const clash = Object.keys(SEARCH_ALIASES).filter(a => a in ALIASES);
    expect(clash, `ALIASES と重複: ${clash.join(", ")}`).toEqual([]);
  });

  it("曖昧な通称「フレンチプレス」「レッグカール」を含まない", () => {
    expect(SEARCH_ALIASES).not.toHaveProperty("フレンチプレス");
    expect(SEARCH_ALIASES).not.toHaveProperty("レッグカール");
  });
});

describe("通称での検索(exSearchText / exMatches)", () => {
  it("検索テキストに通称(e.al)を含める", () => {
    i18n.setLang("ja");
    expect(i18n.exSearchText(sampleExercise())).toContain("リアレイズ");
  });

  it("英語UIでも通称で引ける", () => {
    i18n.setLang("en");
    expect(i18n.exMatches(sampleExercise(), "リアレイズ")).toBe(true);
  });

  it("英字の通称は大文字小文字を無視して当たる", () => {
    const ohp = sampleExercise({ n: "バーベルオーバーヘッドプレス", m: "三角筋前部", eq: "バーベル", al: ["OHP"] });
    expect(i18n.exMatches(ohp, "ohp")).toBe(true);
  });

  it("al が無い種目(カスタム種目)でも落ちず、通称の分は何も足さない", () => {
    const custom = sampleExercise({ n: "自作マシンプレス", al: undefined });
    expect(i18n.exSearchText(custom)).not.toContain("undefined");
    expect(i18n.exMatches(custom, "リアレイズ")).toBe(false);
  });
});

// coachResolveName は「全種目の正式名・表示名 → 全種目の通称」の順で登録し、先に登録したものが勝つ。
// その順序を index.html と同じ形で組んで、同名のカスタム種目が通称に負けないことを確かめる。
describe("AIコーチの名前解決(同名のカスタム種目を通称より優先する)", () => {
  const resolverFor = (exercises) => makeCoachNameResolver([
    ...exercises.map(e => ({ name: e.n, labels: [] })),
    ...exercises.flatMap(e => (e.al || []).map(a => ({ name: e.n, labels: [a] }))),
  ]);

  it("通称を正式名に解決する", () => {
    expect(resolverFor([sampleExercise()])("リアレイズ")).toBe("リアデルトフライ");
  });

  it("通称と同じ名前のカスタム種目があれば、カスタム種目に解決する", () => {
    const custom = { n: "リアレイズ", m: "三角筋後部", eq: "ケーブル" };
    expect(resolverFor([sampleExercise(), custom])("リアレイズ")).toBe("リアレイズ");
  });

  it("index.html の coachResolveName は通称を正式名の後ろに登録している", () => {
    const head = indexHtml.indexOf("const coachResolveName = useMemo(");
    expect(head).toBeGreaterThan(0);
    const body = indexHtml.slice(head, indexHtml.indexOf("[allExercises, lang]", head));
    const names = body.indexOf("allExercises.map(e => ({ name: e.n");
    const aliases = body.indexOf("(e.al || [])");
    expect(names).toBeGreaterThan(0);
    expect(aliases).toBeGreaterThan(names);
  });

  it("index.html の allExercises が通称 al を付けている", () => {
    expect(indexHtml).toMatch(/const allExercises = useMemo\([\s\S]{0,200}al: SEARCH_ALIASES_OF\[e\.n\]/);
  });
});
