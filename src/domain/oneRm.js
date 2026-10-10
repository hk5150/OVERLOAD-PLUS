// 推定1RM・実効重量の計算。
// index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやexportは使わない。ビルド不要の原則を維持するため)。
// 元は index.html 内の定義をそのまま移設したもの。1.3 で、13回以上は推定しないようにした(est1RM の上のコメント)。

// 13回以上は推定しない(0 を返す)。Epley 式は回数が多いほど高めに出て、軽い重量の高回数セットが
// 自己ベストに見えてしまうため(北村さんの判断、2026-10-05。docs/改善要望_2026-10.md の 6)。
// ここで切るので、自己ベスト(prMap)・比較の行・⚡・グラフ・Watch の完了画面がすべて同じ基準になる
// (呼び出し側で個別に除くと、条件がずれて「比較は緑なのに ⚡ が無い」が起きた)。
const SET_1RM_MAX_REPS = 12;
const est1RM = (weight, reps) => {
  if (!weight || !reps || reps < 1) return 0;
  if (reps > SET_1RM_MAX_REPS) return 0;
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
// 13回以上も出さない(est1RM が 0 を返すのと同じ基準)。
// RIR の有無は見ない(入る前から薄く出す。濃さは呼び出し側が決める)。
// effW は effWeight を通した実効重量(ダンベルは両手、自重は体重込み)。入力した重量で判定すると、
// 加重0の懸垂やディップスに一切出なくなる(reviewer 指摘)。
function showsSet1RM(s, effW, reps) {
  return !s.warmup && !s.assisted && effW > 0 && reps >= 1 && reps <= SET_1RM_MAX_REPS;
}

// 自己ベストの更新を祝う(YOU WIN!、1.4)かどうか。RIR を入れたその1セットについて判定する。
//   set1RM:   そのセットの推定1RM(行に 1RM を出せないセット=13回以上・補助ありは 0 で渡す)
//   pastBest: 保存済みの記録での自己ベスト(prMap。今日の分は入っていない)
// **過去の自己ベストを超えたら毎回祝う**(北村さん、2026-10-10)。1.4 (18) は今日それまでの最高も超えたときだけにしていたが、
// 2セット目は前のセットを写した同じ値か、疲れて少し低いことが多く、「2連続で更新したのに出ない」になった。
// 同じセットで何度も出さない印は index.html 側(celebratedRef)で持つ。
// 過去の記録が無い種目(pastBest が 0)では祝わない。初めての種目は毎セットが「更新」になってしまう。
// 0.01 の差を要るのは、行の緑(index.html の over1RM)と同じく、計算の端数で同じ値を「超えた」と言わないため。
function isNew1RMBest({ set1RM, pastBest }) {
  if (!(set1RM > 0) || !(pastBest > 0)) return false;
  return set1RM > pastBest + 0.01;
}

// ブラウザの<script>グローバルスコープではconst宣言もbare identifierとして参照できるが、
// vmサンドボックス(テスト環境)ではcontextオブジェクトのプロパティにならないため明示的に公開する。
globalThis.est1RM = est1RM;
globalThis.effWeight = effWeight;
globalThis.dayBest1RM = dayBest1RM;
globalThis.SET_1RM_MAX_REPS = SET_1RM_MAX_REPS;
globalThis.showsSet1RM = showsSet1RM;
globalThis.isNew1RMBest = isNew1RMBest;
