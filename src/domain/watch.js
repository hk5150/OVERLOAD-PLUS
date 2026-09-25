// Apple Watch との同期(iOS 版のみ。Web 版ではネイティブ部分がすべて何もしない)。
// 設計と判断の理由は docs/Watchアプリ.md。前提だけここに書くと:
//
//   **iPhone(この JS)が唯一の正。** Watch には表示用に整形済みのスナップショットを送り、
//   Watch で入力されたセットは「操作(op)」として送り返される。op はネイティブ側のキューに
//   溜まっていて、JS が動いた時点で applyWatchOps で today に合流させる
//   (iPhone のアプリが裏で寝ている間も、Watch では入力を続けられるように)。
//
//   重量・回数は today と同じ「表示単位の文字列」でやりとりする。Watch 側で kg/lb を換算しない。
//   ボリューム・1RM・保存・課金判定は Swift に持ち込まない(二重化させない)。
//
//   op の取りこぼし対策: ネイティブのキューは「読む(peek)」と「消す(ack)」を分けてある。
//   JS は合流させた op の id を下書きに一緒に保存し、保存できてから ack する。
//   途中でアプリが落ちても、次の起動で同じ op を読み直し、下書きの id で二重適用を弾く。

const WATCH_SNAPSHOT_VERSION = 1;
// スナップショットに載せる「合流済みの opId」の件数。Watch はこれを見て楽観反映を外す。
// Watch が一度に溜める op の数(1回のトレーニングのセット数)より十分大きければよい。
const WATCH_APPLIED_KEEP = 100;

const watchRir = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));

// index.html から渡す情報で、Watch に送るスナップショットを作る純粋関数(テスト対象)。
// exercises の各要素: { id, name, weightLabel, unit, step, restAfter, sets(today のまま), prevSets(kg。exerciseInsight の sets) }
// fmtW: kg → 表示単位の文字列(wU)
function buildWatchSnapshot({ now, exercises = [], restStartAt = null, dayName = null, menu = [], labels, applied = [], fmtW }) {
  const state = exercises.length > 0 ? "active" : menu.length > 0 ? "menu" : "idle";
  return {
    v: WATCH_SNAPSHOT_VERSION,
    sentAt: now,
    state,
    restStartAt: state === "active" ? restStartAt : null,
    dayName,
    labels,
    exercises: exercises.map((ex) => {
      let ws = 0; // ワーキングセットの通し番号(index.html の wsIndex と同じ数え方)
      return {
        id: ex.id,
        name: ex.name,
        weightLabel: ex.weightLabel,
        unit: ex.unit,
        step: ex.step,
        restAfter: ex.restAfter,
        sets: ex.sets.map((s) => {
          if (!s.warmup) ws += 1;
          const p = s.warmup ? null : (ex.prevSets && ex.prevSets[ws - 1]) || null;
          return {
            weight: s.weight == null ? "" : String(s.weight),
            reps: s.reps == null ? "" : String(s.reps),
            rir: s.warmup ? null : watchRir(s.rir),
            warmup: !!s.warmup,
            prev: p ? {
              text: `${p.assisted ? labels.assisted : ""}${fmtW(p.weight)}${ex.unit}×${p.reps}${p.rir != null ? ` RIR${p.rir}` : ""}`,
              weight: String(fmtW(p.weight)),
              reps: String(p.reps),
              rir: p.rir != null ? p.rir : null,
            } : null,
          };
        }),
      };
    }),
    menu,
    applied: applied.slice(-WATCH_APPLIED_KEEP),
  };
}

// Watch の op を today に合流させる純粋関数(テスト対象)。
// op は2種類: kind "add"(行の追加。値は直前の行の複製) / "set"(その行の値を確定)。
// Watch は届く状態なら sendMessage、届かなければ transferUserInfo で送るので、**届く順番は入れ替わりうる**。
// そのため作成時刻(at)順に並べ、次の規則で冪等に扱う:
// - set: 行があれば上書き。行数ちょうどなら足す(add より先に届いた)。それより先は保留
// - add: 行がすでにあれば何もしない(set が先に届いて足してある)。行数ちょうどなら足す。それより先は保留
// - 存在しない種目への op は捨てる(iPhone 側で種目を消した・記録を保存した)
// 保留(deferred)は合流済みに数えない。キューに残り、間の行が届いた後の読み込みで適用される。
// 足す行は直前の行を複製する(iPhone の「セットを追加」と同じく、補助の印などを引き継ぐ)。
// 戻り値: { today, restStartAt(適用できた op のうち最新の休憩開始), applied, deferred }
function applyWatchOps(today, ops, alreadyApplied = []) {
  const seen = new Set(alreadyApplied);
  let next = today;
  let restStartAt = null;
  const applied = [];
  const deferred = [];
  const sorted = (ops || []).filter((op) => op && op.opId).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const op of sorted) {
    if (seen.has(op.opId)) continue;
    seen.add(op.opId);
    const i = next.findIndex((ex) => ex.id === op.exId);
    if (i < 0) { applied.push(op.opId); continue; }
    const ex = next[i];
    const sets = ex.sets.slice();
    const values = { weight: op.weight, reps: op.reps, rir: op.rir == null ? "" : op.rir };
    if (op.setIndex > sets.length) { deferred.push(op.opId); continue; }
    applied.push(op.opId);
    if (op.setIndex === sets.length) {
      const last = sets[sets.length - 1];
      sets.push({ ...(last || {}), ...values, warmup: false });
    } else if (op.kind === "add") {
      continue; // 行はすでにある
    } else {
      sets[op.setIndex] = { ...sets[op.setIndex], ...values };
    }
    next = next.map((e, j) => (j === i ? { ...ex, sets } : e));
    if (op.restStartAt != null && (restStartAt == null || op.restStartAt > restStartAt)) restStartAt = op.restStartAt;
  }
  return { today: next, restStartAt, applied, deferred };
}

function capWatch() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    const c = w ? w.Capacitor : null;
    if (c && typeof c.isNativePlatform === "function" && c.isNativePlatform() && c.Plugins && c.Plugins.Watch) {
      return c.Plugins.Watch;
    }
  } catch { /* ignore */ }
  return null;
}

// 最新のスナップショットを Watch へ(updateApplicationContext。最後の1件だけが届けばよい)。
// 同じ内容を何度送っても害はないが、ネイティブ側で直前と同じなら送らない。
async function syncWatchSnapshot(snapshot) {
  const plugin = capWatch();
  if (!plugin) return;
  try {
    await plugin.updateSnapshot({ snapshot: JSON.stringify(snapshot) });
  } catch { /* Watch に送れなくても記録の継続を妨げない */ }
}

// ネイティブのキューにある op を読む(消さない)。
async function peekWatchOps() {
  const plugin = capWatch();
  if (!plugin) return [];
  try {
    const res = await plugin.pendingOps();
    return ((res && res.ops) || []).map((s) => {
      try { return JSON.parse(s); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

// 下書きに保存できた op をキューから消す。
async function ackWatchOps(opIds) {
  const plugin = capWatch();
  if (!plugin || !opIds || opIds.length === 0) return;
  try {
    await plugin.ackOps({ opIds });
  } catch { /* 消せなくても、次回は下書きの id で二重適用を弾く */ }
}

// Watch から op が届いたときに呼ばれる。戻り値の remove() で解除する。
function onWatchOps(handler) {
  const plugin = capWatch();
  if (!plugin) return { remove() {} };
  let sub = null;
  let removed = false;
  Promise.resolve(plugin.addListener("opsReceived", () => handler())).then((s) => {
    sub = s;
    if (removed && sub) sub.remove();
  }).catch(() => {});
  return { remove() { removed = true; if (sub) sub.remove(); } };
}

globalThis.WATCH_APPLIED_KEEP = WATCH_APPLIED_KEEP;
globalThis.buildWatchSnapshot = buildWatchSnapshot;
globalThis.applyWatchOps = applyWatchOps;
globalThis.syncWatchSnapshot = syncWatchSnapshot;
globalThis.peekWatchOps = peekWatchOps;
globalThis.ackWatchOps = ackWatchOps;
globalThis.onWatchOps = onWatchOps;
