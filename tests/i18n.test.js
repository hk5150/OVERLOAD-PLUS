import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// 翻訳対象はユニーク378本ある。人間が突き合わせるのは無理なので、
// 「jaにあってenに無い」「種目マスターにあって対応表に無い」を機械的に落とす。
// docs/多言語化.md の「テストで縛るもの」に対応する。

const i18n = loadDomainModule("src/domain/i18n.js");

// EXERCISE_DB / MUSCLES / EQUIPMENT / SPLIT_PRESETS は #appsrc の中(index.html)にあり、
// ドメインファイルには出ていない。移設するとindex.htmlの差分が大きくなり
// 他セッションとの衝突リスクが上がるので、ここでは配列リテラルだけを切り出して評価する。
// 対象はどれも純粋なデータリテラルなので、これで十分かつ壊れにくい。
const indexHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");

// 1行で書かれた配列(EQUIPMENT)と複数行の配列(EXERCISE_DB)が混在しているので、
// 正規表現で終端を当てにせず、開き括弧から対応する閉じ括弧まで深さを数えて切り出す。
// 対象データに [ ] を含む文字列は無いので、この単純な走査で足りる。
function evalLiteral(constName) {
  const head = indexHtml.indexOf(`const ${constName} = [`);
  if (head < 0) throw new Error(`index.html から ${constName} を取り出せませんでした`);
  const start = indexHtml.indexOf("[", head);
  let depth = 0, end = -1;
  for (let i = start; i < indexHtml.length; i++) {
    const c = indexHtml[i];
    if (c === "[") depth++;
    else if (c === "]" && --depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(`${constName} の閉じ括弧が見つかりません`);
  return vm.runInNewContext("(" + indexHtml.slice(start, end + 1) + ")");
}

const EXERCISE_DB = evalLiteral("EXERCISE_DB");
const MUSCLES = evalLiteral("MUSCLES");
const EQUIPMENT = evalLiteral("EQUIPMENT");
const SPLIT_PRESETS = evalLiteral("SPLIT_PRESETS");

describe("index.htmlからの抽出", () => {
  it("種目マスターを取り出せている(抽出が壊れたら以降の網羅チェックが無意味になるため)", () => {
    expect(EXERCISE_DB.length).toBeGreaterThan(80);
    expect(EXERCISE_DB.every(e => typeof e.n === "string" && e.n.length > 0)).toBe(true);
  });
});

describe("UI文言のキー集合", () => {
  it("jaとenのキーが完全一致する", () => {
    const ja = Object.keys(i18n.I18N.ja).sort();
    const en = Object.keys(i18n.I18N.en).sort();
    const missingInEn = ja.filter(k => !en.includes(k));
    const missingInJa = en.filter(k => !ja.includes(k));
    expect(missingInEn, `enに無いキー: ${missingInEn.join(", ")}`).toEqual([]);
    expect(missingInJa, `jaに無いキー: ${missingInJa.join(", ")}`).toEqual([]);
  });

  it("値が空文字のキーが無い", () => {
    for (const lang of ["ja", "en"]) {
      for (const [k, v] of Object.entries(i18n.I18N[lang])) {
        expect(typeof v === "string" && v.length > 0, `${lang}.${k} が空です`).toBe(true);
      }
    }
  });
});

describe("ドメイン語彙の網羅", () => {
  it("全ての種目に英語名がある", () => {
    const missing = EXERCISE_DB.map(e => e.n).filter(n => !i18n.EX_NAMES_EN[n]);
    expect(missing, `英語名が未定義の種目: ${missing.join(", ")}`).toEqual([]);
  });

  it("英語名テーブルに、種目マスターに存在しない名前が混ざっていない(改名時の取り残し検出)", () => {
    const known = new Set(EXERCISE_DB.map(e => e.n));
    const orphans = Object.keys(i18n.EX_NAMES_EN).filter(n => !known.has(n));
    expect(orphans, `種目マスターに無い名前: ${orphans.join(", ")}`).toEqual([]);
  });

  it("全ての部位に英語名がある", () => {
    const missing = MUSCLES.filter(m => !i18n.MUSCLE_NAMES_EN[m]);
    expect(missing, `英語名が未定義の部位: ${missing.join(", ")}`).toEqual([]);
  });

  it("全ての器具に英語名がある", () => {
    const missing = EQUIPMENT.filter(q => !i18n.EQ_NAMES_EN[q]);
    expect(missing, `英語名が未定義の器具: ${missing.join(", ")}`).toEqual([]);
  });

  it("種目マスターが参照する部位・器具も英語名を持つ(MUSCLES/EQUIPMENTに載せ忘れた値の検出)", () => {
    const missingM = [...new Set(EXERCISE_DB.map(e => e.m))].filter(m => m && !i18n.MUSCLE_NAMES_EN[m]);
    const missingQ = [...new Set(EXERCISE_DB.map(e => e.eq))].filter(q => q && !i18n.EQ_NAMES_EN[q]);
    expect(missingM, `英語名が未定義の部位: ${missingM.join(", ")}`).toEqual([]);
    expect(missingQ, `英語名が未定義の器具: ${missingQ.join(", ")}`).toEqual([]);
  });

  it("全ての分割プリセット名と曜日名に英語名がある", () => {
    const missingSplit = SPLIT_PRESETS.map(p => p.name).filter(n => !i18n.SPLIT_NAMES_EN[n]);
    const dayNames = [...new Set(SPLIT_PRESETS.flatMap(p => p.days.map(d => d.name)))];
    // Push / Pull / Legs のように英語のままでよい曜日名は対応表に載せない運用にするため、
    // 「日本語を含む曜日名」だけを必須にする。
    const missingDay = dayNames.filter(n => /[ぁ-んァ-ヶ一-龥]/.test(n) && !i18n.DAY_NAMES_EN[n]);
    expect(missingSplit, `英語名が未定義の分割: ${missingSplit.join(", ")}`).toEqual([]);
    expect(missingDay, `英語名が未定義の曜日: ${missingDay.join(", ")}`).toEqual([]);
  });

  it("曜日の頭文字が7個ずつある", () => {
    expect(i18n.WEEKDAYS.ja).toHaveLength(7);
    expect(i18n.WEEKDAYS.en).toHaveLength(7);
  });
});

describe("言語の決定", () => {
  it("保存された設定を最優先する", () => {
    expect(i18n.resolveLang("en", "ja-JP")).toBe("en");
    expect(i18n.resolveLang("ja", "en-US")).toBe("ja");
  });

  it("保存が無ければブラウザの言語を見る(地域付きでも判定できる)", () => {
    expect(i18n.resolveLang(null, "en-US")).toBe("en");
    expect(i18n.resolveLang(undefined, "en")).toBe("en");
    expect(i18n.resolveLang(null, "ja-JP")).toBe("ja");
  });

  it("未対応の言語・不明な値は日本語にフォールバックする", () => {
    expect(i18n.resolveLang("fr", "fr-FR")).toBe("ja");
    expect(i18n.resolveLang(null, undefined)).toBe("ja");
    expect(i18n.resolveLang(null, "")).toBe("ja");
  });
});

describe("表示名の解決", () => {
  it("日本語のときは元の名前をそのまま返す", () => {
    i18n.setLang("ja");
    expect(i18n.exName("バーベルベンチプレス")).toBe("バーベルベンチプレス");
    expect(i18n.muscleName("胸")).toBe("胸");
  });

  it("英語のときは対応表を引く", () => {
    i18n.setLang("en");
    expect(i18n.exName("バーベルベンチプレス")).toBe("Barbell Bench Press");
    expect(i18n.muscleName("胸")).toBe("Chest");
    expect(i18n.eqName("自重")).toBe("Bodyweight");
    expect(i18n.dayName("背中")).toBe("Back");
  });

  it("対応表に無い名前(カスタム種目)は消さずにそのまま返す", () => {
    i18n.setLang("en");
    expect(i18n.exName("自作マシンプレス")).toBe("自作マシンプレス");
    expect(i18n.dayName("腕の日")).toBe("腕の日");
  });

  it("検索テキストには日英どちらも含まれる(英語UIでも日本語名で引けるように)", () => {
    i18n.setLang("en");
    const s = i18n.exSearchText({ n: "バーベルベンチプレス", m: "胸", eq: "バーベル" });
    expect(s).toContain("バーベルベンチプレス");
    expect(s).toContain("barbell bench press");
    expect(s).toContain("chest");
  });
});

describe("t()", () => {
  it("選択中の言語の文言を返す", () => {
    i18n.setLang("ja");
    expect(i18n.t("settings.language")).toBe("言語");
    i18n.setLang("en");
    expect(i18n.t("settings.language")).toBe("Language");
  });

  it("未定義のキーはキー文字列を返す(空文字にすると画面から消えて原因が分からなくなるため)", () => {
    i18n.setLang("en");
    expect(i18n.t("nope.missing")).toBe("nope.missing");
  });

  it("プレースホルダを差し込める", () => {
    i18n.setLang("en");
    i18n.I18N.en["__test"] = "{n} sets";
    expect(i18n.t("__test", { n: 3 })).toBe("3 sets");
    delete i18n.I18N.en["__test"];
  });
});
