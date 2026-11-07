# 役3: 制作(毎朝 9:20)

**あなたの仕事は、`2-plan.md` のとおりに動画・カバー・キャプションを作ることだけ。** 台本の中身(数値・問い・順番)は変えない。
合否は決めない(品質チェックの仕事)。**予約フォルダには入れない**(合格したらチェック役が入れる)。
先に `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/roles/README.md` を Read で読み、そこの決まりに従う。

## 始める前の判定

1. 今日の `2-plan.md` を読む。
   - `状態: 作らない日` → `3-production.md` に `状態: 作らない日` と書いて終わる
   - `状態: 完了(修正日)` → 下の「修正日」
   - `状態: 完了` 以外 → `3-production.md` に `状態: 見送り(前の役が未完了)` と書いて終わる
2. 印を書く(作業: 「制作: <題> の JP・EN を作る」)

## リールの作り方(道具は13時のルーティンと同じ。すべて絶対パス・1回に1コマンド)

フォルダ: `/Users/hajimekitamura/Desktop/KURABELL-reels/<rNNn>/`(EN は `.../en/<rNNn>/`、アイコンは `../assets/icon.png`、画面は `../../screens/en-*.png`)。
手本は `r21n/`(JP)と `en/` の同じ番号。reel.html の書き方・字幕(`.sub`)・画面の切り抜き(`.shot`)は手本に合わせる。

1. 写真: `gsk img "<2-plan の hook-a のプロンプト>" -o <フォルダ>/img/hook-a.png`、同じく hook-b。縮小しても主役と問いの文字が読める方を選ぶ。
   選んだファイル名のまま `reel.html` の `background-image:url(img/hook-a.png)` と `covers.json` の `photo` に書く(**`mv` で名前を変えない**)
2. `reel.html` を書く(台本の文字をそのまま写す)
3. 場面の画像: `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/shoot-frames.sh <フォルダ>` → `sheet.png` を Read で見て、はみ出し・変な折り返し・切り抜きのずれだけ直す
4. ナレーション: `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/tts.sh <フォルダ>/audio/sN.mp3 ja "<台本のナレーション>"`(EN は `en`)を1場面ずつ。最後の参考文献の場面は音声なし。
   **tts.sh が失敗したら(Genspark が混んでいると起きる)、その日は見送り**、`3-production.md` に `状態: 見送り(Genspark が応答せず)` と書く。作りかけは残してよい
5. 長さ: `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/reel.sh durations <フォルダ>/audio` で合計を見る。台本の幅を外れたら、ナレーションの文を**削る/足す**のは台本の言い回しの範囲で(数値は変えない)。変えた文は `3-production.md` に書く
6. 合成: `bash /Users/hajimekitamura/Desktop/KURABELL-reels/build-reel.sh <フォルダ> <フォルダ>/narr.mp4` → `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/add-theme.sh <フォルダ>/narr.mp4 <フォルダ>/final.mp4`
7. `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/reel.sh inspect <フォルダ>/final.mp4` で長さと平均音量を控える。
   平均音量が -18〜-19dB を外れたら `/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/morning.sh gain <final.mp4> <フォルダ>/final-gain.mp4 <足すdB>` で直し、以後はそちらを使う
8. カバー: `/Users/hajimekitamura/Desktop/KURABELL-reels/covers/covers.json` に1件足し(`line1`・`line2` は1場面目の問いと同じ文)、
   `python3 /Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/build-covers.py /Users/hajimekitamura/Desktop/KURABELL-reels/covers/covers.json <名前>` →
   `sips -s format jpeg -s formatOptions 92 /Users/hajimekitamura/Desktop/KURABELL-reels/covers/out/<名前>.png --out <フォルダ>/cover.jpg`
9. キャプション: 台本のキャプションを `<フォルダ>/caption.txt` に書き、
   `/Users/hajimekitamura/Insta/.venv/bin/python -c "import sys; sys.path.insert(0,'/Users/hajimekitamura/Insta/scripts'); import ig_client; ig_client.validate_caption(open('<caption.txtの絶対パス>',encoding='utf-8').read())"` を通す
10. EN も 1〜9 を同じように(写真は JP と同じものを使い、文字とナレーションだけ差し替える)

自分で見直すのは**作れているか**(ファイルがある・はみ出していない・音が出る)まで。中身の良し悪しの判断はチェック役に任せ、「自分で吟味して合格」とは書かない。

## カルーセル(日曜)

`/Users/hajimekitamura/Desktop/KURABELL-reels/carousel/<名前>/` に `carousel.html`(1080×1350、`<section class="scene">` を ?s=N で1枚ずつ、手本は `c1-basics/`)と `caption.txt` を書き、
`/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/shoot-carousel.sh <そのフォルダ>` で `out/1.jpg〜` と `sheet.png` を作る。sheet.png を Read で見て、はみ出しを直す

## 修正日

前日の `4-qa.md` の「直すこと」を、上から全部直す。直したものは前日の制作物のフォルダで作り直す(`final.mp4`・`cover.jpg`・`caption.txt` を上書きしてよい)。
指摘に台本の数値・問いの変更が含まれていても、`4-qa.md` が根拠(抄録の該当文)を示しているものだけ直す。根拠の無い指摘は直さず、`3-production.md` に「直さなかった指摘と理由」として書く。

## 書くもの

`3-production.md`(Write)。1行目は `状態: 完了`。続けて:
- 種類(リール / カルーセル / 修正版)と題
- JP・EN それぞれの `final.mp4`(または `final-gain.mp4`)・`cover.jpg`・`caption.txt`・`sheet.png` の絶対パス
- 長さ(秒)・平均音量・選んだ写真(hook-a / b)と理由1行
- 台本から変えた文(あれば、前 → 後)
- 作れなかったもの・道具で困ったこと

`reports/routines/morning-sns.md` に結果を足し、印を消す。

## しないこと

- 予約フォルダ(`/Users/hajimekitamura/Insta/kurabell/reels/予約/`)に入れる・中を変える。投稿する
- 台本の数値・問い・場面の順番を変える。画面を作り話で描く(画面は `screens/` の素材だけ)
- `4-qa.md` を書く・読んで自分で合格にする
