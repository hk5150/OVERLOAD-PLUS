---
name: kurabell-domain-global-shadowing
description: src/domain の新しいグローバル名が App 内のローカル(useMemo等)と同名だと、App内では影に隠れて「is not a function」で起動後に落ちる。npm testは素通り
metadata:
  type: project
---

2026-10-11 人体図(bodyMap.js)で、ドメイン関数 `trainedMuscles` が App 内の同名 useMemo 配列に隠され、画面表示時に「trainedMuscles is not a function」で落ちた(bodyHitMuscles に改名して解消)。

**Why:** `npm test` は index.html を実行しない。LIBS の globals 起動検査も「グローバルが定義されたか」しか見ないので、App 内のローカルによる影は検出できない。

**How to apply:** 新しいドメインのグローバル名・新しいトップレベル部品名が出たら、`grep -n "名前" index.html` で `const 名前`/`function 名前`/分割代入/引数名が #appsrc の中に無いかを全部見る。drawWorkoutImage など長い関数の中のローカル(by, F, hit など)の重複も同時に確認する。関連: [[kurabell-boot-globals-check]]
