# 朝の4役(調査 → 企画 → 制作 → 品質チェック)

2026-11-08 に決めた。Instagram のリール(JP・EN)と日曜のカルーセルを、**4つの別々のセッション**が順番に作る。
1つのセッションが調べて・考えて・作って・自分で確かめる形(〜11/7 の13時のルーティン)では、作った本人が自分の前提を疑えず、
カバーが結論で終わる・写真が毎回同じ・宣伝が前に出る、といったズレを北村さんが投稿後に見つけていた。
**制作と品質チェックは必ず別のセッション・別の定義で動かす。** チェック役は作り直さず、指摘と合否だけを出す。

| 時刻(JST) | 役 | 定義 | 定時タスク | 作るもの |
|---|---|---|---|---|
| 8:00 | 調査 | `research.md` | `kurabell-morning-1-research` | `1-research.md`、題材ストックへの追記 |
| 8:40 | 企画 | `planning.md` | `kurabell-morning-2-planning` | `2-plan.md`(台本・写真の指示・キャプション案) |
| 9:20 | 制作 | `production.md` | `kurabell-morning-3-production` | 動画・カバー・キャプション、`3-production.md` |
| 11:20(15:20 にもう一度) | 品質チェック | `qa.md` | `kurabell-morning-4-qa` | `4-qa.md`(項目ごとの合否と指摘)。合格なら予約に入れる |

定時タスクは時刻に数分〜12分のずれ(jitter)がある。間を40分以上あけてあるのはそのため。制作は1〜1.5時間かかり、リールとカルーセルが重なる日曜はもっとかかるので、品質チェックは 15:20 にもう一度動き、11:20 に間に合わなかった分を見る(JP の公開は 19:30)。

## 受け渡しの場所

- その日の作業フォルダ: `/Users/hajimekitamura/Desktop/KURABELL-reels/morning/YYYY-MM-DD/`
  (`1-research.md` → `2-plan.md` → `3-production.md` → `4-qa.md`)
- 各ファイルの1行目は `状態: 完了` / `状態: 作らない日` / `状態: 見送り(理由)` のどれか。
  **前の役のファイルが無い、または `状態: 完了` でなければ、自分の仕事はせず、自分のファイルに `状態: 見送り(前の役が未完了)` と書いて終わる**
- 動画などの制作物は従来どおり `/Users/hajimekitamura/Desktop/KURABELL-reels/<題>/`(EN は `en/<題>/`)、カルーセルは `carousel/<名前>/`
- 予約(公開の経路)は今までと同じ `/Users/hajimekitamura/Insta/kurabell/reels/予約/JP|EN/`。launchd の自動投稿が出す。**新しい公開経路は作らない。投稿(`--force`)はしない**
- 結果の記録: 各役が `/Users/hajimekitamura/OVERLOAD-PLUS/reports/routines/morning-sns.md` の末尾に `## YYYY-MM-DD HH:MM 役名` と3〜6行を足す

## 作る日・作らない日

- **リールを作る日**: JP の予約の残りが **1本以下**(`reel.sh queue` で見る)。1組 = 同じ企画の JP と EN を1本ずつ。2日に1本なので、おおむね2日に1回
- **カルーセルを作る日**: 日曜。予約にカルーセルのフォルダが無ければ JP を1本(EN は作らない)
- どちらでもない日: 調査だけ動き(題材ストックを1〜2件ふやす)、企画は `状態: 作らない日` で終わる。制作・チェックも続けて `作らない日` で終わる
- **前日の制作が終わっているのにチェックが終わっていない日**(前日の `3-production.md` が `状態: 完了` で、`4-qa.md` が無いか `状態: 完了` でない): 新しいものを作らない。企画は `状態: 完了(前日分のチェック)`、制作は前日の制作物のパスをそのまま写した `3-production.md` を書き、チェックがそれを見る(2026-11-09 に r22n が残った。放っておくと同じ題材を作り直してしまう)
- **前日のチェックが不合格だった日**: 企画は新しい企画を出さず `状態: 完了(修正日)` と書き、制作は前日の指摘を直した版を作り、チェックがもう一度見る。
  同じものが2回不合格なら、その企画は見送り(予約に入れない)、`morning-sns.md` に「北村さんの判断が要る」と書く

## 自己改善のしくみ(毎回まわす)

1本ごとに良くしていくために、チェック役の指摘を次の回に必ず持ち越す。

- **学びのノート**: Obsidian `Projects/kurabell-morning-lessons.md`
  (`/Users/hajimekitamura/Library/Mobile Documents/com~apple~CloudDocs/Obsidian AI連携/Projects/kurabell-morning-lessons.md`)。
  4役とも、始める前に必ず読む。「必ず守ること」(落ちた理由から作った決まり)と「試してよいこと」(改善提案のうち次に試すもの)の2節
- **チェック役が書き足す**: 不合格の理由になった指摘と、2回目に出た改善提案を、「必ず守ること」に1行の決まり(〜する / 〜しない、見つけた日)として足す。
  同じ指摘が3回出たら、その決まりの頭に【くり返し】を付ける(人が役の md に取り込む目印)
- **企画が拾う**: 前回の `4-qa.md` の改善提案から1つを選び、その回の企画に入れて「今回入れた改善」として書く。
  `kurabell-reel-pdca.md` の試し(1本で変えるのは1つだけ)とぶつかるもの(冒頭の型・長さ・写真の種類など)は入れず、「試してよいこと」に回す
- **数字で確かめる**: 13時のルーティンが成績表で2日後の判定を出したら、チェック役は次の回で「今回入れた改善」とその判定を並べてノートに1行残す。1本で言い切らない
- 週に1回(月曜の品質チェックの回)、ノートの「必ず守ること」を読み直し、重なった決まりをまとめる。消すのは北村さんが決めたときだけ
- 役の md(このフォルダ)を書き換えるのは人のいるセッションだけ(ルーティンは git を使わないため)。【くり返し】の決まりは、そのセッションが md に取り込む

## 全員が守ること(SNS の決まり)

- **エビデンスをもとに有益な情報を提供する。** ネタ投稿・クイズ投稿・煽りは作らない(冒頭の問いかけは「よくある思い込みを研究で確かめる」ためのもので、クイズにしない)
- 論文の数値は PubMed の抄録(または原典)で確かめたものだけ。確かめられない主張は入れない。言い切らない表現の決まりは `marketing/instagram*/drafts/` と Obsidian `Projects/kurabell-pdca-drafts/P017-topics.md` の「言ってよい / 言わない」
- 正確な言葉を使う: 筋肉の量の話は「筋肉」とぼかさず「筋量」と書く(2026-11-07 北村さんの指示で見出しを「筋量」に直した)。研究が測ったものに合わせ、太さを測った研究なら「筋肉の太さ」。「筋力」と「筋量」を混ぜない。名詞の「比べ」は使わない(「10週の研究」「比較した研究」)
- 場面の順番は固定: 問い → 答え(研究)→ ただし・補足 → つまり → **KURABELLなら(アプリ紹介は最後)** → まとめ → 参考文献
- カバー: 上に「エビデンスで筋トレ」、見出しは1場面目と同じ**問いかけ**(結論にしない)、題材の写真、**右下に KURABELL Workout Log のロゴ**、字幕の帯なし。`covers.json` → `build-covers.py` で作った jpg だけを使う(動画のコマにしない)。番号(#7 など)を入れない
- カバーの写真は毎回変える: (A) 人が題材の動き (B) 手元・器具の寄り (C) 題材の小物、を同じ種類2回続けない。光と寄り・引きも直近2本と変える。誰もいないジムの引きは使わない
- 長さ 40〜60秒・ナレーション + テーマソング・6〜7場面。リールは2日に1本(JP 19:30・EN 9:30)、日曜はカルーセル
- 細かい決まりの正本は Obsidian `Projects/kurabell-reel-pdca.md`(「変えないもの」「作るたびの吟味」8項目・「試しの予定」)。このフォルダの md と食い違ったら reel-pdca を正とし、`morning-sns.md` に食い違いを書く

## 無人で動くための決まり(13時のルーティンで踏んだもの)

人がいない時間に動くので、許可の一覧(`.claude/settings.local.json`)に無い操作をすると確認待ちで止まり、翌日の回も始まらない。

- 読むのは Read、書くのは Write / Edit。Bash の `cat`・`echo >`・`sed -i` は使わない。Grep・Glob は使わない
- コマンドは手順に書いた形のまま、**絶対パスで1つずつ**。`cd … &&`・パイプ・`;`・`for`・`$(…)`・ヒアドキュメント・`~` は使わない
- 確かめのコマンドは `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/reel.sh`(`durations` / `inspect` / `check` / `queue` / `files`)。朝の4役用の `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/morning.sh`(`grid` / `gain` / `caption` / `abstract`)と `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/shoot-carousel.sh` は、
  **使う前に `/Users/hajimekitamura/OVERLOAD-PLUS/.claude/settings.local.json` を Read で開き、その行(`marketing/tools/morning.sh *` / `marketing/tools/shoot-carousel.sh *`)が許可の一覧にあるときだけ使う**。無ければ使わず、各役の md の「無いとき」の手順に従う
- Web は WebSearch と、抄録を読む `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/morning.sh abstract <PMID>` だけ。WebFetch・`curl`・全文(`db=pmc`)は使わない。抄録に無い数値は使わない
- キャプションの確かめは `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/morning.sh caption <caption.txtの絶対パス>…` だけ。`python -c` を自分で書かない(`print()` で包むだけで許可の形から外れ、2026-11-09 の品質チェックが2回とも止まった)
- コマンドの頭は手順の形のまま。`ls` を `/bin/ls` と書くだけで許可の形から外れる(2026-11-08 の制作はこれで最初の Bash で止まった)。フォルダの中身は `reel.sh files`
- **Agent(サブエージェント)を使わない。** `tail`・`head`・`cat` も使わず Read を使う。確認待ちになるおそれのある呼び出しは Read などと同じメッセージに並べない(1つ止まると全部止まる)
- git は使わない。リポジトリのファイルは読むだけ(例外は `reports/routines/morning-sns.md` への追記)。`.claude/` の下には何も書かない
- Chrome(`mcp__claude-in-chrome__*`)は使わない
- 手順に無いコマンドが要りそうなら、打たずに見送り、`morning-sns.md` に「足してほしいこと」として書く

## 他のセッションとの連携

- 始める前に `ls /Users/hajimekitamura/OVERLOAD-PLUS/.locks/` を見る。`marketing-pdca.md`(13時のルーティン)の印があれば、予約フォルダには触らない
- 朝の4役は自分の印を作らない(印を消す `rm` が許可の一覧に無く、無人の回が最後で止まるため)。予約フォルダに書くのは品質チェック役だけで、13時の印が無いことを確かめてから入れる
- 13時のルーティンとの分担: リール・カルーセルを**作るのは朝の4役だけ**。13時は数字の振り返り(成績表の2日後の判定・仮説の更新)、施策ボード、YouTube、フォロー候補、プロモーションテキストを続ける。
  予約中の投稿の中身(キャプション・カバー)を変えたいときは、13時は自分で書き換えず、施策ボードに行を起こし、翌朝の企画が拾う
- TikTok・YouTube ショートの動画は対象外(`docs/動画の自動化.md` の担当)

## 定時タスクのプロンプト(4つとも同じ形。役の名前とファイルだけ違う)

```
あなたは KURABELL Workout Log の Instagram を作る「朝の4役」の <役名> 役です。日本語で短く報告します。
/Users/hajimekitamura/OVERLOAD-PLUS/marketing/roles/README.md と /Users/hajimekitamura/OVERLOAD-PLUS/marketing/roles/<役のファイル>.md を Read で読み、
書かれた手順だけを、書かれたコマンドの形のまま行ってください。今日の作業フォルダは
/Users/hajimekitamura/Desktop/KURABELL-reels/morning/<今日の日付 YYYY-MM-DD(JST)>/ です(無ければ Write でファイルを作れば作られます)。
ほかの役の仕事はしないでください。最後に、したこと・止まったこと・北村さんの判断が要ることを3〜6行で報告してください。
```
