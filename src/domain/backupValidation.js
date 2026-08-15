// 保存データ(通常の起動読み込み・バックアップ復元とも)の構造検証。
// index.htmlの#appsrcから<script src>で素のグローバルスクリプトとして読み込まれる
// (importやexportは使わない、ビルド不要の原則を維持するため)。
// ロジックは元のindex.html内の定義から一切変更していない(移設のみ)。

// 旧形式は配列そのもの、新形式は { workouts: [...] } のオブジェクト。
function extractWorkoutsArray(p) {
  return Array.isArray(p) ? p : p?.workouts;
}

// 壊れたデータで上書き・表示しないよう、最低限の構造を検証する。問題があれば例外を投げる。
function validateWorkoutsShape(ws) {
  if (!Array.isArray(ws)) throw new Error("workoutsが配列ではありません");
  ws.forEach((w, i) => {
    if (!w || typeof w !== "object") throw new Error(`${i + 1}件目の記録の形式が不正です`);
    if (typeof w.date !== "string") throw new Error(`${i + 1}件目の記録に日付がありません`);
    if (!Array.isArray(w.exercises)) throw new Error(`${i + 1}件目の記録の種目データが配列ではありません`);
    w.exercises.forEach((ex, j) => {
      if (!ex || typeof ex.name !== "string") throw new Error(`${i + 1}件目の記録・${j + 1}種目目の名前が不正です`);
      if (!Array.isArray(ex.sets)) throw new Error(`${i + 1}件目の記録・${j + 1}種目目のセットデータが配列ではありません`);
    });
  });
}

globalThis.extractWorkoutsArray = extractWorkoutsArray;
globalThis.validateWorkoutsShape = validateWorkoutsShape;
