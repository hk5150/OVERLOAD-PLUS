// 可動域係数(rom)と体重係数(bw)をどこから解決するか。
// index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやmodule.exportsは使わない。ビルド不要の原則を維持するため)。
//
// ここに切り出した理由は、この解決順序を間違えると**テストが全部緑のまま実害が出る**から。
// v102で係数の既定値を見直したとき、実際に次の2つを踏んだ:
//
//   1. 記録側に焼き込まれた値(saveWorkoutが毎回書く)を設定値として読み戻していたため、
//      一度でも記録した種目には種目マスターの更新が永久に届かなかった。しかも
//      saveWorkoutがまた書き戻すので、古い値が自己増殖して回り続ける
//   2. それを直すときに、カスタム種目を含まない索引(dbLookup)を使ってしまい、
//      自重のカスタム種目が bw:0 になって実効重量もボリュームも0になった
//
// どちらも「記録として保存されてしまう」種類なので、UIを目視しても気づきにくい。

// 係数の解決。**記録側のスナップショットは引数に取らない**(意図的)。
// 記録に焼き込まれた値は「その日の計算に使った値」であって、ユーザーがそう決めたという
// 意思表示ではない。ユーザーの調整は上書き(exerciseOverrides)側に入る。
//
// lookup には findExercise 相当を渡すこと。カスタム種目とユーザー上書きの両方を
// 含んだ索引でないと 2 を再発させる。
function resolveCoefficients(name, lookup) {
  const meta = lookup(name);
  return { bwFactor: meta?.bw ?? 0, rom: meta?.rom ?? 1.0 };
}

globalThis.resolveCoefficients = resolveCoefficients;
