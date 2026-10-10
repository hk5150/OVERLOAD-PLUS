// AIコーチ(手動版)の答えの取り込み。docs/AIコーチ.md
// index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやexportは使わない。ビルド不要の原則を維持するため)。
//
// 流れ: プロンプトをコピー → 利用者が ChatGPT 等に貼って送る → 答えをアプリに貼る → ここで読む。
// 答えはチャットAIが書いたものをスマホでコピーしてきたものなので、形が崩れている前提で寛容に読む
// (前後の説明文、コードブロックの有無、全角の数字や記号、「“”」の引用符、"24kg" のような文字列の重量)。
// 一方で、取り込んでよいかの判定は厳しくする。アプリに無い種目は取り込まずに知らせ、
// 範囲外の値のセットは捨てて件数を知らせる。
//
// **RIR は絶対に入れない。** このアプリでは RIR が入ったセット=実施済み。案のセットに RIR が入ると、
// やっていないセットが記録に残る。AI が RIR を書いてきても読まない。

// 全角の英数字・記号を半角に(NFKC)、引用符の揺れを " に、ゼロ幅の文字を消す
function normalizeCoachText(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[“”„‟″〝〞]/g, '"')
    .replace(/[​-‍﻿]/g, "");
}

// text の start にある "{" から、対応する "}" までを返す(文字列の中の括弧は数えない)
function balancedObjectAt(text, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

function parseLooseJson(s) {
  try { return JSON.parse(s); } catch { /* 下で末尾のカンマを外して試す */ }
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")); } catch { return null; }
}

// 答えの全文から、exercises の配列を持つ JSON オブジェクトを探す。
// 候補が複数あれば、目印("kurabell")付きのうち最後のもの、無ければ最後のものを採る
// (AI が先に例を書いた場合や、相談文の見本ごと貼った場合に、見本の方を拾わないように)。
// 目印を付けるよう頼んでいるが、付いていなくても exercises があれば読む。
// 戻り値: { ok: true, plan } / { ok: false, error: "empty" | "notFound" }
function extractCoachPlan(text) {
  const src = normalizeCoachText(text).trim();
  if (!src) return { ok: false, error: "empty" };
  const found = [];
  let i = src.indexOf("{");
  while (i !== -1) {
    const body = balancedObjectAt(src, i);
    const obj = body ? parseLooseJson(body) : null;
    if (obj && typeof obj === "object" && Array.isArray(obj.exercises)) {
      found.push(obj);
      i = src.indexOf("{", i + body.length); // 中のセットの { は見ない
    } else {
      // 閉じていない { (説明文の中の記号や、途中で切れたコピー)や読めない JSON は飛ばして、次の { から探す
      i = src.indexOf("{", i + 1);
    }
  }
  if (found.length === 0) return { ok: false, error: "notFound" };
  const marked = found.filter(o => o.kurabell != null);
  return { ok: true, plan: (marked.length ? marked : found)[(marked.length ? marked : found).length - 1] };
}

// 数値として読む。"24kg" → 24、"8回" → 8。読めなければ NaN
function coachNumber(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const m = normalizeCoachText(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

// 1セット分を {w, r, wu} に。キーの揺れ(weight / reps / warmup)と "24x10" のような文字列も受ける
function coachSetOf(s) {
  if (typeof s === "string") {
    const m = normalizeCoachText(s).match(/(-?\d+(?:\.\d+)?)\s*[x×*]\s*(\d+)/i);
    return m ? { w: Number(m[1]), r: Number(m[2]), wu: false } : null;
  }
  if (!s || typeof s !== "object") return null;
  const wu = s.wu ?? s.warmup ?? s.w_up;
  return {
    w: coachNumber(s.w ?? s.weight ?? s.kg ?? s.lb),
    r: coachNumber(s.r ?? s.reps ?? s.rep),
    wu: wu === true || wu === "true" || wu === 1,
  };
}

// 種目名の照合用のキー。全角半角・大文字小文字・空白・中黒・括弧の記号の違いを無視する。
// stripParen: 括弧の中身ごと消す(AI が「サイドレイズ(片手)」のように注記を足してくるため)
function coachNameKey(s, stripParen = false) {
  let x = normalizeCoachText(s).toLowerCase();
  if (stripParen) x = x.replace(/\([^)]*\)|\[[^\]]*\]|「[^」]*」|【[^】]*】/g, "");
  return x.replace(/[\s・·\-_()[\]「」【】'"`]/g, "");
}

// entries: [{ name: 保存用の名前(日本語), labels: [表示名など、AI が書きうる名前] }]
// 返す関数は、AI が書いた名前から保存用の名前を引く(無ければ null)。
// 英語表示の利用者には英語の種目名で一覧を渡すので、英語名でも引けるようにしてある。
// まず括弧の中身を残したキーで引き、無ければ中身を消したキーで引く
// (括弧つきの正式名を持つ種目を、注記を消したせいで別の種目に当てないように)。
function makeCoachNameResolver(entries) {
  const full = new Map(), bare = new Map();
  (entries || []).forEach(e => {
    [e.name, ...(e.labels || [])].filter(Boolean).forEach(label => {
      const a = coachNameKey(label), b = coachNameKey(label, true);
      if (a && !full.has(a)) full.set(a, e.name);
      if (b && !bare.has(b)) bare.set(b, e.name);
    });
  });
  return (raw) => {
    if (raw == null) return null;
    return full.get(coachNameKey(raw)) ?? bare.get(coachNameKey(raw, true)) ?? null;
  };
}

// 読んだ案を、取り込める形に絞る。
//   resolveName: makeCoachNameResolver の戻り値
//   weightInRange(w): 表示単位の重量 w が保存できる範囲か(index.html で kg に直して SET_VALUE_LIMITS と比べる)
//   maxReps: 回数の上限
//   weightStep: 重量の単位(表示単位)。渡すと、その単位に丸めて数える(アプリ全体で 1kg 刻み、2026-10-10)
// 戻り値: { exercises: [{ name, sets: [{ w, r, wu }] }], unknown: [AI が書いた名前], dropped: 捨てたセットの数, rounded: 丸めた数 }
// 同じ種目が2回出てきたら、後の方は捨てる(同名のカードが2枚あると前回の記録が片方にしか付かない)。
function validateCoachPlan(plan, { resolveName, weightInRange, maxReps, weightStep }) {
  const exercises = [], unknown = [];
  let dropped = 0, rounded = 0;
  const seen = new Set();
  (plan?.exercises || []).forEach(raw => {
    const rawName = typeof raw === "string" ? raw : (raw?.name ?? raw?.exercise ?? raw?.n);
    const name = resolveName(rawName);
    const rawSets = Array.isArray(raw?.sets) ? raw.sets : [];
    if (!name) { if (rawName != null && String(rawName).trim()) unknown.push(String(rawName).trim()); return; }
    if (seen.has(name)) { dropped += rawSets.length; return; }
    const sets = [];
    rawSets.forEach(s => {
      const v = coachSetOf(s);
      const r = v ? Math.round(v.r) : NaN;
      if (!v || !Number.isFinite(v.w) || v.w < 0 || !Number.isFinite(r) || r < 1 || r > maxReps) { dropped++; return; }
      // 単位に丸めてから範囲を確かめる(丸めた結果が範囲外になるものは取り込まない)
      let w = v.w;
      if (weightStep > 0) w = Math.round(Math.round(w / weightStep) * weightStep * 100) / 100;
      if (!weightInRange(w)) { dropped++; return; }
      if (Math.abs(w - v.w) > 1e-9) rounded++;
      sets.push({ w, r, wu: v.wu });
    });
    if (sets.length === 0) return; // セットが1つも残らない種目は入れない(捨てた数は上で数えた)
    seen.add(name);
    exercises.push({ name, sets });
  });
  return { exercises, unknown, dropped, rounded };
}

// 実施済み = ウォームアップでなく、RIR が入っている(index.html の他の判定と同じ)
const coachSetDone = (s) => !s.warmup && s.rir !== "" && s.rir != null;

// 案を today に合わせる。始める前は today = [] で呼ぶ(案がそのまま today になる)。
//   newExercise(name): 新しく足す種目のカード(index.html の addExercise と同じ形、sets は空で返してよい)
//
// Watch の入力は「種目の id + 行番号」で届く(src/domain/watch.js の applyWatchOps)ので、次を守る:
//   - 案に残る種目は、今のカードの id をそのまま使う(id が変わると、届く途中の Watch の入力が捨てられる)
//   - 各種目の「最後の実施済みの行」までは一切触らず、その後ろだけを案のセットに置き換える
//     (行が前にずれると、遅れて届いた Watch の値が別のセットに入る)。案には実施済みを含めない約束で頼んでいる
//   - 案に無い種目は、実施済みのセットが1つでもあれば残し、無ければ外す
// 並びは、残すだけの種目(実施済みがあって案に無い)を元の順で先に、そのあと案の順。
// スーパーセットの印は、並び替えの後で隣に同じ印の種目が無くなったものだけ外す
// (表示もインターバルも「隣と同じ印か」で判定している。離れたまま印が残ると、後で別の種目と繋いだときに巻き込む)。
function mergeCoachPlan(today, plan, { newExercise }) {
  const cur = Array.isArray(today) ? today : [];
  const used = new Set();
  const planned = (plan?.exercises || []).map(p => {
    const idx = cur.findIndex((ex, i) => !used.has(i) && ex.name === p.name);
    const planSets = p.sets.map(s => ({ weight: String(s.w), reps: String(s.r), rir: "", warmup: !!s.wu }));
    if (idx === -1) return { ...newExercise(p.name), sets: planSets };
    used.add(idx);
    const ex = cur[idx];
    let last = -1;
    ex.sets.forEach((s, i) => { if (coachSetDone(s)) last = i; });
    return { ...ex, sets: [...ex.sets.slice(0, last + 1), ...planSets] };
  });
  const keptOnly = cur.filter((ex, i) => !used.has(i) && ex.sets.some(coachSetDone));
  const next = [...keptOnly, ...planned];
  return next.map((ex, i) => {
    if (ex.ssGroup == null) return ex;
    if (next[i - 1]?.ssGroup === ex.ssGroup || next[i + 1]?.ssGroup === ex.ssGroup) return ex;
    const { ssGroup, ...rest } = ex;
    return rest;
  });
}

// 「元に戻す」(記録中に案を当てた直後の5秒)。before = 当てる前の today、current = 今の today。
// 丸ごと before に戻すと、その5秒の間に Watch や iPhone で入れたセットが全種目で消える。
// 実施済みの行が増えた種目は今のまま残し、増えていない種目だけを当てる前に戻す。
// 案で新しく入った種目は、実施済みの行があれば末尾に残す。
function revertCoachPlan(before, current) {
  const done = (ex) => (ex?.sets || []).filter(coachSetDone).length;
  const cur = Array.isArray(current) ? current : [];
  const back = (before || []).map(b => {
    const c = cur.find(x => x.id === b.id);
    return c && done(c) > done(b) ? c : b;
  });
  const added = cur.filter(c => !(before || []).some(b => b.id === c.id) && done(c) > 0);
  return [...back, ...added];
}

globalThis.normalizeCoachText = normalizeCoachText;
globalThis.extractCoachPlan = extractCoachPlan;
globalThis.coachNameKey = coachNameKey;
globalThis.makeCoachNameResolver = makeCoachNameResolver;
globalThis.validateCoachPlan = validateCoachPlan;
globalThis.coachSetDone = coachSetDone;
globalThis.mergeCoachPlan = mergeCoachPlan;
globalThis.revertCoachPlan = revertCoachPlan;
