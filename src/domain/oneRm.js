// 推定1RM・実効重量の計算。
// index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやexportは使わない。ビルド不要の原則を維持するため)。
// ロジックは元のindex.html内の定義から一切変更していない(フェーズ0監査時点のコードをそのまま移設)。

const est1RM = (weight, reps) => {
  if (!weight || !reps || reps < 1) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
};

function effWeight(weight, isDb, bwFactor, bodyweight) {
  let w = weight;
  if (bwFactor > 0) w = bodyweight * bwFactor + weight; // 自重+加重
  if (isDb) w = w * 2; // ダンベルは片手入力→両手
  return w;
}

// ある日の記録から推定1RMの最大値を出す。
// ウォームアップと補助あり(assisted)は、その日の実力を表さないので除く。
// #appsrc側に同じreduceが4箇所コピーされていて、除外条件が3種類に割れていたため
// (workingSetsだけを使う経路はassistedを除いておらず、prMapや履歴タブの⚡バッジと
// 値が食い違っていた)、ここに集約してテストで縛る。
// isDb/bwFactor/bodyweightは呼び出し側で解決して渡す(種目マスターの参照は#appsrc側の責務。
// bodyweightには記録当時のスナップショット bwAtLog を優先して渡すこと)。
function dayBest1RM(sets, isDb, bwFactor, bodyweight) {
  return (sets || []).reduce((max, s) => {
    if (s.warmup || s.assisted) return max;
    return Math.max(max, est1RM(effWeight(s.weight, isDb, bwFactor, bodyweight), s.reps));
  }, 0);
}

// 記録画面の各セットに推定1RMを出すか。ウォームアップと補助ありは実力を表さないので出さない。
// 13回以上も出さない: Epley 式は回数が多いほど高めに出て、軽い重量の高回数セットが
// 自己ベストに見えてしまう(北村さんの判断。docs/改善要望_2026-10.md の 6)。
// RIR の有無は見ない(入る前から薄く出す。濃さは呼び出し側が決める)。
// effW は effWeight を通した実効重量(ダンベルは両手、自重は体重込み)。入力した重量で判定すると、
// 加重0の懸垂やディップスに一切出なくなる(reviewer 指摘)。
const SET_1RM_MAX_REPS = 12;
function showsSet1RM(s, effW, reps) {
  return !s.warmup && !s.assisted && effW > 0 && reps >= 1 && reps <= SET_1RM_MAX_REPS;
}

// ブラウザの<script>グローバルスコープではconst宣言もbare identifierとして参照できるが、
// vmサンドボックス(テスト環境)ではcontextオブジェクトのプロパティにならないため明示的に公開する。
globalThis.est1RM = est1RM;
globalThis.effWeight = effWeight;
globalThis.dayBest1RM = dayBest1RM;
globalThis.SET_1RM_MAX_REPS = SET_1RM_MAX_REPS;
globalThis.showsSet1RM = showsSet1RM;
