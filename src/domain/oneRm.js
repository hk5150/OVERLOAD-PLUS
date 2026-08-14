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

// ブラウザの<script>グローバルスコープではconst宣言もbare identifierとして参照できるが、
// vmサンドボックス(テスト環境)ではcontextオブジェクトのプロパティにならないため明示的に公開する。
globalThis.est1RM = est1RM;
globalThis.effWeight = effWeight;
