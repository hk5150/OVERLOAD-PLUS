# 複数部位を鍛える種目の表現と集計(主働筋+協働筋の分数カウント)

前提(リポジトリの現状、2026-10-11 確認):
- `index.html` の `MUSCLES`(346行付近)は16部位: 大胸筋 / 広背筋 / 僧帽筋 / 脊柱起立筋 / 三角筋前部・中部・後部 / 上腕二頭筋 / 上腕三頭筋 / 前腕 / 大腿四頭筋 / ハムストリングス / 臀部 / ふくらはぎ / 腹筋 / 全身。
- `EXERCISE_DB`(425行付近、約98種目)は各種目に主部位 `m` を1つだけ持つ。
- 週間集計(`weekly`、1857〜1883行付近)は、記録側の `ex.muscle`(保存時のスナップショット)をキーに `workingSets(ex).length` と `exVolume(ex)` を足すだけ。したがってベンチプレスは大胸筋にのみ計上され、上腕三頭筋・三角筋前部には0セット。

---

## Q1. 間接セット(協働筋)をどう数えるべきか — エビデンス

### Takeaway
現時点で最も直接的な根拠は Pelland ら(FAU、Zourdos 研)のメタ回帰で、「間接セット=0.5セット」とする分数(fractional)法が、「1(全部数える)」「0(数えない)」より筋肥大・筋力の予測で相対的に最も支持された。ただし0.5という値そのものは比較した3候補のうちの最良であって、筋ごと・種目ごとに検証された係数ではない。

### Cited Findings
- Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC。67研究・2,058人の多層メタ回帰。全セットを測定部位への特異性で direct / indirect に分類し、indirect を 1(total)/0.5(fractional)/0(direct)の3通りで数えて比較した — [SportRxiv preprint v2](https://sportrxiv.org/index.php/server/preprint/view/460)
- 「fractional」の相対的エビデンスが最も強く、主解析に採用された — [SportRxiv preprint](https://sportrxiv.org/index.php/server/preprint/view/460); [sponet.de](https://sponet.de/sponet/Record/4097139)
- ボリューム増で筋肥大・筋力とも増える(事後確率100%)が収穫逓減あり、筋力の方が逓減が強い。頻度の筋肥大への効果は無視できる程度と両立 — [SportRxiv preprint](https://sportrxiv.org/index.php/server/preprint/view/460)
- 査読版: Sports Med. 2025 Dec 4 として引用されている。「1回あたり約11セット(筋肥大)/約2セット(筋力)」で上積みが検出できなくなる(PUOS)と報告 — [train.fitness 解説](https://train.fitness/personal-trainer-blogs/not-all-sets-are-created-equal)。注: 同じ解説記事内に「2026年2月に公表」という記述もあり、公表時期の表記が食い違う(未確認)。
- 平均的なボリューム付近で、分数週セット1つ追加あたり筋サイズ約+0.24%という傾き — [sci-sport.com](https://sci-sport.com/en/muscle-hypertrophy-strength-and-volume-how-does-the-relationship-evolve-272/)(二次情報)
- Hevy 社の解説記事も、主働筋1セット・協働筋0.5セットを実用的な目安としつつ「種目によって協働筋への刺激は違うので理想的ではない」と明記(例: ラットプルダウン=背中1、二頭0.5) — [Hevy: How many sets](https://www.hevyapp.com/how-many-sets/)

#### 種目別の筋肥大(MRI/超音波)研究 — 「どの協働筋が実際に育つか」
- **スクワットはハムストリングスを育てない(強い)**: Kubo, Ikebukuro, Yata 2019(Eur J Appl Physiol、17名、10週、MRI)。フル(約140°)/ハーフ(約90°)とも大腿四頭筋は約5%増、内転筋+6.2%、大臀筋+6.7%(深い群で優位)、ハムストリングスはほぼ増えず — [Stronger by Science: squat depth](https://www.strongerbyscience.com/squat-depth/); [SbS: squats & adductors](https://www.strongerbyscience.com/squats-adductors/)
- **ヒップスラストとスクワットで大臀筋の肥大は同程度、スクワットは大腿四頭筋・内転筋で上回る、ハムは両群ほぼゼロ**: Plotkin ら 2023(Front Physiol、9週・週2回・3→6セット・8–12回限界まで、HT n=18/SQ n=16、MRI)。スクワット群が大腿四頭筋 +3.6±1.5 cm²、内転筋 +2.5±0.7 cm² 上回り、ハム差 0.1±0.6 cm² — [PMC10593473](https://pmc.ncbi.nlm.nih.gov/articles/PMC10593473/); [Frontiers](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2023.1279170/full)
- **レッグプレスは大臀筋・大内転筋を育てるが大腿直筋は育てない(強い)**: Kinoshita, Maeo ら(MSSE, Publish Ahead of Print, 2026、17名、片脚ずつ KE vs LP、70%1RM×10回×5セット×週2、12週、MRIで17筋)。大腿直筋 KE +13.2% vs LP +1.1%、広筋群 +5.0–7.2% vs +4.4–6.2%(同等)、大腿四頭筋全体 +7.1% vs +4.9%(有意差なし)。LPのみ大臀筋 +15.4%、大内転筋 +6.2%。ハム(大腿二頭筋長頭)は両条件で +1.5〜5.3% とわずか — [MSSE 原著 PDF(DOI 10.1249/MSS.0000000000003957)](https://www.fisiologiadelejercicio.com/wp-content/uploads/2026/02/hypertrophic_effects_of_single__versus_multi_joint.1002-1.pdf)
- **スクワットでは大腿直筋が育ちにくい**: レッグエクステンション群は大腿直筋が3部位すべて有意に増えたが、スクワット群はどの部位でも有意に増えなかった — [StrengthLog: squat vs leg extension](https://www.strengthlog.com/squat-vs-leg-extension/)
- **ベンチプレスは上腕三頭筋の外側頭は育てるが長頭はほぼ育てない**: Brandão ら 2020(J Strength Cond Res 34(5):1254-1263、未鍛錬男性50名、10週・週2、MRIで3頭別)。ベンチのみ群は外側頭は良好、長頭は最小、内側頭は伸展種目の約半分。伸展種目を含む群は三頭筋全体で約2倍 — [StrengthLog 解説](https://www.strengthlog.com/bench-press-is-not-enough-for-maximal-triceps-growth/)
- **ラットプルダウンでも肘屈筋は育つ(未鍛錬者)**: Gentil ら 2015。ラットプルダウンのみ群 +6.10%、カールのみ群 +5.83%、群間差なし(10週・週2) — [PMC4592763](https://pmc.ncbi.nlm.nih.gov/articles/PMC4592763); ただし同じグループから「単関節の方が肘屈筋の肥大が大きい」とする別論文もある — [Gentil 著者サイト PDF(題名のみ確認)](https://paulogentil.com/pdf/Single-Joint%20Exercise%20Results%20in%20Higher%20Hypertrophy%20of%20Elbow%20Flexors%20Than%20Multijoint%20Exercise.pdf)
- **オーバーヘッド姿勢の肘伸展は三頭筋長頭を大きく育てる**: Maeo ら 2023(Eur J Sport Sci、21名、片腕ずつ)。長頭 +28.5% vs +19.6%、三頭筋全体 +19.9% vs +13.9%(軽い絶対負荷でも) — [Stronger by Science](https://www.strongerbyscience.com/?p=57800); [立命館大学ニュース](https://www.ritsumei.ac.jp/shs/news/article.html/?id=680)
- **シーテッドレッグカールはライイングより大きいハム肥大**: Maeo ら 2021「Greater Hamstrings Muscle Hypertrophy but Similar Damage Protection after Training at Long versus Short Muscle Lengths」 — [Wikipedia: Leg curl(二次)](https://en.wikipedia.org/wiki/Leg_curl)(数値は未取得)

### Inferences
- 「間接=0.5」はメタ回帰レベルで支持された唯一の数値規約で、アプリの既定値として採るのが妥当。ただし種目単位の研究は、0.5 が過大な組(スクワット→ハム ≒0、レッグプレス/スクワット→大腿直筋 ≒0、ベンチ→三頭筋長頭 ≒小)と、過小な組(レッグプレス→大臀筋 +15%、スクワット→大臀筋はヒップスラストと同程度、プルダウン→肘屈筋はカールと同程度[未鍛錬者])の両方を示す。
- よって **1 / 0.5 / 0.25 / 0(=書かない)** の3段階+無しで十分。0.25 は「関与はあるが肥大の根拠が弱い/慣習」を表す逃げ道として使う。
- 「臀部」をスクワット・レッグプレスで 0.5 とするのは控えめ側。MRI は 1.0 に近い可能性を示すが、研究はいずれも未鍛錬者・短期で、慣習(SbS/RP系)も脚プレス系の臀部は間接扱いなので 0.5 を推奨。

### Gaps
- Pelland らの査読版の正確な巻号・公表日(2025年12月 vs 2026年2月の表記揺れ)は未確認。
- 「indirect」の具体的な分類表(どの種目がどの筋の indirect か)を原著から取れていない。0.5 を種目別に変えるべきかは原著も検証していない。
- 三角筋前部がベンチ/インクラインで実際に肥大する縦断研究は今回見つけられなかった(慣習扱い)。
- ロウ系で三角筋後部・僧帽筋中下部・菱形筋が肥大するという縦断データも見つけられなかった(慣習扱い)。

---

## Q2. EMG で寄与度を決めてよいか

### Takeaway
よくない。急性の表面EMG振幅は縦断的な筋肥大の予測因子として妥当性が確認されていない(Vigotsky ら 2022)。Plotkin 2023 でも EMG の高さと MRI の肥大は対応しなかった。寄与表は EMG ではなく縦断研究(MRI/超音波)+慣習で作り、根拠の強弱を明記すべき。

### Cited Findings
- Vigotsky ら「Longing for a Longitudinal Proxy: Acutely Measured Surface EMG Amplitude is not a Validated Predictor of Muscle Hypertrophy」Sports Med 2022。検証の乏しさと機序的根拠の弱さから、EMGで刺激の強さを比べる急性研究は慎重に扱うべきと結論 — [iris.polito.it](https://iris.polito.it/handle/11583/2957257); [MuscleAndMotion 解説](https://www.muscleandmotion.com/blog/maximizing-emg-amplitude/)
- EMG は筋の電気的「興奮」を測るもので「活性化」や力そのものではない — [Vigotsky ら 2018 PMC5758546](https://pmc.ncbi.nlm.nih.gov/articles/PMC5758546)
- Plotkin 2023: ヒップスラストは大臀筋の平均sEMGが高かったが肥大は同程度。「急性のsEMGは肥大の結果を予測しない」 — [PMC10593473](https://pmc.ncbi.nlm.nih.gov/articles/PMC10593473/)
- 反例(EMGが一致した例): Kinoshita/Maeo 2026 では、追試の sEMG パターンが KE/LP の肥大差と「おおむね一致」した — [MSSE PDF](https://www.fisiologiadelejercicio.com/wp-content/uploads/2026/02/hypertrophic_effects_of_single__versus_multi_joint.1002-1.pdf)

### Inferences
- EMG は「関与の有無」の目安には使えても、0.5 か 0.25 かを決める精度はない。EMG 由来の細かい%配分(例: 胸62%/三頭23%/肩15%)はアプリに持ち込まない方がよい。

### Gaps
- EMG と肥大の一致・不一致を体系的に比べたメタ分析は今回確認できず。

---

## Q3. 他アプリはどう表現・集計しているか

### Takeaway
「主働筋1つ+協働筋複数」というデータモデルは事実上の標準(Hevy のカスタム種目UIで確認)。協働筋を集計でいくつに数えるかは、公開ドキュメントで明示しているアプリが少ない。明示が確認できたのは Arvo(0.5)のみ。

### Cited Findings
- Hevy: カスタム種目で「主働筋1つ+協働筋を複数」選べる。週あたり部位別セット数のグラフに反映 — [Hevy custom exercises](https://www.hevyapp.com/features/custom-exercises/); [Hevy sets per muscle group](https://www.hevyapp.com/features/sets-per-muscle-group-per-week/)。協働筋を1/0.5/0のどれで数えるかはページに記載なし(取得して確認)。
- Hevy のブログは手計算の目安として主1・協0.5を推奨 — [Hevy: How many sets](https://www.hevyapp.com/how-many-sets/)
- Arvo(AIトレーニングアプリ)のブログ: 「Secondary muscle sets count as 0.5x」。例: プレス10セット+三頭種目4セット→三頭は 10×0.5+4=9セット — [arvo.guru](https://arvo.guru/blog/training-volume-science)
- MacroFactor Workouts(SbS/Nippard系): 部位別のボリューム追跡と、部位を「secondary」優先度に設定する機能はあるが、協働筋のカウント係数は公開情報で確認できず — [macrofactor.com/workouts](https://macrofactor.com/workouts/); [MacroFactor Jan 2026 update](https://macrofactor.com/mm-jan-2026/)
- Fitbod: セット・回数・重量から「各筋群がどれだけ働いたか」を推定し、筋群ごとに回復% (0–100%)を出す。協働筋の配分係数は非公開 — [Fitbod Help: Muscle Recovery](https://help.fitbod.me/hc/en-us/articles/360006269014-Muscle-Recovery); [Fitbod blog](https://fitbod.me/blog/muscle-recovery/)
- 別アプリのユーザー要望ボードで「主=背中なら+1、副=脚なら+0.5」という分配が要望として出ている(実装済みかは不明) — [userjot 要望ボード](https://strongsplit.userjot.com/board/p/exercise-muscle-improvements)

### Inferences
- 主1/副0.5 は「研究(Pelland)」「アプリ解説(Hevy, Arvo)」の双方で一致する最大公約数。KURABELL がこれを採ると、他アプリからの乗り換え利用者の直感とも合う。
- 表示は「直接セット」と「間接込みの分数セット」を並べるのが安全(Hevy記事自身が0.5の粗さを認めているため、合算値だけを見せると誤解を招く)。

### Gaps
- Strong / JEFIT / Alpha Progression / RP Hypertrophy app の協働筋カウント規則は公式資料で確認できず(RP のヘルプは 403 で取得不可)。Israetel の Volume Landmarks が間接セットを何倍で扱うかも一次資料未確認。

---

## Q4. 部位の粒度 — 語彙を増やすべきか

### Takeaway
現行16部位はおおむね適切。研究上「別物」として扱うべき差(三頭筋長頭、大腿直筋、ハムの種目差、大臀筋 vs 中臀筋)は実在するが、部位を分割すると記録・分割日・AIコーチの語彙まで波及する。分割はせず、寄与表の係数で吸収するのを推奨。追加を検討する価値があるのは「内転筋」1つだけ。

### Cited Findings
- 三頭筋: ベンチは外側頭、伸展種目(特にオーバーヘッド)は長頭 — [StrengthLog / Brandão 2020](https://www.strengthlog.com/bench-press-is-not-enough-for-maximal-triceps-growth/); [SbS / Maeo 2023](https://www.strongerbyscience.com/?p=57800)
- 大腿四頭筋: 多関節(スクワット/レッグプレス)は広筋群、大腿直筋はレッグエクステンションが必要 — [Kinoshita/Maeo 2026](https://www.fisiologiadelejercicio.com/wp-content/uploads/2026/02/hypertrophic_effects_of_single__versus_multi_joint.1002-1.pdf); [StrengthLog](https://www.strengthlog.com/squat-vs-leg-extension/)
- 内転筋: スクワット(+6.2%)・レッグプレス(大内転筋 +6.2%)で明確に肥大し、ヒップスラストより上 — [SbS](https://www.strongerbyscience.com/squats-adductors/); [PMC10593473](https://pmc.ncbi.nlm.nih.gov/articles/PMC10593473/); [Kinoshita/Maeo 2026](https://www.fisiologiadelejercicio.com/wp-content/uploads/2026/02/hypertrophic_effects_of_single__versus_multi_joint.1002-1.pdf)
- 臀部: ヒップスラストとスクワットで大臀筋の肥大は同程度、中臀筋+小臀筋は伸びが小さい — [PMC10593473](https://pmc.ncbi.nlm.nih.gov/articles/PMC10593473/)

### Inferences(推奨)
- **分割しない**: 三頭筋長頭/外側頭、大腿直筋/広筋、広背筋/菱形筋・僧帽筋中下部。いずれも `normMuscle` 移行・分割日マッチ・AIコーチの候補リストに波及し、ユーザーにとっての利得(週セット数の微差)より複雑さが勝る。代わりに係数で表現する(例: ベンチ→三頭 0.5 は長頭が育たない分を考えると上限側、という注記)。
- **ロウ系の僧帽筋**: 既存語彙「僧帽筋」をそのまま協働筋に使い 0.5(中下部・菱形筋を代表させる)。シュラッグ(上部)と同じキーに入るのは許容。
- **内転筋の追加(任意)**: スクワット/レッグプレス/ランジで 0.5 を受ける唯一の「現在どこにも計上されない」大きな筋。追加する場合も主部位にする種目(アダクションマシン)が無いなら、協働筋専用の語彙になる点に注意。追加しないなら臀部・大腿四頭筋に吸収して無視でよい。
- **「全身」**: 協働筋の寄与先には使わない(集計上の意味がない)。

### Gaps
- 菱形筋・僧帽筋中下部・三角筋後部がロウで肥大するかの MRI データは見つけられず。
- 中臀筋をアブダクションで育てた縦断データは未調査。

---

## Q5. 推奨データモデルと、既存リストの寄与表

### Takeaway
`EXERCISE_DB` の各要素に `sec: { 部位: 係数 }` を足し(主部位 `m` は 1.0 として据え置き)、集計時に種目マスターから引く。係数は 0.5(標準の間接)と 0.25(関与はあるが根拠が弱い/慣習)の2値だけ。記録側に協働筋をスナップショットしない。

### Cited Findings
- 0.5 の根拠: [Pelland ら SportRxiv](https://sportrxiv.org/index.php/server/preprint/view/460)
- 0 にすべき組の根拠: スクワット→ハム [SbS](https://www.strongerbyscience.com/squat-depth/)、[PMC10593473](https://pmc.ncbi.nlm.nih.gov/articles/PMC10593473/)
- 臀部をレッグプレス系に付ける根拠: [Kinoshita/Maeo 2026](https://www.fisiologiadelejercicio.com/wp-content/uploads/2026/02/hypertrophic_effects_of_single__versus_multi_joint.1002-1.pdf)
- 二頭をプル系に付ける根拠: [Gentil 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4592763)
- 三頭をプレス系に付ける根拠: [Brandão 2020 via StrengthLog](https://www.strengthlog.com/bench-press-is-not-enough-for-maximal-triceps-growth/)

### Inferences — 実装の形(提案)

```js
// m = 主部位(1.0)。sec = 協働筋(0.5 = 標準の間接 / 0.25 = 関与はあるが根拠弱・慣習)
{ n: "バーベルベンチプレス", m: "大胸筋", eq: "バーベル", t: "C", sec: { 上腕三頭筋: 0.5, 三角筋前部: 0.5 } },
```
集計(`weekly`)は:
```js
const n = workingSets(ex).length;
add(ex.muscle, n);                                   // 直接セット
const sec = findExercise(ex.name)?.sec || {};        // 記録ではなく種目マスターから引く
for (const [k, w] of Object.entries(sec)) addIndirect(k, n * w);
```
注意点(このリポジトリ固有):
- **協働筋は記録にスナップショットしない。** CLAUDE.md の rom/bwFactor の教訓(記録側の値が毎回書き戻され、マスター更新が永久に届かなくなった)と同じ構造になる。`resolveCoefficients` と同様に、集計時にマスターから解決する純粋関数を `src/domain/` に置き、テストで縛る。
- **kgボリューム(`exVolume`)は主部位だけに計上を推奨。** 0.5 の根拠はセット数で、kg×回数を協働筋に按分する根拠はない(按分すると総ボリュームが二重計上になり、現行の `totalVol` の意味が変わる)。
- 表示は「直接 n セット + 間接 m(分数)」の2段にし、合算だけを見せない。
- カスタム種目は `sec` 空(=現行と同じ挙動)。後から編集UIで足せる余地だけ残す。
- `muscleMatchesDay`(分割日マッチ)や AI コーチの候補リストは主部位 `m` のままにする(協働筋で候補が膨れるのを防ぐ)。

### 寄与表(現行 EXERCISE_DB 全種目)

記号: 根拠 **S** = 縦断MRI/超音波あり、**C** = 慣習(SbS/Hevy/Arvo等の主1・副0.5規約と解剖学的機能から推定)。主部位は現行の `m` を変更しない(1.0)。

| 種目 | 主(1.0) | 協働筋 | 根拠 |
|---|---|---|---|
| バーベルベンチプレス | 大胸筋 | 上腕三頭筋 0.5, 三角筋前部 0.5 | 三頭 S(Brandão: 外側頭のみ)/前部 C |
| ダンベルベンチプレス | 大胸筋 | 上腕三頭筋 0.5, 三角筋前部 0.5 | 同上 |
| スミスマシンベンチプレス | 大胸筋 | 上腕三頭筋 0.5, 三角筋前部 0.5 | 同上 |
| チェストプレス | 大胸筋 | 上腕三頭筋 0.5, 三角筋前部 0.5 | C |
| プッシュアップ | 大胸筋 | 上腕三頭筋 0.5, 三角筋前部 0.5, 腹筋 0.25 | C |
| ディップス | 大胸筋 | 上腕三頭筋 0.5, 三角筋前部 0.5 | C |
| ダンベルフライ | 大胸筋 | 三角筋前部 0.25 | C |
| ペックデックフライ | 大胸筋 | 三角筋前部 0.25 | C |
| ケーブルフライ | 大胸筋 | 三角筋前部 0.25 | C |
| インクラインバーベルベンチプレス | 大胸筋 | 三角筋前部 0.5, 上腕三頭筋 0.5 | C |
| インクラインダンベルプレス | 大胸筋 | 三角筋前部 0.5, 上腕三頭筋 0.5 | C |
| インクラインチェストプレス | 大胸筋 | 三角筋前部 0.5, 上腕三頭筋 0.5 | C |
| スミスマシンインクラインプレス | 大胸筋 | 三角筋前部 0.5, 上腕三頭筋 0.5 | C |
| ロー・トゥ・ハイ・ケーブルフライ | 大胸筋 | 三角筋前部 0.25 | C |
| 懸垂 | 広背筋 | 上腕二頭筋 0.5, 三角筋後部 0.25, 僧帽筋 0.25, 前腕 0.25 | 二頭 S(Gentil 2015)/他 C |
| アシスト懸垂 | 広背筋 | 上腕二頭筋 0.5, 三角筋後部 0.25, 僧帽筋 0.25 | 同上 |
| ラットプルダウン | 広背筋 | 上腕二頭筋 0.5, 三角筋後部 0.25, 僧帽筋 0.25 | 二頭 S(Gentil 2015) |
| 片手ラットプルダウン | 広背筋 | 上腕二頭筋 0.5, 三角筋後部 0.25 | C |
| ストレートアームプルダウン | 広背筋 | 上腕三頭筋 0.25 | C(肩伸展で長頭が関与) |
| ダンベルプルオーバー | 広背筋 | 大胸筋 0.5, 上腕三頭筋 0.25 | C |
| バーベルベントオーバーロウ | 広背筋 | 僧帽筋 0.5, 三角筋後部 0.5, 上腕二頭筋 0.5, 脊柱起立筋 0.25 | C |
| Tバーロウ | 広背筋 | 僧帽筋 0.5, 三角筋後部 0.5, 上腕二頭筋 0.5, 脊柱起立筋 0.25 | C |
| ワンハンドダンベルロウ | 広背筋 | 僧帽筋 0.5, 三角筋後部 0.5, 上腕二頭筋 0.5 | C |
| チェストサポートダンベルロウ | 広背筋 | 僧帽筋 0.5, 三角筋後部 0.5, 上腕二頭筋 0.5 | C |
| ケーブルシーテッドロウ | 広背筋 | 僧帽筋 0.5, 三角筋後部 0.5, 上腕二頭筋 0.5 | C |
| マシンロウ | 広背筋 | 僧帽筋 0.5, 三角筋後部 0.5, 上腕二頭筋 0.5 | C |
| インバーテッドロウ | 広背筋 | 僧帽筋 0.5, 三角筋後部 0.5, 上腕二頭筋 0.5 | C |
| バーベルシュラッグ | 僧帽筋 | 前腕 0.25 | C |
| ダンベルシュラッグ | 僧帽筋 | 前腕 0.25 | C |
| ケーブルシュラッグ | 僧帽筋 | — | C |
| デッドリフト | 脊柱起立筋 | 臀部 0.5, ハムストリングス 0.5, 大腿四頭筋 0.25, 僧帽筋 0.25, 前腕 0.25 | C |
| ラックプル | 脊柱起立筋 | 臀部 0.5, 僧帽筋 0.5, ハムストリングス 0.25, 前腕 0.25 | C |
| バックエクステンション | 脊柱起立筋 | 臀部 0.5, ハムストリングス 0.5 | C |
| バーベルオーバーヘッドプレス | 三角筋前部 | 三角筋中部 0.5, 上腕三頭筋 0.5 | C |
| ダンベルショルダープレス | 三角筋前部 | 三角筋中部 0.5, 上腕三頭筋 0.5 | C |
| アーノルドプレス | 三角筋前部 | 三角筋中部 0.5, 上腕三頭筋 0.5 | C |
| マシンショルダープレス | 三角筋前部 | 三角筋中部 0.5, 上腕三頭筋 0.5 | C |
| スミスマシンショルダープレス | 三角筋前部 | 三角筋中部 0.5, 上腕三頭筋 0.5 | C |
| フロントレイズ | 三角筋前部 | — | C |
| サイドレイズ | 三角筋中部 | — | C |
| ケーブルサイドレイズ | 三角筋中部 | — | C |
| マシンサイドレイズ | 三角筋中部 | — | C |
| アップライトロウ | 三角筋中部 | 僧帽筋 0.5, 三角筋前部 0.25, 上腕二頭筋 0.25 | C |
| リアデルトフライ | 三角筋後部 | 僧帽筋 0.25 | C |
| リバースペックデック | 三角筋後部 | 僧帽筋 0.25 | C |
| ケーブルリアデルトフライ | 三角筋後部 | 僧帽筋 0.25 | C |
| フェイスプル | 三角筋後部 | 僧帽筋 0.5 | C |
| バーベルカール | 上腕二頭筋 | 前腕 0.25 | C |
| EZバーカール | 上腕二頭筋 | 前腕 0.25 | C |
| ダンベルカール | 上腕二頭筋 | 前腕 0.25 | C |
| インクラインダンベルカール | 上腕二頭筋 | 前腕 0.25 | C |
| ハンマーカール | 上腕二頭筋 | 前腕 0.5 | C(腕橈骨筋) |
| プリーチャーカール | 上腕二頭筋 | 前腕 0.25 | C |
| ケーブルカール | 上腕二頭筋 | 前腕 0.25 | C |
| マシンカール | 上腕二頭筋 | 前腕 0.25 | C |
| ナローグリップベンチプレス | 上腕三頭筋 | 大胸筋 0.5, 三角筋前部 0.5 | C |
| スカルクラッシャー | 上腕三頭筋 | — | — |
| トライセッププレスダウン | 上腕三頭筋 | — | — |
| オーバーヘッドケーブルエクステンション | 上腕三頭筋 | — | (長頭に特に有効 S: Maeo 2023) |
| ダンベルオーバーヘッドエクステンション | 上腕三頭筋 | — | 同上 |
| トライセップキックバック | 上腕三頭筋 | — | — |
| マシントライセップエクステンション | 上腕三頭筋 | — | — |
| ベンチディップス | 上腕三頭筋 | 三角筋前部 0.25, 大胸筋 0.25 | C |
| リストカール | 前腕 | — | — |
| リバースリストカール | 前腕 | — | — |
| ファーマーズウォーク | 前腕 | 僧帽筋 0.5, 腹筋 0.25 | C |
| バーベルスクワット | 大腿四頭筋 | 臀部 0.5, 脊柱起立筋 0.25(内転筋を足すなら 0.5) | 臀部・内転筋 S(Kubo 2019, Plotkin 2023)/ハム=0 S |
| フロントスクワット | 大腿四頭筋 | 臀部 0.5, 脊柱起立筋 0.25 | 同上(外挿) |
| スミスマシンスクワット | 大腿四頭筋 | 臀部 0.5 | 同上(外挿) |
| ゴブレットスクワット | 大腿四頭筋 | 臀部 0.5 | 同上(外挿) |
| レッグプレス | 大腿四頭筋 | 臀部 0.5(内転筋を足すなら 0.5) | S(Kinoshita/Maeo 2026: 大臀筋+15.4%)/ハム≒0 |
| ハックスクワット | 大腿四頭筋 | 臀部 0.5 | 外挿 |
| レッグエクステンション | 大腿四頭筋 | — | (大腿直筋に必要 S) |
| ブルガリアンスクワット | 大腿四頭筋 | 臀部 0.5 | C |
| ランジ | 大腿四頭筋 | 臀部 0.5 | C |
| ルーマニアンデッドリフト | ハムストリングス | 臀部 0.5, 脊柱起立筋 0.5, 前腕 0.25 | C |
| ダンベルルーマニアンデッドリフト | ハムストリングス | 臀部 0.5, 脊柱起立筋 0.5 | C |
| グッドモーニング | ハムストリングス | 臀部 0.5, 脊柱起立筋 0.5 | C |
| ライイングレッグカール | ハムストリングス | — | (シーテッドの方が肥大大 S: Maeo 2021) |
| シーテッドレッグカール | ハムストリングス | — | 同上 |
| ノルディックハムカール | ハムストリングス | — | — |
| ヒップスラスト | 臀部 | 大腿四頭筋 0.25 | 臀部 S(Plotkin 2023)/ハム≒0 S/四頭 C |
| ケーブルキックバック | 臀部 | ハムストリングス 0.25 | C |
| ヒップアブダクション | 臀部 | — | C(中・小臀筋。大臀筋とは別物) |
| ステップアップ | 臀部 | 大腿四頭筋 0.5 | C |
| スタンディングカーフレイズ | ふくらはぎ | — | — |
| シーテッドカーフレイズ | ふくらはぎ | — | — |
| レッグプレスカーフレイズ | ふくらはぎ | — | — |
| クランチ | 腹筋 | — | — |
| ケーブルクランチ | 腹筋 | — | — |
| レッグレイズ | 腹筋 | — | — |
| ハンギングレッグレイズ | 腹筋 | 前腕 0.25 | C |
| アブローラー | 腹筋 | 広背筋 0.25 | C |
| アブドミナルマシン | 腹筋 | — | — |

表の設計方針:
- 「ハムストリングス」をスクワット/レッグプレス/ヒップスラストに **付けない**のは意図的(縦断MRIでほぼ肥大なし)。よくある「スクワット=ハム副」の慣習より研究を優先した唯一の明確な逸脱。
- 0.25 は全体の合計値への影響が小さいので、迷ったら付けない(=0)側に倒してよい。実装を最小にするなら 0.25 を全部落として 0.5 だけ残しても、Pelland の規約とは整合する。
- 主部位の付け替え(例: デッドリフトの主を臀部へ)はこの調査の範囲外。現行 `m` は据え置いた。

### Gaps
- 0.25 の段は研究上の裏付けがない独自の簡略化(Pelland は 0.5 のみ検証)。
- フロントスクワット・ハックスクワット・ブルガリアン・ランジの臀部寄与は、スクワット/レッグプレスからの外挿。
- 三角筋前部(プレス系)・後部(ロウ系)・僧帽筋(ロウ系)の 0.5 はすべて慣習。
