// 集計ボリュームの計算。index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして
// 読み込まれる(importやexportは使わない、ビルド不要の原則を維持するため)。
//
// effWeight/resolveIsDb/resolveRomはdeps引数で明示的に受け取る(暗黙のグローバル参照にしない)。
// 理由: resolveIsDb/resolveRomは#appsrc側でconst宣言されているだけでglobalThisに登録されておらず、
// このファイルのようにLIBSで#appsrcより先に読み込まれる別スクリプトからは、
// 呼び出し時点であってもbareな識別子として解決できない(このファイルとindex.html側の
// eval実行は同じグローバルオブジェクトを共有しても、const宣言のレキシカルスコープは共有されない)。
// effWeightはglobalThisに登録されているため本来bare参照でも動くが、一貫性のため同じ形にする。
//
// ロジックは元のindex.html内の定義から一切変更していない(bodyweight/depsを引数化しただけ)。

// ボリューム・セット数はワーキングセットのみ(ウォームアップは除外)
function workingSets(ex) {
  return (ex.sets || []).filter(s => !s.warmup);
}

// 集計用ボリューム: 実効重量 × 回数 × 可動域係数(1RM/PR/判定には係数を掛けない)
function setVolume(ex, s, bodyweight, deps) {
  const { effWeight, resolveIsDb, resolveRom } = deps;
  return effWeight(s.weight, resolveIsDb(ex.name, ex.isDb), ex.bwFactor ?? 0, ex.bwAtLog ?? bodyweight) * s.reps * resolveRom(ex.name, ex.rom);
}

function exVolume(ex, bodyweight, deps) {
  return workingSets(ex).reduce((a, s) => a + setVolume(ex, s, bodyweight, deps), 0);
}

globalThis.workingSets = workingSets;
globalThis.setVolume = setVolume;
globalThis.exVolume = exVolume;
