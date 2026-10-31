# Gemini 連携(Google AI Plus)

2026-10-31、北村さんが Google AI Plus に加入。「Gemini との連携を強化して」の依頼で、使いどころを決めた。
プランの中身(公式ページで確認)は Obsidian の `Knowledge/google-ai-plus-plan.md`。

## 前提: API では組み込めない
- AI Plus には **Gemini API / AI Studio のクレジットが無い**。個人の Gemini CLI(Google ログイン)も 2026-06-18 に Pro/Ultra でも止まった
- だから毎日のルーティンから Gemini を API で呼ぶ形は作らない。使うのは Gemini アプリ(gemini.google.com)とその中のノートブックを、
  北村さんが手で、または Claude in Chrome で使う形
- ナレーションの TTS は今の Genspark 経由のまま(`marketing/tools/tts.sh`)。画像は GPT Image のまま。Flow の動画生成(200クレジット/月)は、
  AI で作った映像がエビデンスの方針と合わないので使っていない

## 1. AIコーチの答えの確認
Gemini(3.6 Flash)の実物の答えを、アプリの取り込みで確かめた。結果と残りは `docs/AIコーチ.md` の「未確認・残課題」。

## 2. ノートブック「KURABELL エビデンス(リールで使った論文)」
gemini.google.com のサイドバー「ノートブック」にある(旧 NotebookLM が Gemini アプリの中に入った)。
URL: https://gemini.google.com/notebook/14a3f96e-1323-4844-ae37-4b1ed6a65657

- ソースは、`marketing/` の下書きに出典として書いた論文 15本(PubMed の抄録ページ 14本 + Rekstis 2025 のオープンアクセス全文)。
  PubMed のページは**抄録だけ**なので、全文の表の数字までは確かめられない
- 使い方: 台本の数字を貼って、次のように聞く。答えは抄録の原文を引用し、出典の URL を添えて返ってくる
  ```
  ソースだけを根拠に答えてください。次の台本の数字が、ソースの抄録と合っているか確かめ、
  合っていなければ正しい数字と該当するソースを示してください。
  1. 「…」
  ```
  2026-10-31 に試した: 0.37%(PMID 27433992)は原文の引用つきで「合っている」。Ogasawara 2013(PMID 23053130)は
  「24週続けた群と、6週+3週休みを繰り返した群(鍛えたのは計18週)」と、比べた条件の細かい違いを指摘した
- **最後の確認は今までどおり原典で行う。** ノートブックは「見落とし・言い過ぎを早く見つける」ための一次チェックで、
  Gemini の判定をそのまま根拠にしない(10/31 の AIコーチの答えでも、説明文に「種目順を変えた」と書きながら変えていない食い違いがあった)
- 新しい論文をリールで使ったら、そのページ(PubMed の URL など)をソースに足す。「ソースを追加」→「ウェブサイトを追加」で、
  複数の URL を空白区切りでまとめて入れられる

## Claude in Chrome で操作するときのこつ(2026-10-31)
- gemini.google.com のノートブックは、クリック・スクリーンショットとも通った(2026-08 に notebook.google.com で通らなかったのとは別のホスト)
- 入力欄(Quill の `div.ql-editor`)は `form_input` が使えず、合成の paste イベントも無視される。
  `ed.focus(); document.execCommand('insertText', false, text)` なら改行ごと入る
- 答えの「コピー」ボタンで写すと Markdown(```kurabell のブロック付き)、画面を選択して写すとブロックの囲みが消えて「コード スニペット」の見出しが残る
