# Instagram 運用(KURABELL公式)

2026-10-04 開始。日本語のみ。個人アカウント `hajimek_life` の仕組み(`~/Insta`)とは別。

## 流れ

`drafts/` → `approved/` → `published/` のディレクトリ移動で状態を表す(`../x/` と同じ)。

1. Claude が `drafts/` に下書きを書く(1投稿 = `YYYY-MM-DD-topic.md` + 画像)
2. 北村さんが見て良ければ `approved/` へ移す
3. **投稿は北村さんが Instagram アプリから手で行う。** Claude は投稿しない(画像をiPhoneに送ってから投稿する)
4. 投稿したら `published/` へ移し、md の末尾に投稿日時と URL を書く

## 画像

`carousel.html` を Playwright で 1080×1350 で撮る(`?s=番号`)。素材は `assets/`(ストーリー版 `~/Desktop/KURABELL-instagram-story/v3/` から取り込んだもの)。

## 書くときの約束

`../x/README.md` と同じ(アプリにない機能を書かない・価格を書かない・否定形から書き出さない)。加えて:

- キャプションの URL はタップできないので「プロフィールのリンクから」と書く
- リンクは `ct=instagram` のキャンペーンリンク(`profile.md`)
- ハッシュタグは5〜8個
