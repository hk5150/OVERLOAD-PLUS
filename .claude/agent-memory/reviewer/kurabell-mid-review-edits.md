---
name: kurabell-mid-review-edits
description: レビュー中にも実装側セッションがファイルを書き足すことがある。報告前に git status を取り直す
metadata:
  type: project
---

レビューの途中で、差分に無かったファイル(CLAUDE.md・privacy.html・docs/*.md)が新たに現れたことがある(2026-09-26、Watchアプリ v120 のレビュー時)。実装側セッションがレビュー依頼後もドキュメントを並行して書いていた。

**Why:** 開始時の `git status` だけで範囲を確定すると、後から混ざった変更を見落とす/誤って範囲外と報告する。

**How to apply:** 報告を書く直前に `git status --short` を取り直し、開始時との差を「レビュー中に増えた変更」として明示する。

(このメモは当初 cwd が ios/App のときに `ios/App/.claude/agent-memory/reviewer/` へ誤って保存され、
未追跡ディレクトリとして `git status` に `?? ios/App/.claude/` で出ていた。2026-09-28 に正しい場所へ移した。
同じ `?? ios/App/.claude/` を見たら、それはレビュアーのメモの置き忘れで、他セッションの作業ではない)
