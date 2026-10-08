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
  "common.details":    { ja: "詳しく",       en: "Details" },
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

  // ---- 新しいバージョンのお知らせ(Web版のみ。index.html末尾のSW登録ブロックが検知) ----
  "update.ready":      { ja: "新しいバージョンがあります", en: "A new version is available" },
  "update.reload":     { ja: "更新",         en: "Update" },

  // ---- 起動時・保存まわりのエラー ----
  "err.crashTitle":    { ja: "予期しないエラーが発生しました。記録データは保存されたままです。", en: "Something went wrong. Your records are still saved." },
  "err.crashHint":     { ja: "再読み込みしてお試しください。", en: "Please reload and try again." },
  "err.jsonBroken":    { ja: "保存データがJSON形式として壊れています", en: "Saved data is not valid JSON" },
  "err.dataCorrupt":   { ja: "データが壊れている可能性があります", en: "the data may be corrupted" },
  "err.loadFailed":    { ja: "保存されている記録を読み込めませんでした({msg})。記録は端末に残っています。アプリを完全に終了して、開き直してください(それまで記録や変更は保存されません)。開き直しても直らないときは、「設定」タブのバックアップから復元できます。", en: "Could not load your saved records ({msg}). Your records are still on this device. Please quit the app completely and open it again (nothing will be saved until then). If that doesn't help, restore a backup from the Settings tab." },
  "err.saveFailed":    { ja: "保存に失敗しました。通信環境を確認し、下の「再試行」から保存し直してください。", en: "Save failed. Check your connection and try again with Retry below." },
  "err.workoutSaveFailed": { ja: "ワークアウトを保存できませんでした。入力した内容は残っています。通信環境を確認して、もう一度「ワークアウトを保存」を押してください。", en: "Couldn't save the workout. What you entered is still here. Check your connection and tap Save workout again." },
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
  "compare.recentDay": { ja: "過去{n}回の{day}",      en: "Last {n} {day} sessions" },
  "compare.recent":    { ja: "直近{n}回",             en: "Last {n} sessions" },
  "log.lastDate":      { ja: "前回 {date}",           en: "Last {date}" },
  // 元は「回連続」だけ<strong>で囲っていたが、英語だと語順が変わって太字の範囲を保てない。
  // 1文にまとめ、強調は span 側の fontWeight でかける。
  "log.streak":        { ja: "{w}{unit} で {n}セッション連続", en: "{n} sessions in a row at {w}{unit}" },
  "log.trend":         { ja: "推移 {list}",           en: "Trend {list}" },
  "log.plateauAlert":  { ja: "重量が{n}セッション連続で頭打ち。そろそろ上げどき", en: "Stuck at this weight for {n} sessions — time to add more" },
  // 同じ重量が続いていても回数が落ちている場合。「上げどき」とは言わず事実だけ渡す。
  // {best}は直近数回での最高であって「前々回」ではないので、矢印で繋がない。
  // 連続回数({n})は隣のlog.streakが既に言っているので繰り返さない。
  "log.repsDown":      { ja: "直近3セッションの最高 {best}回 / 前回 {prev}回", en: "Best {best} reps in the last 3 sessions, {prev} last time" },
  "compare.est1RM":    { ja: "推定1RM",               en: "Est. 1RM" },
  "compare.line":      { ja: "推定1RM {now}{unit}(ベスト比 {diff}{unit})", en: "Est. 1RM {now}{unit} ({diff}{unit} vs best)" },
  "compare.lineFirst": { ja: "初回記録 推定1RM {v}{unit}", en: "First record: est. 1RM {v}{unit}" },
  "compare.lineNow":   { ja: "推定1RM {v}{unit}", en: "Est. 1RM {v}{unit}" },
  "compare.lineBest":  { ja: "過去のベスト 推定1RM {v}{unit}", en: "Your best: est. 1RM {v}{unit}" },
  "compare.win":       { ja: "過去の自分に勝利", en: "New best" },
  "compare.bestWeight": { ja: "最大重量 {v}{unit}", en: "Top weight {v}{unit}" },
  "compare.prTop":     { ja: "最大重量 {v}{unit}", en: "Top weight {v}{unit}" },
  "compare.prStale":   { ja: "1RM {n}日間未更新",     en: "1RM unchanged for {n}d" },
  "compare.setPR":     { ja: "1RM更新 +{v}{unit}", en: "1RM +{v}{unit}" },
  "set.repsDelta":     { ja: "{v}回", en: "reps {v}" },
  // 各セットの右端の推定1RM(単位は付けない。行が長くなるため。同じ行の重量で単位は分かる)
  "set.oneRm":         { ja: "1RM {v}", en: "1RM {v}" },

  // ---- 記録タブ ----
  "log.title":         { ja: "今日の記録", en: "Today's workout" },
  "log.elapsed":       { ja: "経過",       en: "Elapsed" },
  "log.volume":        { ja: "ボリューム", en: "Volume" },
  // 上部バーの到達度ゲージの読み上げ用(画面上は数字を出さずゲージだけ)
  "log.volumeRatio":   { ja: "{pct}%(基準 {v}{unit})", en: "{pct}% of baseline ({v}{unit})" },
  // ボリュームの基準までの残りの全文(title と読み上げ用。画面の文言は下の volumeToGoDay 等)。labelには compare.recentDay/compare.recent の結果(例:「過去3回の胸」)が入る
  "log.volumeToGo":    { ja: "{label}の平均まであと{v}{unit}", en: "{v}{unit} to {label} avg" },
  // ゲージの下の文言(volumeGoalKey)。{n} は基準にした回数。「平均」だけの表記はしない。
  // 「|」は狭い画面で折り返す位置(記録画面はそこで2つに分けて並べる)
  "log.volumeToGoDay":    { ja: "過去{n}回平均まで|あと{v}{unit}", en: "{v}{unit} short of|last-{n} avg" },
  "log.volumeToGoRecent": { ja: "直近{n}回平均まで|あと{v}{unit}", en: "{v}{unit} short of|recent-{n} avg" },
  "log.volumeToGoPrev":   { ja: "前回まで|あと{v}{unit}", en: "{v}{unit} short of|last time" },
  "log.volumeOverDay":    { ja: "過去{n}回平均|+{v}{unit}", en: "+{v}{unit}|vs last-{n} avg" },
  "log.volumeOverRecent": { ja: "直近{n}回平均|+{v}{unit}", en: "+{v}{unit}|vs recent-{n} avg" },
  "log.volumeOverPrev":   { ja: "前回|+{v}{unit}", en: "+{v}{unit}|vs last time" },
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
  "log.offDay":        { ja: "今日の部位外",           en: "Not today's muscle" },
  "log.moveUp":        { ja: "上へ移動",               en: "Move up" },
  "log.moveDown":      { ja: "下へ移動",               en: "Move down" },
  "log.youtube":       { ja: "YouTubeでフォームを検索", en: "Search form on YouTube" },
  "menu.watchForm":    { ja: "フォームを動画で確認", en: "Watch a form video" },
  "log.consultAi":     { ja: "AI相談",                 en: "Ask AI" },
  "log.consultAiDone": { ja: "✓ コピー",               en: "✓ Copied" },
  // ボタンのラベルには入れない(minWidth 74の枠に収まらず、押した瞬間に行が折り返す)。
  // ボタン行の下に一時表示する注記として使う。
  "log.pasteHint":     { ja: "※AIの画面に貼り付けて送信してください", en: "※Paste it into the AI chat and send it" },
  // 矢印は入れない。現在の種目より上を見ているときもボタンは出る(前回実績を見に上へ
  // 戻るのは主機能の動線)ので、方向を書くと逆を指すことがある。
  "log.toCurrent":     { ja: "現在の種目へ",           en: "Current exercise" },
  "log.swap":          { ja: "変更",                   en: "Swap" },
  "log.history":       { ja: "履歴",                   en: "History" },
  "log.exerciseConfig": { ja: "種目の詳細設定",        en: "Exercise settings" },
  "log.removeExercise": { ja: "種目を削除",            en: "Remove exercise" },
  // 種目カードの操作の行(7マス・各45px前後に収まる長さ)
  "act.config":        { ja: "設定",     en: "Settings" },
  "act.form":          { ja: "フォーム", en: "Form" },
  "act.superset":      { ja: "SS",       en: "SS" },
  "log.supersetAria":  { ja: "上の種目とスーパーセット", en: "Superset with the exercise above" },
  "log.swapAria":      { ja: "別の種目に変更",   en: "Swap for another exercise" },
  "log.historyAria":   { ja: "この種目の履歴",   en: "History of this exercise" },
  "log.confirmRemove": { ja: "「{name}」には実施済みのセットがあります。種目ごと削除しますか?", en: "\"{name}\" has completed sets. Remove the whole exercise?" },
  "log.removed":       { ja: "「{name}」を削除しました", en: "Removed \"{name}\"" },
  "log.addedToDay":    { ja: "Day「{day}」にも登録しました", en: "Also added to day \"{day}\"" },
  "log.undoAdd":       { ja: "取り消す", en: "Undo" },
  "log.undo":          { ja: "元に戻す", en: "Undo" },
  "log.swapHint":      { ja: "別の種目に差し替えます(入力中のセットは、差し替え先の種目の前回記録に入れ替わります)。", en: "Swap in another exercise. Sets in progress are replaced with that exercise's last session." },
  "log.searchExercise": { ja: "種目を検索",            en: "Search exercises" },
  "log.noHistory":     { ja: "この種目の過去記録はまだありません。", en: "No past records for this exercise yet." },
  "log.recentN":       { ja: "{name} の直近{n}回の記録", en: "{name} — last {n} sessions" },
  "log.confirmSwap":   { ja: "「{name}」の入力済みの記録が消え、新しい種目の前回記録に置き換わります。よろしいですか?", en: "Your entries for \"{name}\" will be cleared and replaced with the new exercise's last session. Continue?" },
  "log.restoredDraft": { ja: "入力途中の記録を復元しました。続きから記録できます。", en: "Restored your in-progress workout. You can pick up where you left off." },
  "log.discardDraft":  { ja: "復元した記録を破棄して、最初からやり直しますか?", en: "Discard the restored workout and start over?" },
  "log.discard":       { ja: "破棄する",               en: "Discard" },
  "log.backupNow":     { ja: "書き出す",               en: "Export" },
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
  "menu.saveToDayPrompt": { ja: "この内容を Day「{day}」の種目として登録しますか?次からは「今日のメニュー」に並びます。", en: "Register these exercises to \"{day}\"? They'll appear in Today's menu next time." },
  "menu.saveYes":      { ja: "保存する",               en: "Save" },
  "menu.saveNo":       { ja: "今回はしない",           en: "Not now" },
  // AIコーチ(手動版、1.4)。相談文をコピーしてチャットAIに送り、答えを貼って取り込む(src/domain/aiCoach.js)
  "coach.button":      { ja: "AIコーチに相談",         en: "Ask AI Coach" },
  "coach.fab":         { ja: "AIコーチ",               en: "AI Coach" },
  "coach.title":       { ja: "AIコーチ",               en: "AI Coach" },
  "coach.leadPlan":    { ja: "今日のメニューをAIに組んでもらいます。案を見てから、使うかどうかを決められます。", en: "Have an AI build today's menu. You'll see the plan before anything changes." },
  "coach.leadReplan":  { ja: "ここまでの記録をもとに、残りをAIに組み直してもらいます。実施済み(RIR入力済み)のセットは変わりません。", en: "Have an AI rework the rest of today's session. Sets you've finished (RIR entered) stay as they are." },
  "coach.step1":       { ja: "相談文をコピーしてAIを開く", en: "Copy the request and open the AI" },
  "coach.copy":        { ja: "コピーして {ai} を開く", en: "Copy and open {ai}" },
  "coach.copied":      { ja: "コピーしました。AIの画面に貼り付けて送信してください", en: "Copied. Paste it into the AI chat and send it" },
  "coach.step2":       { ja: "AIの答えをまるごとコピーして、ここに貼り付け", en: "Copy the AI's whole answer and paste it here" },
  "coach.pasteLabel":  { ja: "AIの答え",               en: "The AI's answer" },
  "coach.read":        { ja: "読み込む",               en: "Read the plan" },
  "coach.err.empty":   { ja: "答えが貼り付けられていません。", en: "Nothing pasted yet." },
  "coach.err.notFound":{ ja: "答えの中に取り込み用のブロック(kurabell)が見つかりませんでした。答えの最後のブロックまで含めてコピーしてください。", en: "Couldn't find the import block (kurabell) in the answer. Copy the answer through to the final block." },
  "coach.err.none":    { ja: "取り込める種目がありませんでした。", en: "There was nothing to import." },
  "coach.step3":       { ja: "案を確かめる",           en: "Check the plan" },
  "coach.unknown":     { ja: "アプリに無い種目は取り込みません: {list}", en: "Not in the app, so not imported: {list}" },
  "coach.dropped":     { ja: "取り込めないセットを{n}件除きました(読めない値・範囲外の値・同じ種目の2回目)。", en: "Skipped {n} set(s) that couldn't be imported (unreadable or out-of-range values, or a repeated exercise)." },
  "coach.doneMark":    { ja: "済",                     en: "done" },
  "coach.apply":       { ja: "この案を使う",           en: "Use this plan" },
  "coach.applied":     { ja: "AIコーチの案に入れ替えました", en: "Switched to AI Coach's plan" },
  "coach.menuFrom":    { ja: "AIコーチの案です。開始後に調整できます。", en: "AI Coach's plan. You can adjust once you start." },
  "coach.revert":      { ja: "前回の引き継ぎに戻す",   en: "Back to my last numbers" },
  // 相談文(AIに送るもの)。数字は規則で作らない。AIに組ませ、取り込むかは利用者が決める
  "coach.p.plan":      { ja: "以下は私の筋トレ記録です。今日のメニューを組んでください。", en: "Below is my workout log. Please build today's session for me." },
  "coach.p.replan":    { ja: "以下は私の筋トレ記録と、今日ここまでの内容です。今日の残りを組み直してください。", en: "Below is my workout log and what I've done so far today. Please rework the rest of today's session." },
  "coach.p.me":        { ja: "■ 私について",           en: "■ About me" },
  "coach.p.meLine":    { ja: "体重: {bw} / 重量の単位: {unit} / 既定の目標回数: {reps}回", en: "Bodyweight: {bw} / Weight unit: {unit} / Default target reps: {reps}" },
  "coach.p.day":       { ja: "■ 今日の分割",           en: "■ Today's split day" },
  "coach.p.exercises": { ja: "■ 今日の種目と直近の記録(古い順、重量×回数 余力)", en: "■ Today's exercises and recent sessions (oldest first, weight×reps RIR)" },
  "coach.p.target":    { ja: "目標 {lo}〜{hi}回 / 刻み {inc}", en: "Target {lo}-{hi} reps / Increment {inc}" },
  "coach.p.perHand":   { ja: "(片手の重量)",           en: " (weight per hand)" },
  "coach.p.added":     { ja: "(加重分の重量。体重は含まない)", en: " (added weight only, not bodyweight)" },
  "coach.p.noHistory": { ja: "(記録なし)",             en: "(no sessions yet)" },
  "coach.p.today":     { ja: "■ 今日ここまで(実施済みのセットだけ)", en: "■ Done so far today (finished sets only)" },
  "coach.p.catalog":   { ja: "■ アプリにある種目(種目はこの中から選んでください)", en: "■ Exercises in my app (please choose from these)" },
  "coach.p.rules":     { ja: "■ お願い\n- 漸進性過負荷の考え方で、各種目の各セットの重量と回数を提案してください\n- 必要なら、種目の入れ替え・追加・順番の変更もしてください(種目名は上の一覧のとおりに)\n- 重量は{unit}で書いてください。ダンベルは片手の重量、自重種目は加重分だけです\n- ウォームアップを入れるなら \"wu\":true を付けてください\n- 余力(RIR)は書かないでください\n- 最初に、なぜその案にしたかを短く説明してください\n- 最後に、アプリに取り込むための下の形式のブロックを1つだけ出してください(数字は例です)",
                         en: "■ What I'd like\n- Using progressive overload, suggest the weight and reps for every set of every exercise\n- Swap, add or reorder exercises if it helps (use the names exactly as listed above)\n- Write weights in {unit}. Dumbbells are per hand; bodyweight exercises are added weight only\n- Mark any warm-up set with \"wu\":true\n- Don't include RIR\n- Start with a short explanation of why\n- End with exactly one block in the format below so I can import it (the numbers are just an example)" },
  "coach.p.exName":    { ja: "一覧の種目名",           en: "Name from the list" },
  "coach.p.rulesReplan": { ja: "- 実施済みのセットは書かず、これからやるセットだけを書いてください。終えた種目は書かなくてかまいません", en: "- Leave out sets I've already done; list only the sets still to do. Finished exercises can be left out" },

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
  "set.removeSet":     { ja: "セットを削除",           en: "Delete set" },

  // ---- 種目の詳細設定(⚙) ----
  "cfg.muscleUnset":   { ja: "部位(未設定)",           en: "Muscle (not set)" },
  "cfg.bodyweightEx":  { ja: "自重種目",               en: "Bodyweight exercise" },
  "cfg.bwFactor":      { ja: "体重係数",               en: "Bodyweight factor" },
  "cfg.bwFactorHelp":  { ja: "自重のうち何割が負荷になるかの目安です。重量は「体重×係数＋加重」で計算されます。", en: "Roughly what share of your bodyweight is loaded. Weight is calculated as bodyweight × factor + added weight." },
  "cfg.bwFactorHelp2": { ja: "懸垂は体重のほぼ全部を持ち上げるので1.0、ディップスは0.95、腕立ては足で支える分を除いて0.7が目安です。体格やフォームで変わるので、自分に合う値に調整してください。", en: "Pull-ups lift nearly all of your bodyweight, so 1.0; dips 0.95; push-ups 0.7 since your feet carry part of the load. These vary with build and form, so adjust them to fit you." },
  "cfg.rom":           { ja: "可動域係数",             en: "ROM factor" },
  "cfg.romHelp":       { ja: "動かす距離が短い種目のボリュームを控えめに数えるための係数です。", en: "Counts volume more conservatively for exercises with a short range of motion." },
  "cfg.romHelp2":      { ja: "荷重が動く距離を標準的な種目(約40cm)と比べた比率を初期値にしています。シュラッグやカーフレイズは数cmしか動かないため0.3、通常の種目は1.0です。", en: "Defaults come from how far the load travels versus a typical lift (about 40cm). Shrugs and calf raises move only a few centimetres, so 0.3; ordinary lifts are 1.0." },
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
  // ゲージの3セグメント(1分ごと・緑/黄/赤)と対になる声かけ。経過時間そのものは
  // すぐ上の数字が出しているので、この行は「今どうすべきか」だけを言う。
  "rest.coach1":       { ja: "しっかり休憩",           en: "Rest up" },
  "rest.coach2":       { ja: "そろそろ次のセットへ",   en: "Time for your next set" },
  "rest.coach3":       { ja: "パンプが冷める前に",     en: "Go before your pump fades" },
  "rest.finish":       { ja: "終了",                   en: "Finish" },
  "watch.startOnPhone": { ja: "iPhoneで記録を開始すると、ここで入力できます", en: "Start a workout on your iPhone to log sets here" },
  "watch.next":        { ja: "次",                     en: "Next" },
  // Watch の完了画面(改善要望 12)
  "watch.finishedTitle": { ja: "お疲れ様でした", en: "Great work" },
  "watch.finishedMin":   { ja: "{n}分", en: "{n} min" },
  "watch.finishedCounts": { ja: "{e}種目・{s}セット", en: "{e} exercises · {s} sets" },
  "watch.prTitle":       { ja: "1RM更新", en: "New 1RM" },
  "watch.avgHr":         { ja: "平均心拍", en: "Avg HR" },
  "watch.addSet":      { ja: "セットを追加",           en: "Add set" },
  "rest.notifyTitle":  { ja: "インターバル",           en: "Rest timer" },
  "rest.notifyBody":   { ja: "{n}分経過しました。次のセットへ。", en: "{n} min elapsed. Time for your next set." },
  // 1.3 から経過分を選べる(1:30 など)ので、経過の表し方を別にした。rest.notifyBody は古い Watch アプリの予備に残す
  "rest.notifyBodyAt": { ja: "{t}経過しました。次のセットへ。", en: "{t} elapsed. Time for your next set." },
  "rest.minWhole":     { ja: "{n}分", en: "{n} min" },
  "rest.minHalf":      { ja: "{n}分30秒", en: "{n}:30" },

  // ---- 使い方ガイド ----
  "guide.title":       { ja: "アプリの使い方ガイド",   en: "How to use this app" },
  // 「|」は折り返してよい位置(ガイドの見出しとリード文だけが解釈する。index.html の withBreaks)
  "guide.welcome":     { ja: "KURABELL Workout Log |へようこそ", en: "Welcome to |KURABELL Workout Log" },
  // 「|」が無いとスマホ幅で「…アプ/リ。」と割れる。
  "guide.welcomeLead": { ja: "前回の自分を超えるための|筋トレ記録アプリ。", en: "A lifting log built to help you |beat your last session." },
  "guide.welcomeBody": { ja: "同じ分割の前回の記録(重量・回数・セット数)がそのまま並ぶので、入力の手間なく「前回より上」を狙えます。推定1RMや自己ベストは自動で計算されます。", en: "Your last session on the same split day — weight, reps and set count — is laid out for you, so beating it takes no data entry. Estimated 1RM and personal bests are calculated automatically." },
  "guide.step1":       { ja: "① 分割を決める",         en: "① Choose a split" },
  "guide.step1Lead":   { ja: "「分割」タブで、あなたのトレーニング分割を作ります。", en: "Build your training split in the Split tab." },
  "guide.step1Body":   { ja: "全身・上下・PPL・5分割のプリセットから選ぶか、ゼロから作成。各日にやる種目を登録しておくと、その日のメニューが自動で組まれます。保存するたびに次の日へ自動で進みます。", en: "Pick a preset — full body, upper/lower, PPL, 5-day — or start from scratch. Register the exercises for each day and that day's menu builds itself. Every save advances to the next day." },
  "guide.step2":       { ja: "② 記録する",             en: "② Log your sets" },
  "guide.step2Lead":   { ja: "「記録」タブで、重量・回数・「あと何回できた?(RIR)」を入力。", en: "In the Log tab, enter weight, reps, and reps left (RIR)." },
  "guide.step2Body":   { ja: "「あと何回できた?」を入力したセットが実施済みとして記録されます。セット番号のタップでウォームアップ(W)や補助あり(補)に切り替え、連続する種目はスーパーセットにまとめられます。休憩は入力後に自動でタイマーが動き、1分ごとに通知音が鳴ります。", en: "A set counts as done once you enter the reps you had left. Tap the set number to mark it warm-up (W) or assisted (A), and link consecutive exercises into a superset. The rest timer starts on its own and chimes every minute." },
  "guide.step3":       { ja: "③ 伸びを確認する",       en: "③ Watch your progress" },
  "guide.step3Lead":   { ja: "Max 1RMと今日の1RMがその場で比較できます。", en: "Compare your best 1RM against today's, right on the spot." },
  "guide.step3Body":   { ja: "種目ごとに推定1RMと過去のベストとの差が表示され、セットで自己ベストを超えると更新バッジが出ます。ベストを長く更新していないときも知らせるので、停滞にすぐ気付けます。\n\nデータは端末内だけに保存されます。設定タブから定期的にバックアップを書き出してください。", en: "Each exercise shows its estimated 1RM against your best, with a badge on the set that beats it. It also tells you when your best has stood for a long time, so plateaus are obvious.\n\nYour data is stored only on this device. Export a backup regularly from the Settings tab." },
  "guide.start":       { ja: "はじめる",               en: "Get started" },
  "guide.next":        { ja: "次へ",                   en: "Next" },
  "guide.skip":        { ja: "スキップ",               en: "Skip" },

  // ---- 分割タブ ----
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
  "split.autoFill":     { ja: "おまかせで入れる", en: "Fill with the basics" },
  "split.aiPick":       { ja: "AIに相談して決める", en: "Ask AI to choose" },
  "split.pickMuscleFirst": { ja: "先に部位を選ぶと、その部位の種目が並びます。", en: "Pick the muscles first to see exercises for them." },
  "split.removeExerciseAria": { ja: "{name}を登録から外す", en: "Remove {name} from this day" },
  "split.addDayAfter":  { ja: "この後ろにDayを追加", en: "Add a day after this" },
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
  // 分割名が付いた日は名前が、付いていない日は赤い点が出る(セルの実装参照)。
  "history.calendarHint": { ja: "色の付いた日=トレーニング日。タップでその日の記録を表示", en: "Colored days = training days. Tap one to see that day's workout." },
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
  "pr.title":          { ja: "PR(自己ベスト)",      en: "Personal bests" },
  "pr.aboutTitle":     { ja: "PRと推定1RMについて",   en: "About PRs and estimated 1RM" },
  "pr.noteDef":        { ja: "PR=実際に挙げた最大重量。推定1RMは重量×(1+回数/30)による参考値で、12回以下のセットから求めます(回数が多いと高めに出るため)。", en: "PR is the heaviest weight you actually lifted. Estimated 1RM is a reference figure: weight × (1 + reps/30), from sets of 12 reps or fewer (higher reps overestimate it)." },
  "pr.note":           { ja: "ダンベル種目は両手合計、自重種目は体重を含む実効重量で表示します。", en: "Dumbbell lifts are shown as both hands combined; bodyweight lifts include your bodyweight." },
  "pr.achievedOn":     { ja: " ({date}に達成)",        en: " (set {date})" },
  "pr.exercise":       { ja: "種目",                   en: "Exercise" },
  "pr.maxWeight":      { ja: "PR(最大重量)",           en: "PR (top weight)" },
  "pr.updatedToday":   { ja: "本日1RM更新",            en: "1RM updated today" },
  "pr.stale":          { ja: "1RM {n}日間未更新",      en: "1RM unchanged for {n}d" },
  "pr.weightByReps":   { ja: "{w}{unit}×{reps}回",     en: "{w}{unit} × {reps}" },

  // ---- ペイウォール(記録タブ、試用10回を超えたとき) ----
  "trial.left":        { ja: "無料で保存できる記録は、あと{n}回です", en: "Free workouts left: {n}" },
  "trial.buy":         { ja: "購入", en: "Unlock" },
  "paywall.title":     { ja: "試用は10回までです",     en: "You've reached the 10-workout trial limit" },
  "paywall.body":      { ja: "ここまでの記録・比較・グラフ・バックアップはこのまま何回でもご覧いただけます。今日の記録を保存するには、フル解除の購入が必要です。", en: "Everything you've logged — comparisons, charts, backups — stays available. To save today's workout, unlock the full version." },
  "paywall.unlock":    { ja: "{price}でフル解除",       en: "Unlock for {price}" },
  "paywall.later":     { ja: "あとで",                 en: "Not now" },
  "paywall.priceLoadFailed": { ja: "価格を取得できませんでした。電波の良い場所でもう一度お試しください。", en: "Couldn't load the price. Please try again with a better connection." },
  "paywall.purchaseFailed": { ja: "購入を完了できませんでした。もう一度お試しください。", en: "Couldn't complete the purchase. Please try again." },
  "paywall.pending":   { ja: "購入の承認待ちです。承認されると自動でフル解除されます。", en: "Waiting for approval. The full version unlocks automatically once it's approved." },

  // ---- 設定タブ ----
  "settings.iap.title":    { ja: "購入",               en: "Purchase" },
  "settings.iap.unlocked": { ja: "フル解除済みです。試用の記録上限はありません。", en: "You've unlocked the full version. There's no trial limit." },
  "settings.iap.unlock":   { ja: "{price}でフル解除を購入", en: "Unlock full version for {price}" },
  "settings.iap.restore":  { ja: "購入を復元",         en: "Restore purchase" },
  "settings.iap.restored": { ja: "購入を復元しました。", en: "Purchase restored." },
  "settings.iap.restoreNotFound": { ja: "この端末のApple IDに購入履歴が見つかりませんでした。", en: "No purchase found for this Apple ID." },
  "settings.iap.restoreFailed": { ja: "復元できませんでした。もう一度お試しください。", en: "Couldn't restore. Please try again." },
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
  "settings.guideAgain": { ja: "使い方ガイドをもう一度見る", en: "Show the guide again" },
  "settings.bodyweight": { ja: "体重(自重換算・カロリー計算に使用)", en: "Bodyweight (used for bodyweight lifts and calories)" },
  // ヘルスケア連携(iOSのみ)。何を読み書きするかを画面上で明示する(App Store Guideline 2.5.1)。
  "settings.health.title": { ja: "ヘルスケアと連携", en: "Connect to Apple Health" },
  "settings.health.summary": { ja: "ヘルスケアから体重を読み込み、ワークアウトと体重を記録します。Apple Watch では心拍数と消費カロリーも記録します。", en: "Reads your body weight from Health and saves your workouts and body weight. On Apple Watch, heart rate and active energy are recorded too." },
  "settings.health.desc": { ja: "ワークアウトを「従来型筋力トレーニング」として記録し、体重を読み込み・記録します。iPhoneから書き込むワークアウトは時刻のみです(消費カロリーは記録しません)。Apple Watchにアプリを入れている場合は、記録を始めるとWatchでワークアウトが始まり、心拍数と消費カロリー付きでWatchが記録します。オンにする前の記録は書き込みません。このアプリで記録を削除すると、ヘルスケアからも削除されます。", en: "Saves workouts as Traditional Strength Training, and reads and saves your body weight. Workouts written from iPhone have times only, no calories. If the app is on your Apple Watch, starting a workout also starts one on the watch, which records it with heart rate and active energy. Workouts from before you turn this on are not added. Deleting a workout in this app also removes it from Health." },
  "settings.health.denied": { ja: "ヘルスケアへの書き込みが一部許可されていません。ヘルスケアアプリの右上のアイコン →「App」→ KURABELL で許可してください。", en: "Some Health write permissions are off. Allow it in the Health app: tap your profile picture → Apps → KURABELL." },
  "settings.health.failed": { ja: "ヘルスケアに接続できませんでした。", en: "Could not connect to Apple Health." },
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
  "settings.restMinutes": { ja: "知らせる経過時間(複数選べます)", en: "Alert after (choose any)" },
  "settings.soundDesc": { ja: "インターバル中、下で選んだ経過時間に知らせます。通知を許可しておくと、アプリを閉じていても届き、Apple Watchを着けていれば手元でも気づけます。", en: "Alerts you at the times you pick below during your rest. If you allow notifications, they arrive even when the app is closed — and on your wrist if you wear an Apple Watch." },
  // 通知音もアプリ内の音も、iPhoneのサイレントスイッチには従う。以前は「許可していない場合」に
  // だけ掛かる書き方で、通知の方はサイレントでも鳴ると読めてしまっていた。
  // 「バナーとWatchのハプティックは届く」は通知を許可した側にだけ掛ける。未許可側はbeep()だけで、
  // navigator.vibrateはiOSのWKWebViewでは動かないので、バイブが来ると書くと嘘になる。
  "settings.soundDesc2": { ja: "通知を許可していない場合は、アプリを開いている間だけ音で知らせます。iPhoneのサイレントスイッチがオンだと、どちらの場合も音は鳴りません(通知を許可していれば、バナーとApple Watchのハプティックは届きます)。", en: "Without notification access, it chimes only while the app is open. While the iPhone's silent switch is on, neither plays a sound — with notification access you still get the banner and the Apple Watch tap." },
  "settings.notifyDenied": { ja: "通知がオフになっています。iPhoneの「設定」→「通知」→ KURABELL から許可すると、アプリを閉じていても知らせます。", en: "Notifications are off. Allow them in Settings → Notifications → KURABELL to get alerts while the app is closed." },
  "settings.confirmDeleteEx": { ja: "「{name}」を種目一覧から削除します。\n過去の記録は残りますが、一覧には出なくなります。よろしいですか?", en: "Remove \"{name}\" from the exercise list?\nPast records are kept, but it will no longer appear in the list." },
  "settings.confirmDeleteExShort": { ja: "「{name}」を種目一覧から削除します。よろしいですか?", en: "Remove \"{name}\" from the exercise list?" },

  // ---- バックアップ ----
  "backup.title":      { ja: "バックアップ",           en: "Backup" },
  "backup.lastAt":     { ja: "最終: {date}",           en: "Last: {date}" },
  "backup.never":      { ja: "まだ書き出していません", en: "Not exported yet" },
  "backup.desc":       { ja: "記録・分割・カスタム種目・体重をまとめてファイルに保存できます。機種変更や、データが消えたときの復元に使えます。", en: "Save your workouts, split, custom exercises and bodyweight to one file — for a new phone, or if data is ever lost." },
  "backup.export":     { ja: "⬇ バックアップを書き出す(JSON)", en: "⬇ Export backup (JSON)" },
  "backup.import":     { ja: "⬆ バックアップから復元する", en: "⬆ Restore from backup" },
  "backup.csv":        { ja: "CSVで書き出す(Excel等で開く用)", en: "Export CSV (for Excel and similar)" },
  "backup.undoAvail":  { ja: "バックアップ復元より前のデータが端末に残っています。間違えて復元してしまった場合は、ここから戻せます。", en: "The data from before your last restore is still on this device. If you restored by mistake, you can roll it back here." },
  "backup.undo":       { ja: "↩ 復元前の状態に戻す",   en: "↩ Roll back the restore" },
  "backup.warn":       { ja: "※復元すると現在のデータはすべて置き換わります。復元前に念のため書き出しておくと安全です。", en: "Restoring replaces everything you have now. Export a backup first to be safe." },
  "backup.exportUnavailable": { ja: "この環境ではファイルに書き出せません。記録は端末に保存されています。", en: "Files can't be exported in this environment. Your records are saved on this device." },
  "backup.exportFailed": { ja: "書き出せませんでした。もう一度お試しください。", en: "Couldn't export the file. Please try again." },
  "backup.importWriteFailed": { ja: "復元した内容を保存できませんでした。アプリを完全に終了して開き直してから、もう一度復元してください。", en: "Couldn't save the restored data. Quit the app completely, open it again, and restore once more." },
  "backup.exported":   { ja: "バックアップを書き出しました(記録 {n}件)。", en: "Backup exported ({n} workouts)." },
  "backup.csvExported": { ja: "CSVを書き出しました(Excel等で開けます)。", en: "CSV exported (opens in Excel and similar)." },
  "backup.confirmImport": { ja: "バックアップを復元します(記録 {n}件)。\n現在のデータはすべて置き換わります。よろしいですか?", en: "Restore this backup ({n} workouts)?\nEverything you have now will be replaced." },
  "backup.imported":   { ja: "復元しました(記録 {n}件)。", en: "Restored ({n} workouts)." },
  "backup.willClear":  { ja: "記録の中に範囲外の値が{c}か所あります。重量・回数は0に、余力(RIR)は未入力にして戻します。", en: "{c} values in these workouts are out of range. Weight and reps will be set to 0, and reps in reserve will be left blank." },
  "backup.cleared":    { ja: "範囲外の値 {c}か所は0または未入力にしました。", en: " {c} out-of-range values were set to 0 or left blank." },
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
  // 相談プロンプトの末尾に付ける余力の説明(AIコーチ・分割の Day・履歴で共通)
  "share.rirNote":     { ja: "※「余力」はそのセット後にあと何回挙げられたか(RIR)。0が限界。Wはウォームアップ。", en: "Note: RIR is how many more reps I could have done in that set; 0 means failure. W means warm-up." },
  // 分割の1日分について相談するプロンプト。AIコーチ(coach.p.*)が今日のメニューを組ませるのに対し、
  // こちらは「この日の種目構成」を聞く。他の日の担当を渡すのは、分割の設計と衝突する助言
  // (「胸の日に背中も入れては」等)を避けるため。
  "share.dayPrompt":     { ja: "以下は私のトレーニング分割の1日分「{name}」です。種目の選択・順番・ボリュームのバランスについてアドバイスをください。", en: "Below is one day (\"{name}\") of my training split. Please advise on exercise selection, order, and volume balance." },
  "share.dayMeta":       { ja: "分割: {split}(全{total}日) / この日: {n}日目「{name}」", en: "Split: {split} ({total} days) / This day: day {n}, \"{name}\"" },
  "share.dayMuscles":    { ja: "対象部位: {muscles}", en: "Target muscles: {muscles}" },
  "share.dayOthers":     { ja: "他の日の担当: {list}", en: "Other days cover: {list}" },
  "share.dayExercises":  { ja: "登録種目: {list}", en: "Registered exercises: {list}" },
  "share.dayNoExercises":{ ja: "(この日にはまだ種目を登録していません)", en: "(No exercises registered for this day yet.)" },
  "share.dayHistory":    { ja: "■ この日の直近の実績(古い順)", en: "■ Recent sessions for this day (oldest first)" },
  "share.dayPickPrompt": { ja: "以下は私のトレーニング分割の1日分「{name}」です。この日の部位に合う種目を4〜5個、行う順番つきで提案してください。", en: "Below is one day (\"{name}\") of my training split. Please suggest 4-5 exercises that fit this day's muscles, in the order I should do them." },
  "share.dayPickList":   { ja: "■ アプリにある種目(この中から選んでください)", en: "■ Exercises available in my app (please choose from these)" },
  "share.dayPickRule":   { ja: "※種目名は上の一覧のとおりに書いてください(アプリで検索して登録するため)。", en: "※Please write the exercise names exactly as listed above (I'll search for them in the app)." },
  "share.dayNoHistory":  { ja: "(この日の記録はまだありません)", en: "(No sessions recorded for this day yet.)" },
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
  "csv.assisted":      { ja: "補助",                   en: "Assisted" },

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
  "note.rom":          { ja: "シュラッグ・カーフレイズ・クランチなど可動域が小さい種目は、荷重が動く距離に応じて集計ボリュームを0.3〜0.75倍で換算しています(推定1RM・PR・次回メニューの判定には影響しません)。種目ごとに⚙から調整できます。", en: "Shrugs, calf raises, crunches and other short-range exercises have their volume scaled to 0.3–0.75× based on how far the load travels (estimated 1RM, PRs and the next menu are unaffected). Adjust per exercise via ⚙." },

  // YouTubeのフォーム検索。表示文言ではなく検索クエリなので、言語ごとに語順ごと変える。
  // 「やり方」だと入門の長い解説動画が上に来る。ジムで手早く見たいのは要点なので「コツ」にした(改善要望 10c)
  "youtube.query":     { ja: "{name} フォーム コツ", en: "{name} form tips" },
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
  "腹": "Abs",
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
// 部位から自動で付けた名前(「胸・肩」、src/domain/dayPlan.js の autoDayName)は、1語ずつ訳して繋ぐ
const dayName    = (name) => {
  // 同じ名前の Day が重なったときの番号(「胸・肩 2」)は外して訳し、後ろに付け直す
  const m = typeof name === "string" ? name.match(/^(.*?)( \d+)?$/) : null;
  const parts = m && m[1].includes("・") ? m[1].split("・") : null;
  if (LANG === "en" && parts && parts.every(p => DAY_NAMES_EN[p])) {
    const en = parts.map(p => DAY_NAMES_EN[p]);
    return (en.length > 2 ? `${en.slice(0, -1).join(", ")} & ${en[en.length - 1]}` : en.join(" & ")) + (m[2] || "");
  }
  return lookupName(DAY_NAMES_EN, name);
};
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
