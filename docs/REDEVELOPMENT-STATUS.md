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
`/app/focus` · `/app/saarthi` · `/app/studytube` · `/jee-cbt.html` ·
`/api/public/study-planner`

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

## 6. Why `.github/workflows/deploy.yml` is untracked

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
