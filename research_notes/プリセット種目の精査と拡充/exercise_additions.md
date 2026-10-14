# プリセット種目の精査と拡充(EXERCISE_DB 追加候補と既存エントリの監査)

対象: `index.html` の `EXERCISE_DB`(425〜537行、2026-10-11時点で約95種目)、`ALIASES`(539行)、`MUSCLES`(346行)、
`src/domain/i18n.js` の `EX_NAMES_EN`(645行〜)。

調査の制約(最初に明記):
- Hevy / Strong の種目ライブラリは JS 描画・アプリ内のみで、一覧を取得できなかった(Hevy は「400以上」とだけ公表)。
  「Hevy にある/無い」を個別に断定した記述はこのノートには入れていない。
- 機械可読の公開 DB として **free-exercise-db(876種目)** を実際にダウンロードして分類を照合した。
- 日本語名の「よく使われる表記」は、明治ザバス「筋トレ辞典」、smartlog、Life Fitness 日本語カタログ、Lyfta 日本語版で確認できた範囲のみ。
  YouTube の検索ボリュームなど定量データは取れていない。

---

## Q1. 人気アプリ/公開DBにあって、このアプリに無い種目は何か(日本のジムのマシン系を含む)

### Takeaway
欠けているのは主に (a) 日本の総合ジムにほぼ必ずある **アダクション(内転筋)マシン** と **ロータリートルソー**、
(b) 大手ジムに普及したプレートロード系(ペンデュラムスクワット・ベルトスクワット・ヒップスラストマシン/グルートドライブ)、
(c) 定番フリーウェイトの持ち方違い(チンアップ、スモウデッドリフト、インクラインダンベルフライ、ケーブルクロスオーバー等)。
加えて **ケトルベルが EQUIPMENT に無い** ため、スイング等は現状の器具区分で表現できない。

### Cited Findings
- 日本の一般的なジムマシン紹介記事で挙がるのは: チェストプレス、バタフライマシン、ショルダープレス、ラットプルダウン、シーテッドローイング、
  バックエクステンション、アブドミナル(アブクランチ)、ケーブルクランチ、ヒップアブダクション、マルチヒップ、レッグプレス、レッグエクステンション、レッグカール — [smartlog](https://smartlog.jp/184776)
- 別のまとめ記事では「ヒップアブダクター&アダクター(お尻・内もも)」「ロータリートルソー(脇腹)」「ペクトラルフライ&リアデルト」「チン&ディップアシスト」が定番マシンとして並ぶ — [fitmap magazine](https://fitmap.jp/magazine/column/169782/)(検索結果の要約経由。本文は未精読)
- Life Fitness の日本語カタログに「ヒップ・アダクション」「ヒップ・アブダクター/アダクター」「グルート・ブリッジ」「グルート」(Insignia/Axiom シリーズ)が掲載 — [Life Fitness JP: Hip Abductor/Adductor](https://lifefitness.com/ja-jp/catalog/strength-training/selectorized/insignia-series-hip-abductor-adductor), [Glute Bridge](https://lifefitness.com/ja-jp/catalog/strength-training/selectorized/insignia-series-glute-bridge)
- Hammer Strength(Life Fitness)のプレートロード「グルートドライブ」「ベルトスクワット」、および「ペンデュラムXスクワット」が日本語カタログにある — [Glute Drive](https://lifefitness.com/ja-jp/catalog/strength-training/plate-loaded/hammer-strength-plate-loaded-glute-drive), [Belt Squat](https://lifefitness.com/ja-jp/catalog/strength-training/plate-loaded/hammer-strength-plate-loaded-belt-squat), [Pendulum X Squat](https://lifefitness.com/ja-jp/catalog/strength-training/plate-loaded/pendulum-x-squat)
- 国内代理店の JERAI でもベルトスクワット・ヒップスラストのプレートロード機を扱う — [JERAI belt squat](https://jeraifitness.com/ja/products/strength-load-on-belt-squat), [JERAI hip thrust](https://jeraifitness.com/ja/products/strength-load-on-hip-thrust)
- free-exercise-db(876種目)の主動筋カテゴリは 17: abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps。adductors 13件・abductors 8件・neck 8件 — [free-exercise-db](https://github.com/yuhonas/free-exercise-db)(`dist/exercises.json` を取得して集計)
- 同DBのマシン/ケーブル種目には Thigh Adductor / Thigh Abductor、Cable Hip Adduction、Dip Machine、Leverage(=プレートロード)Chest/Incline/Decline Press・High Row・Iso Row・Shrug、Cable Crossover / Low Cable Crossover、Close-Grip Front Lat Pulldown / Underhand Cable Pulldowns / V-Bar Pulldown、Cable Preacher Curl、Reverse Grip Triceps Pushdown、Pallof Press、Cable Wood Chop、Pull Through、Smith Machine Stiff-Legged Deadlift、Smith Machine Calf Raise、Glute Ham Raise、Reverse Hyperextension 等がある — [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
- Hevy の種目リストは「400+」 — [Hevy Help Center](https://help.hevyapp.com/hc/en-us/articles/35382889578135)
- ザバス「筋トレ辞典」の部位タグには 内転筋(19種目)・腹斜筋(38種目)・腸腰筋(6種目) があり、日本の一般向けメディアでもこれらは独立カテゴリとして扱われている — [明治ザバス 筋トレ辞典](https://www.meiji.co.jp/sports/savas/contents/training/)

### 追加候補(優先度順)

列: 日本語名 / English / m(既存MUSCLESの値。★は新カテゴリ提案時の値) / eq / t / db / 根拠

**優先度A — ほぼどのジムにもある/記録頻度が高いと見込まれるもの(まず入れる)**

| # | 日本語名 | English | m | eq | t | db | 根拠 |
|---|---|---|---|---|---|---|---|
| 1 | アダクション(ヒップアダクション) | Hip Adduction | 臀部 → ★内転筋 | マシン | I | | 総合ジムの定番マシン(smartlog, fitmap, Life Fitness)。既存「ヒップアブダクション」と対。現状は付ける部位が無い |
| 2 | チンアップ | Chin-Up | 広背筋 | 自重 | C | | free-exercise-db に独立収録。懸垂と握りが違い記録を分けたい人が多い。bw係数は懸垂と同じ1.0で可 |
| 3 | インクラインダンベルフライ | Incline Dumbbell Fly | 大胸筋 | ダンベル | I | ✓ | 上部胸の定番。既存はフラットのフライのみ |
| 4 | ケーブルクロスオーバー | Cable Crossover | 大胸筋 | ケーブル | I | | free-exercise-db に Cable Crossover / Low Cable Crossover。日本でも「ケーブルフライ」と並び呼称が定着(下記Q2)。既存「ケーブルフライ」の別名として ALIASES 化でもよい |
| 5 | スモウデッドリフト | Sumo Deadlift | 臀部 or ハムストリングス | バーベル | C | | free-exercise-db は primary=hamstrings、secondary に adductors。パワー系ユーザーの主種目 |
| 6 | レッグカール(スタンディング/片脚) | Standing Leg Curl | ハムストリングス | マシン | I | | free-exercise-db に Standing Leg Curl。ライイング/シーテッドに次ぐ第3の型 |
| 7 | ディップスマシン(アシストディップス) | Assisted Dip / Dip Machine | 上腕三頭筋 or 大胸筋 | マシン | C | | 「チン&ディップアシスト」は定番機(fitmap)。free-exercise-db に Dip Machine(primary=triceps)。既存「アシスト懸垂」と対 |
| 8 | ロータリートルソー | Rotary Torso | 腹筋(★腹斜筋) | マシン | I | | 日本の総合ジムの定番機として挙がる(fitmap) |
| 9 | ケーブルプルスルー | Cable Pull-Through | 臀部 | ケーブル | C | | free-exercise-db 収録(Pull Through)。器具が少ないジムでの臀部種目 |
| 10 | ヒップスラストマシン(グルートドライブ) | Hip Thrust Machine | 臀部 | マシン | C | | Life Fitness / JERAI の日本向け製品。バーベル版と重量が別物なので分けないと前回比が壊れる |
| 11 | ペンデュラムスクワット | Pendulum Squat | 大腿四頭筋 | マシン | C | | Life Fitness JP カタログ。近年の大型店に増加(普及度の定量データは無し) |
| 12 | ベルトスクワット | Belt Squat | 大腿四頭筋 | マシン | C | | Hammer Strength / JERAI の日本向け製品 |
| 13 | Vスクワット | V Squat | 大腿四頭筋 | マシン | C | | 大手ジムの定番プレートロード(出典は検索要約のみ。要追加確認) |
| 14 | クローズグリップラットプルダウン(Vバー) | Close-Grip Lat Pulldown | 広背筋 | ケーブル or マシン | C | | free-exercise-db に Close-Grip Front Lat Pulldown / V-Bar Pulldown / Underhand Cable Pulldowns |
| 15 | シーテッドダンベルショルダープレス は既存「ダンベルショルダープレス」で吸収 → **追加不要** | | | | | | |
| 16 | ダンベルランジ/ウォーキングランジ | Walking Lunge | 大腿四頭筋 | ダンベル | C | ✓ | 既存「ランジ」と別記録にしたい人が多い型(推測) |
| 17 | スミスマシンランジ/スプリットスクワット | Smith Machine Split Squat | 大腿四頭筋 | スミス | C | | free-exercise-db: Smith Single-Leg Split Squat |
| 18 | スミスマシンルーマニアンデッドリフト | Smith Machine Romanian Deadlift | ハムストリングス | スミス | C | | free-exercise-db: Smith Machine Stiff-Legged Deadlift。chocoZAP/エニタイム等スミス中心の店で需要 |
| 19 | スミスマシンヒップスラスト | Smith Machine Hip Thrust | 臀部 | スミス | C | | 同上(スミス主体の24hジム)。free-exercise-db に Smith Machine Hip Raise |
| 20 | スミスマシンカーフレイズ | Smith Machine Calf Raise | ふくらはぎ | スミス | I | | free-exercise-db 収録。rom は既存カーフ系と揃えて0.3 |
| 21 | ケーブルロウ(ワンハンド) | Single-Arm Cable Row | 広背筋 | ケーブル | C | | free-exercise-db: Seated One-arm Cable Pulley Rows |
| 22 | ハイロウ(マシン) | High Row (Machine) | 広背筋 | マシン | C | | Hammer Strength の定番。free-exercise-db: Leverage High Row |
| 23 | デクラインベンチプレス | Decline Bench Press | 大胸筋 | バーベル | C | | free-exercise-db に Decline Smith Press / Leverage Decline Chest Press。ザバスのベンチプレス10バリエーションにも含まれるはず(未確認) |
| 24 | ダンベルフロントスクワット/ダンベルスクワット | Dumbbell Squat | 大腿四頭筋 | ダンベル | C | ✓ | ホームトレ/小規模ジム向け。ゴブレット(片手1個)とは記録の意味が違う |

**優先度B — 中上級者の定番フリーウェイト変種(入れる価値はあるが、検索で見つかれば十分な層)**

| # | 日本語名 | English | m | eq | t | db | メモ |
|---|---|---|---|---|---|---|---|
| 25 | シールロウ | Seal Row | 広背筋 | バーベル | C | | 胸を台に預けるロウ。上級者 YouTube で定着(日本語表記の出典は取れず) |
| 26 | ペンドレイロウ | Pendlay Row | 広背筋 | バーベル | C | | 同上 |
| 27 | メドウズロウ | Meadows Row | 広背筋 | バーベル | C | | ランドマイン片手ロウ。片側なので db 相当の扱いをどうするか要判断(下記Q3) |
| 28 | アンダーグリップベントオーバーロウ(リバースグリップ) | Reverse-Grip Barbell Row | 広背筋 | バーベル | C | | free-exercise-db: Reverse Grip Bent-Over Rows。日本では「山本式/ドリアンロウ」とも |
| 29 | ランドマインプレス | Landmine Press | 三角筋前部 | バーベル | C | | 肩に優しい代替として普及 |
| 30 | Zプレス | Z Press | 三角筋前部 | バーベル | C | | 床座りOHP。ニッチ寄り |
| 31 | ダンベルフロントレイズ以外: ケーブルフロントレイズ | Cable Front Raise | 三角筋前部 | ケーブル | I | | free-exercise-db: Front Cable Raise |
| 32 | ライイングサイドレイズ/インクラインサイドレイズ | Lying/Incline Lateral Raise | 三角筋中部 | ダンベル | I | ✓ | ストレッチ種目として日本の YouTube で流行(定量出典なし) |
| 33 | ケーブルYレイズ | Cable Y-Raise | 三角筋中部 | ケーブル | I | | 近年流行(出典なし、優先度低め) |
| 34 | ダンベルベントオーバーリアレイズ は既存「リアデルトフライ」と同一 → ALIASES「リアレイズ」で対応 | | | | | | |
| 35 | スパイダーカール | Spider Curl | 上腕二頭筋 | ダンベル or バーベル | I | | |
| 36 | ケーブルハンマーカール(ロープ) | Cable Rope Hammer Curl | 上腕二頭筋 | ケーブル | I | | free-exercise-db 収録 |
| 37 | コンセントレーションカール | Concentration Curl | 上腕二頭筋 | ダンベル | I | ✓ | 古典的定番 |
| 38 | ベイジアンカール | Bayesian Cable Curl | 上腕二頭筋 | ケーブル | I | | 近年流行(出典なし) |
| 39 | リバースカール | Reverse Curl | 前腕 | バーベル | I | | free-exercise-db: Reverse Cable Curl 等。腕橈骨筋狙い |
| 40 | ロープトライセッププレスダウン/リバースグリッププレスダウン | Rope Pushdown / Reverse-Grip Pushdown | 上腕三頭筋 | ケーブル | I | | free-exercise-db でアタッチメント別に独立収録。重量が変わるため記録を分ける価値あり |
| 41 | ダンベルスカルクラッシャー(ライイングダンベルエクステンション) | Dumbbell Skull Crusher | 上腕三頭筋 | ダンベル | I | ✓ | |
| 42 | JMプレス | JM Press | 上腕三頭筋 | バーベル | C | | 上級者向け |
| 43 | ケーブルキックバック(三頭) | Cable Triceps Kickback | 上腕三頭筋 | ケーブル | I | | 既存「ケーブルキックバック」は臀部なので**名前が衝突する**。「ケーブルトライセップキックバック」とする必要あり |
| 44 | シシースクワット | Sissy Squat | 大腿四頭筋 | 自重 | I or C | | 自重/専用台。bw係数の根拠が無いので `docs/係数の根拠.md` の手順で導出が必要 |
| 45 | ナロースタンスレッグプレス/片脚レッグプレス | Single-Leg Leg Press | 大腿四頭筋 | マシン | C | | free-exercise-db: Narrow Stance Leg Press |
| 46 | ハックスクワット(バーベル)/リバースハックスクワット | Reverse Hack Squat | 臀部 or 大腿四頭筋 | マシン | C | | 機種依存。優先度低 |
| 47 | グルートハムレイズ | Glute-Ham Raise | ハムストリングス | 自重 or マシン | C | | free-exercise-db 収録(machine) |
| 48 | 45°バックエクステンション(臀部狙い) は既存で吸収 → 追加不要 | | | | | | |
| 49 | リバースハイパーエクステンション | Reverse Hyperextension | 臀部 | マシン | I | | free-exercise-db 収録 |
| 50 | ケトルベルスイング | Kettlebell Swing | 臀部 or ハムストリングス | ★ケトルベル(現状なし) | C | | free-exercise-db: primary=hamstrings。ザバスに「ケトルベル」20種目のカテゴリ。EQUIPMENT 拡張が前提 |
| 51 | パワークリーン | Power Clean | 全身 | バーベル | C | | free-exercise-db: primary=hamstrings。既存MUSCLESの「全身」が空いている(使っている種目が無い)ので受け皿になる |
| 52 | ドンキーカーフレイズ / 片脚ダンベルカーフレイズ | Single-Leg Calf Raise | ふくらはぎ | ダンベル | I | | rom 0.3 系 |
| 53 | ティビアレイズ | Tibialis Raise | ★前脛骨筋 or ふくらはぎ | 自重 | I | | 近年流行。ただし部位カテゴリ追加は過剰の可能性(Q4) |
| 54 | パロフプレス | Pallof Press | 腹筋 | ケーブル | I | | free-exercise-db 収録。重量記録の意味は薄い |
| 55 | ケーブルウッドチョップ | Cable Wood Chop | 腹筋(★腹斜筋) | ケーブル | C | | free-exercise-db 収録 |
| 56 | サイドベンド(ダンベル) | Dumbbell Side Bend | 腹筋(★腹斜筋) | ダンベル | I | | 片手1個で行うので db 無し |
| 57 | プランク | Plank | 腹筋 | 自重 | I | | 時間種目。**このアプリは重量×回数前提なので入れると記録形式が破綻する可能性** → 入れない方がよい |
| 58 | デクラインクランチ/シットアップ | Decline Sit-Up | 腹筋 | 自重 | I | | bw 係数要導出 |
| 59 | エクスターナルローテーション(ケーブル) | Cable External Rotation | 三角筋後部(★ローテーターカフ) | ケーブル | I | | free-exercise-db: External Rotation with Cable(shoulders)。リハ/ウォームアップ扱いで重量進捗の意味は薄い |
| 60 | ネックエクステンション/ネックフレクション | Neck Curl / Extension | ★首 | 自重 or プレート | I | | free-exercise-db に neck 8件。格闘技系以外の需要は小さい |
| 61 | ヒップアブダクション(ケーブル)/ケーブルアダクション | Cable Hip Adduction | ★内転筋 | ケーブル | I | | free-exercise-db: Cable Hip Adduction |
| 62 | コペンハーゲンプランク | Copenhagen Plank | ★内転筋 | 自重 | I | | 時間種目なので57と同じ理由で見送り推奨 |
| 63 | インクラインケーブルフライ | Incline Cable Fly | 大胸筋 | ケーブル | I | | free-exercise-db 収録。既存「ロー・トゥ・ハイ」と役割が近い |
| 64 | マシンフライ(インクライン)、プルオーバーマシン | Pullover Machine | 広背筋 | マシン | I | | Nautilus/Hammer の旧来機。設置店は限定的(出典なし) |
| 65 | シュラッグ(スミス/マシン) | Smith Machine / Machine Shrug | 僧帽筋 | スミス/マシン | I | | free-exercise-db: Smith Machine Behind the Back Shrug, Leverage Shrug, Calf-Machine Shoulder Shrug |

### Inferences
- 「重量が器具ごとに全く比較できない」種目(ヒップスラスト: バーベル/マシン/スミス、レッグカール3型、アシスト系)は、
  このアプリの中心機能「前回の同じ番手のセットを見せる」に直結するので、バリエーション追加の優先度を上げてよい。
  逆に、アタッチメント違いだけで重量がほぼ同じもの(Vバー/ワイド等)は1種目に寄せる方がよい。
- 時間・距離で測る種目(プランク、コペンハーゲン、キャリー系の距離)は、記録単位 `{weight, reps, rir}` と合わないので見送るのが妥当。
  既存「ファーマーズウォーク」も同じ問題を抱えている(reps に何を入れるか不明)。
- 部位カテゴリを増やすと、`MUSCLES`・`MUSCLE_NAMES_EN`・分割日の `muscles`・週間集計・`normMuscle` の全部に波及する。
  増やすなら **内転筋** の1つだけが費用対効果に見合う(マシンが日本のジムでほぼ標準装備、既存の対のアブダクションがある)。
  腹斜筋は「腹筋」に、ローテーターカフは「三角筋後部」に、前脛骨筋は「ふくらはぎ」(または追加しない)に寄せる案が現実的。
- ケトルベルを入れるなら EQUIPMENT に1区分追加が要る。ダンベル扱いにすると `db` の意味(片手×2)と食い違いやすい。

### Gaps
- Hevy / Strong / JEFIT / Fitbod / 筋トレMemo の既定種目一覧そのものは取得できなかった(アプリ内/JS描画)。「どのアプリにも入っている」という主張は根拠なしでは書けない。
- ゴールドジム公式のマシンリスト PDF(`s3.goldsgym.jp/files/260510STSマシンリスト_compressed.pdf`)は検索で見つかったが、ホスト名解決に失敗して読めなかった。店舗ごとの機種構成を確かめるならこれを手で開くのが一番早い。
- ペンデュラム/Vスクワット/ベルトスクワットの「日本での普及率」を示す定量データは無い。

---

## Q2. 日本で最も使われる日本語表記はどれか

### Takeaway
一般向け日本語メディアは短い通称を使う傾向(ブルガリアンスクワット、リアレイズ、フレンチプレス、アームカール、シーテッドローイング、バタフライマシン)。
**既存名を変えるより、通称を `ALIASES` に足す方が安全**(記録は名前キーで保存されているため改名は既存データを割る)。

### Cited Findings
- ザバス筋トレ辞典の種目名: 「ブルガリアンスクワット」(7バリエーション)、「リアレイズ」(5)、「フレンチプレス」(5)、「アームカール」(7)、「ハンマーカール」、「アップライトロウ」、「フロントレイズ」、「ショルダープレス」、「ヒップリフト」 — [明治ザバス 筋トレ辞典](https://www.meiji.co.jp/sports/savas/contents/training/)
- 一方、アプリ系(Lyfta 日本語版)は機械翻訳寄りの「ブルガリアン・スプリット・スクワット」 — [Lyfta JP](https://www.lyfta.app/ja/exercise/bulgarian-split-squat-8tg)
- 一般向けジム解説の呼称: 「バタフライマシン」「シーテッドローイング」「アブドミナル(アブクランチ)」「マルチヒップ」「レッグカール」 — [smartlog](https://smartlog.jp/184776)
- 「ペクトラルフライ&リアデルト」「チン&ディップアシスト」「ヒップアブダクター&アダクター」「ロータリートルソー」 — [fitmap](https://fitmap.jp/magazine/column/169782/)(検索要約経由)
- メーカー表記: 「ヒップ・アダクション」「グルート・ブリッジ」(Life Fitness JP) — [Life Fitness JP](https://lifefitness.com/ja-jp/catalog/strength-training/selectorized/insignia-series-hip-adduction)

### ALIASES 追加候補(すべて既存種目へのマップ。新規種目ではない)
| 通称(入力・取り込みで来る名前) | → 既存名 |
|---|---|
| ブルガリアンスプリットスクワット / ブルガリアン・スプリット・スクワット | ブルガリアンスクワット |
| リアレイズ / ベントオーバーリアレイズ | リアデルトフライ |
| バタフライ / バタフライマシン / ペクトラルフライ / マシンフライ | ペックデックフライ |
| シーテッドローイング / シーテッドロウ / ケーブルロウ | ケーブルシーテッドロウ |
| アブクランチ / アブドミナル | アブドミナルマシン |
| ヒップアブダクター / アブダクション / アウターサイ | ヒップアブダクション |
| レッグカール | ライイングレッグカール(どちらに寄せるかは要判断。日本の小型ジムはシーテッド型が多い印象だが出典なし) |
| ラテラルレイズ | サイドレイズ |
| ミリタリープレス / オーバーヘッドプレス / OHP | バーベルオーバーヘッドプレス |
| RDL / ルーマニアンデッド | ルーマニアンデッドリフト |
| ベントオーバーロウ | バーベルベントオーバーロウ |
| ワンハンドロウ / ダンベルロウ | ワンハンドダンベルロウ |
| ライイングトライセプスエクステンション / ライイングエクステンション | スカルクラッシャー |
| プレスダウン / トライセプスプレスダウン / ケーブルプレスダウン | トライセッププレスダウン |
| クローズグリップベンチプレス | ナローグリップベンチプレス |
| チンニング / プルアップ | 懸垂 |
| 腕立て伏せ / 腕立て | プッシュアップ |
| カーフレイズ | スタンディングカーフレイズ |
| アシストチンニング / アシストプルアップ | アシスト懸垂 |
| 腹筋ローラー / アブホイール | アブローラー |
| デッド | デッドリフト |
| フレンチプレス | **割り当て注意**: 日本では立位/座位のオーバーヘッド(ダンベル)と、ライイング(=スカルクラッシャー)の両方を指す。ザバスは5バリエーションとして扱っている。曖昧なので ALIASES に入れず、取り込み時に確認するのが安全(推論) |

### Inferences
- AIコーチの取り込み(`docs/AIコーチ.md`)ではチャットAIが返す名前が既存名と一致しないと新規種目扱いになるはずなので、ALIASES の拡充は新規種目の追加と同じくらい効く可能性がある(コード未確認、推論)。
- 表記揺れ: 既存は「トライセップ」(単数)を使い、日本のメディアでは「トライセプス」も多い(ザバス等で要確認。出典なし)。改名ではなく ALIASES で吸収。
- 「ロー・トゥ・ハイ・ケーブルフライ」だけ中黒を使っており他と不揃い。改名は既存記録を割るので、中黒なし「ロートゥハイケーブルフライ」を ALIASES に足す程度でよい。

### Gaps
- YouTube タイトル・検索ボリュームでの表記比較(例: シーテッドロウ vs シーテッドローイング)は定量データを取得できていない。

---

## Q3. 既存エントリの監査(部位・C/I・器具・db フラグ・重複・命名)

### Takeaway
重大な誤りは少ない。`db` 無しの3種目(ダンベルプルオーバー、ダンベルオーバーヘッドエクステンション、ゴブレットスクワット)は
**ダンベル1個を両手で持つ種目なので db 無しで正しい**。目立つのは「片側ケーブル/マシン種目の扱いが ダンベル片側種目(db: true)と非対称」な点と、
「ステップアップの部位」と「ケーブルキックバックという名前の将来の衝突」。

### Cited Findings(外部DBとの照合: free-exercise-db の primaryMuscles / mechanic)
- Barbell Deadlift: primary = lower back, compound → 既存「デッドリフト=脊柱起立筋」と一致 — [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
- Upright Barbell Row: primary = shoulders, secondary traps, compound → 既存「アップライトロウ=三角筋中部, C」と整合 — 同上
- Dips - Chest Version: primary = chest → 既存「ディップス=大胸筋」と一致 — 同上
- Face Pull: primary = shoulders, **compound** → 既存は t: "I"。どちらでも説明はつく(肩関節外旋+水平外転の複合)。要判断 — 同上
- Hyperextensions (Back Extensions): primary = lower back, isolation, equipment = other → 既存「バックエクステンション=脊柱起立筋, I, マシン」。器具は実態がローマンチェア/ベンチで、bw 0.4 を持つ自重種目なので「マシン」より「自重」が実態に近い(推論) — 同上
- Barbell/Dumbbell Step Ups: primary = **quadriceps**(secondary glutes) → 既存「ステップアップ=臀部」は不一致。同じ片脚系のランジ/ブルガリアンは既存でも大腿四頭筋なので、内部の一貫性の点でも大腿四頭筋に寄せる方が自然 — 同上
- Good Morning: primary = hamstrings → 既存と一致 — 同上
- Barbell Hip Thrust: primary = glutes → 一致 — 同上
- Barbell Shrug: traps, isolation → 一致 — 同上
- Seated Dumbbell Press: shoulders → 一致 — 同上

### 個別の監査結果
1. **db フラグ(依頼の3件)**: ダンベルプルオーバー・ダンベルオーバーヘッドエクステンション・ゴブレットスクワットは、いずれも「ダンベル1個を両手で保持」が標準形。
   入力する重量=実際の負荷なので **db 無しが正しい**。ただし、ワンハンドで行うオーバーヘッドエクステンションは別種目(db: true)として追加する価値あり。
   UIで「この種目は1個の重量を入力」と示す手段が無いと、利用者が2個分を入れたり片手分を入れたりして揺れる(推論)。
2. **片側種目の非対称**: 「ワンハンドダンベルロウ」は db: true(片手重量×2で集計)だが、「片手ラットプルダウン」(ケーブル)は db 無し(=片側分しか数えない)。
   両側を行う前提ならボリュームが半分に出る。新規に入れる片側ケーブル/ランドマイン種目(ケーブルロウ片手、メドウズロウ、片脚レッグプレス、片脚カーフ)も同じ問題を持つ。
   `db` は現状「ダンベル」と「×2」の2つの意味を兼ねているので、追加前に方針を決める必要がある(推論。`docs/係数の根拠.md` に db と bw の併用禁止が書かれている)。
3. **ステップアップ**: 臀部 → 大腿四頭筋 への変更を検討(上記照合)。ただし部位を変えると過去の週間集計の振り分けが変わるか要確認(rom/bwFactor と同様に記録側にスナップショットがあるかどうか次第)。
4. **フェイスプル t: I** — 外部DBは compound。好みの範囲。
5. **バックエクステンション eq: マシン** — 実態は自重(+プレート)。bw係数を持つ他の種目は全部 eq: 自重 なので、一貫性の点で「自重」が自然。
6. **ファーマーズウォーク** — 距離/時間種目で、記録単位(weight×reps×RIR)と合わない。m: 前腕 も外部の一般的分類(全身/僧帽筋/前腕)と比べて恣意的。プリセットから外すか、そのまま残すかは要判断。
7. **ケーブルキックバック(臀部)** — 三頭のケーブルキックバックを足す時に名前がぶつかる。新規側を「ケーブルトライセップキックバック」にする(既存の改名はしない)。
8. **重複**: 完全重複は無し。意味の近いペアは「ケーブルフライ」と将来の「ケーブルクロスオーバー」、「リアデルトフライ」と「リアレイズ」(→ALIASES)。
9. **「全身」カテゴリ**: MUSCLES にあるが EXERCISE_DB で使っている種目が無い。UI側は `MUSCLES.filter(m => EXERCISE_DB.some(e => e.m === m))`(index.html 4811行付近)で空カテゴリを隠しているので実害なし。パワークリーン等を入れるなら受け皿になる。
10. **命名の不揃い**: 「バーベル」接頭辞の有無(バーベルカール/プリーチャーカール(eq: バーベル)/スカルクラッシャー/リストカール)、「ケーブル」接頭辞(ケーブルシーテッドロウ vs ストレートアームプルダウン)。改名は名前キー保存のため既存記録を割るので、揃えるなら ALIASES 経由で新名を受けるだけにとどめる。

### Inferences
- 監査で「直すべき」と言い切れるのは 2(片側種目の扱い方針)と 7(名前衝突の予防)。3・5 は一貫性の改善で、既存記録への影響を確かめてから。

### Gaps
- `m`(部位)を変えた場合に過去記録の集計が遡って変わるか(記録側に muscle がスナップショットされるか)は、このノートでは未確認。`normMuscle` の存在から、記録側に muscle 文字列が保存されていることは読み取れる(index.html 356行付近のコメント「既存記録のmuscle文字列は書き換わらない」)。

---

## Q4. 欠けている部位カテゴリ(内転筋・前脛骨筋・首・腹斜筋・ローテーターカフ)

### Takeaway
外部DB(free-exercise-db: adductors/abductors/neck を独立カテゴリ化)と日本の一般向けメディア(ザバス: 内転筋・腹斜筋・腸腰筋を独立タグ化)の両方に根拠があるが、
このアプリで追加に見合うのは **内転筋のみ**。それ以外は既存部位へ寄せるか、種目自体を入れない。

### Cited Findings
- free-exercise-db の主動筋カテゴリに adductors(13)・abductors(8)・neck(8)。腹斜筋・ローテーターカフ・前脛骨筋の独立カテゴリは無い(腹斜筋系は abdominals、外旋系は shoulders) — [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
- ザバス筋トレ辞典は 内転筋(19)・腹斜筋(38)・腸腰筋(6) をタグとして持つ — [明治ザバス](https://www.meiji.co.jp/sports/savas/contents/training/)
- アダクション機は日本のジム紹介記事・メーカー日本語カタログに定番として載る — [smartlog](https://smartlog.jp/184776), [Life Fitness JP](https://lifefitness.com/ja-jp/catalog/strength-training/selectorized/insignia-series-hip-abductor-adductor)

### Inferences
- 内転筋: 追加推奨。候補種目はアダクション(マシン)、ケーブルアダクション、(スモウデッドリフトは主動筋をハム/臀部に置くので対象外)。英語表示は MUSCLE_NAMES_EN の方針(英語圏アプリの呼び方)に合わせ "Adductors"。
- 腹斜筋: 「腹筋」に含める。ロータリートルソー・ウッドチョップ・サイドベンドは m: 腹筋。
- ローテーターカフ / 首 / 前脛骨筋: 重量の漸進性過負荷を追う対象として需要が小さい。入れるなら既存部位(三角筋後部/僧帽筋/ふくらはぎ)に寄せるか、カスタム種目に任せる。
- 臀部の中に中殿筋(アブダクション)と大殿筋が同居しているのは、Hevy 等も "Glutes"/"Abductors" を分けている例があるので議論の余地はあるが、カテゴリを増やすコストに見合わない(推論。Hevy のカテゴリ一覧は取得できていない)。

### Gaps
- Hevy / Strong の筋群カテゴリ一覧は一次情報で確認できていない。
