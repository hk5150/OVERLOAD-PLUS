---
name: kurabell-image-share-photo-permission
description: UIImageを共有シートに渡すなら Info.plist の NSPhotoLibraryAddUsageDescription が要る(「画像を保存」で落ちる)。1.4(19)で欠落を指摘
metadata:
  type: project
---

1.4 (19) で FileExportPlugin.shareImage(UIImage を UIActivityViewController へ)が入ったが、
`ios/App/App/Info.plist` に NSPhotoLibraryAddUsageDescription が無かった(レビュー時点)。
「画像を保存」を押すと TCC でアプリが落ちる。

**Why:** テキストの share(ファイルURL)では不要だったので、既存パターンをなぞると抜ける。
**How to apply:** 画像・動画を共有シート/写真に渡す差分では Info.plist の利用目的文字列(ja/en の InfoPlist.strings 含む)を確認する。
関連: [[kurabell-share-sheet-export]]

同じレビューで見た別の罠:
- startRestIfIdle(休憩中は blur で始め直さない)にすると、休憩は stopRest まで終わらないので、ウォームアップ(RIR を入れない)後の休憩が計られなくなる
- normalizeSupersets を useEffect で today に当てると、種目削除の取り消し([[kurabell-remove-undo]])でスーパーセットが戻らない(残った側の印が先に外れる)
