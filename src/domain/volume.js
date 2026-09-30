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

// セット種別の切替: 通常 → ウォームアップ(W) → 補助あり(補) → 通常。Wと補助は排他。
// 今日の画面と履歴の編集画面の両方から呼ぶ(片方だけ変えると、両方立ったセットが保存されうる。
// 両方立つと、直前の行を複製する addSet / applyWatchOps で見えない補助セットができる)。
// 集計側の約束事(workingSets 等が W・補助をどう扱うか)と対になるのでここに置く。
function nextSetType(s) {
  if (!s.warmup && !s.assisted) return { warmup: true, assisted: false };
  if (s.warmup) return { warmup: false, assisted: true };
  return { warmup: false, assisted: false };
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
globalThis.nextSetType = nextSetType;
