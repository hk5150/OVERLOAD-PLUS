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
// キーごとに ja / en を隣り合わせで書く。言語別に2つのオブジェクトを並べると、
// 250本を目視で対応付けることになり必ずずれる(片方だけ直した、片方に足し忘れた)。
// この形なら翻訳漏れはその場で見えるし、tests/i18n.test.js が両方揃っているかを機械的に落とす。
//
// {n} のようなプレースホルダは t(key, { n: ... }) で差し込む。
// 英語は同じ内容で日本語の1.5〜2倍の幅になるので、ボタンやラベルは意識的に短くしてある。
const STRINGS = {
  // ---- 汎用 ----
  "common.cancel":     { ja: "キャンセル",   en: "Cancel" },
  "common.save":       { ja: "保存",         en: "Save" },
  "common.delete":     { ja: "削除",         en: "Delete" },
  "common.edit":       { ja: "編集",         en: "Edit" },
  "common.done":       { ja: "完了",         en: "Done" },
  "common.close":      { ja: "閉じる",       en: "Close" },
  "common.reset":      { ja: "リセット",     en: "Reset" },
  "common.reload":     { ja: "再読み込み",   en: "Reload" },
  "common.retry":      { ja: "再試行",       en: "Retry" },
  "common.today":      { ja: "今日",         en: "Today" },
  "common.daysAgo":    { ja: "{n}日前",      en: "{n}d ago" },
  "common.notSet":     { ja: "未設定",       en: "Not set" },
  "common.all":        { ja: "すべて",       en: "All" },
  "common.recent":     { ja: "最近",         en: "Recent" },
  "common.custom":     { ja: "カスタム",     en: "Custom" },
  "history.consultAi":     { ja: "AIに相談",     en: "Ask AI" },
  "history.consultAiDone": { ja: "✓ コピー済",   en: "✓ Copied" },
  "common.loading":    { ja: "読み込み中…",  en: "Loading…" },
  "common.minutes":    { ja: "{n}分",        en: "{n} min" },
  "common.reps":       { ja: "{n}回",        en: "{n} reps" },
  "common.timesShort": { ja: "{n}回",        en: "{n} sessions" },
  // 部位・器具の区切り。日本語は中黒、英語は中点(全角の・は英文に混ざると異物になる)。
  "common.sep":        { ja: "・",           en: " · " },

  // ---- 起動時・保存まわりのエラー ----
  "err.crashTitle":    { ja: "予期しないエラーが発生しました。記録データは保存されたままです。", en: "Something went wrong. Your records are still saved." },
  "err.crashHint":     { ja: "再読み込みしてお試しください。", en: "Please reload and try again." },
  "err.jsonBroken":    { ja: "保存データがJSON形式として壊れています", en: "Saved data is not valid JSON" },
  "err.dataCorrupt":   { ja: "データが壊れている可能性があります", en: "the data may be corrupted" },
  "err.loadFailed":    { ja: "保存されている記録を正しく読み込めませんでした({msg})。データ自体は端末に残っています。復元前のバックアップがあれば「設定」タブから読み込んでください。", en: "Could not load your saved records ({msg}). The data itself is still on this device. If you have a backup, restore it from the Settings tab." },
  "err.saveFailed":    { ja: "保存に失敗しました。通信環境を確認し、下の「再試行」から保存し直してください。", en: "Save failed. Check your connection and try again with Retry below." },
  "err.saveRetryFailed": { ja: "再試行しましたが保存に失敗しました。通信環境を確認してください。", en: "Retried, but the save failed again. Please check your connection." },
  "err.copyFailed":    { ja: "コピーできませんでした。下のテキストを手動でコピーしてください。", en: "Could not copy. Please copy the text below manually." },

  // ---- 種目メモ ----
  "note.label":        { ja: "メモ",   en: "Note" },
  "note.has":          { ja: "有",     en: "Yes" },
  "note.title":        { ja: "種目メモ", en: "Exercise note" },
  "note.pinned":       { ja: "この種目の固定メモ(次回も表示されます)", en: "Pinned note for this exercise (shown next time too)" },
  "note.placeholder":  { ja: "例:シート高さ4、肩甲骨を寄せる、グリップは肩幅より拳1つ外", en: "e.g. Seat height 4, retract shoulder blades, grip one fist outside shoulder width" },

  // ---- 今日のメニューの判定バッジ ----
  "judge.new":         { ja: "初回", en: "First" },
  "judge.prev":        { ja: "前回", en: "Last" },

  // ---- 目標回数の表記 ----
  "reps.uniform":      { ja: "{reps}回 × {sets}セット", en: "{reps} reps × {sets} sets" },
  "reps.varied":       { ja: "{list}回", en: "{list} reps" },

  // ---- あと何回できた?(RIR) ----
  "rir.aria":          { ja: "あと{n}回",     en: "{n} reps left" },
  "rir.ariaMax":       { ja: "あと3回以上",   en: "3 or more reps left" },
  "rir.question":      { ja: "あと何回できた?", en: "Reps left?" },
  "rir.short":         { ja: "余力",          en: "RIR" },
  "rir.same":          { ja: "→ 同じ",        en: "→ same" },

  // ---- 比較の見出し ----
  "compare.recentDay": { ja: "直近{n}回の{day}",      en: "Last {n} {day} sessions" },
  "compare.recent":    { ja: "直近{n}回",             en: "Last {n} sessions" },
  "compare.past":      { ja: "過去の自分",            en: "Your best" },
  "compare.pastAt":    { ja: "過去の自分({date})",    en: "Your best ({date})" },
  "log.lastDate":      { ja: "前回 {date}",           en: "Last {date}" },
  // 元は「回連続」だけ<strong>で囲っていたが、英語だと語順が変わって太字の範囲を保てない。
  // 1文にまとめ、強調は span 側の fontWeight でかける。
  "log.streak":        { ja: "{w}{unit} で {n}回連続", en: "{n} sessions in a row at {w}{unit}" },
  "log.trend":         { ja: "推移 {list}",           en: "Trend {list}" },
  "log.plateauAlert":  { ja: "⚠ 重量が{n}回連続で頭打ち。そろそろ上げどき", en: "⚠ Stuck at this weight for {n} sessions — time to add more" },
  "compare.now":       { ja: "今日の自分",            en: "Today" },
  "compare.est1RM":    { ja: "推定1RM",               en: "Est. 1RM" },
  "compare.maxWeight": { ja: "最大重量",              en: "Top weight" },
  "compare.prFirst":   { ja: "⚡ 初回記録 {v}{unit}", en: "⚡ First record {v}{unit}" },
  "compare.prBeat":    { ja: "過去の自分に勝利(+{v}{unit})", en: "New best (+{v}{unit})" },
  "compare.prTop":     { ja: "🏆 最大重量 {v}{unit}", en: "🏆 Top weight {v}{unit}" },
  "compare.prToday":   { ja: "本日1RM更新済み",       en: "1RM updated today" },
  "compare.prStale":   { ja: "1RM {n}日間未更新",     en: "1RM unchanged for {n}d" },
  "compare.setPR":     { ja: "⚡ 1RM更新 +{v}{unit}", en: "⚡ 1RM +{v}{unit}" },
  "compare.set1RM":    { ja: "推定1RM {v}{unit}",     en: "Est. 1RM {v}{unit}" },

  // ---- 記録タブ ----
  "log.title":         { ja: "今日の記録", en: "Today's workout" },
  "log.elapsed":       { ja: "経過",       en: "Elapsed" },
  "log.volume":        { ja: "ボリューム", en: "Volume" },
  // 上部バーの到達度ゲージの読み上げ用(画面上は数字を出さずゲージだけ)
  "log.volumeRatio":   { ja: "{pct}%(基準 {v}{unit})", en: "{pct}% of baseline ({v}{unit})" },
  // ゲージ下の残量テキスト。labelには compare.recentDay/compare.recent の結果(例:「直近3回の胸」)が入る
  "log.volumeToGo":    { ja: "{label}の平均まであと{v}{unit}", en: "{v}{unit} to {label} avg" },
  "log.volumeOver":    { ja: "{label}の平均を{v}{unit}上回った", en: "{v}{unit} over {label} avg" },
  "log.tapToExpand":   { ja: "タップで拡大", en: "Tap to expand" },
  "log.saving":        { ja: "保存中…",    en: "Saving…" },
  "log.saved":         { ja: "保存済み",   en: "Saved" },
  "log.emptyWithMenu": { ja: "上の「今日のメニュー」から開始するか、下の一覧で種目を追加できます。", en: "Start from Today's menu above, or add exercises from the list below." },
  "log.empty":         { ja: "下の一覧から種目を追加して開始しましょう。", en: "Add an exercise from the list below to get started." },
  "log.emptyHint":     { ja: "「分割」タブでマイ分割法を作ると、今日のメニューに前回の記録が引き継がれます。", en: "Build a split in the Split tab and today's menu will carry over your last session." },
  "log.noValidSets":   { ja: "実施したセットがありません。「あと何回できた?」を入力したセットが記録対象になります。", en: "No completed sets. A set counts once you enter how many reps you had left." },
  "log.saveWorkout":   { ja: "ワークアウトを保存",     en: "Save workout" },
  "log.saveWorkoutNext": { ja: "ワークアウトを保存(次のDayへ)", en: "Save workout (next day)" },
  "log.addSet":        { ja: "＋ セットを追加",        en: "＋ Add set" },
  "log.formBroke":     { ja: "フォーム崩れ",           en: "Form broke" },
  "log.pain":          { ja: "痛み・違和感",           en: "Pain" },
  "log.setsHint":      { ja: "※「あと何回できた?」を入力したセットが実施済みとして記録されます(薄いセットは未実施)。", en: "A set counts as done once you enter the reps you had left (faded sets are not done yet)." },
  "log.setsHint2":     { ja: "左の番号をタップすると ウォームアップ(W) → 補助あり(補) → 通常 と切り替わります。", en: "Tap the number on the left to cycle warm-up (W) → assisted (A) → normal." },
  "log.superset":      { ja: "スーパーセット",         en: "Superset" },
  "log.supersetOn":    { ja: "⛓ 上の種目とスーパーセットにする", en: "⛓ Superset with the exercise above" },
  "log.supersetOff":   { ja: "⛓ 上の種目とスーパーセット中(解除)", en: "⛓ Superset active (tap to unlink)" },
  "log.offDay":        { ja: "今日の部位外",           en: "Not today's muscle" },
  "log.moveUp":        { ja: "上へ移動",               en: "Move up" },
  "log.moveDown":      { ja: "下へ移動",               en: "Move down" },
  "log.youtube":       { ja: "YouTubeでフォームを検索", en: "Search form on YouTube" },
  "log.consultAi":     { ja: "AI相談",                 en: "Ask AI" },
  "log.consultAiDone": { ja: "✓ コピー",               en: "✓ Copied" },
  "log.swap":          { ja: "変更",                   en: "Swap" },
  "log.history":       { ja: "履歴",                   en: "History" },
  "log.exerciseConfig": { ja: "種目の詳細設定",        en: "Exercise settings" },
  "log.removeExercise": { ja: "種目を削除",            en: "Remove exercise" },
  "log.removeExerciseBtn": { ja: "✕ 削除",             en: "✕ Remove" },
  "log.swapHint":      { ja: "別の種目に差し替えます(入力中のセットは、差し替え先の種目の前回記録に入れ替わります)。", en: "Swap in another exercise. Sets in progress are replaced with that exercise's last session." },
  "log.searchExercise": { ja: "種目を検索",            en: "Search exercises" },
  "log.noHistory":     { ja: "この種目の過去記録はまだありません。", en: "No past records for this exercise yet." },
  "log.recentN":       { ja: "{name} の直近{n}回の記録", en: "{name} — last {n} sessions" },
  "log.confirmSwap":   { ja: "「{name}」の入力済みの記録が消え、新しい種目の前回記録に置き換わります。よろしいですか?", en: "Your entries for \"{name}\" will be cleared and replaced with the new exercise's last session. Continue?" },
  "log.restoredDraft": { ja: "入力途中の記録を復元しました。続きから記録できます。", en: "Restored your in-progress workout. You can pick up where you left off." },
  "log.discardDraft":  { ja: "復元した記録を破棄して、最初からやり直しますか?", en: "Discard the restored workout and start over?" },
  "log.discard":       { ja: "破棄する",               en: "Discard" },
  "log.backupNudge":   { ja: "記録は端末内にのみ保存されています。念のためファイルに書き出しておきましょう。", en: "Your records live only on this device. Export a backup to be safe." },
  "log.backupNow":     { ja: "今すぐバックアップ",     en: "Back up now" },
  "log.later":         { ja: "あとで",                 en: "Later" },
  "log.neverBackedUp": { ja: "まだ一度もバックアップしていません。", en: "You have never made a backup." },
  "log.lastBackup":    { ja: "前回のバックアップから{n}日経過しています。", en: "{n} days since your last backup." },

  // ---- 今日のメニュー ----
  "menu.title":        { ja: "今日のメニュー",         en: "Today's menu" },
  // この2つは menu.carryover の {src} にだけ差し込まれる。英語では前置詞 from が
  // 差し込み側にあるので、ここで "From ..." と書くと "Carried over from From your split." になる。
  "menu.fromSplit":    { ja: "マイ分割に登録した種目", en: "your split" },
  "menu.fromLast":     { ja: "前回のセッション",       en: "your last session" },
  "menu.fromHistory":  { ja: "過去",                   en: "your past sessions" },
  "menu.start":        { ja: "この内容で記録を開始",   en: "Start with this menu" },
  "menu.carryover":    { ja: "{src}の記録をそのまま引き継いでいます。開始後に調整できます。", en: "Carried over from {src}. You can adjust once you start." },
  "menu.setCount":     { ja: "({n}セット)",            en: "({n} sets)" },
  "menu.reasonPrev":   { ja: "{date}の記録です。",     en: "From your {date} session." },
  "menu.reasonPrevFallback": { ja: "前回",             en: "last" },
  "menu.reasonNew":    { ja: "初回。軽めの重量で動作を確認しましょう。", en: "First time. Start light and check your form." },
  "menu.assistedShort": { ja: "補:",                   en: "A:" },
  "menu.warmupShort":  { ja: "W:",                     en: "W:" },
  "menu.perHand":      { ja: "(片手)",                 en: "(per hand)" },
  "menu.weighted":     { ja: "加重",                   en: "added" },
  "menu.perHandShort": { ja: "片手",                   en: "/hand" },
  "menu.savePrompt":   { ja: "次回から今日の種目と前回記録を表示できます。この内容をメニューとして保存しますか?", en: "Save today's exercises as your menu so next time they appear with your last numbers?" },
  "menu.saveYes":      { ja: "保存する",               en: "Save" },
  "menu.saveNo":       { ja: "今回はしない",           en: "Not now" },

  // ---- セット行 ----
  "set.weight":        { ja: "重量 {unit}",            en: "Weight {unit}" },
  "set.weightPerHand": { ja: "重量 {unit}/片手",       en: "Weight {unit}/hand" },
  "set.weightAdded":   { ja: "加重 {unit}",            en: "Added {unit}" },
  "set.weightPlain":   { ja: "重量",                   en: "Weight" },
  "set.reps":          { ja: "回数",                   en: "Reps" },
  "set.typeToggle":    { ja: "タップで ウォームアップ / 補助あり / 通常 を切替", en: "Tap to cycle warm-up / assisted / normal" },
  "set.typeAria":      { ja: "セット{n}の種別を切り替え", en: "Toggle type of set {n}" },
  "set.assistedShort": { ja: "補",                     en: "A" },
  "set.weightAria":    { ja: "セット{n}の重量({unit})", en: "Weight of set {n} ({unit})" },
  "set.repsAria":      { ja: "セット{n}の回数",        en: "Reps of set {n}" },
  "set.copyPrev":      { ja: "前のセットの重量・回数をコピー", en: "Copy weight and reps from the previous set" },
  "set.copyPrevShort": { ja: "前のセットをコピー",     en: "Copy previous set" },
  "set.removeAria":    { ja: "セット{n}を削除",        en: "Delete set {n}" },
  "set.warmupToggle":  { ja: "ウォームアップ切替",     en: "Toggle warm-up" },
  "set.removeSet":     { ja: "セットを削除",           en: "Delete set" },

  // ---- 種目の詳細設定(⚙) ----
  "cfg.muscleUnset":   { ja: "部位(未設定)",           en: "Muscle (not set)" },
  "cfg.bodyweightEx":  { ja: "自重種目",               en: "Bodyweight exercise" },
  "cfg.bwFactor":      { ja: "体重係数",               en: "Bodyweight factor" },
  "cfg.bwFactorHelp":  { ja: "自重のうち何割が負荷になるかの目安です。重量は「体重×係数＋加重」で計算されます。", en: "Roughly what share of your bodyweight is loaded. Weight is calculated as bodyweight × factor + added weight." },
  "cfg.bwFactorHelp2": { ja: "懸垂は体重のほぼ全部を持ち上げるので1.0、ディップスは0.95、腕立ては足で支える分を除いて0.65前後が目安です。", en: "Pull-ups lift nearly all of your bodyweight, so 1.0; dips 0.95; push-ups around 0.65 since your feet carry part of the load." },
  "cfg.rom":           { ja: "可動域係数",             en: "ROM factor" },
  "cfg.romHelp":       { ja: "動かす距離が短い種目のボリュームを控えめに数えるための係数です。", en: "Counts volume more conservatively for exercises with a short range of motion." },
  "cfg.romHelp2":      { ja: "シュラッグやカーフレイズは重量の割に可動域が数cmしかないため0.5、通常の種目は1.0にしています。", en: "Shrugs and calf raises move only a few centimetres for the load, so 0.5; everything else is 1.0." },
  "cfg.romHelp3":      { ja: "集計ボリュームにのみ影響し、推定1RMやPRには影響しません。", en: "This affects volume totals only — not estimated 1RM or PRs." },

  // ---- 種目の追加・検索 ----
  "picker.searchPlaceholder": { ja: "種目を検索(なければカスタム追加)", en: "Search exercises (or add your own)" },
  "picker.recentOrder": { ja: "最近使った順",          en: "Recently used" },
  "picker.insertHere":  { ja: "＋ ここに追加",         en: "＋ Add here" },
  "picker.insertClose": { ja: "✕ 閉じる",              en: "✕ Close" },
  "picker.insertAt":    { ja: "{n}番目の後ろに挿入します", en: "Inserting after #{n}" },
  "picker.insertReset": { ja: "末尾に戻す",            en: "Move to end" },
  "picker.todayDay":    { ja: "今日({day})",           en: "Today ({day})" },
  "picker.noMatch":     { ja: "該当なし。下のパネルからカスタム種目として追加できます。", en: "No matches. You can add it as a custom exercise below." },
  "picker.addCustom":   { ja: "「{name}」をカスタム種目として追加", en: "Add \"{name}\" as a custom exercise" },
  "picker.addCustomShort": { ja: "「{name}」をカスタム追加", en: "Add \"{name}\"" },
  "picker.selectMuscle": { ja: "部位を選択",           en: "Select muscle" },
  "picker.addWithConfig": { ja: "この設定で追加",      en: "Add with these settings" },

  // ---- インターバル ----
  "rest.title":        { ja: "インターバル",           en: "Rest" },
  "rest.start":        { ja: "インターバル",           en: "Start" },
  "rest.startLine2":   { ja: "開始",                   en: "rest" },
  "rest.until1min":    { ja: "1分まで",                en: "to 1 min" },
  "rest.elapsed":      { ja: "{n}分経過",              en: "{n} min elapsed" },
  "rest.finish":       { ja: "終了",                   en: "Finish" },
  "rest.notifyTitle":  { ja: "インターバル",           en: "Rest timer" },
  "rest.notifyBody":   { ja: "{n}分経過しました。次のセットへ。", en: "{n} min elapsed. Time for your next set." },

  // ---- 使い方ガイド ----
  "guide.title":       { ja: "アプリの使い方ガイド",   en: "How to use this app" },
  "guide.welcome":     { ja: "KURABELL Workout Log へようこそ", en: "Welcome to KURABELL Workout Log" },
  "guide.welcomeLead": { ja: "前回の内容がそのまま出てくる、筋トレ記録アプリです。", en: "A lifting log that puts your last session right in front of you." },
  "guide.welcomeBody": { ja: "同じ分割の前回の記録(重量・回数・セット数)がそのまま並ぶので、入力の手間なく「前回より上」を狙えます。推定1RMや自己ベストは自動で計算されます。", en: "Your last session on the same split day — weight, reps and set count — is laid out for you, so beating it takes no data entry. Estimated 1RM and personal bests are calculated automatically." },
  "guide.step1":       { ja: "① 分割を決める",         en: "① Choose a split" },
  "guide.step1Lead":   { ja: "「分割」タブで、あなたのトレーニング分割を作ります。", en: "Build your training split in the Split tab." },
  "guide.step1Body":   { ja: "全身・上下・PPL・5分割のプリセットから選ぶか、ゼロから作成。各日にやる種目を登録しておくと、その日のメニューが自動で組まれます。保存するたびに次の日へ自動で進みます。", en: "Pick a preset — full body, upper/lower, PPL, 5-day — or start from scratch. Register the exercises for each day and that day's menu builds itself. Every save advances to the next day." },
  "guide.step2":       { ja: "② 記録する",             en: "② Log your sets" },
  "guide.step2Lead":   { ja: "「記録」タブで、重量・回数・「あと何回できた?(RIR)」を入力。", en: "In the Log tab, enter weight, reps, and reps left (RIR)." },
  "guide.step2Body":   { ja: "「あと何回できた?」を入力したセットが実施済みとして記録されます。セット番号のタップでウォームアップ(W)や補助あり(補)に切り替え、連続する種目はスーパーセットにまとめられます。休憩は入力後に自動でタイマーが動き、1分ごとに通知音が鳴ります。", en: "A set counts as done once you enter the reps you had left. Tap the set number to mark it warm-up (W) or assisted (A), and link consecutive exercises into a superset. The rest timer starts on its own and chimes every minute." },
  "guide.step3":       { ja: "③ 伸びを確認する",       en: "③ Watch your progress" },
  "guide.step3Lead":   { ja: "Max 1RMと今日の1RMがその場で比較できます。", en: "Compare your best 1RM against today's, right on the spot." },
  "guide.step3Body":   { ja: "セットごとに推定1RMが表示され、自己ベストを超えると更新バッジが出ます。何日ベストを更新していないかも分かるので、停滞にすぐ気付けます。\n\n⚠️ データは端末内だけに保存されます。設定タブから定期的にバックアップを書き出してください。", en: "Each set shows its estimated 1RM, with a badge when you beat your best. You can also see how long it has been since your last PR, so plateaus are obvious.\n\n⚠️ Your data is stored only on this device. Export a backup regularly from the Settings tab." },
  "guide.start":       { ja: "はじめる",               en: "Get started" },
  "guide.next":        { ja: "次へ",                   en: "Next" },
  "guide.skip":        { ja: "スキップ",               en: "Skip" },

  // ---- 分割タブ ----
  "split.title":       { ja: "分割法",                 en: "Split" },
  "split.rotation":    { ja: "ローテーション方式:保存するたびに次のDayへ進みます。", en: "Rotation: every save advances to the next day." },
  "split.noSplitHint": { ja: "分割を作らなくても、種目を選んですぐ記録を始められます。分割は後からいつでも作れます。", en: "You can start logging right away without a split — you can always build one later." },
  "split.logNow":      { ja: "今すぐ記録する",         en: "Start logging" },
  "split.orConfigure": { ja: "または、分割メニューを設定する", en: "Or set up a split" },
  "split.pickPattern": { ja: "パターンを選ぶか、ゼロから作成できます。(選ぶと今の分割は置き換わります)", en: "Pick a pattern or start from scratch. Choosing one replaces your current split." },
  "split.createCustom": { ja: "＋ カスタム分割をゼロから作る", en: "＋ Build a custom split" },
  "split.myMenu":      { ja: "マイメニュー",           en: "My split" },
  "split.customName":  { ja: "カスタム分割",           en: "Custom split" },
  "split.nameAria":    { ja: "分割名",                 en: "Split name" },
  "split.change":      { ja: "変更 / 作り直す",        en: "Change / rebuild" },
  "split.deleteSplit": { ja: "分割を削除",             en: "Delete split" },
  "split.backToCurrent": { ja: "← 今の分割({name})に戻る", en: "← Back to {name}" },
  "split.dayNameAria": { ja: "Day名",                  en: "Day name" },
  "split.isToday":     { ja: "今日はこれ",             en: "Today" },
  "split.muscleUnset": { ja: "部位未設定(「編集」から選択)", en: "No muscles set (choose via Edit)" },
  "split.dayExercises": { ja: "この日にやる種目(登録すると自動メニューになります)", en: "Exercises for this day (they become the auto menu)" },
  "split.noBuiltIn":   { ja: "この部位の内蔵種目がありません。", en: "No built-in exercises for this muscle." },
  "split.exerciseList": { ja: "種目: {list}",          en: "Exercises: {list}" },
  "split.tapToLog":    { ja: "タップして記録を始める →", en: "Tap to start logging →" },
  "split.deleteDay":   { ja: "このDayを削除",          en: "Delete this day" },
  "split.addDay":      { ja: "＋ Dayを追加",           en: "＋ Add day" },
  "split.session":     { ja: "今日のセッション(Day {n}/{total}・{name})", en: "Today's session (day {n}/{total} · {name})" },
  "split.dayHistory":  { ja: "{day}の履歴",            en: "{day} history" },
  "split.weekly":      { ja: "直近7日間の部位別",      en: "Last 7 days by muscle" },
  "split.weeklyEmpty": { ja: "種目に部位を設定して記録すると集計されます。", en: "Assign muscles to your exercises and totals will appear here." },
  "split.vsLastWeek":  { ja: "先週比{sign}{pct}%",     en: "{sign}{pct}% vs last week" },
  "split.lastTrained": { ja: "最終{when}",             en: "Last: {when}" },
  "history.calMonth":  { ja: "{y}年{m}月",             en: "{m}/{y}" },
  "history.kcal":      { ja: "約{n}kcal",              en: "~{n} kcal" },
  "split.confirmReplace": { ja: "現在の分割「{cur}」を「{next}」に置き換えます。よろしいですか?(登録した種目・進行状況はリセットされます。記録履歴は残ります)", en: "Replace your current split \"{cur}\" with \"{next}\"? Registered exercises and progress reset. Your workout history is kept." },
  "split.confirmRebuild": { ja: "現在の分割「{cur}」を破棄して、新しくゼロから作成します。よろしいですか?(記録履歴は残ります)", en: "Discard your current split \"{cur}\" and start from scratch? Your workout history is kept." },
  "split.confirmDelete": { ja: "分割設定を削除します。よろしいですか?(履歴は残ります)", en: "Delete your split settings? Your history is kept." },

  // ---- グラフ ----
  "chart.volumeTrend": { ja: "ボリューム推移",         en: "Volume trend" },
  "chart.total":       { ja: "トータル",               en: "Total" },
  "chart.weekly":      { ja: "週別",                   en: "Weekly" },
  "chart.byMuscle":    { ja: "部位別",                 en: "By muscle" },
  "chart.totalVolume": { ja: "総ボリューム",           en: "Total volume" },
  "chart.weekTotal":   { ja: "週合計",                 en: "Week total" },
  "chart.volume":      { ja: "ボリューム",             en: "Volume" },
  "chart.need2":       { ja: "2回以上記録すると推移が表示されます。", en: "Log at least twice to see a trend." },
  "chart.need2Weeks":  { ja: "2週分以上記録すると推移が表示されます。", en: "Log at least two weeks to see a trend." },
  "chart.needMuscle":  { ja: "種目に部位を設定して記録すると部位別で表示されます。", en: "Assign muscles to your exercises to see the breakdown." },
  "chart.needMuscleName": { ja: "「{name}」を2回以上記録すると推移が表示されます。", en: "Log \"{name}\" at least twice to see a trend." },
  "chart.exerciseTrend": { ja: "種目別の重量推移",     en: "Weight trend by exercise" },
  "chart.emptyHint":   { ja: "記録するとここに表示されます。", en: "Your records will show up here." },
  "chart.maxWeight":   { ja: "最大重量",               en: "Top weight" },
  "chart.est1RM":      { ja: "推定1RM",                en: "Est. 1RM" },
  "chart.need2Exercise": { ja: "この種目を2回以上記録するとグラフが表示されます。", en: "Log this exercise at least twice to see the chart." },
  "chart.weekOf":      { ja: "{m}/{d}週",              en: "Week of {m}/{d}" },

  // ---- 履歴タブ ----
  "history.title":     { ja: "履歴",                   en: "History" },
  "history.count":     { ja: "履歴 {n}回",             en: "History · {n}" },
  "history.empty":     { ja: "まだ記録がありません。", en: "No records yet." },
  "history.calendarHint": { ja: "赤い点=トレーニング日。タップでその日の記録を表示", en: "Red dot = training day. Tap to see that day's workout." },
  "history.tapAgain":  { ja: "日付をもう一度タップで解除", en: "Tap the date again to clear" },
  "history.deleteDay": { ja: "この記録を削除",         en: "Delete this workout" },
  "history.deleteWhole": { ja: "この日の記録をまるごと削除", en: "Delete this entire workout" },
  "history.editHint":  { ja: "数値をタップして修正できます。回数を0にすると、そのセットは削除されます。", en: "Tap a number to edit it. Setting reps to 0 removes that set." },
  "history.addForgot": { ja: "記録し忘れた種目を追加できます。", en: "Add an exercise you forgot to log." },
  "history.searchAdd": { ja: "種目を検索して追加",     en: "Search and add an exercise" },
  "history.cancelEdit": { ja: "取消",                  en: "Cancel" },
  "history.confirmDelete": { ja: "{date}の記録を削除します。よろしいですか?", en: "Delete your {date} workout?" },
  "history.confirmDeleteAll": { ja: "すべての履歴を削除します。よろしいですか?", en: "Delete all history?" },
  "history.deleteAll": { ja: "すべての履歴を削除",     en: "Delete all history" },
  "history.emptyAfterEdit": { ja: "有効なセットがありません。この記録を削除しますか?", en: "No valid sets left. Delete this workout?" },

  // ---- 自己ベスト ----
  "pr.title":          { ja: "🏆 PR(自己ベスト)",      en: "🏆 Personal bests" },
  "pr.noteDef":        { ja: "PR=実際に挙げた最大重量。推定1RMは重量×(1+回数/30)による参考値です。", en: "PR is the heaviest weight you actually lifted. Estimated 1RM is a reference figure: weight × (1 + reps/30)." },
  "pr.note":           { ja: "ダンベル種目は両手合計、自重種目は体重を含む実効重量で表示します。", en: "Dumbbell lifts are shown as both hands combined; bodyweight lifts include your bodyweight." },
  "pr.achievedOn":     { ja: " ({date}に達成)",        en: " (set {date})" },
  "pr.exercise":       { ja: "種目",                   en: "Exercise" },
  "pr.maxWeight":      { ja: "PR(最大重量)",           en: "PR (top weight)" },
  "pr.updatedToday":   { ja: "本日1RM更新",            en: "1RM updated today" },
  "pr.stale":          { ja: "1RM {n}日間未更新",      en: "1RM unchanged for {n}d" },
  "pr.weightByReps":   { ja: "{w}{unit}×{reps}回",     en: "{w}{unit} × {reps}" },

  // ---- 設定タブ ----
  "settings.title":    { ja: "設定",                   en: "Settings" },
  "settings.ai":       { ja: "AIに相談",               en: "Ask AI" },
  "settings.aiDesc":   { ja: "「AI相談」を押すと、記録がクリップボードにコピーされ、ここで選んだAIのチャット画面が開きます。貼り付けて送ってください。記録がアプリから自動で送信されることはありません。", en: "Tapping \"Ask AI\" copies your log to the clipboard and opens the chat you pick here — just paste it. The app never sends your log anywhere on its own." },
  "settings.language": { ja: "言語",                   en: "Language" },
  "settings.languageDesc": { ja: "種目名・部位名も切り替わります。記録済みのデータは変わりません。", en: "Exercise and muscle names switch too. Your saved records are not changed." },
  "lang.ja":           { ja: "日本語",                 en: "日本語" },
  "lang.en":           { ja: "English",                en: "English" },
  "settings.unit":     { ja: "重量の単位",             en: "Weight unit" },
  "settings.unitDesc": { ja: "表示と入力の単位だけが変わります。記録は常にkgで保存されるので、切り替えても過去の記録は書き換わりません。", en: "This changes display and input only. Records are always stored in kg, so switching does not rewrite your past workouts." },
  "unit.kg":           { ja: "kg",                     en: "kg" },
  "unit.lb":           { ja: "lb",                     en: "lb" },
  "settings.guideAgain": { ja: "📖 使い方ガイドをもう一度見る", en: "📖 Show the guide again" },
  "settings.bodyweight": { ja: "体重(自重換算・カロリー計算に使用)", en: "Bodyweight (used for bodyweight lifts and calories)" },
  "settings.exercises": { ja: "種目の設定",            en: "Exercise settings" },
  "settings.exercisesDesc": { ja: "内蔵種目も含めて設定を変更できます。部位はボリューム集計に、片手(ダンベル)・自重は重量の計算に使われます。", en: "Adjust any exercise, built-in ones included. Muscle drives volume totals; per-hand and bodyweight drive weight calculations." },
  "settings.exSearch": { ja: "種目を検索(空欄なら使用中の種目)", en: "Search exercises (empty shows the ones you use)" },
  "settings.inUse":    { ja: "使用中",                 en: "In use" },
  "settings.noMatch":  { ja: "該当する種目がありません。", en: "No matching exercises." },
  "settings.exEmptyHint": { ja: "記録するとここに表示されます。部位を選ぶか検索すれば全種目から探せます。", en: "Exercises you log show up here. Pick a muscle or search to browse them all." },
  "settings.modified": { ja: "変更済み",               en: "Modified" },
  "settings.revert":   { ja: "元に戻す",               en: "Reset" },
  "settings.perHand":  { ja: "片手(ダンベル)",         en: "Per hand (dumbbell)" },
  "settings.exNote":   { ja: "※ 設定は今後の記録に反映されます。過去の記録は当時の設定のまま残ります。", en: "Changes apply to future workouts. Past records keep the settings they were logged with." },
  "settings.muscle":   { ja: "部位",                   en: "Muscle" },
  "settings.equipment": { ja: "器具",                  en: "Equipment" },
  "settings.other":    { ja: "その他",                 en: "Other" },
  "settings.sound":    { ja: "インターバルの通知",     en: "Rest timer alerts" },
  "settings.soundDesc": { ja: "インターバル中、1分・2分・3分の経過時に知らせます。通知を許可しておくと、アプリを閉じていても届き、Apple Watchを着けていれば手元でも気づけます。", en: "Alerts you at 1, 2 and 3 minutes into your rest. If you allow notifications, they arrive even when the app is closed — and on your wrist if you wear an Apple Watch." },
  "settings.soundDesc2": { ja: "通知を許可していない場合は、アプリを開いている間だけ音で知らせます(iPhoneのサイレントスイッチがオンだと鳴りません)。", en: "Without notification access, it chimes only while the app is open — and stays silent while the iPhone's silent switch is on." },
  "settings.notifyDenied": { ja: "通知がオフになっています。iPhoneの「設定」→「通知」→ KURABELL から許可すると、アプリを閉じていても知らせます。", en: "Notifications are off. Allow them in Settings → Notifications → KURABELL to get alerts while the app is closed." },
  "settings.confirmDeleteEx": { ja: "「{name}」を種目一覧から削除します。\n過去の記録は残りますが、一覧には出なくなります。よろしいですか?", en: "Remove \"{name}\" from the exercise list?\nPast records are kept, but it will no longer appear in the list." },
  "settings.confirmDeleteExShort": { ja: "「{name}」を種目一覧から削除します。よろしいですか?", en: "Remove \"{name}\" from the exercise list?" },

  // ---- バックアップ ----
  "backup.title":      { ja: "バックアップ",           en: "Backup" },
  "backup.desc":       { ja: "記録・分割・カスタム種目・体重をまとめてファイルに保存できます。機種変更や、データが消えたときの復元に使えます。", en: "Save your workouts, split, custom exercises and bodyweight to one file — for a new phone, or if data is ever lost." },
  "backup.export":     { ja: "⬇ バックアップを書き出す(JSON)", en: "⬇ Export backup (JSON)" },
  "backup.import":     { ja: "⬆ バックアップから復元する", en: "⬆ Restore from backup" },
  "backup.csv":        { ja: "CSVで書き出す(Excel等で開く用)", en: "Export CSV (for Excel and similar)" },
  "backup.undoAvail":  { ja: "バックアップ復元より前のデータが端末に残っています。間違えて復元してしまった場合は、ここから戻せます。", en: "The data from before your last restore is still on this device. If you restored by mistake, you can roll it back here." },
  "backup.undo":       { ja: "↩ 復元前の状態に戻す",   en: "↩ Roll back the restore" },
  "backup.warn":       { ja: "※復元すると現在のデータはすべて置き換わります。復元前に念のため書き出しておくと安全です。", en: "Restoring replaces everything you have now. Export a backup first to be safe." },
  "backup.exported":   { ja: "バックアップを書き出しました(記録 {n}件)。", en: "Backup exported ({n} workouts)." },
  "backup.csvExported": { ja: "CSVを書き出しました(Excel等で開けます)。", en: "CSV exported (opens in Excel and similar)." },
  "backup.confirmImport": { ja: "バックアップを復元します(記録 {n}件)。\n現在のデータはすべて置き換わります。よろしいですか?", en: "Restore this backup ({n} workouts)?\nEverything you have now will be replaced." },
  "backup.imported":   { ja: "復元しました(記録 {n}件)。", en: "Restored ({n} workouts)." },
  "backup.importFailed": { ja: "復元に失敗しました({msg})。", en: "Restore failed ({msg})." },
  "backup.checkFile":  { ja: "ファイルを確認してください", en: "please check the file" },
  "backup.confirmUndo": { ja: "バックアップ復元より前の状態(記録 {n}件)に戻します。\n現在のデータは置き換わります。よろしいですか?", en: "Roll back to the state before the restore ({n} workouts)?\nYour current data will be replaced." },
  "backup.undone":     { ja: "復元前の状態に戻しました(記録 {n}件)。", en: "Rolled back ({n} workouts)." },
  "backup.undoFailed": { ja: "元に戻す処理に失敗しました({msg})。", en: "Roll back failed ({msg})." },
  "backup.checkData":  { ja: "データを確認してください", en: "please check the data" },

  // ---- 共有テキスト・CSV ----
  "share.supersetTag": { ja: "[スーパーセット] ",      en: "[Superset] " },
  "share.assisted":    { ja: "補助",                   en: "assisted" },
  "share.rirLeft":     { ja: " 余力{n}",               en: " RIR{n}" },
  "share.totalVolume": { ja: "総ボリューム {v}{unit}", en: "Total volume {v}{unit}" },
  "share.perHand":     { ja: "{unit}(片手)",           en: "{unit}/hand" },
  "share.withBw":      { ja: "{unit}(体重込)",         en: "{unit} (incl. bodyweight)" },
  "share.bothHands":   { ja: "{unit}(両手計)",         en: "{unit} (both hands)" },
  "share.aiPrompt":    { ja: "以下は私の筋トレ記録です。フォーム、重量設定、ボリュームの妥当性についてアドバイスをください。", en: "Below is my workout log. Please advise on form, load selection, and whether the volume is appropriate." },
  // 種目1つ分の相談プロンプト(記録タブの「AI相談」)
  "share.exPrompt":    { ja: "以下は私の「{name}」の記録です。漸進性過負荷の観点で、次にどの重量・回数で組むべきか提案してください。", en: "Below is my log for \"{name}\". Using progressive overload, suggest what weight and reps I should do next." },
  "share.exMeta":      { ja: "種目: {name}({muscle} / {eq})", en: "Exercise: {name} ({muscle} / {eq})" },
  "share.exUnit":      { ja: "重量の表記: {unit}", en: "Weights are given in: {unit}" },
  "share.exProfile":   { ja: "体重: {bw} / 目標レップ数: {reps}回 / 重量の刻み: {inc}", en: "Bodyweight: {bw} / Target reps: {reps} / Weight increment: {inc}" },
  "share.exPr":        { ja: "自己ベスト: 推定1RM {rm}({rmDate}) 最大重量 {top}({topDate})", en: "Personal best: est. 1RM {rm} ({rmDate}), top weight {top} ({topDate})" },
  "share.exPrEff":     { ja: "(自己ベストの数値は実効重量。ダンベルは両手合計、自重種目は体重込み。各セットの数値とは基準が違います)", en: "(Personal bests are effective load: dumbbells count both hands, bodyweight lifts include bodyweight — a different basis from the per-set numbers.)" },
  "share.exHistory":   { ja: "■ 直近の記録(古い順)", en: "■ Recent sessions (oldest first)" },
  "share.exNoHistory": { ja: "(この種目の記録はまだありません)", en: "(No previous sessions for this exercise yet.)" },
  "share.exStreak":    { ja: "→ {v}が{n}回連続", en: "→ {v} for {n} sessions in a row" },
  "share.exToday":     { ja: "■ 今日ここまで", en: "■ Today so far" },
  "share.rirNote":     { ja: "※「余力」はそのセット後にあと何回挙げられたか(RIR)。0が限界。Wはウォームアップ。", en: "Note: RIR is how many more reps I could have done in that set; 0 means failure. W means warm-up." },
  "csv.date":          { ja: "日付",                   en: "Date" },
  "csv.session":       { ja: "セッション",             en: "Session" },
  "csv.exercise":      { ja: "種目",                   en: "Exercise" },
  "csv.muscle":        { ja: "部位",                   en: "Muscle" },
  "csv.set":           { ja: "セット",                 en: "Set" },
  "csv.type":          { ja: "種別",                   en: "Type" },
  "csv.weight":        { ja: "重量{unit}",             en: "Weight ({unit})" },
  "csv.reps":          { ja: "回数",                   en: "Reps" },
  "csv.rir":           { ja: "あと何回",               en: "Reps left" },
  "csv.working":       { ja: "ワーキング",             en: "Working" },

  // ---- 下部タブ ----
  "tab.split":         { ja: "分割",                   en: "Split" },
  "tab.log":           { ja: "記録",                   en: "Log" },
  "tab.history":       { ja: "履歴",                   en: "History" },
  "tab.settings":      { ja: "設定",                   en: "Settings" },

  // ---- 曜日の頭文字(カレンダー) ----
  "cal.sun": { ja: "日", en: "S" },
  "cal.mon": { ja: "月", en: "M" },
  "cal.tue": { ja: "火", en: "T" },
  "cal.wed": { ja: "水", en: "W" },
  "cal.thu": { ja: "木", en: "T" },
  "cal.fri": { ja: "金", en: "F" },
  "cal.sat": { ja: "土", en: "S" },

  // ---- 注記 ----
  "note.kcal":         { ja: "※カロリーはMETs×体重×時間による概算の目安で、医療・栄養管理用の正確な値ではありません。自重種目のボリュームは体重×係数+加重で換算しています。", en: "Calories are a rough estimate (METs × bodyweight × time), not a medical or nutritional figure. Bodyweight volume is calculated as bodyweight × factor + added weight." },
  "note.rom":          { ja: "シュラッグ・カーフレイズ・リストカールは可動域が小さいため、集計ボリュームを0.5倍で換算しています(推定1RM・PR・次回メニューの判定には影響しません)。種目ごとに⚙から調整できます。", en: "Shrugs, calf raises and wrist curls have a short range of motion, so their volume counts at 0.5× (estimated 1RM, PRs and the next menu are unaffected). Adjust per exercise via ⚙." },

  // YouTubeのフォーム検索。表示文言ではなく検索クエリなので、言語ごとに語順ごと変える。
  "youtube.query":     { ja: "{name} やり方 フォーム", en: "{name} how to proper form" },
};

// t() は言語別のフラットな表を引く。STRINGS から組み立てることで、
// 「jaにはあるがenに無い」を構造的に作れなくしている。
const I18N = { ja: {}, en: {} };
for (const key of Object.keys(STRINGS)) {
  I18N.ja[key] = STRINGS[key].ja;
  I18N.en[key] = STRINGS[key].en;
}

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
  "大胸筋": "Chest",
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
  // 部位を設定していない種目をまとめる内部キー。集計のグループ名としてそのまま画面に出るので、
  // ここに置いて muscleName() 経由で英語にする(保存データ側のキーは日本語のまま)。
  "未設定": "Unassigned",
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
  // アプリが自動で付ける分割名。これも split.name として保存されるので、
  // 生成時に翻訳せず日本語で保存し、表示のときだけ引く(プリセット名と同じ扱い)。
  "マイメニュー": "My Split",
  "カスタム分割": "Custom Split",
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
globalThis.STRINGS = STRINGS;
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
