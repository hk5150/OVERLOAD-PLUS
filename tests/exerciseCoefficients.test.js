import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";

// 種目マスターの可動域係数(rom)と体重係数(bw)を機械的に縛る。
//
// この2つはもともと「シュラッグ等は一律0.5」という当て推量だった。2026-08-23に
// 荷重が動く距離(cm)から rom = clamp(距離/40cm, 0.2, 1.0) で導出し直したが、
// そのとき実際に踏んだ事故が2つあるので、それぞれテストにしてある:
//
//   1. 器具違いだけで動きが同じ系列(シュラッグ3種など)で値が割れた。
//      推定元のcmが 10/12/14 とブレたのが原因で、これはAI推定の精度より細かい差。
//   2. db:true の種目に bw を足すと effWeight が「体重まで2倍」してしまう
//      (src/domain/oneRm.js の `if (isDb) w = w * 2`)。マスター値の変更だけで
//      壊れる経路なので、ここで止める。
//
// 導出の根拠と各種目のcmは docs/係数の根拠.md にある。

const indexHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");

// tests/i18n.test.js と同じ切り出し方(配列リテラルの深さを数える)。
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
const byName = new Map(EXERCISE_DB.map(e => [e.n, e]));

// 器具が違うだけで動きは同じ = romが割れてはいけない組
const SAME_MOTION = [
  ["バーベルシュラッグ", "ダンベルシュラッグ", "ケーブルシュラッグ"],
  ["スタンディングカーフレイズ", "シーテッドカーフレイズ", "レッグプレスカーフレイズ"],
  ["リストカール", "リバースリストカール"],
];

// docs/係数の根拠.md の表と実装を繋ぐスポットチェック。
// 全件は縛らない(値の見直し自体を妨げるため)が、代表値が黙って変わると
// ドキュメントだけが嘘になるので、導出の要になるものを数点だけ固定する。
const SPOT_CHECK = {
  rom: { "バーベルシュラッグ": 0.3, "スタンディングカーフレイズ": 0.3, "クランチ": 0.5, "ヒップスラスト": 0.7 },
  bw:  { "プッシュアップ": 0.7, "懸垂": 1.0, "ノルディックハムカール": 0.85 },
};

// 実際に事故ったのは resolveCoefficients 単体ではなく **呼び出し側の配線** だった。
// npm test は index.html を実行しないので、配線を元に戻しても単体テストは全部緑のまま通る。
// そこで #appsrc をテキストとして検査する(tests/i18n.test.js と同じ発想)。
describe("係数の配線(#appsrc)", () => {
  // コメント行を落としてから検査する。落とさないと、罠を説明したコメント自体に反応して
  // 「実装に残っている」と誤検出する(実際にこのテストの初版でそうなった)。
  const appsrc = indexHtml.slice(indexHtml.indexOf('id="appsrc"'))
    .split("\n").filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");

  it("記録側のスナップショットを設定値として読み戻していない", () => {
    // buildMenuItem が `prevEx.rom ?? cfg.rom` と書いていたのが元凶。saveWorkout は必ず
    // 数値を書くので ?? はフォールバックせず、古い値が自己増殖して回り続けた。
    // しかも「今日のメニュー」は継続ユーザーが毎日通る主経路なので、lastConfig だけ直しても効かない。
    // 「記録側の値 ?? 設定側の値」の形だけを禁止する。記録側の値をそのまま表示する
    // (⚙の入力欄の value={ex.rom ?? 1} など)のは正しいので、?? の右辺に cfg / dbLookup /
    // findExercise が来るものに限定して検出する。
    const bad = [...appsrc.matchAll(/(prevEx|ex)\.(rom|bwFactor)\s*\?\?\s*(cfg|db|dbLookup|findExercise)/g)];
    expect(bad.map(m => m[0]), "記録側の値を設定として読み戻している").toEqual([]);
  });

  it("係数の解決に findExercise を渡している(dbLookupではない)", () => {
    // dbLookup はカスタム種目を見ないため、自重のカスタム種目が bwFactor:0 になり
    // 実効重量もボリュームも推定1RMも0のまま記録される。
    expect(appsrc).toContain("resolveCoefficients(name, findExercise)");
    expect(appsrc.includes("resolveCoefficients(name, dbLookup)")).toBe(false);
  });

  it("係数の上書きを、値が変わったときだけ書いている", () => {
    // 無条件に updateCustomExercise を呼ぶと、欄を触っただけ・チェックを往復しただけで
    // マスターと同値の上書きが永久に残り、以後その種目に既定値の更新が届かなくなる。
    // ここで潰したはずの自己固定を、UI経由で再生産してしまう。
    // 対象は「確定」経路(onBlur / チェックボックスのonChange)。制御された数値入力の
    // onChange は1打鍵ごとの反映で、書かないと入力自体ができないため対象外。
    const calls = [...appsrc.matchAll(/updateCustomExercise\([^)]*\{\s*(bw|rom):/g)]
      .map(m => appsrc.slice(appsrc.lastIndexOf("\n", m.index) + 1, m.index + m[0].length))
      .filter(line => !/onChange=\{ev => updateCustomExercise/.test(line));
    expect(calls.length, "係数を書く確定経路が見つからない(検査が空振りしている)").toBeGreaterThanOrEqual(4);
    for (const line of calls) {
      expect(line, `無条件に上書きを書いている: ${line.trim()}`).toMatch(/if \(.*!==/);
    }
  });
});

describe("種目マスターの係数", () => {
  it("種目マスターを最後まで切り出せている", () => {
    // evalLiteral は [ ] の深さを数えるだけなので、種目名や将来のコメントに角括弧が
    // 入ると途中で閉じたと誤判定して部分配列を返す。そうなると全件走査型のテスト
    // (範囲チェック等)は対象が減っただけで緑のまま通ってしまう。件数で止める。
    expect(EXERCISE_DB.length).toBeGreaterThanOrEqual(94);
    expect(EXERCISE_DB.every(e => typeof e.n === "string" && e.n.length > 0)).toBe(true);
  });

  it("docs/係数の根拠.md に載せた代表値と一致する", () => {
    for (const [name, v] of Object.entries(SPOT_CHECK.rom)) {
      expect(byName.get(name)?.rom, `${name} のromがドキュメントとずれている`).toBe(v);
    }
    for (const [name, v] of Object.entries(SPOT_CHECK.bw)) {
      expect(byName.get(name)?.bw, `${name} のbwがドキュメントとずれている`).toBe(v);
    }
  });

  it("可動域係数が同じ動きの系列で割れていない", () => {
    for (const family of SAME_MOTION) {
      const values = family.map(n => {
        expect(byName.has(n), `${n} が種目マスターに無い`).toBe(true);
        return byName.get(n).rom ?? 1.0;
      });
      expect(new Set(values).size, `${family.join(" / ")} で値が割れている: ${values.join(", ")}`).toBe(1);
    }
  });

  it("可動域係数は減点のみ(0.2〜1.0)", () => {
    // 「動かす距離が短い種目を控えめに数える」ための係数なので、1.0を超えて
    // 加点する種目があってはいけない(cfg.romHelp の説明と実装がずれる)。
    for (const e of EXERCISE_DB) {
      if (e.rom == null) continue;
      expect(e.rom, `${e.n} のromが範囲外`).toBeGreaterThanOrEqual(0.2);
      expect(e.rom, `${e.n} のromが1.0を超えている`).toBeLessThanOrEqual(1.0);
    }
  });

  it("片手入力(db:true)の種目に体重係数を付けていない", () => {
    // effWeight は自重を足した後に isDb で2倍するため、両方持つと体重まで2倍になる。
    const broken = EXERCISE_DB.filter(e => e.db && e.bw > 0).map(e => e.n);
    expect(broken, `db:true と bw の併用は effWeight で体重が2倍になる: ${broken.join(", ")}`).toEqual([]);
  });

  it("体重係数は0より大きく1.0以下", () => {
    for (const e of EXERCISE_DB) {
      if (e.bw == null) continue;
      expect(e.bw, `${e.n} のbwが0以下`).toBeGreaterThan(0);
      expect(e.bw, `${e.n} のbwが1.0を超えている`).toBeLessThanOrEqual(1.0);
    }
  });

  it("自重種目の負荷の大小関係が崩れていない", () => {
    // 体重に対する負荷は 腕立て < ディップス ≦ 懸垂 の順になるはず。
    // 個別に値をいじったときに、この関係が壊れるのを検出する。
    const bw = (n) => {
      expect(byName.has(n), `${n} が種目マスターに無い`).toBe(true);
      return byName.get(n).bw;
    };
    expect(bw("プッシュアップ")).toBeLessThan(bw("ディップス"));
    expect(bw("ディップス")).toBeLessThanOrEqual(bw("懸垂"));
    expect(bw("ベンチディップス")).toBeLessThan(bw("ディップス"));
    expect(bw("インバーテッドロウ")).toBeLessThan(bw("懸垂"));
  });
});
