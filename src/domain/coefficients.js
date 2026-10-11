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

// 内蔵種目と同じ名前のカスタム種目を、内蔵種目への上書き(exerciseOverrides)に移す。
// 内蔵に種目を足すと(2026-10 にヒップアダクション・チンアップなど19種目)、同じ名前で作っていた
// カスタム種目が残って一覧に2行出る。しかも計算は内蔵側(dbLookup・resolveIsDb)を見るのに、
// 設定画面での編集はカスタム側を書き換えるので、直しても効かない。
// 利用者が決めていた部位・器具・db・係数は、内蔵の既定と違うものだけ上書きとして残す
// (同じ値まで書くと、以後マスターの更新が届かなくなる。docs/係数の根拠.md の落とし穴3)。
// 既に上書きがある項目は、そちらを優先する。何度通しても同じ結果になる。
//   master(name): 内蔵種目の定義(無ければ null)
function absorbBuiltinNameClash(customExercises, overrides, master) {
  const customs = customExercises || [], ovs = { ...(overrides || {}) };
  const kept = [];
  let changed = false;
  customs.forEach(c => {
    const base = c && master(c.n);
    if (!base) { kept.push(c); return; }
    changed = true;
    const own = {};
    if (c.m && c.m !== base.m) own.m = c.m;
    if (c.eq && c.eq !== base.eq) own.eq = c.eq;
    if (!!c.db !== !!base.db) own.db = !!c.db;
    if ((c.bw || 0) !== (base.bw || 0)) own.bw = c.bw || 0;
    if (c.rom != null && c.rom !== (base.rom ?? 1.0)) own.rom = c.rom;
    if (Object.keys(own).length) ovs[c.n] = { ...own, ...(ovs[c.n] || {}) };
  });
  return changed ? { customExercises: kept, exerciseOverrides: ovs } : { customExercises: customs, exerciseOverrides: overrides || {} };
}

globalThis.resolveCoefficients = resolveCoefficients;
globalThis.absorbBuiltinNameClash = absorbBuiltinNameClash;
