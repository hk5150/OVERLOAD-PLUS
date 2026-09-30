---
name: kurabell-stored-rir-empty-string
description: 保存済み記録の「未実施」はrirキー無しが正形。rir:""を保存側に入れると s.rir != null 判定の箇所とWatchのPrev.rir(Int?)デコードが壊れる
metadata:
  type: project
---

`today`(入力途中)では未実施 = `rir: ""`、**保存済みの記録では未実施 = rir キーが無い**(saveWorkout / saveEditWorkout が `...(rir ? {rir} : {})` で落とす)。
保存済み記録を読む箇所の多くは `s.rir != null` だけで判定しているので、保存側に `rir: ""` が入ると
「(RIR)」「前回 60×8 RIR」の空表示、`num(s.rir) - prevSet.rir` が `x - ""` で偽の「→ RIR+2」、
そして watch.js の `prev.rir: p.rir != null ? p.rir : null` が `""` を送り、Watch の `Prev.rir: Int?` の
JSONDecoder が typeMismatch → `try?` で snapshot ごと捨てられ Watch が更新されなくなる(swiftで実証済み)。

v128(復元時に範囲外の値を "" にする変更)のレビューで発見(2026-09-30)。

**Why:** 保存済みデータの形が「今日の入力」の形と違うことはコードからは読み取りにくく、"" を足す変更が静かに下流を壊す。

**How to apply:** 保存済み記録(workouts)に値を書き込む/整形する差分では、rir を "" や null にしていないか、
Watch へ送る prevSets 経由で Swift の Int? に文字列が流れないかを確認する。[[kurabell-1rm-filter-divergence]]
