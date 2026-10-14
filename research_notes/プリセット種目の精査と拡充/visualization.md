# 種目と対象筋の可視化(ボディマップ・ヒートマップ・動作図)

調査日: 2026-10-11。前提: 外部ホストへのリクエスト禁止(全部同梱)、`#appsrc` の React(Web はランタイム Babel、iOS は esbuild)、有料 App Store アプリ(クローズドソース)なので商用同梱できるライセンスが必須。

リポジトリ側の現状(index.html を直接確認):
- 色は `const C = { bg:"#141517", surface:"#1E2023", surface2:"#26292D", border:"#2E3237", text:"#F2F0EB", muted:"#A3A8B0", red:"#E2453C", blue:"#3D7BD9", yellow:"#E8B33C", green:"#4CAF6E", grey:"#5A6069" }`(index.html:308)。色の役割がコメントで決まっている(赤=主要操作と削除、黄=RIR・注意、緑=前回超え、青=スーパーセットと「補助あり」だけ)。
- `MUSCLES`(index.html:346)は 16 部位: 大胸筋 / 広背筋・僧帽筋・脊柱起立筋 / 三角筋前部・中部・後部 / 上腕二頭筋・上腕三頭筋・前腕 / 大腿四頭筋・ハムストリングス・臀部・ふくらはぎ / 腹筋・全身。
- `EXERCISE_DB`(index.html:425)の各種目は部位を `m` に **1つだけ** 持つ。副次筋(secondary)のフィールドは無い。記録側も `ex.muscle` 1つ。部位別のボリューム推移は Recharts の折れ線(`muscleVolumeTrend`, index.html:3449)で出している。
- 同梱ライブラリは `vendor/` の react / react-dom / prop-types / recharts / babel のみ(`LIBS`, index.html:180)。

## (a)(b) 筋肉マップ用の SVG 素材・React コンポーネントとライセンス

### Takeaway
商用・クローズドソースで安全に使えるのは MIT の `react-body-highlighter` 系(元は `react-native-body-highlighter` のポリゴン)で、gzip 約 4.6KB と極小。ただし三角筋が「前/後」しかなく **三角筋中部・脊柱起立筋の区別が足りない** ので、ポリゴンを `src/domain/` などに取り込んで(MIT 表記を残して)部位を足す「フォーク+自前調整」が最も現実的。wger の筋肉 SVG(元は Wikimedia、CC BY-SA 3.0)は ShareAlike の扱いが曖昧なので避ける。

### Cited Findings
- **react-body-highlighter**: ライセンス MIT。前面(anterior)/背面(posterior)の2ビュー。部位スラッグは trapezius, upper-back, lower-back, chest, biceps, triceps, forearm, back-deltoids, front-deltoids, abs, obliques, adductor, hamstring, quadriceps, abductors, calves, gluteal, head, neck。SVG ポリゴンは React Native 版 react-native-body-highlighter から流用と明記 — [GitHub giavinh79/react-body-highlighter](https://github.com/giavinh79/react-body-highlighter)
- 同パッケージの色付けは `highlightedColors` 配列で「頻度-1 番目の色」を使う方式(1回=1色目、2回=2色目…)— [GitHub giavinh79/react-body-highlighter](https://github.com/giavinh79/react-body-highlighter)
- npm 実測(`npm view`/`npm pack`、2026-10-11): `react-body-highlighter` 2.0.5、MIT、peerDependencies は `react >=16` のみ、最終更新 2022-05-14。本番 min ファイル 14,414 バイト、gzip 4,648 バイト。パッケージ内 LICENSE は「MIT License / Copyright (c) 2020 GV79」。コードから抽出したスラッグには上記に加え `knees`, `left-soleus`, `right-soleus` がある — [npm react-body-highlighter](https://www.npmjs.com/package/react-body-highlighter)
- **react-native-body-highlighter**: MIT、前後・男女・左右別の指定が可能、295 stars。npm 3.2.0、最終更新 2026-04-13、`react-native-svg` 依存(Web の React にはそのまま使えない)— [GitHub HichamELBSI/react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter)、[npm](https://www.npmjs.com/package/react-native-body-highlighter)
- **body-highlighter**(react-body-highlighter のフォーク、フレームワーク非依存、ランタイム依存ゼロ、DOM に直接描画): npm 3.0.2、MIT(LICENSE は GV79 の著作権表示を継承)、最終更新 2025-11-08。front-deltoids / back-deltoids を区別、「Pectoralis Major」等の解剖学名を正規化して受け付ける。アクセシビリティ機能の記載なし — [GitHub lahaxearnaud/body-highlighter](https://github.com/lahaxearnaud/body-highlighter)、[npm body-highlighter](https://www.npmjs.com/package/body-highlighter)
- **react-muscle-highlighter**: npm 1.2.0、MIT(「Copyright (c) 2024 My Muscle Contributors」)、最終更新 2026-01-06、peer は React 18/19。スラッグは abs, adductors, ankles, biceps, calves, chest, **deltoids(前後の区別なし)**, feet, forearm, gluteal, hair, hamstring, hands, head, knees, lower-back, neck, obliques, quadriceps, tibialis, trapezius, triceps, upper-back。男女×前後の4アセットで、男性前+後のアセットだけで gzip 約19.6KB(実測)— [GitHub soroojshehryar/react-muscle-highlighter](https://github.com/soroojshehryar/react-muscle-highlighter)
- **MuscleMap(SwiftUI)**: MIT、iOS 17+。22 基本筋+14 サブグループ(上部/下部胸、前/後三角筋、ローテーターカフ等)、ヒートマップ用カラースケール(workout / thermal / medical / monochrome)と補間方式あり。ただしネイティブ Swift なので WebView 内の React UI には直接使えない。図版の出所は明記なし — [GitHub melihcolpan/MuscleMap](https://github.com/melihcolpan/MuscleMap)
- Flutter 向けにも MIT の muscle_mapper(SVG を自前で用意する BYOA 方式)などがある(本アプリでは使えない)— [pub.dev muscle_mapper](https://pub.dev/packages/muscle_mapper)
- **wger**: コードは AGPL-3.0-or-later、運動・食品データは「Creative Commons(個別エントリ参照)」、ドキュメントは CC-BY-SA-4.0 — [GitHub wger-project/wger](https://github.com/wger-project/wger)
- wger の筋肉 SVG(`wger/core/static/images/muscles/`、`muscular_system_front.svg` / `_back.svg` と main/secondary の部位別画像)の SOURCES ファイルは Wikimedia Commons の `File:Muscular_system.svg` と `File:Muscular_system-back.svg` を指すだけ — [wger SOURCES](https://github.com/wger-project/wger/blob/master/wger/core/static/images/muscles/SOURCES)
- その元 `File:Muscular_system.svg` は作者 Termininja、**CC BY-SA 3.0 Unported**、クレジット・ライセンスへのリンク・変更有無の明示が必要、現行版は 3.74MB — [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Muscular_system.svg)
- CC BY-SA は改変物を同じライセンスで配布する義務があり、クローズドソースのプロジェクトでは作品全体への波及の可能性もあり得るため作者に確認を推奨、という議論(コミュニティの見解であり法的判断ではない)— [OpenGameArt LPC FAQ コメント](https://lpc.opengameart.org/user/1/comments?page=17)
- Gray's Anatomy(1918 年 米国第20版)由来の図は米国でパブリックドメイン。Wikimedia の「Muscles anterior labeled.png」は Mikael Häggström が Gray の図から作ったコラージュ — [検索結果: zhwiki ミラー](https://zhwiki.oracleblog.org/zh-hant/File:Muscles_anterior_labeled.png)
- **MuscleWiki**: API は月 $10〜$199.99。ライセンスは取消可能・再許諾不可で、**動画・サムネイル・ボディマップ画像をオフライン保存することを禁止**(一時キャッシュのみ)— [MuscleWiki API pricing](https://api.musclewiki.com/pricing)、[MuscleWiki API Terms](https://api.musclewiki.com/api-terms)

### Inferences
- 推奨は「react-body-highlighter のポリゴン(約14KB min / 4.6KB gzip)を `src/domain/bodyMap.js` 的なファイルに取り込み、MIT の著作権表示を残す」。npm を vendor するより、ポリゴンを持つ小さな自前コンポーネントのほうが、ランタイム Babel 経路・esbuild 経路・`LIBS`/`APP_ASSETS`/`DOMAIN_FILES` の3点同期(CLAUDE.md の罠)の両方で扱いやすい。新ファイルを足すなら3箇所を揃える必要がある。`#appsrc` 内にインライン SVG コンポーネントとして書けば同期問題自体を避けられる。
- 既存の極小パッケージはどれも「三角筋中部」を持たない。前面・背面図の三角筋ポリゴンを外側(肩の頂点)で分割して「中部」を作るのが手間最小。正確さを求めるなら側面図を足すが、労力に見合わない。
- ポリゴン調のローポリ人体は「医療図っぽさ」が薄く、ダーク UI・Barlow Condensed の硬いトーンにも合わせやすい。線を `C.border`、未使用部位を `C.surface2` で塗る想定。
- Wikimedia の CC BY-SA SVG は 3.74MB と重く、ShareAlike の波及リスクもあるので、採用理由がない。Gray's の PD 図はリアルな線画でヒートマップの塗り分けには向かない(部位がパス単位で分かれていない)。
- MuscleWiki は規約上オフライン同梱が不可能なので選択肢から外れる。

### Gaps
- react-native-body-highlighter のポリゴン自体の原作者・出所(独自作画か、何かのトレースか)は README に記載がなく確認できなかった。MIT の連鎖は確認できたが、元図版の来歴は未確認。
- body-highlighter の GitHub 上の最終コミット日・テスト状況は取得できなかった(npm の更新日 2025-11-08 のみ)。

## (a)(b) 主要アプリの見せ方と UX

### Takeaway
Hevy は「直近7日の部位別セット数」を青で塗る人体図+部位別セット数の一覧、Fitbod は「回復度 0〜100%」を色分けした人体図。KURABELL の「前回の実績を見せて判断はユーザーに委ねる」方針には、回復度の推定(Fitbod 型)ではなく **事実の集計(Hevy 型の週間セット数)** が合う。

### Cited Findings
- Hevy は記録中にも筋肉分布のヒートマップを表示でき、タップで詳細を開ける。「直近7日のボディグラフ」と「Body distribution」で部位別のトレーニング量を **総セット数** で表示。チャート版は 30日/3か月/1年/全期間 — [Hevy features 検索結果](https://www.hevyapp.com/features/training-chart/)、[APKMirror Hevy 2.5.6 リリースノート](https://www.apkmirror.com/?p=11862319)
- Hevy の筋群チャートは、期間内に鍛えた部位を青でラベル表示し、週ごとに矢印で前後の週へ移動できる — [Hevy Muscle Group Workout Chart](https://www.hevyapp.com/features/muscle-group-workout-chart/)
- Hevy は後のアップデートで筋肉分布に女性のアセットを追加 — [APKMirror Hevy 3.0.4](https://www.apkmirror.com/apk/hevy-gym-workout-tracker/hevy-gym-log-workout-tracker/hevy-gym-log-workout-tracker-3-0-4-release/)
- Fitbod は Body タブで各筋群の回復度を 0〜100% で色分けした筋肉マップを表示。セット・回数・重量から各筋群への負荷を推定し、約6日で完全回復とみなす — [Fitbod Help: Muscle Recovery](https://help.fitbod.me/hc/en-us/articles/360006269014-Muscle-Recovery)、[Fitbod blog](https://fitbod.me/blog/muscle-recovery/)

### Inferences
- Fitbod 型「回復度%」は、削除済みのルールエンジンと同類の「アプリが判定する層」になり、CLAUDE.md の中心思想(判断はユーザー)とぶつかる。採るなら Hevy 型で「今週の部位別セット数(RIR 入力済み=実施済みのセットだけ)」を人体図の濃淡+数値で出す。
- 数値を必ず併記する(色だけで量を読ませない)。人体図はタップで部位の内訳(種目×セット)へ。週切替は既存の週間集計 UI に揃える。
- 種目詳細や種目ピッカーには、小さな前後2体の図で「主=濃い、副=薄い」を出すのが定番(Hevy/Strong 等の一般的な見せ方。ただし Strong・JEFIT・Apple Fitness の具体仕様は今回確認できていない)。

### Gaps
- Hevy が副次筋をどう数えるか(0.5 セット扱い等)は公式ページに記載がなく不明。
- Strong・JEFIT・Apple Fitness の筋肉マップの仕様、ユーザー評価(レビュー)は時間内に一次情報を取れなかった。

## (a)(b) 粒度: アプリの MUSCLES とボディマップ領域の対応

### Takeaway
react-body-highlighter のスラッグで 16 部位のうち 13 はそのまま対応する。足りないのは「三角筋中部」(要自作)と、「僧帽筋/広背筋/脊柱起立筋」の背面での描き分けの確認。副次筋を出すには `EXERCISE_DB` に副次筋フィールドを新設する必要がある。

### Cited Findings
- react-body-highlighter の実スラッグ: trapezius, upper-back, lower-back, chest, biceps, triceps, forearm, front-deltoids, back-deltoids, abs, obliques, quadriceps, hamstring, gluteal, calves, adductor, abductors, knees, left-soleus, right-soleus, head, neck(npm パッケージ実物から抽出)— [npm react-body-highlighter](https://www.npmjs.com/package/react-body-highlighter)
- MuscleMap(Swift)は前/後三角筋・上部/下部胸・内/外側大腿四頭・ローテーターカフまでサブグループを持つ(粒度の上限の参考)— [GitHub melihcolpan/MuscleMap](https://github.com/melihcolpan/MuscleMap)
- free-exercise-db は各種目に `primaryMuscles` / `secondaryMuscles` の配列を持つ(主/副の2段で十分という業界的な前例)— [GitHub yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)

### Inferences
対応表案(左=MUSCLES、右=react-body-highlighter のスラッグ):
- 大胸筋 → chest
- 広背筋 → upper-back(背面の広い領域。ライブラリの upper-back は広背筋+菱形筋寄りの領域)
- 僧帽筋 → trapezius(前面の首付け根にも出る)
- 脊柱起立筋 → lower-back
- 三角筋前部 → front-deltoids / 三角筋後部 → back-deltoids / **三角筋中部 → 該当なし(前後両図の肩外側にポリゴンを新設)**
- 上腕二頭筋 → biceps / 上腕三頭筋 → triceps / 前腕 → forearm
- 大腿四頭筋 → quadriceps / ハムストリングス → hamstring / 臀部 → gluteal / ふくらはぎ → calves(+ soleus)
- 腹筋 → abs(+ obliques を同じ部位として塗るか、追加部位「腹斜筋」を検討)
- 全身 → マップでは塗らない(または全体を薄く)
- 追加候補: 内転筋(adductor)、外転筋(abductors)は既存ポリゴンがあるので MUSCLES に足しても描画コストはゼロ。腹斜筋も同様。
- 副次筋は `EXERCISE_DB` の各エントリに例えば `s: ["三角筋前部","上腕三頭筋"]` を足す形が最小(記録データの形は変えない。週間集計で副次を 0.5 セット等で数えるかは別の設計判断)。約150種目分の副次筋付けは手作業で数時間規模。

### Gaps
- 上記対応(特に upper-back が広背筋を十分に覆うか)は、ポリゴンを実際に描画して目視確認していない。

## (c) 動作の見せ方(イラスト・アニメーション)

### Takeaway
ライセンスが明確な購入先は WorkoutLabs(1点 $15/年 or $25 永久、全679種目は $1,200/年 or $3,500+ 永久)。無料の free-exercise-db は Unlicense 表記だが画像の出所が文書化されておらず、有料アプリへの同梱はリスクが残る。MuscleWiki はオフライン保存禁止。現実的には「当面は筋肉マップ+文章の手順」、動作図が必要なら WorkoutLabs の買い切りか、自前の簡素な線画を段階的に描く。

### Cited Findings
- WorkoutLabs: 1点 $15(年間)/ $25(永久)から、15点以上で値引き。全ライブラリ(679 種目)は $1,200/年、永久は $3,500 以上。PNG / SVG、カラー/白黒、多くの種目で MP4・GIF・アニメ用 SVG あり、男女・体型違いあり。米国著作権局に登録済みの原著作物 — [WorkoutLabs Exercise Illustrations Licensing](https://workoutlabs.com/exercise-illustrations-licensing/)
- WorkoutLabs はアプリ・ウェブ・商用プロジェクトでの利用には書面のライセンスが必要 — [WorkoutLabs Use of Illustrations](https://workoutlabs.com/use-of-illustrations/)
- free-exercise-db: Unlicense(パブリックドメイン宣言)、800 以上の種目、`exercises/<名前>/0.jpg` 形式の画像。元は Ollie Jennings の exercises.json から — [GitHub yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)
- 元の exercises.json も Unlicense だが、README にデータ・画像の出典の記載がない。同じ作者側は商用データセット(2,500+ 種目、10,000+ 画像、3,500+ 動画)を別売りしている — [GitHub wrkout/exercises.json](https://github.com/wrkout/exercises.json)
- 運動アニメ素材では、GymVisual の GIF を無断転売していたサイトから購入した開発者が法的通知を受けた事例が報告されている(二次情報、検索結果の要約)— [検索結果: WorkoutLabs/各種](https://workoutlabs.com/use-of-illustrations/)
- MuscleWiki の動画・サムネイル・ボディマップ画像はオフライン保存禁止 — [MuscleWiki API Terms](https://api.musclewiki.com/api-terms)
- wger の運動画像は「個別エントリごとの Creative Commons」で、エントリごとにライセンス・作者が付く — [GitHub wger-project/wger](https://github.com/wger-project/wger)

### Inferences
- **free-exercise-db の画像は「PD 宣言はあるが来歴不明」**。写真の見た目から第三者サイト由来の可能性を否定できず(未確認)、有料アプリに同梱して後で権利主張されると取り下げ以外の手がない。テキスト(主/副の筋肉、手順)だけ参考にし、画像は使わないのが安全。
- wger の画像はエントリごとに CC BY / CC BY-SA が混在し得るので、使うなら CC BY / CC0 のものだけを選別し、アプリ内にクレジット画面が必要。手間に対して点数が揃わない。
- 容量の目安(推定、未実測): 単色線画 SVG は1点 5〜15KB 程度、150種目×2コマで 1.5〜4.5MB 前後。gzip 後はその数分の1。PNG 2コマ(例 400px)なら1点 30〜60KB で 150種目 9〜18MB。MP4 は1本数百KB で 150本数十MB。iOS 同梱なら SVG 線画が最も軽い。Web 版は v137 で凍結済みなので SW の `APP_ASSETS` への影響は iOS ビルド(www/)と開発時のみ。
- Lottie は lottie-web(数百KB級)を vendor する必要があり、素材も別途調達が要る。150種目分の Lottie を作る・買う手段は今回見つからず、費用対効果が低い。
- 自作案: 棒人間+器具の2コマ(開始/終了)線画を、まず使用頻度上位 30 種目だけ描く。`C.text` の線・`C.red` で主動筋を示せばブランドとも整合。WorkoutLabs の 30 点買い切りなら概算 $750(30×$25、値引き前)。

### Gaps
- WorkoutLabs の単色 SVG の実ファイルサイズ、スタイル(ダーク背景で使えるか)は未確認。
- GymVisual の正規ライセンス価格は取得できなかった。
- free-exercise-db 画像の実際の出典は確認できなかった(README・元リポジトリとも記載なし)。

## アクセシビリティ(色覚)とダークモードでのヒートマップ

### Takeaway
赤〜緑の色相変化は避け、**単一色相(アプリの赤 `#E2453C`)の明度段階+数値ラベル** にする。ダーク背景では「量が多いほど明るく彩度が高い」方向にする。

### Cited Findings
- 色覚多様性に対しては単一色相で彩度・明度を変える逐次パレットが最良 — [GitLab Design: Data visualization color](https://design.gitlab.com/data-visualization/color)
- 逐次パレットは知覚的に均一な明度変化を持ち、暗い背景では向きを反転させる(高い値ほど明るく)— [GitLab Design: Data visualization color](https://design.gitlab.com/data-visualization/color)
- WCAG 2.1 SC 1.4.11(非テキストのコントラスト): グラフィック要素は隣接色に対して 3:1 以上 — [GitLab Design: Data visualization color](https://design.gitlab.com/data-visualization/color)

### Inferences
- 段階は 0 / 1〜5 / 6〜9 / 10〜14 / 15+ セットのような 4〜5 段の離散ステップにし、凡例に数値範囲を書く(連続グラデーションより読み取りやすく、部位境界との 3:1 も確保しやすい)。
- 未トレーニング部位は `C.surface2`(#26292D)、最大段は `C.red`。赤は「主要操作と削除」の色なので、色の役割を広げることになる点は判断が要る。代替として黄(`C.yellow`)は「RIR・注意」の役割、緑は「前回超え」の役割があるため、どの色でも既存の役割と被る。ヒートマップを赤系にするなら「赤=量・強度」という役割追加をコメントに明記する。
- 部位の境界線は `C.bg` で細く引き、隣接部位が同じ段でも区別できるようにする。主/副の区別は色の濃淡だけでなく、副をハッチや外枠のみにするなど形でも区別できるとよい。
- 読み上げ用に、図とは別に「大胸筋 12セット、広背筋 8セット…」の一覧を `srOnly` で渡す(既存の `srOnly` 定数を流用)。
- i18n: 部位名は既存の `muscleName(m)` を使えば ja/en 両対応になる。図中に文字を置かず、凡例と一覧側に出せば英語の長い名前でもレイアウトが崩れない。
- 実装の工数感(推定): 部位マップ(ポリゴン取り込み+三角筋中部の追加+週間セット数の塗り分け)で 1〜2 日。副次筋データの付与(約150種目)で半日〜1日。動作図は自作 30 種目で数日、購入なら選定と取り込みで 1 日程度+費用。

### Gaps
- 具体的な色段階(`#E2453C` から暗い背景への補間値)のコントラスト比は計算・実測していない。実装時に検証が必要。
