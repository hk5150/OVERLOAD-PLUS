---
name: watch-workout-restart-pitfall
description: Watch の WorkoutManager.start は isRunning だと今のセッションを破棄して始め直すので、startWatchApp の追加呼び出しは走行中のワークアウトを壊す
metadata:
  type: project
---

WorkoutManager.start(_:) は isRunning のとき、lastSaved で無ければ discard(report:true) してから新セッションを作り、recordStartAt=nil に戻して attach(10分窓)に頼る。
iPhone 側 drain は同じバッチに discarded と started が並ぶと watchWorkoutStopped が後勝ちして watchLive を降ろす。

**Why:** 2026-10-12 の 1.4.1 (29) レビュー(iPhone の20秒後の再試行 + Watch 自身の開始)で、再試行が走行中セッションを捨てる経路として指摘した。
**How to apply:** startWatchApp を増やす変更・start() を呼ぶ経路を足す変更では、「同じ記録に対応付いて走っているセッションを捨てないか」「iPhone 側の setTimeout がサスペンド明けに遅れて発火しないか」を必ず確認する。

追記(2026-10-12、Watch が保存後も終わらない件のレビュー): Watch のワークアウトを終わらせる入口は SessionStore.syncWorkout だけで、
呼ばれるのはスナップショット受信時と workoutDidStart だけ。syncWorkout は `snap.recordStartAt == r` を lastSaved より先に見るので、
saveWorkout の途中(setWatchLastSaved 済み・setStartAt(null) 前)の中間スナップショットでは終わらない。終わらない系の変更ではここを確認する。

追記(2026-10-12、recover 追加のレビュー): アプリ再起動後のセッション引き取りは WorkoutManager.recover(handleActiveWorkoutRecovery)。
recordStartAt は UserDefaults に永続化され recover で戻る。recover は isBusy なら黙って諦めるので、start() と競合すると孤児セッションが残りうる。
永続化した recordStartAt は「どのセッションの値か」を持たないので、古い値で別記録の syncIdentifier に締める経路がないか確認する。

追記(2026-10-12、forceEnd 追加のレビュー): スナップショットの state(active/menu/idle)は「記録中か」を表さない。種目を全部消すと
記録中でも menu/idle になり recordStartAt は載ったまま(watch.js buildWatchSnapshot)。「記録していない画面」を条件にする変更では
SessionStore.recordInProgress を見ているか確認する。
