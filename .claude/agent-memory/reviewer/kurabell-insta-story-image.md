---
name: kurabell-insta-story-image
description: drawWorkoutImage の story(1080×1920)分岐。上半分が固定で一覧は約744pxしかなく、8種目で「全セット」と言いつつ切れる。ボタン2つの和文ラベルが折り返す(2026-10-12)
metadata:
  type: project
---

2026-10-12 未コミット差分で、Instagram 画像に story 版が追加された(見出し〜人体図を g.translate(0, OY=110) で下げ、一覧だけ分岐)。
レビュー時の要点:
- 一覧の使える高さは FB - LT ≒ 744px(人体図あり)。最小段で1種目 ≒ 104px なので **8種目から「ほか N 種目」**になり、ボタンの「(全セット)」と食い違う
- 見出しのアイコン y≒174、足もとの文字 y≒1746。Instagram ストーリーの上下の重なり(推奨は上下250px前後空け)にかかる
- drawBest への切り出しで、投稿用の tight 時の印の字が 26→24px に変わった(投稿用が完全には同じでない)
- 「ストーリー用(全セット)」14px は 390px 幅でも2行に折れる

**Why:** 画像の描画は npm test で見えず、数値計算でしか重なり・溢れを確認できない。
**How to apply:** drawWorkoutImage を触る差分では、OY/FOOT_UP と avail を実数で計算し、典型的な6〜8種目の日で溢れないか確かめる。[[kurabell-image-share-photo-permission]]
