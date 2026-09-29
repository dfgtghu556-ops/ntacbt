# NTACBT — Redevelopment round: status

> Companion to [`REDEVELOPMENT-PLAN.md`](./REDEVELOPMENT-PLAN.md).
> Every row below was verified by running the command named in the _Verified by_
> column, not by inspection.

**Branch:** `arena/01a0e8ab-ntacbt` · **Started:** 2026-09-28 · **Base:** `289459c`

---

## Baseline (measured before any edit)

| Check                  | Before                                           | After                    |
| ---------------------- | ------------------------------------------------ | ------------------------ |
| `npx tsc --noEmit`     | 0 errors                                         | **0 errors**             |
| `npm run lint`         | **23,422 errors** (23,416 prettier + 6 warnings) | **0 errors**, 6 warnings |
| `npm run validate:all` | exit 0                                           | **exit 0**               |
| `npm test` (robot E2E) | 112 / 112                                        | **112 / 112**            |
| `npm run build`        | ok                                               | **ok**                   |
| Unit tests             | none existed                                     | **55 passing**           |

---

## Phase 0 — Formatting & latent-bug fixes ✅

`commit 788d4b3`

- `prettier --write` across `src/`, `scripts/` and the legacy `public/js` bundle,
  `public/sw.js`, `scripts/generate-full-registry.js`.
- `src/features/focus/streak.ts` — `let cursor` → `const` (never reassigned).
- `src/integrations/supabase/previewAuthStorage.ts` — `let timer` → `const`, and
  dropped a **duplicate reassignment that left two pending timeout handles**
  (the first `clearTimeout` was a no-op, so every request leaked a timer).

## Phase A — Auth system ✅

`commit c3133d1`

| File                               | What                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/config/constants.ts`          | `APP_CONFIG`, `ROUTES`, `EXAM_CONFIG` (incl. the NTA marking constants), `STORAGE_KEYS`, `DAY_MS`       |
| `src/config/theme.ts`              | Palette mirror for non-CSS consumers + `SUBJECT_COLORS`                                                 |
| `src/types/auth.types.ts`          | `User`, `AuthState`, `LoginCredentials`, `RegisterData`, `AuthResponse`, `AuthProvider`, `AuthError`    |
| `src/services/http.ts`             | axios instance, `ApiRequestError`, `normalizeError` — never leaks raw axios internals                   |
| `src/services/auth.service.ts`     | local device provider (default) + Supabase when configured; transport failures become an honest message |
| `src/features/auth/store.ts`       | zustand + `persist`; holds identity only                                                                |
| `src/features/auth/hooks.ts`       | `useAuth()` (restores a session once), `useRequireAuth()`                                               |
| `src/routes/app.auth.login.tsx`    | Sign-in page in the app's own design language                                                           |
| `src/routes/app.auth.register.tsx` | Sign-up + exported pure `validateRegister`                                                              |
| `src/routes/app.profile.tsx`       | Identity, live provider, data-location disclosure                                                       |
| `src/utils/cn.ts`                  | `@/utils/*` alias over the single existing implementation                                               |
| `tsconfig.json`                    | path aliases for `@/config`, `@/services`, `@/types`, `@/utils`, …                                      |
| `src/routes/app._layout.tsx`       | avatar → `/app/profile`; guest "Sign in" link in the header                                             |

**Guarantee under test:** signing in or out never reads, writes or clears
`localStorage["jeecbt.v1"]` (the legacy progress blob).

## Phase B — Exam system refactor ✅

`commit 0a72595`

| File                              | What                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/types/exam.types.ts`         | `Question`, `Exam`, `ExamAttempt`, `ExamState` + adapters to/from the engine's `Cbt*` shapes                                               |
| `src/features/exams/types.ts`     | re-export shim so both import spellings resolve                                                                                            |
| `src/features/exams/store.ts`     | zustand live-attempt state (paper, answers, cursor, clock)                                                                                 |
| `src/features/exams/autosave.ts`  | 30 s autosave + resume; remaining time from the **wall clock** so a closed tab cannot gain time; drafts older than the paper are discarded |
| `src/services/exam.service.ts`    | load from the local CBT store / baked PYQ bank; grade via the NTA engine; persist attempts                                                 |
| `src/features/exams/components/*` | `ExamInstructions`, `ExamHeader`, `QuestionPanel`, `QuestionPalette`, `Calculator`, `ExamResult`                                           |
| `src/routes/cbt.tsx`              | reduced from 954 lines to composition + data loading                                                                                       |

Preserved: NTA marking, the dense percentile table, the response-status state
machine, per-question time accumulation, auto-submit at zero.
Added: autosave + resume, palette legend with text **and** colour, ARIA labels,
`safeEvaluate` (the calculator never reaches `eval` with arbitrary input), and a
"what should you do next?" block on the result screen.

## Phase C — Unit tests ✅

`commit 34d23ce`

`vitest.config.ts` + `src/test/setup.ts` + 5 suites / **55 tests**:

| Suite              | Covers                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.test.ts`   | +4/−1 marking, integers +4/0, published range keys, per-subject split, accuracy that never counts skips, zero-division, percentile monotonicity + determinism |
| `auth.test.ts`     | every `validateRegister` rule, local session lifecycle, and that sign-out leaves legacy progress intact                                                       |
| `exams.test.ts`    | adapter round-trips, autosave save/load/expire/corrupt-JSON, wall-clock remaining, palette tones, calculator sanitiser                                        |
| `exam-ui.test.tsx` | instructions, warning-window header, MCQ vs numeric panels, nav disabling, calculator interaction                                                             |
| `engines.test.ts`  | humane streak, mentor-report bounds/determinism/never-throws on malformed stores, 2 400-char AI-context bound, action ordering                                |

Wired as `npm run test:unit` / `test:watch`; `validate:all` now includes it.
`npm test` is untouched and still runs the 112-check robot E2E.

## Phase D — Deployment & docs ✅

| File                           | What                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vercel.json`                  | SPA fallback that excludes `/api/*`, immutable asset caching, `nosniff` / `X-Frame-Options` / `Referrer-Policy`                                                                                               |
| `.github/workflows/deploy.yml` | `verify` job (lint → typecheck → validate:all → robot → build) on every push/PR; `deploy` job **only** when the three Vercel secrets exist, so a fork never fails CI. **Delivered untracked** — see §5 below. |
| `.env.example`                 | rewritten with what each var actually does and the "everything works empty" guarantee                                                                                                                         |
| `README.md`                    | new Testing section + a Redevelopment section stating what was rebuilt, kept and rejected                                                                                                                     |
| `docs/REDEVELOPMENT-PLAN.md`   | the replan, with every decision and its reasoning                                                                                                                                                             |

---

## Live smoke test (dev server, port 8080)

All routes returned **200**:

`/` · `/app` · `/app/auth/login` · `/app/auth/register` · `/app/profile` ·
`/cbt` · `/app/planner` · `/app/pyq` · `/app/analytics` · `/app/report` ·
`/app/focus` · `/app/saarthi` · `/app/studytube` · `/app/tests` ·
`/app/search?q=electrostatics` · `/jee-cbt.html` · `/api/public/study-planner`

(`/app/search` without a `q` param returns **307 → `?q=`**, which is TanStack
Router normalising the required search param — expected, not a failure.)

Rendered content verified on the new pages: "Welcome back / Sign in / Create an
account / Your data stays yours / Skip for now" on login, "Not signed in /
Account provider / Where your preparation lives" on profile, and the
"Preparing your test…" loading shell on `/cbt`.

---

## 5. Phase E — Tests surface + global search ✅

| File                           | What                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/search/index.ts` | Pure, framework-free global-search engine: builds one index from the verified syllabus, the teacher/institute registry, the PYQ paper list, the student's saved tests and notes; scores with an explainable scheme (exact title > prefix > whole word > keyword > subtitle), AND-matches every term, caps per type, deterministic order. Hyphens/apostrophes **join** words so "Gauss' law" and "gauss-law" both match. |
| `src/routes/app.search.tsx`    | `/app/search` — grouped results (Topics · Chapters · Teachers · Institutes · Papers · Your tests · Your notes), an honest empty state, and a pre-query "ready to search" panel showing what is indexed. Every academic hit is badged `verified` / `unverified` with its source as the tooltip.                                                                                                                          |
| `src/routes/app.tests.tsx`     | `/app/tests` — one place to start a paper: the quick diagnostic, tests saved on this device, and the full previous-year library (API first, baked fallback). Each hands the paper to the exam service so the runner never guesses.                                                                                                                                                                                      |
| `src/components/layout/nav.ts` | `NAV` + `SHELF` extracted out of the route file so they are importable and testable. Nav is now Home · Planner · **Learn** · **Tests** · PYQ · **Progress**.                                                                                                                                                                                                                                                            |
| `src/test/search.test.ts`      | 20 tests: index invariants (no duplicates, every academic record carries a source), ranking, AND-matching, hyphen joining, per-type caps, type restriction, determinism, grouping.                                                                                                                                                                                                                                      |
| `src/test/nav.test.ts`         | 8 tests: unique paths/labels, label length, thumb-zone budget, and — critically — that the mobile grid derives its column count from `NAV.length`.                                                                                                                                                                                                                                                                      |

**Bug caught while doing this:** adding "Tests" to a hard-coded `grid-cols-5`
mobile bar wrapped the sixth item onto a second row. The bar now renders
`repeat(${NAV.length}, minmax(0, 1fr))`, and `nav.test.ts` guards the contract.

**Header search now searches everything.** It used to hard-code a jump to
StudyTube; it now goes to `/app/search`, so one box covers papers, chapters,
topics, teachers, institutes, saved tests and notes.

---

## 6. Phase F — StudentContext (the cross-scope leakage fix) ✅

**The bug.** Every surface invented its own answer to "what am I preparing for":
`app.studytube.tsx` initialised `target` to a hard-coded `"jeemain"`, the planner
kept its own `profile.target`, language lived under its own key, and goals lived
in the legacy settings blob. A CBSE Class 12 student who had never opened the
planner was therefore served **JEE Main content by default**, and a JEE student
could be shown board-only educators.

**The fix.** One persisted, typed description of who is studying, read by every
engine through a single module store:

| File                                          | Role                                                                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/context/student-context.ts`     | `StudentContext`, `normalizeContext` (never throws), persistence under `STORAGE_KEYS.STUDENT`, `seedFromLegacy` (read-only), `scopeOf`, `studyTubeTarget`, `checkScopeLeak` |
| `src/features/context/use-student-context.ts` | `useSyncExternalStore` binding with lazy hydration and cross-tab `storage`-event sync                                                                                       |
| `src/routes/app.studytube.tsx`                | Seeds `target`/`language` from the context and persists a target change so the choice survives the next visit                                                               |

It is **derived state, not a second source of academic truth** — it selects a
scope, it never defines one. Seeding reads the legacy `jeecbt.v1` blob (planner
`profile.target`, `settings.examDate`/`targetPercentile`/`dailyGoal`/`focusGoal`/
`lang`) and never writes back, so an existing student loses no preference.

**Three real bugs found and fixed while testing it:**

1. `seedFromLegacy` tested `target in GOAL_TO_TARGET`, which checks **goal
   names**, not target values — so every legacy planner target (`jeemain`,
   `board12`, …) silently failed to seed and the student always fell back to the
   JEE default. Replaced with `goalForTarget`, which searches the values.
2. `normalizeContext` trusted a stored `syllabusYear` that contradicted the
   goal, which is how a Class 11 student ends up reading the 2025-26 syllabus.
   The year is now derived from the goal.
3. Legacy `settings.dailyGoal` is a **question count**, not minutes — the legacy
   app divides it against `dailyQuestions` (`public/js/app.js:23218`,
   `q14 / (goal*14)`). It is stored as `dailyQuestions`; `focusGoal` genuinely is
   minutes and keeps its legacy 10–600 range.

**Verification.** `tsc --noEmit` 0 errors · `npm run lint` 0 errors (9 warnings,
all in vendored `src/components/ui/*`) · `validate:all` exit 0
(39,799 / 3,202 / 15,482 / 77 / 19 / 49 assertions) · **131 unit tests**
(83 → 131: +35 pure, +13 hook) · `vite build` exit 0 · all 15 routes 200 on the
dev server.

---

## 7. Phase 1 (rebuild plan) — Trust core: provenance + de-faking ✅

**The problem.** A prose comment is not provenance. The repo had three
overlapping shapes (`SourceRef` in `academics/types.ts`, an inline provenance
block in `data/syllabus.ts`, and prose in `cbt/engine.ts`) and no machine
check, so nothing failed a build when a claim went stale.

**What shipped.**

| File                                | Role                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/academics/source.ts`  | The canonical `Source` record — all six fields the plan names — plus `isCompleteSource`, `missingSourceFields`, `describeSource`, `isVerifiedStatus` and the `SOURCE_RECORDS` registry |
| `scripts/validate-sources.mjs`      | 35 checks, wired into `validate:all`                                                                                                                                                   |
| `src/features/readiness/predict.ts` | The predictor, rewritten to label its output honestly                                                                                                                                  |

`SourceRef` now extends `Source`, `SyllabusDataset`'s inline block is replaced
by it, and teacher provenance is built by one helper instead of hand-written
per record. `SOURCE_RECORDS` registers five datasets: the NTA percentile table
(verified), the candidate count (provisional), the JEE syllabus, the legacy
planner catalog and the PYQ papers.

**The validator fails on:** an incomplete record, guaranteed-outcome phrasing,
a promised mark gain, and a hard-coded frequency/probability claim that is not
computed from the verified question bank. It strips comments before matching —
a validator that fails on the comment _explaining_ the fix is worse than none.

**The predictor, de-faked:**

- `reliable`, `confidence`, `evidence` and `fallback` are now on the result.
  One attempt at 5/300 returns **rank 0 and "Not enough data to estimate
  reliably"** instead of a confident AIR from noise. Reliability needs both a
  sample (≥2 attempts) and paper coverage.
- The candidate count behind the AIR is recorded `provisional` with its own
  source record, and the rank inherits that label in the UI.
- It no longer maps a JEE Main percentile onto an Advanced outcome — that is
  cross-exam inference between two different exams.
- It no longer promises a specific mark gain; `topFix` gives a direction.
- The dashboard gates the rank and band behind `reliable`, shows the attempt
  count, and links both sources.

**Four real bugs found and fixed while doing it:**

1. **`config/constants.ts` read `import.meta.env` unguarded**, so the module
   threw in plain Node. `scripts/validate-planner.mjs` bundles the engines for
   `platform: "node"`, so any engine that transitively imported a storage key
   took the _whole planner validator_ down (1,212 scenarios / 39,799
   assertions). Guarded, with a regression test.
2. **`readiness.ts` had** `planner?.profile?.target || (attempts ? "jeemain" :
"jeemain")` — the same hard-coded fallback Phase F removed from StudyTube,
   hidden in a no-op ternary. It now reads the persisted StudentContext.
3. **All 103 teacher records carry a channel _display name_ and no URL**, so
   none is verifiable. `channelUrl` is now optional and a record without one is
   recorded `unverified` rather than given an invented link. See open item 5.
4. **`validate-sot.mjs`'s textual type check could not see a re-export**, so
   moving `VerificationStatus` to the canonical module read as a deletion. The
   check now accepts a definition _or_ a re-export.

**Verification.** `tsc --noEmit` 0 errors · `npm run lint` 0 errors (9 warnings,
all in vendored `src/components/ui/*`) · `validate:all` exit 0
(39,799 / 3,202 / 15,482 / 77 / 19 / 49 assertions, 0 failures) · **151 unit
tests** (131 → 151) · `vite build` exit 0 · all 14 routes 200.

---

## 8. Phase 3 (rebuild plan) — the learning loop: one mastery store ✅

**The gap.** Mastery lived in three places that never spoke to each other:

| Where                   | What it tracked                                                      |
| ----------------------- | -------------------------------------------------------------------- |
| `readiness.ts`          | Per-chapter accuracy, from CBT attempts alone                        |
| `studytube/progress.ts` | Mastery **per video** (keyed on `videoId`)                           |
| `mentor/report.ts`      | Video counts and chapter accuracy, side by side but never in one row |

So "videos done", "PYQs attempted" and "accuracy" for the **same chapter**
could not be answered — which is the one question the combined report exists
to answer. Finishing an Electrostatics lecture never moved the Electrostatics
chapter.

**What shipped.**

| File                              | Role                                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/mastery/mastery.ts` | `buildMastery` — pure over the evidence; one record per chapter with attempts, PYQ attempts, lessons finished, recall, last activity, state, score, reason and next action        |
| `src/features/mastery/collect.ts` | `masteryFromStores` — reads the real stores. A PYQ paper is a `CbtTest` with `pyq: true`, so it is counted through the same path as any test: **one question bank, one accuracy** |
| `src/features/mentor/report.ts`   | `preparation` — the combined per-chapter row                                                                                                                                      |
| `src/routes/app.report.tsx`       | The "My preparation, chapter by chapter" table                                                                                                                                    |
| `src/features/academics/index.ts` | `chapterForTopic()` — resolves a topic to its chapter **within the student's scope**, or `null`                                                                                   |

Handshakes now record `subject`/`chapter`/`topic` at write time, so the store
never has to re-resolve a video id against the catalog. A handshake with no
chapter is **skipped rather than guessed** into the nearest one — missing
evidence is honest, wrong evidence is not.

**Two real bugs found and fixed:**

1. **`strongTopics` was hard-coded to `[]`** with a "filled below" comment that
   never filled it, so the report's strengths section was permanently empty. It
   now reads the real per-chapter accuracy from the mastery store.
2. **`priorityChapters` silently dropped every chapter with 1–2 attempts.**
   `weak` needs `>= MIN_SAMPLE` and `untouched` needs 0 attempts, so a chapter
   with one attempt fell through all three bands and **vanished from the
   report entirely** — exactly the student who most needs the nudge. Added a
   `thin` band, with a regression test.

Also extracted the `toSubject()` duplicated across `app.tests.tsx` and
`app.pyq.tsx` into `features/academics/subject.ts` rather than adding a third
copy.

**Verification.** `tsc --noEmit` 0 errors · `npm run lint` 0 errors (9 warnings,
all in vendored `src/components/ui/*`) · `validate:all` exit 0
(39,799 / 3,202 / 15,482 / 77 / 19 / 49) · **182 unit tests** (151 → 182) ·
`vite build` exit 0 · all 14 routes 200.

---

## 9. Why `.github/workflows/deploy.yml` is untracked

The file is written and ready at `.github/workflows/deploy.yml`, but it is **not
committed** because this sandbox's GitHub App does not hold the `workflows`
permission, and GitHub rejects any push that creates or updates a file under
`.github/workflows/` without it:

```
! [remote rejected] ... (refusing to allow a GitHub App to create or update
  workflow `.github/workflows/deploy.yml` without `workflows` permission)
```

To land it, either grant the App the **workflows** permission and re-run
`git add .github/workflows/deploy.yml && git commit && git push`, or paste the
file into the repo through the GitHub web UI. Everything else in this round is
already pushed to `arena/01a0e8ab-ntacbt`.

Until then, CI is not enforced on push — run `npm run lint`, `npx tsc --noEmit`
and `npm run validate:all` locally (all three are green).

---

## 10. Phase 4 (rebuild plan) — the real curriculum map + planner scope

**The finding that started this.** The only CBSE data in the repo was
`cbse27Topics` in `src/data/sot/legacy-inline.json` — a flat
`[name, ?, ?, classLevel]` chapter list with no units, no topics and no
source. Worse, an audit of the `CBSE_12` academic scope showed all **116**
of its records were teacher/playlist catalog entries whose `chapter` field
held marketing strings ("Organic Chemistry Maestro") and whose `topic`
field held playlist names. So `chapterForTopic` for a CBSE scope had no
syllabus to resolve against, and its nearest-string fallback matched a
*teacher's name* — asking for the real chapter "Atoms" resolved to a video
series. **All 37 real CBSE Class XII chapters returned `null`.**

**What was built.**

- `src/data/curriculum/cbse-class-12-2026-27.ts` — the real CBSE Class XII
  2026-27 syllabus: 3 subjects, 25 units, 37 chapters, 240 topics, with
  `theoryMarks`, `chaptersOf`, `unitOfChapter` and
  `assertClassLevelIsolation`.
- `src/data/curriculum/index.ts` — a versioned registry. `curriculumFor`
  takes an explicit `(board, classLevel, academicYear)` and returns `null`
  on a miss; it never falls back to the nearest year, so a student on a
  future syllabus cannot be planned against stale chapters.
- `src/features/academics/curriculum-bridge.ts` — makes `chapterForTopic`
  resolve CBSE scopes through the map. JEE scopes map to no curriculum key
  and keep using the structured JEE syllabus records untouched.
- `src/features/planner/scope.ts` — resolves a planner request against the
  map and returns `in-syllabus` / `in-syllabus-topic` / `off-syllabus` /
  `no-map` / `unknown-subject` plus one honest note. It **annotates** the
  request, it never rewrites it.
- `src/features/planner/coverage.ts` + a panel on `/app/planner` — measures
  the stored plan against the map: per chapter, planned and actually-done
  minutes and a state, rolled up per unit.
- `scripts/validate-curriculum.mjs` — 29 checks, wired into
  `validate:all` after `validate:syllabus`.

**Marks honesty.** Unit marks are recorded only where every source agrees.
Chemistry sums to exactly **70** and Mathematics to exactly **80**.
**Physics unit marks are `null` throughout**, because published per-unit
figures conflict and several sum to 133 for a 70-mark theory paper. The
UI renders "not published here", never 0, and the subject total is null too
because a partial sum would be a fabricated weight.

**One matcher, everywhere.** `matchCurriculum` lives in the curriculum
registry so the planner scope and the academic adapter share it — a student
who types "Optics" in the planner and "optics" on a test question must land
in the same mastery row.

**The Eklavya schedule was not touched**, per the instruction in
`.lovable/plan`. The coverage panel is a read-only lens over the stored
plan.

---

## 11. Phase 6 (rebuild plan) — dashboard information order

The rebuild plan asks for: greeting → today's focus + ONE primary action →
today's tasks → progress → 3–5 weak areas → continue learning → optional
deep analytics behind disclosure. The dashboard had a hero, nine stat
panels and **no today's task list**.

- `src/features/planner/today.ts` + a `TodayStrip` on `/app` — today's
  tasks read from the student's own plan, falling back to the nearest
  upcoming day when today is empty. The 3–5 weak areas come from
  `priorityChapters`, the same ranking the mentor report uses, so Home and
  the report can never disagree.
- The primary action is chosen from what the evidence supports. A student
  with no attempts is sent to a diagnostic, because every other number on
  the dashboard depends on there being at least one attempt.

The result page already matched the plan's order (header score → "What
should you do next?" → strengths → breakdown → mistakes → weakest topics →
question review), and `NAV` already had the six specified destinations, so
needed no change.

---

## 12. A5 — shareable parent / mentor report

- `src/features/report/share.ts` + a `SharePanel` on `/app/report`.
- **The privacy contract is the feature.** The store holds notes, YouTube
  notes, bookmarks, watch-later lists, SRS card contents, goal and contract
  free text. The module does not copy the store; it builds a
  `ShareableReport` from an explicit allowlist and documents both sides in
  `PRIVACY`, which the report page prints next to the output. Tests assert
  poisoned private fields never reach the report object, the text one-pager
  or the markdown one-pager, and that no account identifier leaks even when
  the store has one.
- Tone follows the "no shame" requirement: a missed day is a number, never
  a verdict, and every weak chapter is paired with a constructive note.
- The report page shows the full one-pager inline **before** the student
  copies it, so the clipboard copy can never differ from what they read.

**Latent bug fixed on the way:** `loadFocusStore` parses localStorage, so
one null or field-less session made `todayFocusSeconds` and `focusStreak`
throw, blanking the whole dashboard instead of degrading. Both helpers now
filter invalid sessions at the top. Regression tests in
`src/test/focus.test.ts`.

---

---

## 13. A8 — audio summary

- `src/lib/speech.ts` — Web Speech API wrapper. No API key, nothing sent
  anywhere, works offline, which matters more than voice quality for the
  low-connectivity case the research doc calls out.
- `src/features/mentor/speech.ts` — composes the spoken version from the
  same numbers the page renders, in the page's own order.
- Three rules: availability is **reported**, never assumed (the voice list
  populates asynchronously and varies by device, so the button disables
  with a reason); markdown is stripped and the text capped, because the
  2,400-character AI context string read aloud is noise; one utterance at
  a time, and leaving the page stops the speech.
- Hinglish is read with an Indian English voice, because it is
  Roman-script Hindi and a Hindi voice would mispronounce the Latin
  letters.
- A student with no attempts hears "not attempted any questions yet",
  never "0 percent accuracy".

---

## 14. A10 — PWA install, offline fallback, real asset caching

A manifest and service worker already existed, but three things meant the
app was not actually installable or offline-capable.

1. **`start_url` was `/jee-cbt.html`** — the legacy HTML shell. Installing
   dropped a student into the app the rebuild is moving away from. Now
   `/app`, with shortcuts for Today, a mock test, PYQ papers and the
   mentor report.
2. **No offline fallback.** A navigation miss served `/`, the marketing
   page. `public/offline.html` is now the declared fallback and says
   plainly that attempts and the plan are stored on the device, not in the
   cloud.
3. **Hashed assets were never cached**, so "works offline" was
   aspirational. Vite emits `/assets/app.index-A1b2C3.js`, so the hash
   changes every build and a cached copy is immutable by construction —
   those are now cache-first permanently. Unversioned URLs (`/js/app.js`,
   `/css/legacy.css`) stay network-first, because caching those is the
   original v1 bug that froze every student on the first version they ever
   loaded.

The classification rules live in `public/sw-classify.js` and are loaded by
`sw.js` via `importScripts`, so they are testable. The suite checks them
against the filenames Vite actually emits.

Install is a real ask rather than Chrome's easy-to-miss mini-infobar. A
dismissal is respected for two weeks and declining the browser dialog
counts as a dismissal. iOS gets the real share-sheet instructions instead
of a button that does nothing. Already-installed is detected through both
the display-mode media query and `navigator.standalone`.

---

---

## 15. A2 — Memory Locker (spaced repetition)

- `src/features/memory/srs.ts` — real **SM-2**, not the legacy app's fixed
  1→3→7→21→45-day ladder. The ladder does not adapt: a card a student keeps
  failing comes back on the same timing as one they find trivial. SM-2 carries a
  per-card ease factor, so failures shorten the interval and successes lengthen
  it. A failing grade resets the ladder to one day and counts a lapse. Ease is
  bounded below at 1.3 so a card can never become unschedulable.
- Four grades (Again / Hard / Good / Easy) rather than Anki's 0–5, mapped onto
  SM-2's quality scale — on a phone, fewer buttons that get pressed beat six
  that do not.
- `src/features/memory/use-deck.ts` — **auto-seeds from the student's real wrong
  answers**, reading the same legacy test store the mastery engine reads. Never
  from a right answer. The card front is the real question text and the back is
  the real answer; there is no invented "suggested formula" anywhere, and a
  question with no readable text is skipped rather than turned into a
  placeholder.
- `/app/memory` shows one card at a time with the answer hidden until the
  student commits, because active recall is the mechanism and showing both sides
  turns it into re-reading. There is no peek — a peek inflates the grade and
  corrupts the schedule. A session is 20 cards so the queue can be finished.
- Memory sits in the sidebar `SHELF`, not the primary `NAV`: the primary nav
  stays at Phase 6's six destinations and the mobile bottom bar is grid-locked
  to `NAV.length`. The `SHELF` test now checks a shortcut resolves to a real
  route file rather than that it is in `NAV` — the property that actually
  protects the student, and stronger than the old check.

---

---

## 16. A4 — Today's DPP (adaptive practice)

- `src/features/practice/dpp.ts` builds the set; a card on `/app` launches it.
- **It does not label questions easy/medium/hard.** The baked PYQ bank carries
  `subject`, `chapter`, `topic`, `type`, `text`, `options`, `answer`, `sol` — and
  no difficulty field. Inventing one would be the fabricated data the rebuild
  plan forbids, and a wrong label actively misleads: a student shown "easy" on a
  question they keep failing learns to distrust the whole app. The adaptation is
  in the **selection**, not in a label — every question carries the reason it was
  chosen so the student can see the logic.
- Selection order: weak chapters (a real sample below 50%) weakest first; then
  thin samples one question each, because a chapter with two attempts is
  *unmeasured* rather than failing, and this also stops the set only ever
  reinforcing what is already known; then the highest-weightage chapters; then
  the remainder spread across subjects.
- Deterministic per day (mulberry32 seeded from the day key), so a reload does
  not reshuffle the set and a student can finish what they started.
- Launched by saving the set as a real `CbtTest`, so `/cbt` resolves it by id and
  the student gets the full exam runtime — timer, palette, negative marking,
  autosave, and a result that feeds the same mastery store every other test
  uses. A DPP attempt is therefore counted by the same accuracy the mentor
  report uses.
- `dppToCbtTest` returns null below 6 questions: a three-question "test" would
  produce a result that looks like evidence and is not.
- Fixed a real robustness bug: `?? []` is not enough for a payload that could be
  a string or object, and calling `.filter` on it took down the practice page.
- Three tests run against the real baked bank (5 papers, 375 questions), reading
  the same `paper.questions` shape `cbt.tsx` reads. They skip when the bake has
  not run, since `public/pyq` is gitignored.

---

---

## 17. A9 — XP, levels and badges (gamification done right)

- `src/features/focus/achievements.ts`, surfaced as a card on `/app`.
- **Everything is derived, never accumulated.** XP is recomputed from the
  student's evidence on every read. A stored counter would drift — it would
  survive a data wipe, inflate on a re-import, and quietly disagree with the
  numbers elsewhere on the page. Deriving it means the XP shown always equals
  what the focus minutes, attempts, lessons and mastered chapters add up to, and
  it cannot be inflated by editing localStorage.
- **No badge can be earned by NOT doing something.** Every predicate asserts a
  completed positive act, and a test greps every label and description for
  failure-framed language. No countdown, no loss framing, no locked-badge wall —
  an unearned badge is shown with a real progress bar toward a completed act, or
  not shown at all.
- **No leaderboard.** The research doc puts peer comparison in A6 and flags it as
  the item most likely to backfire. The only comparison is "beat your own best",
  against the student's own previous streak, and a first-ever streak is not
  treated as a personal best because there is nothing to beat.
- Only **completed** focus sessions earn XP, so a timer left running does not.
- Fixed a real bug on the way: the dashboard effect passed the `humane` **state**
  to the awards builder, which still held its initial value because the setState
  in the same effect had not applied — a student with a real streak would have
  been awarded for an empty one. The lint rule caught it; the computed value is
  now captured locally, matching how the effect already handles the survival
  score.

---

## Open items for the user

1. **A `.env` containing real Supabase credentials is committed to the repo.**
   It is tracked (`git ls-files .env` returns it) and holds
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, etc.
   Anyone with clone access has these values, and they will be in the git history
   even after removal. **Recommended:** rotate the Supabase keys, then
   `git rm --cached .env`, add `.env` to `.gitignore`, and commit
   `.env.example` only. This was **not** done unilaterally because removing a
   tracked file could break an existing deployment.
2. `src/data/video-engine.ts` still carries pre-existing `tsc` complaints in some
   configurations; the current tree is clean, but the file is on the list for the
   teacher/video verification pass described in the original rebuild plan.
3. The Eklavya 96-test schedule is deliberately untouched (out of scope).
4. The brief's "admin dashboard" was not built: NTACBT is a single-student,
   local-first product, so an admin role exists in the type contract but there is
   no multi-tenant admin surface to build one against. The mentor report
   (`/app/report`) is the equivalent read-only "oversight" view.
5. **CBSE Class XI 2026-27 has no published map.** `curriculumKeyForExam`
   resolves `CBSE_11`, but no Class XI map has been transcribed yet, so a
   `board11` student gets an honest "not published here" rather than the
   Class XII chapters. Transcribing Class XI is the obvious next map.
6. **No teacher record has a verifiable channel URL.** All 103 carry a display
   name only (`channelName: "JEE Wallah"`), so every one is now recorded
   `unverified` in the academic source-of-truth. Nothing filters on that yet,
   so StudyTube is unaffected — but the rebuild plan's Phase 5 says unverifiable
   entries should be _hidden_ from recommendations, which would empty the
   teacher picker. Supplying the URLs (or accepting the labelling) is a
   decision for you, not one to make unilaterally.
