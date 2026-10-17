async (page) => {
function genSeed(lang) {
const DAYS = {
  Push: [
    ["バーベルベンチプレス", "大胸筋", 62.5, 2.5, 10, false, 0, 40],
    ["インクラインダンベルプレス", "大胸筋", 20, 2, 12, true, 0, 0],
    ["ダンベルショルダープレス", "三角筋前部", 16, 2, 12, true, 0, 0],
    ["サイドレイズ", "三角筋中部", 8, 1, 15, true, 0, 0],
    ["トライセッププレスダウン", "上腕三頭筋", 25, 2.5, 12, false, 0, 0],
  ],
  Pull: [
    ["懸垂", "広背筋", 0, 2.5, 10, false, 1.0, 0],
    ["バーベルベントオーバーロウ", "広背筋", 55, 2.5, 10, false, 0, 0],
    ["ラットプルダウン", "広背筋", 50, 2.5, 12, false, 0, 0],
    ["フェイスプル", "三角筋後部", 15, 2.5, 15, false, 0, 0],
    ["バーベルカール", "上腕二頭筋", 25, 2.5, 12, false, 0, 0],
  ],
  Legs: [
    ["バーベルスクワット", "大腿四頭筋", 80, 2.5, 8, false, 0, 50],
    ["ルーマニアンデッドリフト", "ハムストリングス", 70, 2.5, 10, false, 0, 0],
    ["レッグプレス", "大腿四頭筋", 120, 10, 12, false, 0, 0],
    ["ライイングレッグカール", "ハムストリングス", 35, 2.5, 12, false, 0, 0],
    ["スタンディングカーフレイズ", "ふくらはぎ", 60, 5, 15, false, 0, 0],
  ],
};
const ORDER = ["Push", "Pull", "Legs"];
const BW = 70;

// ダブルプログレッション: 3セットとも上限回数に届いたら増量して下限から
function makeState(ex) {
  const [, , w, , hi] = ex;
  return { w, top: hi - 2 };
}
const state = {};
for (const d of ORDER) for (const ex of DAYS[d]) state[ex[0]] = makeState(ex);

const start = new Date("2026-07-05T19:00:00+09:00");
const workouts = [];
let day = 0;
let dayIdx = 0;
// 2日に1回、たまに3日空く。9/21(月)が最後
while (true) {
  const d = new Date(start.getTime() + day * 86400000);
  if (d > new Date("2026-09-21T23:00:00+09:00")) break;
  const session = ORDER[dayIdx % 3];
  const exercises = [];
  let vol = 0;
  for (const ex of DAYS[session]) {
    const [name, muscle, , inc, hi, isDb, bwFactor, wu] = ex;
    const s = state[name];
    const sets = [];
    if (wu) sets.push({ weight: wu, reps: 10, rir: 3, warmup: true, assisted: false });
    const reps = [s.top, Math.max(s.top - 1, hi - 4), Math.max(s.top - 2, hi - 5)];
    const rirs = [2, 1, 1];
    for (let i = 0; i < 3; i++) sets.push({ weight: s.w, reps: reps[i], rir: rirs[i], warmup: false, assisted: false });
    const load = (bwFactor ? BW * bwFactor : 0) + s.w;
    for (const st of sets) if (!st.warmup) vol += (isDb ? 2 : 1) * load * st.reps;
    const e = { name, muscle, sets, isDb, rom: name.includes("カーフ") ? 0.3 : 1.0, bwFactor };
    exercises.push(e);
    // 次回へ進める
    if (s.top >= hi) { s.w = +(s.w + inc).toFixed(1); s.top = hi - 2; } else s.top += 1;
  }
  const dur = 55 + ((dayIdx * 7) % 20);
  const endAt = new Date(d.getTime() + dur * 60000);
  workouts.push({
    date: endAt.toISOString(), session, startAt: d.toISOString(), endAt: endAt.toISOString(),
    durationMin: dur, totalVolume: Math.round(vol), kcal: Math.round(dur * 6), exercises,
  });
  dayIdx++;
  day += dayIdx % 4 === 0 ? 3 : 2;
}

// 次回がPushになるように末尾を落とす(ヒーロー画像はベンチプレス)
while (workouts.length % 3 !== 0) workouts.pop();
dayIdx = workouts.length;
const split = {
  name: "Push / Pull / Legs",
  days: ORDER.map(n => ({ name: n, muscles: n === "Push" ? ["大胸筋", "三角筋前部", "三角筋中部", "上腕三頭筋"]
    : n === "Pull" ? ["広背筋", "三角筋後部", "上腕二頭筋"] : ["大腿四頭筋", "ハムストリングス", "臀部", "ふくらはぎ"],
    exercises: DAYS[n].map(e => e[0]) })),
  cursor: dayIdx % 3,
};
// 英語版はlb表示なので、lbで切りのいい重量(5lb刻み)に寄せたkg値にする
const LB = 0.45359237;
const toLbRound = (kg) => kg === 0 ? 0 : Math.round(kg / LB / 5) * 5 * LB;
const lbWorkouts = workouts.map(w => ({ ...w, exercises: w.exercises.map(e => ({ ...e,
  sets: e.sets.map(st => ({ ...st, weight: toLbRound(st.weight) })) })) }));
{
  const data = {
    workouts: lang === "en" ? lbWorkouts : workouts, split,
    profile: { bodyweight: BW, soundOn: true, defTargetReps: 10, defIncrement: 2.5, lang, unit: lang === "en" ? "lb" : "kg", aiService: "chatgpt" },
    recentNames: [], customExercises: [], exerciseNotes: {}, exerciseOverrides: {},
    lastBackupAt: "2026-09-21T12:00:00.000Z", guideSeen: true,
  };
  return JSON.stringify(data);
}
}

  // 分割タブの「Day ごとの最終○日前」と「直近7日間の部位別」(セット数・先週比・人体図)。2026-10-17、P017 の題材 D・E 用
  // サンプル履歴(9/21 で終わる)を、最後の記録が2日前になるようにずらす(直近7日間と先週の両方に記録が入る)
  const LANG = 'en';
  const D = '/Users/hajimekitamura/Desktop/KURABELL-reels/screens/' + LANG + '-';
  const seed = JSON.parse(genSeed(LANG));
  const ws = seed.workouts;
  const lastStart = new Date(ws[ws.length - 1].startAt).getTime();
  const target = new Date(); target.setDate(target.getDate() - 2); target.setHours(19, 0, 0, 0);
  const off = target.getTime() - lastStart;
  const sh = (s) => new Date(new Date(s).getTime() + off).toISOString();
  for (const w of ws) { w.date = sh(w.date); w.startAt = sh(w.startAt); w.endAt = sh(w.endAt); }
  const SEED = JSON.stringify(seed);
  const T = LANG === 'ja' ? { split: '分割', weekly: '直近7日間の部位別' } : { split: 'Split', weekly: 'Last 7 days by muscle' };
  const ctx = await page.context().browser().newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: LANG === 'ja' ? 'ja-JP' : 'en-US' });
  const ROOT = '/Users/hajimekitamura/OVERLOAD-PLUS';
  await ctx.route('http://kurabell.test/**', (route) => {
    let path = new URL(route.request().url()).pathname; if (path === '/') path = '/index.html';
    return route.fulfill({ path: ROOT + decodeURIComponent(path) });
  });
  const p = await ctx.newPage();
  await p.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('workout-log-v1', s); sessionStorage.setItem('seeded', '1'); } }, SEED);
  const hideBadge = () => p.evaluate(() => { [...document.querySelectorAll('*')].filter(e => e.children.length===0 && /^v\d+$/.test(e.textContent.trim())).forEach(e => e.style.visibility='hidden'); document.activeElement && document.activeElement.blur(); });
  const shot = async (name) => { await hideBadge(); await p.waitForTimeout(500); await p.screenshot({ path: D + name + '.png' }); };
  const missed = [];
  await p.goto('http://kurabell.test/index.html?shot=1');
  await p.waitForTimeout(4000);
  try {
    await p.getByText(T.split, { exact: true }).last().click(); await p.waitForTimeout(1500);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
    await shot('split-days');
    await p.evaluate((txt) => { const e = [...document.querySelectorAll('h3')].find(h => h.textContent.trim() === txt); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 140); }, T.weekly);
    await shot('split-weekly');
  } catch (e) { missed.push(e.message.slice(0, 120)); }
  await ctx.close();
  return { missed, off: Math.round(off / 86400000) };
}
