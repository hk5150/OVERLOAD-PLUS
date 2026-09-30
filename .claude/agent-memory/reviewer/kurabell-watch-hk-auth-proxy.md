---
name: kurabell-watch-hk-auth-proxy
description: 1.1(7)でiPhoneがWatchの分のHealthKit許可(心拍read・消費カロリーshare/read)を代わりに求める形にした。型集合の同期と審査メモ/docsの追随を確認する
metadata:
  type: project
---

1.1 (6) の実機で、startWatchApp で裏から起こされた Watch が権限シートを出せずワークアウトが始まらない(仮説)。
iPhone の HealthManager.requestAuthorization に Watch の WorkoutManager と同じ型を足し、startWatchWorkout でも先に呼ぶ形にした(2026-09-29 レビュー)。

**Why:** 許可は iPhone アプリと依存型 Watch アプリ(WKRunsIndependentlyOfCompanionApp=NO)で共有される前提。実機未検証。
**How to apply:** HealthManager / WorkoutManager のどちらかの requestAuthorization の型を変える差分では、もう片方と揃っているか見る(当時はテストで縛っていなかった)。
iPhone 単体ユーザーにも心拍の許可シートが出るので、APPSTORE.md「次のバージョン」の審査メモと docs/Watchアプリ.md の「権限は Watch で求める」記述が追随しているか確認する。
Watch 側 start() の requestAuthorization にはタイムアウトが無く、止まると isBusy が立ったままになる点も関連。[[kurabell-watch-workout-ownership]]
