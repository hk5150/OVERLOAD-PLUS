# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OVERLOAD+ (`overload`) is a progressive-overload workout logging PWA. Its primary UX is that each exercise card shows the previous session's actual sets so you can log "the same, or a bit more" with minimal typing. A deterministic rule engine (`analyzeExercise`) can additionally judge whether to increase weight/reps or deload based on past sets (weight/reps/RIR) — when enabled, that judgment is layered on top as a `suggestion` annotation (badge + one-tap diff chips) rather than replacing the previous-record display; see `RULE_ENGINE_ENABLED` below. No backend — everything runs client-side and persists to `localStorage`.

## Build / run / deploy

There is no build step, package manager, or test suite — this is a single static HTML file loaded directly by the browser.

- **Local dev**: serve the directory over HTTP (not `file://`, since the service worker and manifest need a real origin) and open `index.html`, e.g. `python3 -m http.server 8000`.
- **Deploy**: push to GitHub and serve via GitHub Pages. Deploying the web app just means committing and pushing `index.html` (and any changed assets) to `main`.
- **Cache busting**: `sw.js`'s `fetch` handler is network-first, uncached-content-falls-back-to-cache for *every* same-origin GET (app shell and `vendor/*` alike — there is currently no cache-first path for the vendor libs, despite what older comments in this file used to say). When you change `index.html`, bump the `CACHE` version string at the top of `sw.js` or returning users may see a stale cached copy. Also bump the version badge string hardcoded in the header near the top of `App()` (search for the `v` + number span) — keep the two in sync.
- **No linter/formatter/tests are configured** for the web app. Verify changes by opening the page in a browser and exercising the UI directly — Babel does transform errors at runtime and surfaces them in the on-page boot error UI, so a runtime syntax error will show up as a boot failure screen rather than a build failure.
- **iOS app (Capacitor)**: `ios/` holds the native wrapper project; `www/` is generated output (gitignored, do not edit by hand). `npm run sync-www` (also run automatically by `npm run ios:sync`) reads `#appsrc` out of `index.html`, pre-transpiles the JSX with esbuild (see `scripts/sync-www.js`), and writes it to `www/app.bundle.js` — the generated `www/index.html` loads that bundle via a plain `<script src>` with no runtime Babel and no `eval()`. `vendor/babel.min.js` (2.87MB) is intentionally excluded from `www/vendor/`. This build step is scoped to the iOS output only; the root `index.html` used for GitHub Pages stays zero-build, per the point below.

## Architecture

Everything lives in `index.html`, which has two layers:

1. **Bootstrap script** (top of `<body>`, runs immediately): loads React 18, ReactDOM, prop-types, and Recharts from `vendor/` (local files, not CDN — this was migrated off unpkg/jsdelivr; see git history around the Capacitor work if you need the old CDN URLs), then reads the app source out of `<script type="text/plain" id="appsrc">`, transpiles it with `Babel.transform(src, { presets: ['react'] })` (also loaded from `vendor/babel.min.js`, ~2.87MB), and `eval`s the result. This indirection exists so the JSX/ES6+ app code can ship as a single file with zero build tooling for the web deploy target. If you edit app logic, edit the contents of the `#appsrc` block — the code isn't executed directly by the browser, so JSX syntax errors won't show up as normal parse errors until Babel runs. **This bootstrap/runtime-Babel path is intentionally NOT how the iOS build works** — see the Capacitor bullet above.
2. **App source** (inside `#appsrc`, ~3500+ lines of JSX): a single large `App()` function component holding most UI state, plus supporting data/logic defined above it in this order:
   - Design tokens (`C`), muscle group taxonomy, the exercise database (`EXERCISE_DB`, ~95 built-in exercises), split presets, judgement-type labels (`JUDGE`).
   - **Rule engine** (`analyzeExercise`, currently around line 387): pure function taking an exercise name + full workout history + `{phase}` and returning `{type, reason, prescription}`. This is the core domain logic — it decides weight increase / reps increase / deload / pain warning / comeback-after-break / etc. based on whether working sets (non-warmup, non-assisted) hit the rep ceiling, RIR targets, stall streaks, and days since last session. Any change to progression behavior belongs here, not scattered in the UI. Note: this function's return value only flows into the UI as a `suggestion` annotation (see below) — `suggestionFor()` currently only forwards `{type, reason, weight, targetReps}` from `res.prescription`, so any other field `analyzeExercise` computes (e.g. a widened `repHigh` from the weight-jump guard) is silently dropped before it reaches `today`/saved records. Extend `suggestionFor()`'s picked fields (and the chip-apply handler) if you need more of the prescription to actually take effect.
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

## This repo gets edited from multiple places — always check state before trusting your memory of it

Development on this project happens from several sources that don't share context with each other: an earlier claude.ai chat (Artifact-based, pre-dates this git repo and isn't accessible from here), and — as of the iOS work — multiple separate Claude Code chat sessions working the same repo concurrently (e.g. a "機能修正" feature-work session and an "App Store販売準備" iOS-submission session). Any of them can commit and push between your turns. Concretely this has already happened once: mid-session, `git log` showed two Capacitor-related commits neither the user nor the active session had made.

Consequences for how you work here:
- **Don't trust line numbers, version strings, or "current state" claims from earlier in a long conversation, or from this file's own prose, without re-checking.** Run `git log --oneline -10` and `git status` at the start of a work session and again if a lot of time/turns have passed. Re-`grep` for the thing you're about to edit rather than assuming a remembered line number still points at it.
- If the user pastes design discussion or a diff from "another chat," treat it as authoritative *intent*, but verify the actual file contents before acting — the other session's work may or may not already be in this repo's git history.
- If you're about to do multi-step work that would conflict with concurrent edits elsewhere (large refactors, renames), it's worth surfacing that risk to the user rather than assuming you have exclusive access to the repo.

## Other files

- `manifest.json`: PWA manifest (icons, theme color, standalone display).
- `sw.js`: service worker, see cache-busting note above.
- `icon-*.png`, `apple-touch-icon.png`: PWA icons, referenced by `manifest.json`/`index.html`.
- `vendor/`: locally-vendored React/ReactDOM/prop-types/Recharts/Babel Standalone, committed to the repo (not gitignored) since both the web app and the iOS build depend on them and there's no package-manager step for the web target.
- `ios/`, `www/`, `scripts/sync-www.js`, `package.json`: the Capacitor iOS wrapper and its build pipeline. `www/` and `node_modules/` are gitignored (generated); everything else is committed. See the iOS bullet under Build/run/deploy above.
