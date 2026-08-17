// 日本語/英語の表示切り替え。index.htmlから<script src>で素のグローバルスクリプトとして
// 読み込まれる(importやmodule.exportsは使わない。ビルド不要の原則を維持するため)。
//
// 設計の要点は docs/多言語化.md を参照。前提だけここに書くと:
//
//   種目名・部位名・器具名・分割の曜日名は「表示文字列」ではなく**保存データのキー**である。
//   記録は { name: "バーベルベンチプレス" } として保存され、SQLiteでは
//   workout_exercises.name というインデックス付きカラムになっている。
//   exerciseNotes / exerciseOverrides / recentNames / split.days[].muscles も名前キー。
//   よって**保存側は日本語名のまま一切変えず**、表示の直前にこの対応表を引いて英語にする。
//   対応表に無い名前(ユーザーのカスタム種目・リネームした曜日)は、そのまま返す。
//
// この方針のおかげで storage.js / db/ 以下 / backupValidation.js は無変更で済んでいる。
// 逆に言えば、ここの対応表は「英語名 → 日本語名」の逆変換には使ってはならない。

// ================= 言語の決定 =================
// 保存された設定 > ブラウザ/OSの言語 > 日本語。
// navigator.language は "en-US" のような地域付きで来るので前2文字だけ見る。
const SUPPORTED_LANGS = ["ja", "en"];

function resolveLang(savedLang, navigatorLang) {
  if (SUPPORTED_LANGS.includes(savedLang)) return savedLang;
  const head = String(navigatorLang || "").slice(0, 2).toLowerCase();
  return head === "en" ? "en" : "ja";
}

let LANG = "ja";
const getLang = () => LANG;
const setLang = (lang) => { LANG = SUPPORTED_LANGS.includes(lang) ? lang : "ja"; return LANG; };

// ================= UI文言 =================
// jaとenのキー集合が完全一致していることを tests/i18n.test.js が機械的に強制する。
// 378本を手で突き合わせるのは無理なので、抜けはテストで落とす。
// {n} のようなプレースホルダは t(key, { n: ... }) で差し込む。
const I18N = {
  ja: {
    "settings.language": "言語",
    "settings.languageDesc": "種目名・部位名も切り替わります。記録済みのデータは変わりません。",
    "lang.ja": "日本語",
    "lang.en": "English",
    // YouTubeのフォーム検索。表示文言ではなく検索クエリなので、言語ごとに語順ごと変える。
    "youtube.query": "{name} やり方 フォーム",
  },
  en: {
    "settings.language": "Language",
    "settings.languageDesc": "Exercise and muscle names switch too. Your saved records are not changed.",
    "lang.ja": "日本語",
    "lang.en": "English",
    "youtube.query": "{name} how to proper form",
  },
};

// 未定義のキーはキー文字列そのものを返す。空文字を返すとレイアウトだけ残って
// 原因が分からなくなるため、画面に出して気づけるようにする。
function t(key, params) {
  const table = I18N[LANG] || I18N.ja;
  let s = table[key] != null ? table[key] : (I18N.ja[key] != null ? I18N.ja[key] : key);
  if (params) {
    for (const k of Object.keys(params)) s = s.split("{" + k + "}").join(String(params[k]));
  }
  return s;
}

// ================= ドメイン語彙(日本語名 → 英語表示名) =================
// 日本語側は「キーそのもの」なので二重に持たない。
const EX_NAMES_EN = {
  // 胸
  "バーベルベンチプレス": "Barbell Bench Press",
  "ダンベルベンチプレス": "Dumbbell Bench Press",
  "ダンベルフライ": "Dumbbell Fly",
  "チェストプレス": "Chest Press",
  "ペックデックフライ": "Pec Deck Fly",
  "スミスマシンベンチプレス": "Smith Machine Bench Press",
  "ケーブルフライ": "Cable Fly",
  "ディップス": "Dips",
  "プッシュアップ": "Push-Up",
  "インクラインバーベルベンチプレス": "Incline Barbell Bench Press",
  "インクラインダンベルプレス": "Incline Dumbbell Press",
  "インクラインチェストプレス": "Incline Chest Press",
  "スミスマシンインクラインプレス": "Smith Machine Incline Press",
  "ロー・トゥ・ハイ・ケーブルフライ": "Low-to-High Cable Fly",
  // 広背筋
  "懸垂": "Pull-Up",
  "アシスト懸垂": "Assisted Pull-Up",
  "ラットプルダウン": "Lat Pulldown",
  "片手ラットプルダウン": "Single-Arm Lat Pulldown",
  "ストレートアームプルダウン": "Straight-Arm Pulldown",
  "ダンベルプルオーバー": "Dumbbell Pullover",
  "バーベルベントオーバーロウ": "Barbell Bent-Over Row",
  "Tバーロウ": "T-Bar Row",
  "ワンハンドダンベルロウ": "One-Arm Dumbbell Row",
  "チェストサポートダンベルロウ": "Chest-Supported Dumbbell Row",
  "ケーブルシーテッドロウ": "Seated Cable Row",
  "マシンロウ": "Machine Row",
  "インバーテッドロウ": "Inverted Row",
  // 僧帽筋
  "バーベルシュラッグ": "Barbell Shrug",
  "ダンベルシュラッグ": "Dumbbell Shrug",
  "ケーブルシュラッグ": "Cable Shrug",
  // 脊柱起立筋
  "デッドリフト": "Deadlift",
  "ラックプル": "Rack Pull",
  "バックエクステンション": "Back Extension",
  // 三角筋前部
  "バーベルオーバーヘッドプレス": "Barbell Overhead Press",
  "ダンベルショルダープレス": "Dumbbell Shoulder Press",
  "アーノルドプレス": "Arnold Press",
  "マシンショルダープレス": "Machine Shoulder Press",
  "スミスマシンショルダープレス": "Smith Machine Shoulder Press",
  "フロントレイズ": "Front Raise",
  // 三角筋中部
  "サイドレイズ": "Lateral Raise",
  "ケーブルサイドレイズ": "Cable Lateral Raise",
  "マシンサイドレイズ": "Machine Lateral Raise",
  "アップライトロウ": "Upright Row",
  // 三角筋後部
  "リアデルトフライ": "Rear Delt Fly",
  "リバースペックデック": "Reverse Pec Deck",
  "ケーブルリアデルトフライ": "Cable Rear Delt Fly",
  "フェイスプル": "Face Pull",
  // 上腕二頭筋
  "バーベルカール": "Barbell Curl",
  "EZバーカール": "EZ-Bar Curl",
  "ダンベルカール": "Dumbbell Curl",
  "インクラインダンベルカール": "Incline Dumbbell Curl",
  "ハンマーカール": "Hammer Curl",
  "プリーチャーカール": "Preacher Curl",
  "ケーブルカール": "Cable Curl",
  "マシンカール": "Machine Curl",
  // 上腕三頭筋
  "ナローグリップベンチプレス": "Close-Grip Bench Press",
  "スカルクラッシャー": "Skull Crusher",
  "トライセッププレスダウン": "Triceps Pushdown",
  "オーバーヘッドケーブルエクステンション": "Overhead Cable Extension",
  "ダンベルオーバーヘッドエクステンション": "Dumbbell Overhead Extension",
  "トライセップキックバック": "Triceps Kickback",
  "マシントライセップエクステンション": "Machine Triceps Extension",
  "ベンチディップス": "Bench Dips",
  // 前腕
  "リストカール": "Wrist Curl",
  "リバースリストカール": "Reverse Wrist Curl",
  "ファーマーズウォーク": "Farmer's Walk",
  // 大腿四頭筋
  "バーベルスクワット": "Barbell Squat",
  "フロントスクワット": "Front Squat",
  "レッグプレス": "Leg Press",
  "ハックスクワット": "Hack Squat",
  "レッグエクステンション": "Leg Extension",
  "ブルガリアンスクワット": "Bulgarian Split Squat",
  "ランジ": "Lunge",
  "ゴブレットスクワット": "Goblet Squat",
  "スミスマシンスクワット": "Smith Machine Squat",
  // ハムストリングス
  "ルーマニアンデッドリフト": "Romanian Deadlift",
  "ダンベルルーマニアンデッドリフト": "Dumbbell Romanian Deadlift",
  "ライイングレッグカール": "Lying Leg Curl",
  "シーテッドレッグカール": "Seated Leg Curl",
  "グッドモーニング": "Good Morning",
  "ノルディックハムカール": "Nordic Hamstring Curl",
  // 臀部
  "ヒップスラスト": "Hip Thrust",
  "ケーブルキックバック": "Cable Kickback",
  "ヒップアブダクション": "Hip Abduction",
  "ステップアップ": "Step-Up",
  // ふくらはぎ
  "スタンディングカーフレイズ": "Standing Calf Raise",
  "シーテッドカーフレイズ": "Seated Calf Raise",
  "レッグプレスカーフレイズ": "Leg Press Calf Raise",
  // 腹筋
  "クランチ": "Crunch",
  "ケーブルクランチ": "Cable Crunch",
  "レッグレイズ": "Leg Raise",
  "ハンギングレッグレイズ": "Hanging Leg Raise",
  "アブローラー": "Ab Wheel Rollout",
  "アブドミナルマシン": "Abdominal Machine",
};

// 部位名。解剖学名の直訳(Latissimus Dorsi等)ではなく、英語圏のトレーニングアプリで
// 実際に使われる呼び方に寄せる(Lats / Traps / Quads)。
const MUSCLE_NAMES_EN = {
  "胸": "Chest",
  "広背筋": "Lats",
  "僧帽筋": "Traps",
  "脊柱起立筋": "Lower Back",
  "三角筋前部": "Front Delts",
  "三角筋中部": "Side Delts",
  "三角筋後部": "Rear Delts",
  "上腕二頭筋": "Biceps",
  "上腕三頭筋": "Triceps",
  "前腕": "Forearms",
  "大腿四頭筋": "Quads",
  "ハムストリングス": "Hamstrings",
  "臀部": "Glutes",
  "ふくらはぎ": "Calves",
  "腹筋": "Abs",
  "全身": "Full Body",
};

const EQ_NAMES_EN = {
  "バーベル": "Barbell",
  "ダンベル": "Dumbbell",
  "マシン": "Machine",
  "ケーブル": "Cable",
  "スミス": "Smith",
  "自重": "Bodyweight",
};

// 分割プリセット名と、その曜日名。曜日名は w.session として記録に保存されるので、
// 種目名と同じく「表示だけ」差し替える。ユーザーがリネームした曜日は対応表に無いので素通しになる。
const SPLIT_NAMES_EN = {
  "全身法": "Full Body",
  "上半身 / 下半身": "Upper / Lower",
  "Push / Pull / Legs": "Push / Pull / Legs",
  "5分割(胸/背中/脚/肩/腕)": "5-Day Split (Chest/Back/Legs/Shoulders/Arms)",
};

const DAY_NAMES_EN = {
  "全身": "Full Body",
  "上半身": "Upper",
  "下半身": "Lower",
  "胸": "Chest",
  "背中": "Back",
  "脚": "Legs",
  "肩": "Shoulders",
  "腕": "Arms",
};

// 曜日の頭文字。fmtDateが `9/3 (水)` を組み立てるのに使う。
const WEEKDAYS = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

// 対応表に無ければ元の文字列をそのまま返す。カスタム種目・リネームされた曜日名が
// 消えてしまわないようにするため(空文字を返すと画面から名前が消える)。
const lookupName = (table, name) => (LANG === "ja" ? name : (table[name] || name));

const exName     = (name) => lookupName(EX_NAMES_EN, name);
const muscleName = (name) => lookupName(MUSCLE_NAMES_EN, name);
const eqName     = (name) => lookupName(EQ_NAMES_EN, name);
const splitName  = (name) => lookupName(SPLIT_NAMES_EN, name);
const dayName    = (name) => lookupName(DAY_NAMES_EN, name);
const weekdayLabel = (dow) => (WEEKDAYS[LANG] || WEEKDAYS.ja)[dow];

// 種目の検索対象テキスト。英語UIでも日本語名で引けるように、常に両方を含める
// (ジムで「ベンチ」と打つ日本語話者が英語UIにしていても探せるようにするため)。
const exSearchText = (e) => [e.n, EX_NAMES_EN[e.n], e.m, MUSCLE_NAMES_EN[e.m], e.eq, EQ_NAMES_EN[e.eq]]
  .filter(Boolean).join(" ").toLowerCase();

// 種目の絞り込み。英語名は大文字小文字を無視して当てる("bench"で"Bench Press"に当たるように)。
const exMatches = (e, q) => !q || exSearchText(e).includes(String(q).toLowerCase());

// ブラウザの<script>グローバルスコープではconst宣言もbare identifierとして参照できるが、
// vmサンドボックス(テスト環境)ではcontextオブジェクトのプロパティにならないため明示的に公開する。
globalThis.SUPPORTED_LANGS = SUPPORTED_LANGS;
globalThis.resolveLang = resolveLang;
globalThis.getLang = getLang;
globalThis.setLang = setLang;
globalThis.I18N = I18N;
globalThis.t = t;
globalThis.EX_NAMES_EN = EX_NAMES_EN;
globalThis.MUSCLE_NAMES_EN = MUSCLE_NAMES_EN;
globalThis.EQ_NAMES_EN = EQ_NAMES_EN;
globalThis.SPLIT_NAMES_EN = SPLIT_NAMES_EN;
globalThis.DAY_NAMES_EN = DAY_NAMES_EN;
globalThis.WEEKDAYS = WEEKDAYS;
globalThis.exName = exName;
globalThis.muscleName = muscleName;
globalThis.eqName = eqName;
globalThis.splitName = splitName;
globalThis.dayName = dayName;
globalThis.weekdayLabel = weekdayLabel;
globalThis.exSearchText = exSearchText;
globalThis.exMatches = exMatches;
