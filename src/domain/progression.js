// 重量の増加幅(increment)への丸め。ルールエンジン(analyzeExercise)が提案重量を
// 「2.5kg刻みのジムで62.3kg等が出ない」ように丸めるのに使う。
// ロジックはindex.html内の元の実装(snap関数、および補助ありのみ分岐のインライン重複)から
// 一切変更していない(フェーズ0監査時点のコードをそのまま移設)。
function roundToIncrement(weight, increment) {
  return Math.max(0, Math.round(weight / increment) * increment);
}

globalThis.roundToIncrement = roundToIncrement;
