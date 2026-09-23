---
name: kurabell-health-profile-flags
description: v116 HealthKit連携。profile.healthOn/healthBwAtは端末固有の状態なのにバックアップ復元でprofileごと上書きされる。persistRefは非イベント文脈のsetState後の描画待ち窓を閉じない
metadata:
  type: project
---

v116(2026-09-24レビュー時点で未コミット)でiOS版にHealthKit連携が入った。紐づけキーは記録の `startAt`、
体重同期は `profile.healthBwAt` より新しいサンプルだけ反映。

レビューで指摘した穴:
- `importBackup` / `restoreFromPreImportSnapshot` は `profile: defaultProfile(p.profile)` で丸ごと上書きするため、
  端末固有の `healthOn`(=権限を取った事実)が別端末のバックアップから入る。新端末で権限シート無しにスイッチがオン、
  書き込みは notDetermined で黙って失敗、案内文(denied時のみ)も出ない
- `persistRef`/`profileRef` は描画時に更新されるので、await後(非イベント文脈)のsetState→描画までの間に
  ネイティブ応答が来ると古いクロージャでworkoutsを書き戻す(clearAll・importBackupが該当)
- 体重欄にフォーカスしたまま背景→復帰すると、pullが値を差し替え、blurで同じ値をヘルスケアへ書き戻す

**Why:** 「refで最新を見る」「healthBwAtで書き戻し防止」は主要経路では正しいが、復元・全削除・フォーカス中という脇道で崩れる。

**How to apply:** profileに端末固有の項目を足す差分では復元経路での扱いを確認する。persistRef系を増やす差分では
非イベント文脈のpersist呼び出し(awaitの後)との競合を見る。関連: [[kurabell-select-sentinel-mismatch]]
