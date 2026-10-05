// 分割の Day の組み立て(改善要望 2・3a、docs/改善要望_2026-10.md)。
// index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやexportは使わない。ビルド不要の原則を維持するため)。

// 「おまかせで入れる」の部位ごとの優先順。上から取る。
// 種目名は index.html の EXERCISE_DB の正式名で持つこと(別名だと前回の記録と名前が一致しなくなる)。
// tests/dayPlan.test.js が、全部の名前が EXERCISE_DB にあり、部位も一致することを縛っている。
// キーの並びは、Day の中で先に取る部位の順(大きい部位から)。
// 脊柱起立筋・前腕・腹筋は北村さんの表に無く、こちらで1つずつ決めた。
const STARTER_PICKS = {
  "大胸筋": ["バーベルベンチプレス", "インクラインダンベルプレス", "ケーブルフライ"],
  "広背筋": ["ラットプルダウン", "ケーブルシーテッドロウ", "ワンハンドダンベルロウ"],
  "大腿四頭筋": ["バーベルスクワット", "レッグプレス", "レッグエクステンション"],
  "ハムストリングス": ["ルーマニアンデッドリフト"],
  "臀部": ["ヒップスラスト"],
  "脊柱起立筋": ["デッドリフト"],
  "僧帽筋": ["ダンベルシュラッグ"],
  "三角筋前部": ["ダンベルショルダープレス"],
  "三角筋中部": ["サイドレイズ"],
  "三角筋後部": ["フェイスプル"],
  "上腕二頭筋": ["ダンベルカール"],
  "上腕三頭筋": ["トライセッププレスダウン"],
  "ふくらはぎ": ["スタンディングカーフレイズ"],
  "前腕": ["リストカール"],
  "腹筋": ["クランチ"],
};
const STARTER_FULL_BODY = ["バーベルスクワット", "バーベルベンチプレス", "デッドリフト", "ラットプルダウン", "ダンベルショルダープレス"];
const STARTER_MAX = 5;

// Day の部位から、登録する種目を最大5つ選ぶ。部位を順番に1つずつ回して取るので、
// 部位が少ない Day ほど1部位から多く取る(胸だけの Day は胸の3種目、胸・肩・三頭の Day は各1つ+胸の2つ目)。
function starterPicks(muscles) {
  const ms = muscles || [];
  if (ms.includes("全身")) return STARTER_FULL_BODY.slice();
  const order = Object.keys(STARTER_PICKS);
  const lists = ms.filter(m => STARTER_PICKS[m]).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(m => STARTER_PICKS[m]);
  const out = [];
  for (let r = 0; out.length < STARTER_MAX; r++) {
    const row = lists.filter(l => r < l.length).map(l => l[r]);
    if (row.length === 0) break;
    for (const n of row) if (out.length < STARTER_MAX && !out.includes(n)) out.push(n);
  }
  return out;
}

// 部位から付ける Day 名(「胸・肩」)。保存は常に日本語で、英語の画面では dayName が
// 「・」で区切って1語ずつ訳す(Chest & Shoulders)。言語を切り替えても名前が混ざらないように。
const DAY_GROUP_OF = {
  "大胸筋": "胸",
  "広背筋": "背中", "僧帽筋": "背中", "脊柱起立筋": "背中",
  "三角筋前部": "肩", "三角筋中部": "肩", "三角筋後部": "肩",
  "上腕二頭筋": "腕", "上腕三頭筋": "腕", "前腕": "腕",
  "大腿四頭筋": "脚", "ハムストリングス": "脚", "臀部": "脚", "ふくらはぎ": "脚",
  "腹筋": "腹",
  "全身": "全身",
};
const DAY_GROUP_ORDER = ["全身", "胸", "背中", "肩", "腕", "脚", "腹"];
function autoDayName(muscles) {
  const groups = [...new Set((muscles || []).map(m => DAY_GROUP_OF[m]).filter(Boolean))];
  if (groups.includes("全身")) return "全身";
  return groups.sort((a, b) => DAY_GROUP_ORDER.indexOf(a) - DAY_GROUP_ORDER.indexOf(b)).join("・");
}

// 部位を変えたときの Day 名。まだ手で名前を付けていない(既定の「Day 3」か、前の部位から
// 自動で付けた名前のまま)ときだけ付け直す。手で付けた名前(「Push」など)は触らない。
// opts.locked: その名前の記録がすでにある。Day 名は記録の session に入っていて、前回の同じ Day・
//   同じ Day の平均・今日のメニューを名前で引いている。変えるとつながりが切れるので、記録がある Day は変えない
//   (5分割のプリセットの「脚」は autoDayName と同じ形なので、これが無いと腹筋を足しただけで「脚・腹」になった。reviewer 指摘)
// opts.taken: ほかの Day の名前。同じ名前が2つあると記録が混ざるので、重なったら「胸・肩 2」のように番号を付ける
function nextDayName(day, nextMuscles, index, opts) {
  const o = opts || {};
  if (o.locked) return day.name;
  const auto = autoDayName(day.muscles);
  const base = day.name.replace(/ \d+$/, "");
  const untouched = /^Day \d+$/.test(day.name) || (auto !== "" && base === auto);
  if (!untouched) return day.name;
  const next = autoDayName(nextMuscles);
  return next ? uniqueDayName(next, o.taken) : uniqueDayName(`Day ${index + 1}`, o.taken, true);
}

// taken に無い名前にする。isDayN なら「Day N」の N を進め、そうでなければ「 2」「 3」を付ける
function uniqueDayName(name, taken, isDayN) {
  const t = taken || [];
  if (!t.includes(name)) return name;
  if (isDayN) {
    let n = parseInt(name.slice(4), 10);
    while (t.includes(`Day ${n}`)) n++;
    return `Day ${n}`;
  }
  let k = 2;
  while (t.includes(`${name} ${k}`)) k++;
  return `${name} ${k}`;
}

globalThis.STARTER_PICKS = STARTER_PICKS;
globalThis.STARTER_FULL_BODY = STARTER_FULL_BODY;
globalThis.STARTER_MAX = STARTER_MAX;
globalThis.starterPicks = starterPicks;
globalThis.DAY_GROUP_OF = DAY_GROUP_OF;
globalThis.autoDayName = autoDayName;
globalThis.nextDayName = nextDayName;
globalThis.uniqueDayName = uniqueDayName;
