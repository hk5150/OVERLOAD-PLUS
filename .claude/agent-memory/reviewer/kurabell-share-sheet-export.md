---
name: kurabell-share-sheet-export
description: v125 iOS書き出しの共有シート(FileExportPlugin)。completionWithItemsHandlerの複数回呼び出し、Copyでcompleted:true、await後のクロージャpersist
metadata:
  type: project
---

v125(2026-09-30レビュー時点で未コミット)で、iOS版のバックアップ/CSV書き出しを `<a download>` から
自前プラグイン `FileExport.share({filename,text})` → UIActivityViewController に変えた。
JS側は `src/domain/fileExport.js`、呼び出しは index.html の `exportTextFile` / `exportBackup` / `exportCSV`。

レビューで指摘した穴:
- `completionWithItemsHandler` の中で一時ファイル削除と resolve を無条件にしていた。iOS 13+ では共有拡張
  (メッセージ・メール等)をキャンセルするとシートが残ったまま completed:false で呼ばれ、続けて別の項目を
  選ぶと2回目が来る。1回目で消したファイルを2回目の保存が読めない/JSはキャンセル扱いで確定済み
- 「コピー」を選ぶと completed:true になり、ファイルが残らないのに lastBackupAt が更新され催促が30日消える
- `exportBackup` は await(シート表示中)の後にクロージャの `persist` を呼ぶ。persist は全項目を書くので、
  その間に persistRef 経由で更新された profile(前面復帰時のヘルスケア体重pull)を古い値で書き戻す

コミット 0e127ce で上3点は対処済み(settledガード・Copy除外・persistRef)。横断レビュー(2026-09-30)で残っていた穴:
- Swift側は一時ファイルを書いてから main.async で `presentedViewController != nil` なら "busy" として **同じURLを removeItem** する。
  バックアップJSONのファイル名は日付だけ(`kurabell-backup-YYYYMMDD.json`)なので、連打の2回目が1回目のシートが使うファイルを消す。
  JS側にも連打ガードは無い(ボタンは workouts.length===0 でしか disabled にならない)
- `backup.exportUnavailable`「iOS版では、まだファイルに書き出せません」は plugin 未登録時の文言。JSとネイティブは同梱なので実質到達不能だが「まだ」が古い

**Why:** 書き出しは成否が「催促を消すか」に直結する。ネイティブのコールバック意味論とawait窓の両方で崩れうる。

**How to apply:** FileExportPlugin や書き出し経路を触る差分では、上の3点が直っているか・再発していないかを見る。
関連: [[kurabell-health-profile-flags]] [[kurabell-error-banner-single-slot]]
