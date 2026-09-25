---
name: kurabell-error-banner-single-slot
description: index.htmlのerrorは読込失敗・保存失敗・noValidSets・復元失敗が共有する1枠。再試行ボタンはsaveStatus==="error"で出るがerror空なら帯ごと消える。無条件setError("")は無関係なエラーを消す
metadata:
  type: project
---

`error` state は1つの文字列枠で、err.loadFailed / err.saveFailed / err.saveRetryFailed / log.noValidSets /
backup.importFailed / backup.undoFailed が上書きし合う。エラー帯は `{error && ...}` で描画され、
再試行ボタンはその内側に `saveStatus === "error"` のときだけ出る。
つまり **setError("") すると saveStatus が "error" のままでも再試行ボタンごと見えなくなる**。

v117レビュー(2026-09-25)で見た穴:
- saveWorkout の setError("") が試用上限(ペイウォール)の早期returnより前にあり、未保存状態の帯と再試行を消す
- 同じ行が err.loadFailed(「データは端末に残っています」)も消す。persistは読込失敗時でも上書きするガードが無い(既存)
- persist の `saveStatus === "error"` 判定はクロージャ値なので、書き込みが並走すると解除漏れが残る
- restoreFromPreImportSnapshot は persist が例外を投げない(内部でcatch)ため、書き込み失敗でもスナップショットを削除する(既存)

**Why:** エラーの「種類」を持たずに文字列1枠で運用しているため、消す側が何を消しているか判別できない。

**How to apply:** setError("") を足す差分では、その時点で帯に出ている可能性がある他のエラーと saveStatus を列挙し、
関数形式で対象の文言だけ消しているかを見る。関連: [[kurabell-health-profile-flags]]
