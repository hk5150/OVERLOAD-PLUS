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

  const LANG = (typeof SNS_LANG !== 'undefined') ? SNS_LANG : 'ja';
  const D = '/Users/hajimekitamura/Desktop/KURABELL-reels/screens/' + LANG + '-';
  const T = LANG === 'ja'
    ? { start: 'タップして記録を始める', go: 'この内容で記録を開始', expand: 'タップで拡大', close: '閉じる', log: '記録', hist: '履歴', last: '前回 9/17', W: '72.5' }
    : { start: 'Tap to start logging', go: 'Start with this menu', expand: 'Tap to expand', close: 'Close', log: 'Log', hist: 'History', last: 'Last 9/17', W: '160' };
  const ctx = await page.context().browser().newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: LANG === 'ja' ? 'ja-JP' : 'en-US' });
  const ROOT = '/Users/hajimekitamura/OVERLOAD-PLUS';
  await ctx.route('http://kurabell.test/**', (route) => {
    let path = new URL(route.request().url()).pathname; if (path === '/') path = '/index.html';
    return route.fulfill({ path: ROOT + decodeURIComponent(path) });
  });
  const p = await ctx.newPage();
  await p.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('workout-log-v1', s); sessionStorage.setItem('seeded', '1'); } }, genSeed(LANG));
  const hideBadge = () => p.evaluate(() => { [...document.querySelectorAll('*')].filter(e => e.children.length===0 && /^v\d+$/.test(e.textContent.trim())).forEach(e => e.style.visibility='hidden'); document.activeElement && document.activeElement.blur(); });
  const shot = async (name) => { await hideBadge(); await p.waitForTimeout(500); await p.screenshot({ path: D + name + '.png' }); };
  const scrollToText = (re, off, minTop) => p.evaluate(([re, off, minTop]) => { const r = new RegExp(re); const e=[...document.querySelectorAll('*')].find(e=>e.children.length===0 && r.test(e.textContent.trim()) && e.getBoundingClientRect().top + scrollY > minTop); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - off); }, [re, off, minTop]);
  await p.goto('http://kurabell.test/index.html?shot=1');
  await p.waitForTimeout(4000);
  await p.getByText(T.start).click(); await p.waitForTimeout(1200);
  await shot('menu');
  await p.getByText(T.go).click(); await p.waitForTimeout(1200);
  const set = async (i, v) => { await p.evaluate(([i, v]) => { const e = document.querySelectorAll('input')[i]; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); }, [i, v]); await p.waitForTimeout(250); };
  const rir = async (i, v) => { await p.evaluate(([i, v]) => { let e = document.querySelectorAll('input')[i]; while (e && ![...e.querySelectorAll('*')].some(x => x.children.length===0 && x.textContent.trim()==='3+')) e = e.parentElement; const bs = [...e.querySelectorAll('button')].filter(x => x.textContent.trim()===v); bs[bs.length-1].click(); }, [i, v]); await p.waitForTimeout(300); };
  await rir(0, '3+');
  await set(2, T.W); await set(3, '10'); await rir(2, '1');
  await set(4, T.W); await set(5, '8'); await rir(4, '1');
  await set(6, T.W); await set(7, '8');
  await p.waitForTimeout(800);
  // 経過38分・休憩1分37秒の状態で開き直す(下書き復元経路)
  await p.addInitScript(() => { if (sessionStorage.getItem('draftFix')) return; sessionStorage.setItem('draftFix','1'); const d = JSON.parse(localStorage.getItem('workout-draft-v1')); d.startAt = Date.now() - 38*60000 - 12000; d.restStartAt = Date.now() - 97000; d.savedAt = Date.now(); localStorage.setItem('workout-draft-v1', JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(4000);
  await p.getByText('OK', { exact: true }).click(); await p.waitForTimeout(400);
  const missed = [];
  try { await p.getByText(T.expand).click({ timeout: 4000 }); await p.waitForTimeout(1200); await shot('rest'); await p.getByText(T.close, { exact: true }).first().click({ timeout: 4000 }); await p.waitForTimeout(500); } catch (e) { missed.push('rest'); }
  try { await scrollToText('^' + T.last, 175, 0); await shot('hero'); } catch (e) { missed.push("await scrollToText('^' + T.last, 175, 0)"); }
  try { await p.getByText(T.hist, { exact: true }).last().click(); await p.waitForTimeout(1500); } catch (e) { missed.push('await p.getByText(T.hist, { exact: true '); }
  try { await p.evaluate(() => window.scrollTo(0, 0)); await shot('charts'); } catch (e) { missed.push('await p.evaluate(() => window.scrollTo(0'); }
  try { await scrollToText('^' + T.hist + '$', 250, 400); await shot('calendar'); } catch (e) { missed.push("await scrollToText('^' + T.hist + '$', 2"); }
  // --- SNS 用に追加: フォーム(YouTube 検索)のボタンと AIコーチ ---
  try { await p.getByText(T.log, { exact: true }).last().click(); await p.waitForTimeout(1200); } catch (e) { missed.push('await p.getByText(T.log, { exact: true }'); }
  try { await scrollToText('^' + (LANG === 'ja' ? 'フォーム' : 'Form') + '$', 420, 0); } catch (e) { missed.push("await scrollToText('^' + (LANG === 'ja' "); }
  try { await p.evaluate((lbl) => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === lbl); if (b) { b.style.outline = '4px solid #E8B33C'; b.style.outlineOffset = '3px'; b.style.borderRadius = '10px'; } }, LANG === 'ja' ? 'フォーム' : 'Form'); } catch (e) { missed.push('await p.evaluate((lbl) => { const b = [.'); }
  try { await shot('form'); } catch (e) { missed.push("await shot('form');"); }
  try { await p.evaluate(() => window.scrollTo(0, 0)); } catch (e) { missed.push('await p.evaluate(() => window.scrollTo(0'); }
  const coach = p.getByText(LANG === 'ja' ? /AIコーチ/ : /AI Coach|Rework the rest with AI/).first();
  if (await coach.count()) { await coach.scrollIntoViewIfNeeded(); await shot('coach-button'); await coach.click(); await p.waitForTimeout(1500); await shot('coach'); }
  const txt = await p.evaluate(() => document.body.innerText.slice(0, 300));
  await ctx.close();
  return { missed, txt: txt.slice(0, 200) };
}
