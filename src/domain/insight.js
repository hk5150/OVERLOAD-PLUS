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
// 限界で止まっていると見なす連続回数(stalledAtFailure)
const INSIGHT_STALL_SESSIONS = 3;

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

  // 推移(古い順)。代表セットを持たない日は飛ばすので、直近が全セット補助ありでも
  // それ以前の推移は出せる。重量だけだと「15kg×13回 → 15kg×9回」の後退が
  // 「15 → 15」と横ばいに見えるので、トップセットの回数も一緒に持つ。
  const trend = entries.slice(0, INSIGHT_TREND_LEN)
    .map(e => { const t = topSetOf(e.ex); return t ? { weight: insightNum(t.weight), reps: insightNum(t.reps) } : null; })
    .filter(Boolean).reverse();

  // 加重が0のまま続く種目(腕立てなど加重できないもの)に「重量が頭打ち」と言っても
  // 取れる行動がない。回数の伸びは推移で見えるので、重量の助言だけを抑える。
  // 前回1回だけで判断すると「今回はたまたま自重だけだった懸垂」を加重不可と誤判定するため、
  // 推移の範囲に一度でも加重があるかで見る。
  const canAddWeight = trend.some(v => v.weight > 0);

  // 日付と前回のセットは、代表セットが取れるかどうかとは無関係に返す。
  // ここを一緒くたにnullで返すと、その日の全セットに「補助あり」を付けただけで
  // セット行のゴースト表示まで消え、「前回の実績をそのまま見せる」という中心機能が
  // 働かなくなる(アシストマシンを常用する種目で実際に起きる)。
  const base = {
    date: prev.date,
    sets: (prev.ex.sets || []).filter(s => !s.warmup),
    isDb: isDbOf ? isDbOf(name, prev.ex.isDb) : !!prev.ex.isDb,
    trend,
    canAddWeight,
  };

  // 代表セットが取れない日(全セットが補助あり、または回数未入力)。重量にまつわる判断材料は
  // 出せないので、消費側が畳めるよう topWeight を null にして知らせる。
  if (!prevTop) {
    return { ...base, topWeight: null, topReps: null, topRir: null, streak: 0, readyToProgress: false, bestRecentReps: 0, stalledAtFailure: false };
  }

  const prevWeight = insightNum(prevTop.weight);
  const prevReps = insightNum(prevTop.reps);

  // 同じトップ重量が何セッション連続しているか
  let streak = 0;
  for (const e of entries) {
    const t = topSetOf(e.ex);
    if (t && insightNum(t.weight) === prevWeight) streak++; else break;
  }

  // 重量が同じでも回数が伸びていれば過負荷は掛かっている。逆に回数が落ちている最中に
  // 重量を上げるのは順序が逆なので、そのときは「上げどき」と言わない。
  // 比べる範囲を直近INSIGHT_REPS_WINDOW回に限るのは、ずっと前の突出した1回が
  // 「上げどき」を無期限にブロックしてしまうため(実データの13回は、その重量を
  // 1セットしかやらなかった日の値だった)。
  const recentTops = entries.slice(0, Math.min(streak, INSIGHT_REPS_WINDOW)).map(e => topSetOf(e.ex)).filter(Boolean);
  const bestRecentReps = recentTops.reduce((max, t) => Math.max(max, insightNum(t.reps)), 0);

  // 限界で止まっている(ディロードの知らせ、1.4)。同じ重量が INSIGHT_STALL_SESSIONS 回続き、
  // その全回のトップセットが余力0(RIR が 0 以下)で、直近の回数がそれ以前の最高を超えていない。
  // 2026-08-23 に見送った「アプリ全体の RIR0 の割合」(docs/vite移行.md)と違い、記録に見えている事実だけで決まる。
  // このときは「上げどき」と言わない(毎回限界で同じ回数なら、重量を上げる段階ではない)。数字は変えない。
  let stalledAtFailure = false;
  if (streak >= INSIGHT_STALL_SESSIONS) {
    const win = entries.slice(0, INSIGHT_STALL_SESSIONS).map(e => topSetOf(e.ex));
    const allFailure = win.every(t => t && t.rir !== "" && t.rir != null && insightNum(t.rir) <= 0);
    const earlierBest = win.slice(1).reduce((max, t) => Math.max(max, insightNum(t.reps)), 0);
    stalledAtFailure = allFailure && prevReps <= earlierBest;
  }
  const readyToProgress = !stalledAtFailure && prevReps >= bestRecentReps;

  return {
    ...base,
    topWeight: prevWeight,
    topReps: prevReps,
    topRir: prevTop.rir,
    streak,
    readyToProgress,
    bestRecentReps,
    stalledAtFailure,
  };
}

// その日の「今日のスコア」(100点満点。Instagram 用の画像に出す。北村さん、2026-10-11)。配点は見て分かるものだけにする:
//   前回超え 60点: 前回がある種目のうち、トップセットの重量が上がった・同じ重量で回数が増えた = 1、
//                  同じ重量・同じ回数 = 0.5、それ以外 = 0 の平均 × 60
//   ボリューム 25点: 同じ Day の前回以上 25 / 前回の 90% 以上 15 / それ未満 5
//   自己ベスト 15点: 1種目 5点、3つで満点
// items: [{ now: {weight, reps}, prev: {weight, reps} | null, pr: boolean }]。重量は保存値(kg)のまま比べる
// prevVolume が無い(その Day を初めてやった日)か、前回と比べられる種目が1つも無い日(種目を全部入れ替えた等)なら null
// (比べる相手が無いのに点を付けない。後者は「前回超え 0/0」で最高40点になっていた。reviewer 指摘)
function workoutScore({ items, volume, prevVolume }) {
  if (!(Number(prevVolume) > 0)) return null;
  const list = items || [];
  const withPrev = list.filter(it => it && it.now && it.prev);
  if (withPrev.length === 0) return null;
  let credit = 0, beaten = 0;
  for (const it of withPrev) {
    const nw = insightNum(it.now.weight), nr = insightNum(it.now.reps);
    const pw = insightNum(it.prev.weight), pr = insightNum(it.prev.reps);
    if (nw > pw + 0.001 || (Math.abs(nw - pw) <= 0.001 && nr > pr)) { credit += 1; beaten += 1; }
    else if (Math.abs(nw - pw) <= 0.001 && nr === pr) credit += 0.5;
  }
  const v = Number(volume) || 0, pv = Number(prevVolume);
  const volPts = v >= pv ? 25 : v >= pv * 0.9 ? 15 : 5;
  const prCount = list.filter(it => it && it.pr).length;
  const score = Math.round((withPrev.length ? 60 * credit / withPrev.length : 0) + volPts + Math.min(15, prCount * 5));
  return { score, beaten, withPrev: withPrev.length, prCount };
}

// ── 前回の同じ番手のセットとの差(セット行の右に出る「+2.5kg」「+1回」「RIR+1」「同じ」)──
// セット行とお疲れ様の画面(「前回と比べて ▲6 =7 ▼2」)の両方がこの1つの規則を使う。
// 2か所に書くと、片方だけ直したときに「画面で緑だったセットの数」と「前回超えの数」が食い違う(docs/続ける理由_2026-11.md)。
//
// cur: 今日のセット。**weight は表示単位の数字**(入力欄の値そのもの)。reps / rir / warmup / assisted
// prev: 前回の記録のセット(保存値、weight は kg)
// conv: 単位の換算。{ toDisplay: wU, fromDisplay: fromU, snap: snapKg }(units.js)。省略すると kg のまま
// 戻り値: { kind: "up"|"same"|"down", by: "weight"|"reps"|"rir", value } か null(比べない・比べられない)
//
// 決め方(重量 → 回数 → RIR の順に、最初に違うところで決める):
// - 重量の差は「画面に出ている数字どうし」で取り、0.1 に丸めて 0 なら同じ。kg で記録した前回を lb で表示しているとき、
//   保存値どうしの差では「+0lb」「−0.4lb」のような、打った数字と合わない差が出る
// - 重量が増えて回数が減ったセットも、重量で決まるので「前回超え」
// - 重量・回数が同じなら RIR の差。同じ重量かは表示単位の刻み(snap)で見る(kg の前回を lb で打ち直すと保存値が少しずれる)
// - 補助ありと補助なしは比べない(補助で増えた回数が「伸び」に見える)。ウォームアップ・未実施(RIR 未入力)・空の行も比べない
const INSIGHT_ID_CONV = { toDisplay: insightNum, fromDisplay: insightNum, snap: insightNum };

function setDelta(cur, prev, conv) {
  if (!cur || !prev || cur.warmup) return null;
  if (cur.rir === "" || cur.rir == null) return null;
  if (!!cur.assisted !== !!prev.assisted) return null;
  const c = conv || INSIGHT_ID_CONV;
  const w = insightNum(cur.weight), r = Math.round(insightNum(cur.reps));
  if (!(w > 0 || r > 0)) return null;
  const dw = Math.round((w - c.toDisplay(prev.weight)) * 10) / 10;
  if (dw !== 0) return { kind: dw > 0 ? "up" : "down", by: "weight", value: dw };
  const pr = Math.round(insightNum(prev.reps));
  if (r !== pr) return { kind: r > pr ? "up" : "down", by: "reps", value: r - pr };
  if (prev.rir != null && c.snap(prev.weight) === c.snap(c.fromDisplay(cur.weight))) {
    const d = insightNum(cur.rir) - prev.rir;
    return { kind: d > 0 ? "up" : d < 0 ? "down" : "same", by: "rir", value: d };
  }
  return null;
}

// 今日の種目ぜんぶを前回と比べた数(お疲れ様の画面)。exercises は記録中の today(セットの weight は表示単位)。
// prevSetsOf(name) は前回のワーキングセットの並び(exerciseInsight(...).sets。セット行と同じ相手)。
// 番手は「ウォームアップを除いた通し番号」で、未実施の行も番号を取る(セット行の wsIndex と同じ数え方)。
// 戻り値: { up, same, down, best }。best は今日いちばん伸びた種目 { name, by: "weight"|"reps", value } か null。
// best の選び方: 重量が増えた種目を優先し、増えた割合(前回の表示重量に対する)が最大のもの。重量が増えた種目が無ければ
// 回数の増えが最大のもの。同じ値なら並びが先のもの。前回の重量が 0(自重に加重を足した等)の割合は 100% とみなす
function compareWithPrevious(exercises, prevSetsOf, conv) {
  const c = conv || INSIGHT_ID_CONV;
  let up = 0, same = 0, down = 0;
  let bestW = null, bestR = null;
  for (const ex of exercises || []) {
    const prevSets = (prevSetsOf && prevSetsOf(ex.name)) || [];
    let ws = 0;
    for (const s of ex.sets || []) {
      if (s.warmup) continue;
      ws++;
      const prev = prevSets[ws - 1];
      const d = setDelta(s, prev, c);
      if (!d) continue;
      if (d.kind === "up") up++; else if (d.kind === "down") down++; else same++;
      if (d.kind !== "up") continue;
      if (d.by === "weight") {
        const pw = c.toDisplay(prev.weight);
        const ratio = pw > 0 ? d.value / pw : 1;
        if (!bestW || ratio > bestW.ratio) bestW = { name: ex.name, by: "weight", value: d.value, ratio };
      } else if (d.by === "reps") {
        if (!bestR || d.value > bestR.value) bestR = { name: ex.name, by: "reps", value: d.value };
      }
    }
  }
  const b = bestW || bestR;
  return { up, same, down, best: b ? { name: b.name, by: b.by, value: b.value } : null };
}

// ── 週の目標(分割タブの「今週 1 / 3回」とお疲れ様の画面)──
// 週は**月曜0時**で区切る(履歴の「週別」と同じ)。端末の時刻で区切り、夏時間でずれないよう日付の足し引きで進める。
// 「今週の回数」は今週保存した記録の数(同じ日に2回保存したら2回)。記録の date(保存した時刻)で数える。
// 「続いた週」(streak)は、目標に届いた週が先週から切れずに何週続いているか。今週は届いた時点で数に入れ、
// 届いていない今週は数えず、切れたことにもしない(週の途中で「連続が途切れた」と見せない)。
// 目標を変えたら過去の週も新しい目標で数え直す(週ごとの目標の履歴は持たない)。
function normalizeWeeklyGoal(v) {
  const x = Number(v);
  return Number.isInteger(x) && x >= 1 && x <= 7 ? x : null;
}

function insightWeekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
}
function insightWeekKey(d) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

function weekCounts(workouts) {
  const m = new Map();
  for (const w of workouts || []) {
    const t = new Date(w && w.date).getTime();
    if (!isFinite(t)) continue;
    const k = insightWeekKey(insightWeekStart(t));
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function weekProgress(workouts, goal, now) {
  const counts = weekCounts(workouts);
  const start = insightWeekStart(now);
  const thisWeek = counts.get(insightWeekKey(start)) || 0;
  const g = normalizeWeeklyGoal(goal);
  if (g == null) return { thisWeek, goal: null, streak: 0, reached: false };
  const reached = thisWeek >= g;
  let streak = reached ? 1 : 0;
  const d = new Date(start);
  for (;;) {
    d.setDate(d.getDate() - 7);
    if ((counts.get(insightWeekKey(d)) || 0) >= g) streak++; else break;
  }
  return { thisWeek, goal: g, streak, reached };
}

// 「週の目標を決めましょう」で最初から選んでおく数。今週を除く直近4週の平均を四捨五入して 1〜7 に収める。
// 使い始めて4週に満たない人は、最初の記録の週から先週までの週数で割る(始めたばかりの人を少なく見積もらない)。
// 先週までに記録が無い(今週始めた)なら今週の回数。
function suggestWeeklyGoal(workouts, now) {
  const counts = weekCounts(workouts);
  const start = insightWeekStart(now);
  let firstT = Infinity;
  for (const w of workouts || []) { const t = new Date(w && w.date).getTime(); if (isFinite(t) && t < firstT) firstT = t; }
  const clamp = v => Math.min(7, Math.max(1, Math.round(v)));
  if (!(firstT < start.getTime())) return clamp(counts.get(insightWeekKey(start)) || 1);
  const d = new Date(start);
  let sum = 0, weeks = 0;
  for (let i = 0; i < 4; i++) {
    d.setDate(d.getDate() - 7);
    sum += counts.get(insightWeekKey(d)) || 0;
    weeks++;
    if (d.getTime() <= insightWeekStart(firstT).getTime()) break;
  }
  return clamp(sum / weeks);
}

globalThis.exerciseInsight = exerciseInsight;
globalThis.topSetOf = topSetOf;
globalThis.workoutScore = workoutScore;
globalThis.setDelta = setDelta;
globalThis.compareWithPrevious = compareWithPrevious;
globalThis.normalizeWeeklyGoal = normalizeWeeklyGoal;
globalThis.weekProgress = weekProgress;
globalThis.suggestWeeklyGoal = suggestWeeklyGoal;
