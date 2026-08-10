# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OVERLOAD+ (`overload`) is a progressive-overload workout logging PWA. Given past sets (weight/reps/RIR), a deterministic rule engine prescribes the next session's weight, reps, and sets per exercise. No backend — everything runs client-side and persists to `localStorage`.

## Build / run / deploy

There is no build step, package manager, or test suite — this is a single static HTML file loaded directly by the browser.

- **Local dev**: serve the directory over HTTP (not `file://`, since the service worker and manifest need a real origin) and open `index.html`, e.g. `python3 -m http.server 8000`.
- **Deploy**: push to GitHub and serve via GitHub Pages (see README.md for the manual upload flow used previously). Since this is a git repo now, deploying just means committing and pushing `index.html` (and any changed assets) to `main`.
- **Cache busting**: the service worker (`sw.js`) does network-first for the app shell but cache-first for CDN libs. When you change `index.html`, bump the `CACHE` version string at the top of `sw.js` (e.g. `overload-v53` → `overload-v54`) or returning users may see a stale cached copy.
- **No linter/formatter/tests are configured.** Verify changes by opening the page in a browser and exercising the UI directly — Babel does transform errors at runtime and surfaces them in the on-page boot error UI, so a runtime syntax error will show up as a boot failure screen rather than a build failure.

## Architecture

Everything lives in `index.html`, which has two layers:

1. **Bootstrap script** (top of `<body>`, runs immediately): loads React 18, ReactDOM, prop-types, Recharts, and Babel Standalone from CDN (unpkg, falling back to jsdelivr), then reads the app source out of `<script type="text/plain" id="appsrc">`, transpiles it with `Babel.transform(src, { presets: ['react'] })`, and `eval`s the result. This indirection exists so the JSX/ES6+ app code can ship as a single file with zero build tooling. If you edit app logic, edit the contents of the `#appsrc` block — the code isn't executed directly by the browser, so JSX syntax errors won't show up as normal parse errors until Babel runs.
2. **App source** (inside `#appsrc`, ~3300 lines of JSX): a single large `App()` function component holding most UI state, plus supporting data/logic defined above it in this order:
   - Design tokens (`C`), muscle group taxonomy, the exercise database (`EXDB`, ~95 built-in exercises), split presets, judgement-type labels (`JUDGE`).
   - **Rule engine** (`analyzeExercise`, around line 391): pure function taking an exercise name + full workout history + `{phase}` and returning `{type, reason, prescription}`. This is the core domain logic — it decides weight increase / reps increase / deload / pain warning / comeback-after-break / etc. based on whether working sets (non-warmup, non-assisted) hit the rep ceiling, RIR targets, stall streaks, and days since last session. Any change to progression behavior belongs here, not scattered in the UI.
   - Shared style helper objects, small presentational components (`NumInput`, `JudgeBadge`, `GuideArt`, `RirSelect`).
   - `App()`: owns all state via `useState` (workouts, split, profile, UI toggles, edit/history modals, timers, etc.) and renders four tab views gated by a `view` state string: `"split"`, `"log"`, `"history"`, `"settings"`.

Key domain concepts:
- **Workout record**: a day's session = `{ date, exercises: [...] }`, each exercise has `sets` with `{weight, reps, rir, warmup, assisted, ...}`.
- **Storage**: `store.{get,set,del}` wraps `window.storage` (used when embedded in certain host environments) with a `localStorage` fallback; both paths are attempted and failures are swallowed so the app never crashes on persistence. Main keys: `workout-log-v1` (saved history) and `workout-draft-v1` (in-progress entry, so an in-progress set survives an accidental reload/crash).
- **AI features are disabled**: `const AI_ENABLED = false` near the top of `#appsrc` gates the AI coach comment / exercise how-to features, which call `https://api.anthropic.com/v1/messages` directly from the client (see `callAI`). Re-enabling this in a real deployment requires proxying the API key server-side (e.g. via a Vercel function) rather than calling Anthropic directly from the browser — do not just flip `AI_ENABLED` to `true` without adding a proxy.
- **Rule engine is also disabled**: `const RULE_ENGINE_ENABLED = false` (separate flag from `AI_ENABLED`) gates whether `analyzeExercise`'s prescription is actually shown/used in the UI. The function and its call sites are kept intact so it can be re-enabled later.
- **ROM factor**: exercises with small range of motion (shrugs, calf raises) get their logged volume halved for volume charts only — this does not affect 1RM estimates or the rule engine's progression decisions.
- **Dumbbell exercises**: logged as single-hand weight; total/effective load is computed as double that for volume/1RM purposes. **Bodyweight exercises**: effective load is `bodyweight × exercise factor + added weight`.
- **A set only counts as "completed" once its RIR (余力/reps-in-reserve) is entered.** Sets without RIR are treated as not-yet-logged, not as zero-RIR.
- **State updates on `today`/session-in-progress state must use the functional updater form** (`setToday(t => ...)`, not `setToday(newValue)` derived from a stale closure) — a prior bug where in-progress records silently disappeared was caused by non-functional updates racing with other state changes.

## Working from claude.ai chat history

Earlier development happened in a claude.ai chat (Artifact-based), not in this repo. That chat is not accessible to Claude Code directly — if the user pastes chat excerpts, treat them as authoritative design/decision history, but **verify claimed state against the actual files first**, since this repo can lag behind what was last produced in that chat (it was kept in sync via manual "upload files" to GitHub, not git commits from that session). As of 2026-08-10, this repo is on `sw.js` cache `overload-v53` and does not yet contain the "insight row" features (previous-session RIR display, same-weight streak, 3-session-average volume %) described as delivered at v54 in that chat — confirm current state with `grep` before assuming a described feature is present.

## Other files

- `manifest.json`: PWA manifest (icons, theme color, standalone display).
- `sw.js`: service worker, see cache-busting note above.
- `icon-*.png`, `apple-touch-icon.png`: PWA icons, referenced by `manifest.json`/`index.html`.
