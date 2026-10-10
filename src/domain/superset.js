// スーパーセットの印(ssGroup)の後始末。index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやexportは使わない。ビルド不要の原則を維持するため)。
//
// スーパーセットは「隣り合う種目に同じ ssGroup を付ける」ことで表している。解除・並べ替え・削除で隣が変わると、
// 1種目だけが印を持った「片割れ」が残り、1種目だけのスーパーセットとして表示され続けた(1.4 (18) で北村さんが発見)。
// 隣に同じ印の種目が無いものは印を外す。変わらなければ同じ配列を返す(setToday の無駄な更新を避けるため)。
function normalizeSupersets(list) {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const next = list.map((ex, i) => {
    if (!ex || ex.ssGroup == null || ex.ssGroup === "") return ex;
    if (list[i - 1]?.ssGroup === ex.ssGroup || list[i + 1]?.ssGroup === ex.ssGroup) return ex;
    changed = true;
    const { ssGroup, ...rest } = ex;
    return rest;
  });
  return changed ? next : list;
}

globalThis.normalizeSupersets = normalizeSupersets;
