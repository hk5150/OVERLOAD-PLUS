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

// バックアップJSONのフォーマットバージョン。エクスポート時にこの値を書き込み、
// リストア時にはこの値までしか読めない(未来のバージョンで作られたバックアップを
// 無理に読み込んで壊れたデータを取り込まないため)。旧バックアップ(formatVersion未記載)は
// 「フォーマットバージョン導入前=v1相当」として許容する。
const CURRENT_BACKUP_FORMAT_VERSION = 1;

function assertKnownFormatVersion(p) {
  const v = p && typeof p === "object" && !Array.isArray(p) ? p.formatVersion : undefined;
  if (v == null) return; // 導入前の旧バックアップは許容
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new Error("バックアップのformatVersionが不正です");
  }
  if (v > CURRENT_BACKUP_FORMAT_VERSION) {
    throw new Error(`このバックアップは新しいバージョンの本アプリで作成されています(formatVersion: ${v})。アプリを最新版に更新してから復元してください`);
  }
}

// 復元時だけ行う、値そのものの妥当性チェック。起動時の通常読み込みでは行わない
// (num()による丸め込みは保存経路が別途担当しており、validateWorkoutsShapeを厳しくすると
// 既存の「文字列の重量も形状としては許容する」という挙動と衝突するため、別関数として分離する)。
function validateBackupNumericSanity(ws) {
  ws.forEach((w, i) => {
    (w.exercises || []).forEach((ex, j) => {
      (ex.sets || []).forEach((s, k) => {
        const where = `${i + 1}件目・${j + 1}種目目・${k + 1}セット目`;
        if (s.weight != null && s.weight !== "") {
          const weight = Number(s.weight);
          if (!Number.isFinite(weight) || weight < 0 || weight > 2000) {
            throw new Error(`${where}の重量が異常な値です`);
          }
        }
        if (s.reps != null && s.reps !== "") {
          const reps = Number(s.reps);
          if (!Number.isFinite(reps) || reps < 0 || reps > 1000) {
            throw new Error(`${where}の回数が異常な値です`);
          }
        }
        if (s.rir != null && s.rir !== "") {
          const rir = Number(s.rir);
          if (!Number.isFinite(rir) || rir < -10 || rir > 30) {
            throw new Error(`${where}のRIRが異常な値です`);
          }
        }
      });
    });
  });
}

function isValidDateString(v) {
  if (typeof v !== "string" || !v) return false;
  return !isNaN(new Date(v).getTime());
}

function validateBackupDates(ws) {
  ws.forEach((w, i) => {
    if (!isValidDateString(w.date)) throw new Error(`${i + 1}件目の記録の日付を解釈できません`);
    if (w.startAt !== undefined && w.startAt !== null && !isValidDateString(w.startAt)) {
      throw new Error(`${i + 1}件目の記録の開始時刻を解釈できません`);
    }
    if (w.endAt !== undefined && w.endAt !== null && !isValidDateString(w.endAt)) {
      throw new Error(`${i + 1}件目の記録の終了時刻を解釈できません`);
    }
  });
}

// split/profile/recentNames/customExercises/exerciseNotes/exerciseOverrides は
// 「あれば型が正しいこと」だけを見る(旧バックアップには無いキーもあるため必須にはしない)。
function validateBackupTopLevelShape(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return; // 旧形式(配列そのもの)は対象外
  if (p.split !== undefined && p.split !== null && typeof p.split !== "object") {
    throw new Error("splitの形式が不正です");
  }
  if (p.profile !== undefined && p.profile !== null && typeof p.profile !== "object") {
    throw new Error("profileの形式が不正です");
  }
  if (p.recentNames !== undefined && p.recentNames !== null && !Array.isArray(p.recentNames)) {
    throw new Error("recentNamesの形式が不正です");
  }
  if (p.customExercises !== undefined && p.customExercises !== null && !Array.isArray(p.customExercises)) {
    throw new Error("customExercisesの形式が不正です");
  }
  if (p.exerciseNotes !== undefined && p.exerciseNotes !== null && typeof p.exerciseNotes !== "object") {
    throw new Error("exerciseNotesの形式が不正です");
  }
  if (p.exerciseOverrides !== undefined && p.exerciseOverrides !== null && typeof p.exerciseOverrides !== "object") {
    throw new Error("exerciseOverridesの形式が不正です");
  }
}

// バックアップ復元(importBackup/restoreFromPreImportSnapshot)の入口で呼ぶ、まとめの検証。
// 何か1つでも問題があれば例外を投げる。呼び出し側は、この関数が例外を投げなかった場合にのみ
// 現在のデータを置き換えること(検証前に置き換えなければ、失敗時に現在データはそのまま残る)。
function validateBackupPayload(p) {
  const ws = extractWorkoutsArray(p);
  validateWorkoutsShape(ws);
  assertKnownFormatVersion(p);
  validateBackupNumericSanity(ws);
  validateBackupDates(ws);
  validateBackupTopLevelShape(p);
  return ws;
}

globalThis.extractWorkoutsArray = extractWorkoutsArray;
globalThis.validateWorkoutsShape = validateWorkoutsShape;
globalThis.CURRENT_BACKUP_FORMAT_VERSION = CURRENT_BACKUP_FORMAT_VERSION;
globalThis.validateBackupPayload = validateBackupPayload;
