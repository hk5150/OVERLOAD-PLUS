// 重量の表示単位(kg / lb)。index.htmlから<script src>で素のグローバルスクリプトとして
// 読み込まれる(importやmodule.exportsは使わない。ビルド不要の原則を維持するため)。
//
// 設計の要点は docs/多言語化.md を参照。前提だけここに書くと:
//
//   **保存は常に kg。表示と入力のときだけ換算する。**
//   単位を混ぜて保存すると「前回と同じ重量ならRIRの差分を出す」同一負荷判定
//   (浮動小数の比較)が無言で壊れる。比較は必ず保存値=kgで行う。
//   lb入力は2.5lb刻みなので kg 換算値は決定的になり、同じ入力は必ず同じ kg 値になる。
//   表示側の 0.5 lb 丸め(wU)が往復誤差を吸収する。
//
//   この方針のおかげで oneRm.js / volume.js / storage.js / db/ 以下は無変更で済んでいる。
//   単位を切り替えても保存済みのデータは一切書き換えない。
//
// 言語設定(i18n.js の LANG)とは独立している。「日本語UIだがlb」「英語UIだがkg」は
// どちらもあり得るので、別のスイッチにしてある。

const LB_PER_KG = 0.45359237;
const SUPPORTED_UNITS = ["kg", "lb"];

// index.html の num() はこのファイルより後に読み込まれるので、ここでは使えない。
const n = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };

// 保存された設定 > 端末の言語 > kg。
// アメリカ英語のときだけ lb を既定にする(イギリス・豪州のジムはkg表記が多いため広げない)。
function resolveUnit(savedUnit, navigatorLang) {
  if (SUPPORTED_UNITS.includes(savedUnit)) return savedUnit;
  return String(navigatorLang || "").toLowerCase() === "en-us" ? "lb" : "kg";
}

let UNIT = "kg";
const getUnit = () => UNIT;
const setUnit = (u) => { UNIT = SUPPORTED_UNITS.includes(u) ? u : "kg"; return UNIT; };
const uLabel = () => UNIT;

const kgToLb = (kg) => n(kg) / LB_PER_KG;
const lbToKg = (lb) => n(lb) * LB_PER_KG;

// 表示単位へ(丸めなし)。ボリューム・推定1RM・グラフはこれを使い、丸めは呼び出し側で行う。
const toU = (kg) => (UNIT === "lb" ? kgToLb(kg) : n(kg));

// 表示単位から保存単位(kg)へ。入力欄の値を保存するときに通す。
// ここでは丸めない。丸めるとボリュームや推定1RMの集計に誤差が乗り、
// 135lb×8 が 1,080lb ではなく 1,079lb と出てしまう。
// 入力欄に出る桁数の問題は、単位を切り替える経路(convWeightStr)だけで処理する。
const fromU = (v) => (UNIT === "lb" ? lbToKg(v) : n(v));

// プレート単位の重量。**換算が入るときだけ** 0.5 刻みに丸める。
// lb: 2.5lb / 5lb 刻みで入力した値は kg 保存を経て往復してもここで元の値に戻る。
// kg: 保存値をそのまま返す。丸めてしまうと、62.3kg のように 0.5 刻みでない値を
//     入れている既存ユーザーの記録を表示するだけで書き換えてしまう。
const wU = (kg) => (UNIT === "lb" ? Math.round(kgToLb(kg) * 2) / 2 : n(kg));

// 入力欄に入れる文字列。0.5刻みなので "60" や "132.5" のように短く出る。
const wStr = (kg) => String(wU(kg));

// 記録中の入力値(表示単位の文字列)を、単位を切り替えたときに読み替える。
// today と編集中の記録は保存前の文字列なので、切り替えの瞬間に中身も換算しないと
// 「135」がlbからkgに化けて別物の記録になってしまう。
// 空文字はそのまま返す(未入力を "0" にしてしまうと、未実施のセットが実施済みに見える)。
function convWeightStr(str, fromUnit, toUnit) {
  if (str === "" || str == null) return str;
  if (fromUnit === toUnit) return str;
  const kg = fromUnit === "lb" ? Math.round(lbToKg(str) * 10) / 10 : n(str);
  const v = toUnit === "lb" ? Math.round(kgToLb(kg) * 2) / 2 : kg;
  return String(v);
}

// 増加幅(±ボタンの刻み)。kgで保存された値を表示単位に直す。
// lbは2.5刻みに丸めるので、kgの既定値がそのまま実機のlb刻みになる:
//   マシン5kg→10lb / 単関節ダンベル片手1kg→2.5lb / 単関節2.5kg→5lb / 多関節ダンベル2kg→5lb
// 専用のlbテーブルを持たずに済み、ユーザーが調整した刻みも比例して反映される。
const incU = (kgInc) => (UNIT === "lb" ? Math.max(2.5, Math.round(kgToLb(kgInc) / 2.5) * 2.5) : n(kgInc));

// ブラウザの<script>グローバルスコープではconst宣言もbare identifierとして参照できるが、
// vmサンドボックス(テスト環境)ではcontextオブジェクトのプロパティにならないため明示的に公開する。
globalThis.LB_PER_KG = LB_PER_KG;
globalThis.SUPPORTED_UNITS = SUPPORTED_UNITS;
globalThis.resolveUnit = resolveUnit;
globalThis.getUnit = getUnit;
globalThis.setUnit = setUnit;
globalThis.uLabel = uLabel;
globalThis.kgToLb = kgToLb;
globalThis.lbToKg = lbToKg;
globalThis.toU = toU;
globalThis.fromU = fromU;
globalThis.wU = wU;
globalThis.wStr = wStr;
globalThis.convWeightStr = convWeightStr;
globalThis.incU = incU;
