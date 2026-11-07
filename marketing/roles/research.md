# 役1: 調査(毎朝 8:00)

**あなたの仕事は、次のリールに使える「確かめ済みの研究」を用意することだけ。** 企画(冒頭の問い・台本)も制作もしない。
先に `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/roles/README.md` を Read で読み、そこの決まりに従う。

## 読むもの

1. `README.md`(このフォルダ)
2. Obsidian `Projects/kurabell-reel-pdca.md`(成績表・仮説・「変えないもの」)
   = `/Users/hajimekitamura/Library/Mobile Documents/com~apple~CloudDocs/Obsidian AI連携/Projects/kurabell-reel-pdca.md`
3. Obsidian `Projects/kurabell-pdca-drafts/P017-topics.md`(題材ストック。「使った」の印が付いていないものが残り)
4. Obsidian `Projects/kurabell-instagram-metrics.md` の直近
5. Obsidian `Projects/kurabell-morning-lessons.md`(学びのノート。事実・言葉の決まりは調査でも守る)
6. 前日の `4-qa.md`(あれば。事実の誤りで落ちた題材は、そこで指摘された点を確かめ直す)

## 手順

1. `.locks/` に `marketing-pdca.md` があっても調査は進めてよい(予約に触らないため)
2. **使える題材の残りを数える**: P017-topics.md で「使った」が付いておらず、`言ってよい / 言わない` まで書いてある題材の数
3. **残りが3件未満なら1〜2件ふやす。3件以上なら、一番上の未使用の題材を確かめ直すだけにする**
   - 選び方: 成績表で 2日後のリーチ・視聴率が上位3本の題材と同じ種類の「よくある思い込み」を、研究で確かめられる題材。
     既に使った題材(P017-topics の「使った」・成績表の題)と重ねない。ネタ・クイズになる題材(雑学、〇×当て)は選ばない
   - 根拠はメタ分析・系統的レビュー・ランダム化比較試験を優先する。1本の小さな研究だけのときは、その旨(人数・期間)を必ず書く
   - 探すのは WebSearch。論文は PMID を特定し、**抄録を WebFetch(eutils の efetch)で読む**。数値は抄録に書いてあるものだけを写す
   - 抄録で確かめられなかった題材は足さない(`1-research.md` に「見送った題材と理由」として残す)
4. **アプリのつなぎ先を確かめる**: 題材に合う機能を1つ選び、リポジトリの `index.html` と `src/domain/` を Read で読んで、実際にそう動くかを確かめる(読むだけ)。
   使える機能と言い方の決まりは `/Users/hajimekitamura/.claude/scheduled-tasks/kurabell-marketing-pdca/SKILL.md` の「アプリの機能」の段落と同じ(休憩タイマーは「残り時間」ではなく経過時間、AIコーチは「AIが自動で組む」と言い切らない、など)
5. **P017-topics.md の末尾に、既存と同じ形で足す**(Edit):
   ```
   ## <記号>. <思い込みの形の題> — 調査: YYYY-MM-DD(朝の4役)
   - 主: 著者. 誌名. 年;巻(号):頁(PMID 00000000)
     - 対象・期間・人数・条件・結果(抄録の数値のまま)
     - 言ってよい: 「…」 / 言わない: 「…」(抄録に無い値、因果の言い過ぎ)
   - 添える(補足・反証): …
   - 研究の限界: 人数・期間・対象(初心者か、鍛えた人か)
   - 正確な言葉: 測ったもの(筋量 / 筋肉の太さ / 筋力 / 1RM)
   - アプリ: 機能名と、index.html で確かめた動き。使える画面素材(`/Users/hajimekitamura/Desktop/KURABELL-reels/screens/README.md` の一覧から)
   ```
6. `1-research.md` を作業フォルダに書く(Write)。形:
   ```
   状態: 完了
   # 調査 YYYY-MM-DD
   ## 使える題材の残り: N件(上から順に)
   ## 今日足した / 確かめ直した題材
   - 題・PMID・抄録で確かめた数値・言ってよい / 言わない
   ## 見送った題材と理由
   ## 企画への申し送り(1〜3行。例: 「成績表の上位は思い込み型。次の試しの予定は〜」)
   ```
7. `reports/routines/morning-sns.md` に結果を足す

## しないこと

- 冒頭の問い・台本・キャプションを書く(企画の仕事)。画像を作る・音声を作る(制作の仕事)
- 抄録に無い数値を書く、ほかのサイトを WebFetch で開く、論文の結論を強める
- P017-topics.md の既存の行や「使った」の印を書き換える(足すだけ)
