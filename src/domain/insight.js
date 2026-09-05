// ある種目の直近の傾向(判断材料として記録画面に出す値)。
// index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやexportは使わない。ビルド不要の原則を維持するため)。
//
// #appsrcの中に置いていたが、ここの分岐は実データでしか誤りが露見しない種類のものが多く、
// 実際にユーザーの実記録で「15kgで13回できた日から9回に落ちているのに『そろそろ上げどき』と
// 出る」「同じ日に15×9を達成しているのに推移には15×8と出る」の2件を踏んだため、
// テストで縛れるようにここへ移した。
//
// isDbOf は種目マスターを見て「ダンベル種目か」を解決する関数(#appsrc側の責務)。
// coefficients.js が索引を注入するのと同じパターン。
//
// workouts は保存順(追記順)で、日付でソートされていない。過去日の記録を後から編集して
// 日付を変えると、entries[0] は「最新の日付」ではなく「最後に保存した記録」になる。

const INSIGHT_TREND_LEN = 4;   // 推移として並べるセッション数
// 回数を比べる範囲。推移(4件)より狭いので、画面に出ている最高回数と bestRecentReps が
// 食い違うことがある。文言(log.repsDown)側に「直近3セッションの」と範囲を書いてあるのは
// そのため。ここを変えるなら文言も一緒に直すこと。
const INSIGHT_REPS_WINDOW = 3;

function insightNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

// その日を代表する1セット。ウォームアップと補助ありは実力を表さないので除く。
// 同じ重量なら回数が多い方を採る。先頭優先にすると、15×8 / 15×9 / 15×8 の日が
// 「15×8」として推移に出てしまい、達成した15×9が消える。
function topSetOf(ex) {
  const ws = (ex.sets || []).filter(s => !s.warmup && !s.assisted && insightNum(s.reps) > 0);
  if (ws.length === 0) return null;
  return ws.reduce((best, s) => {
    const w = insightNum(s.weight), bw = insightNum(best.weight);
    if (w !== bw) return w > bw ? s : best;
    return insightNum(s.reps) > insightNum(best.reps) ? s : best;
  }, ws[0]);
}

function exerciseInsight(workouts, name, isDbOf) {
  const entries = [];
  for (let i = (workouts || []).length - 1; i >= 0; i--) {
    const ex = (workouts[i].exercises || []).find(e => e.name === name);
    if (ex) entries.push({ date: workouts[i].date, ex });
  }
  if (entries.length === 0) return null;

  const prev = entries[0];
  const prevTop = topSetOf(prev.ex);
  if (!prevTop) return null;
  const prevWeight = insightNum(prevTop.weight);
  const prevReps = insightNum(prevTop.reps);

  // 同じトップ重量が何回連続しているか
  let streak = 0;
  for (const e of entries) {
    const t = topSetOf(e.ex);
    if (t && insightNum(t.weight) === prevWeight) streak++; else break;
  }

  // 推移(古い順)。重量だけだと「15kg×13回 → 15kg×9回」の後退が「15 → 15」と
  // 横ばいに見えるので、トップセットの回数も一緒に持つ。
  const trend = entries.slice(0, INSIGHT_TREND_LEN)
    .map(e => { const t = topSetOf(e.ex); return t ? { weight: insightNum(t.weight), reps: insightNum(t.reps) } : null; })
    .filter(Boolean).reverse();

  // 重量が同じでも回数が伸びていれば過負荷は掛かっている。逆に回数が落ちている最中に
  // 重量を上げるのは順序が逆なので、そのときは「上げどき」と言わない。
  // 比べる範囲を直近INSIGHT_REPS_WINDOW回に限るのは、ずっと前の突出した1回が
  // 「上げどき」を無期限にブロックしてしまうため(実データの13回は、その重量を
  // 1セットしかやらなかった日の値だった)。
  const recentTops = entries.slice(0, Math.min(streak, INSIGHT_REPS_WINDOW)).map(e => topSetOf(e.ex)).filter(Boolean);
  const bestRecentReps = recentTops.reduce((max, t) => Math.max(max, insightNum(t.reps)), 0);
  const readyToProgress = prevReps >= bestRecentReps;

  return {
    date: prev.date,
    sets: (prev.ex.sets || []).filter(s => !s.warmup),
    topWeight: prevWeight,
    topReps: prevReps,
    topRir: prevTop.rir,
    isDb: isDbOf ? isDbOf(name, prev.ex.isDb) : !!prev.ex.isDb,
    streak,
    trend,
    readyToProgress,
    bestRecentReps,
    // 加重が0のまま続く種目(腕立てなど加重できないもの)に「重量が頭打ち」と言っても
    // 取れる行動がない。回数の伸びは推移で見えるので、重量の助言だけを抑える。
    canAddWeight: prevWeight > 0,
  };
}

globalThis.exerciseInsight = exerciseInsight;
globalThis.topSetOf = topSetOf;
