# NTACBT — Full-Platform Robustness Audit & Hardening

> **Date:** 2026-09-03
> **Scope:** Every feature surface of the platform — the AI/adaptive planner and its
> recommendation engine, the readiness/weak-topic engine, the NTA CBT scoring engine,
> post-test analytics/Mistake-Doctor, the PYQ pipeline, the focus system, the StudyTube
> offline catalog, the React app shell routes, and the legacy single-file app
> (`public/jee-cbt.html`, driven by the robot E2E harness).
> **Method:** Full read of each module, reproduction of every existing test/validator,
> live smoke-testing of every API endpoint + React route against a running server, and two
> new large-dataset validation harnesses built from the *real* production source.

---

## 1. What was tested (feature inventory)

| Feature surface | Implementation | Tested by |
|---|---|---|
| AI / adaptive planner | `/api/public/study-planner` + `features/planner/*` | `validate-planner` (1,177 scenarios) |
| Readiness / weak-topic engine | `features/readiness/readiness.ts` | `validate-planner` + `validate-full` |
| NTA CBT scoring + percentile | `features/cbt/engine.ts` | `validate-full` (120 tests × 75 Qs) |
| Post-test analytics / Mistake-Doctor | `features/cbt/analytics.ts` | `validate-full` |
| PYQ bake + fallback | `routes/api/public/pyq-papers.ts` + `build-pyq.mjs` | `validate-full` (5,000 rows) |
| Focus system | `features/focus/focus.ts` | `validate-full` (40-day history) |
| StudyTube offline catalog | `features/studytube/catalog.ts` | `validate-planner` + `validate-full` |
| Saarthi AI chat | `routes/api/public/ai-chat.ts` | live smoke (503 w/o keys is correct) |
| **AI Mentor engine** | `features/mentor/report.ts` → `/app/report` | `validate-mentor` (618 reports / 600 synthetic students) |
| Live classes finder | `routes/api/public/live-classes.ts` | live smoke |
| PDF → test AI fallback | `routes/api/public/pdf-reformat.ts` | live smoke |
| Legacy single-file app | `public/jee-cbt.html` | `robot-test.mjs` (112 checks) |
| React app shell routes | `src/routes/*` | live smoke (all 200) |

---

## 2. Bugs found & fixed

### 2.1 NTA percentile tables were inconsistent across surfaces (HIGH)
The React CBT engine (`src/features/cbt/engine.ts`) used a **sparse** NTA 2025
anchor table that was missing the published anchors at **25, 35, 45, 55, 65, 85,
95, 110, 130, 165** marks. The legacy app and `validate-analytics` use the full
**dense** table. Result: the **same score displayed a different percentile**
depending on whether the student was on the React Analytics page or the legacy
app — diverging by up to **~1.06 percentile points** (e.g. 45 marks → 76.14% on
React vs 77.20% legacy; 55 marks → 83.94% vs 84.60%).

**Fix:** replaced the React `NTA_ANCHORS` with the exact dense table used by
`public/jee-cbt.html` and `scripts/validate-analytics.mjs`. Now every surface
reports the same percentile for the same score.

### 2.2 Readiness accuracy double-counted correct answers (HIGH)
`features/readiness/readiness.ts` — `accuracyOf()`:
```ts
attempted += all.correct || 0 + (all.wrong || 0);   // wrong: `+` binds tighter than `||`
```
This evaluated as `correct || (0 + wrong)`, so whenever any answer was correct the
wrong count was ignored and the denominator under-counted. Every accuracy figure
(and therefore weak-topic detection → adaptive-plan re-ordering) was inflated.

**Fix:** `attempted += (all.correct || 0) + (all.wrong || 0);`

### 2.3 React planner showed everything as "not done" (MEDIUM)
The legacy app records completion in `plannerDone[id]`, not on the task row. The
`DataStore.planner` getter returned raw rows, so the React planner + readiness
engine never saw completed tasks (completion % stuck at 0). **Fix:** overlay
`plannerDone[id]` → `status` in the `planner` getter.

### 2.4 "Focus 3-Week Window" was miscomputed (LOW)
`src/routes/app.planner.tsx` used `now − 3 days .. now + 24 days`, hiding today's
tasks. **Fix:** `now .. now + 21 days`.

### 2.5 `parseDuration` accepted malformed YouTube time strings (MEDIUM)
`features/planner/engine.ts` accepted components `> 59` (e.g. "9:99"), letting an
adversarial/malformed `lengthText` inject an absurd duration into ranking bands.
**Fix:** reject minutes/seconds `> 59`. (Also hardened match — verified by harness.)

### 2.6 Unbounded/untyped request body on the planner route (MEDIUM)
The route trusted a parse of the POST body. A client could send `topic` as an
object/array (leaking `"[object Object]"` into search queries), a non-numeric
`maxMinutes` (NaN into duration math), or unknown enum values. **Fix:** new
framework-free `features/planner/normalize.ts` coerces every field to a bounded,
typed, valid value and **never throws**. (Verified by adversarial harness.)

### 2.7 Single-file route coupled logic (architecture)
The 703-line planner route bundled HTTP/caching, YouTube scraping, query building,
ranking and merge in one handler that was only reachable over the network. Split
into `features/planner/normalize.ts` (input hygiene) + `features/planner/engine.ts`
(pure, injectable-search logic) with a thin HTTP/cache route. Production output is
byte-equivalent; only the deliberate fixes above change behavior.

---

## 3. Validation harnesses ("training on a large dataset")

Both harnesses bundle the **real** source with Rolldown and run actual functions —
no network needed.

### `npm run validate:planner` — 1,177 scenarios / 34,815 assertions
Every official syllabus topic, the full curated registry, 720 kind × depth ×
target × language combos, teacher/institute matrix, 220 seeded-fuzz combos,
malformed payloads, ranking invariants, offline catalog, readiness + adaptive plan.

### `npm run validate:full` — 3,202 cases
CBT scoring over 120 generated 75-question tests; the full dense percentile
cross-surface consistency check (React == legacy at every multiple of 5 marks);
post-test analytics; readiness over an 8-test attempt history; the AI planner
across 15 topics × kinds × targets × languages; the PYQ pipeline over a 5,000-row
generated dataset (order, counts, well-formedness); focus-system streak over a
40-day history; StudyTube offline catalog; merge/rank invariants.

**Run them:**
```sh
npm run validate:planner
npm run validate:full
npm run validate:all          # includes both + every existing validator
```

---

## 4. Verified status (this change)

| Check | Result |
|---|---|
| `npm run validate:all` | ✅ all 9 validators pass (incl. the new mentor harness) |
| `npm run validate:planner` | ✅ 1,198 scenarios / 36,257 assertions |
| `npm run validate:full` | ✅ 3,202 cases |
| `npm run robot-test` (legacy E2E) | ✅ 112 checks |
| `npm run validate:mentor` | ✅ 618 reports / 15,482 assertions / 0 throws |
| `npm run build` | ✅ |
| `npm run lint` (changed files) | ✅ 0 errors |
| `npx tsc --noEmit` | ⚠️ 14 pre-existing errors — all in untouched `video-engine.ts` (13) + `supabase/client.ts` (1). None from this change; `npm run build` does not run `tsc`. |

### Live smoke (running server)
- React routes `/app`, `/app/planner`, `/app/analytics`, `/app/focus`, `/app/saarthi`,
  `/app/pyq`, `/app/studytube`, `/cbt`, `/jee-cbt.html` → all **200**.
- `/api/public/study-planner` → robust topic 200 (curated lessons first); obscure topic
  200 `{items:[],fallback:true}`; malformed body & non-JSON → **400**.
- `/api/public/live-classes` → 200; malformed body → 200 (coerced to defaults).
- `/api/public/ai-chat`, `/pdf-reformat`, `/cloud-config` → **503** with a clear,
  actionable message when no env keys are configured (correct degradation, no crash).

---

## 5. Remaining items (pre-existing / out of this change's scope)

1. **`tsc` strictness** in `src/data/video-engine.ts` (13) and
   `src/integrations/supabase/client.ts` (1) — `exactOptionalPropertyTypes` /
   `noUncheckedIndexedAccess` complaints in untouched files. Runtime-safe and not
   exercised by the build. Recommend a follow-up.
2. **Rate-limit maps** (`ai-chat`, `pdf-reformat`, `study-planner`, `live-classes`)
   are per-instance, not shared across serverless instances — see `PHASE0-AUDIT.md`.
3. **YouTube scraping** of public search pages is a documented ToS/robots risk.
4. **PWA precache** is empty (`PHASE0-AUDIT.md` item) — runtime caching works.
5. **Supabase public RLS** is permissive by design (single-owner app).

---

## 6. AI Mentor — whole-platform integration (this phase)

The platform now behaves as **one connected AI mentor**. Every student surface is
aggregated by a single pure, deterministic, framework-free engine into one
explainable per-student report, which is also available to the Saarthi assistant
as a bounded context.

### 6.1 How it's wired

- **`src/features/mentor/report.ts`** — `buildMentorReport({ store, focus, studytube })`
  reads the legacy `DataStore` (attempts, tests, settings), the adaptive planner
  profile + tasks, the NTA CBT readiness/weak-topic engine, the StudyTube
  watch/mastery/handshake store, and the focus session store. It never throws, never
  touches the network, and clamps every number into a valid range. It returns one object
  with `learner`, `performance`, `mastery`, `study`, `mistakes`, `focus`, `planner`,
  `readinessScore` (0–100 + level), priority-sorted `actions`, `risks`, and `summary`.
- **`mentorContextForAI(report, max=2400)`** — produces a bounded per-student context
  string (≤2400 chars) so Saarthi reasons over the *whole* student, not one tab.
- **`src/routes/app.saarthi.tsx`** — the assistant now loads the mentor report + AI
  context in addition to readiness.
- **`src/routes/app.report.tsx`** — new `/app/report` "Mentor Report" page (hero
  readiness score, KPI grid, next steps, risks, study/discipline, plan adherence, weak
  topics, links to Planner + Saarthi). Nav link added on `/app`.
- **`src/lib/store.ts`** — `DataStore.tests` getter now guards non-array corrupt shapes.

### 6.2 Validation (huge dataset + real-life scenarios + 1-year usage)

`npm run validate:mentor` bundles the **real** production modules with Rolldown and runs:

- **600 synthetic students** simulating up to **365 days** of usage (attempts, tests,
  planner tasks, focus sessions, StudyTube mastery/watch-later, handshakes).
- **8 named real-life scenarios**: brand-new, active, near-exam, low-accuracy,
  no-focus-but-tests, heavy-watch-no-practice, stale-plan-massive-overdue, no-StudyTube.
- **10 corrupted / malicious store shapes** (null store, NaN/Infinity result fields,
  tasks not an array, 5000 attempts).

**Result: 618 reports / 15,482 assertions / 0 failures / 0 throws.** Invariants:
`readinessScore` and all percentiles/percentages are finite and in range, actions are
priority-sorted, output is deterministic (same input → same report), and the AI context
fits the 2400-char bound.

### 6.3 Real bugs caught and fixed by this phase

1. **Focus consistency could exceed 100** with >21-day history → windowed to the last
   21 days and clamped to 0–100.
2. **`DataStore.tests` crashed on a non-array corrupt shape** → now returns `[]`.

Both are now covered by the harness so they cannot regress.
