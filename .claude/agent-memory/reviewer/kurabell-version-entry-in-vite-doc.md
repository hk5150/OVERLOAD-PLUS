---
name: kurabell-version-entry-in-vite-doc
description: CACHEバージョンを上げる差分では docs/vite移行.md に同バージョンの節(変更したファイルの表・バージョン/コミット行)が追加されているかを確認する
metadata:
  type: project
---

CACHE vNNN を上げるコミットは慣例として `docs/vite移行.md` に同バージョンの節を足している(v107/v108/v109で確認)。
v109では節の「変更したファイル」表とバージョン・コミット行が抜け、後から別コミット(6715637)で埋め直した実績がある。

**Why:** CLAUDE.md にもテストにも書かれていない慣例なので、実装者が忘れやすく、ユーザーは後から揃え直している。

**How to apply:** `sw.js` の CACHE が変わる差分をレビューするとき、`docs/vite移行.md` に新バージョンの節が無ければ「改善提案」として指摘する(コミット前に足すかは実装者判断)。
