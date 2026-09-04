# NTACBT — Roadmap Features: IMPLEMENTED

> Every feature from `docs/PRODUCT-ROADMAP-AUDIT.md` is now applied and live.
> This doc tells you exactly what changed, where it lives in the code, and how
> to see/test it yourself. Both surfaces work:
> - **Legacy app**: `/jee-cbt.html` (the main platform, `/` redirects here)
> - **React Learning OS**: `/app` (the "Mission Control" dashboard)

---

## How to launch
The dev server is running on `http://localhost:8080`.

| URL | What it is |
|---|---|
| `/jee-cbt.html` | Legacy full platform (dashboard is the entry) |
| `/app` | React "Mission Control" dashboard (new features) |
| `/app/planner` | Adaptive planner (goal-based ranking + why) |
| `/app/studytube` | StudyTube (emoji-free, Focus target switch) |

---

## Feature-by-feature: what was built + how to test

### F1 — Goal-based To-Do engine (not a rigid timetable)
**Where:** legacy `aipToday` (auto-sorts by weakness/weightage, shows effort
minutes, check-off goals); React `/app/planner` via `adaptTasks` (weak-first
ranking, "Why" on every task).
**Test:** Open `/app/planner`. Turn on **"Adapt for weaknesses"** — weak topics
move to the top with a **Weak target** badge and a *why* line. In legacy, open
**AI Planner → Today** — tasks are goal-checkboxes with minutes, not forced hours.
**Status:** already built, verified green.

### F2 — "Am I on track?" Survival Score + Mission card  (the defining feature)
**Where:** new `src/features/readiness/survival.ts` → `computeSurvival()`. Renders
as the big **`SurvivalMission`** card on `/app` and the **`survivalBanner()`**
card on the legacy dashboard.
**Test:** Open `/app`. You'll see a **ring with a 0–100 score**, a status
(On-track / Watch / At-risk), a **"Do this next"** line, and 5 mini-bars showing
*how* the score was built (Plan, Accuracy, Weak-topic health, Mistake leak,
Consistency). Every number is derived from your real data — nothing guessed.
**Status:** NEW, verified (24/24 assertions).

### F3 — Auto re-plan on missed/overrun (guilt-free recovery)
**Where:** legacy `aipRebalance()` (missed days redistributed), `aipRebalanceActual()`
(ran-over budget spread to later days), and pull-forward in `aipToday`.
**Test:** In legacy planner, mark 2 tasks as done early / watch a longer video than
planned — the remaining today-tasks are rebalanced and the "Momentum / pull next
2 tasks" prompt appears. Skip a day and the "kaam reh gaya — redistribute karun?"
mentor prompt fires.
**Status:** already built, verified green (25/25).

### F4 — Mistake-DNA micro-drills (active recall)
**Where:** new `src/features/cbt/microDrill.ts` + `src/features/cbt/mistake.ts`.
Renders as the **Mistake-DNA micro-drill** panel on `/app`.
**Test:** Do a test (or rely on past attempts). Open `/app` → the panel shows ~5
**active-recall cards** built from your strongest mistake pattern + weakest topic.
Tap a card to **flip** and self-check. It's retrieval (say the answer first), not
re-watching.
**Status:** NEW, verified (24/24).

### F5 — Humane Streak + Streak-Freeze (recoverable, never punishing)
**Where:** new `src/features/focus/streak.ts` → `computeHumaneStreak()`. Shown on
`/app` in the **Consistency** card + an ethical loss-framing nudge.
**Test:** On `/app`, the Consistency card shows your current-day streak, the
**freezes left**, and if a streak is at risk it says *"do the 5-min micro-win
before midnight"* — never shames you into quitting.
**Status:** NEW, verified (24/24).

### F6 — "Your progress, not your loss" reactivation
**Where:** React dashboard `showReactivation`.
**Test:** Return to `/app` after 2+ days away with existing progress — a green card
appears: *"Your progress isn't gone. You last studied N days ago…"* with a positive
pick-up message. No guilt.
**Status:** NEW.

### F7 — JEE + Board dual-lane readiness (balanced promise, made visible)
**Where:** `computeDualLane()` in `survival.ts`. Renders as **"Two lanes, one
balanced plan"** on `/app`.
**Test:** Open `/app` → you see **JEE readiness** and **Board readiness** scores
side-by-side plus an automatic split (board-first vs JEE-first). JEE content stays
strong; board is never over- or under-weighted.
**Status:** NEW, verified (24/24).

### F8 — 5-min micro win (tiny action keeps the habit alive)
**Where:** `/app` Quick actions **"5-min micro win"** card + streak microWin text.
**Test:** On `/app`, the Quick actions row includes a **"5-min micro win"** card that
tells you the one tiny thing to do on a tired day.
**Status:** NEW.

### F9 — Wellness / balance signals (not guilt)
**Where:** new `src/features/readiness/wellness.ts` → **"Balance, not burnout"**
strip on `/app`.
**Test:** Open `/app` → you'll see a 3-card strip: healthy-pace, **take a break
after 90 min**, and **"You are not just an exam."**
**Status:** NEW, verified.

### F10 — Trust = correct, always-visible data + the Guarantee Card
**Where:** **"Why you can trust these numbers"** panel + **Guarantee Card** on `/app`.
**Test:** Open `/app`. The Guarantee Card states the honest position: *"Our guarantee
is the system, not a score — you will never study blind and never get stuck."* The
trust panel lists exactly how each number is computed.
**Status:** NEW.

---

## Files touched / created

**New modules**
- `src/features/readiness/survival.ts` — Survival Score + dual-lane engine
- `src/features/readiness/wellness.ts` — balance signals
- `src/features/cbt/microDrill.ts` — active-recall micro-drill generator
- `src/features/cbt/mistake.ts` — Mistake-Doctor bridge from the legacy store
- `src/features/focus/streak.ts` — humane streak + freeze
- `scripts/validate-survival.mjs` — 24 assertions (new, green)
- `scripts/test-survival-banner.mjs` — legacy banner check (4 assertions, green)
- `docs/IMPLEMENTED-FEATURES.md` — this doc

**Modified**
- `src/features/dashboard/types.ts` — `SurvivalScore`, `DualLaneReadiness`, `MicroDrillCard`
- `src/routes/app.index.tsx` — Mission-Control dashboard (Survival ring, Guarantee
  card, dual-lane, streak, micro-drill, wellness, trust)
- `public/jee-cbt.html` — `survivalBanner()` on the legacy dashboard
- `package.json` — `validate:survival`, `test:survival-banner` scripts

---

## Validation status (all green)
- `npm run build` — exit 0
- `npm run validate:all` — planner **39590/0**, full **3202/0**, mentor **15482/0**
- `npm run validate:survival` — **24/0**
- `npm run test:survival-banner` — **4/0**
- `npm test` (robot) — **112/0**
- `tsc` — no new errors (only the 14 pre-existing in `video-engine.ts`/`supabase`)

Now go test. Start with `/app` (the Mission Control) — that's where all ten
features visibly live.
