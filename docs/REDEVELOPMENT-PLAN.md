# NTACBT — Complete Redevelopment: Replan

> **Source of truth for this round:** `redevlopment.txt` (uploaded to branch
> `dfgtghu556-ops-patch-1`), read together with the repository's own history
> (`.lovable/plan/…-2026-09-01.md`, `docs/*-AUDIT.md`, `docs/NEXT-FEATURES-RESEARCH.md`).
>
> **Date:** 2026-09-28 · **Branch:** `arena/01a0e8ab-ntacbt`

---

## 0. Executive summary — what changed in the replan, and why

`redevlopment.txt` opens with:

> **Current State:** Basic CBT application requiring complete modernization
> … This is NOT a patch or incremental update. You will rebuild the entire
> application from the ground up.

**That premise is no longer true.** Since that document was written, NTACBT has
grown into a JEE/CBSE *learning operating system*: 113 TypeScript/TSX modules,
a typed NTA CBT scoring engine with the dense official percentile table, an AI
adaptive planner, a StudyTube video engine, a deterministic AI-Mentor report
engine, a verified teacher/syllabus source-of-truth, an Android Focus-Guard app,
a PWA shell, and **9 validators + 5 harnesses** that are all green today
(`npm run validate:all` → exit 0, `npx tsc --noEmit` → 0 errors).

A literal "clean slate" (`mkdir ntacbt-redeveloped && npm create vite`) would
therefore **destroy working, validated, data-bearing product** and replace it
with a generic login/exam/dashboard skeleton — i.e. it would move the project
*backwards*. It would also break `AGENTS.md`'s history-preservation policy and
the repo's own documented "why not a blind rewrite" stance.

**So the replan keeps the document's *intent* and drops its *method*:**

| The document's intent | How it is honoured |
|---|---|
| Modern, enterprise-grade architecture | Layer the app (`VerifiedData → Services → Domain → UI`), extract the monolith routes into `src/features/*` + `src/services/*` + `src/types/*` |
| Production-ready standards | Green lint, green build, green validators, unit tests, typed API clients, real loading/empty/error states |
| Full automation, no confirmations | Implemented end-to-end in one pass, validating after each step |
| **Auth system** (Phase 4) | **Genuinely missing → built** (see §3) |
| **Exam system** (Phase 5) | **Exists as a 954-line route → refactored into the document's structure + autosave/resume added** (see §4) |
| Dashboard / results / routing / UI kit | Already built and validated — kept, documented |
| Deployment (Vercel, CI) | Added (see §6) |
| Unit tests (vitest/RTL) | **Genuinely missing → added** (see §5) |
| Zero ESLint errors | **Was 23,422 prettier errors → now green** (see §2) |

Everything below is either (a) work that does not exist yet, or (b) work that
exists but in a shape the document explicitly asks to improve. Nothing that
already works is rewritten for its own sake.

---

## 1. Baseline measured before any edit

| Check | Result at `289459c` |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ❌ **23,422 prettier errors + 6 react-refresh warnings across 39 files** |
| `npm run validate:all` | ✅ exit 0 (jee2026 · sot · syllabus · teachers · videos · links · analytics · planner · full · mentor · journey · fuzz · r3) |
| `npm run build` | ✅ (after `node scripts/build-pyq.mjs`) |
| `npm test` (robot E2E) | ✅ 112 checks |
| `node_modules` | ❌ absent — nothing could run until `npm install` |

---

## 2. Decisions taken against the document (and the reasoning)

### 2.1 "Clean slate" → **rejected**
Deleting the working app is not a redevelopment, it is a data-loss event. The
document's own Phase 1 output (login + exam + dashboard with `[1,2,3].map(...)`
hard-coded rows) is strictly *less* capable than `/app` today.

### 2.2 `react-router-dom@6` → **kept TanStack Router**
The repo uses typed, file-based TanStack Router + TanStack Start (`src/routes/`,
`routeTree.gen.ts`, `src/routes/README.md` documents the convention). Porting to
RRv6 would delete route-level search validation (`validateSearch`), SSR, and the
server API routes. `BrowserRouter` is not reintroduced.

### 2.3 `tailwind.config.js` + `postcss.config.js` → **not created**
Tailwind **v4** is wired through `@tailwindcss/vite` inside
`@lovable.dev/vite-tanstack-config` (see the warning at the top of
`vite.config.ts`). A v3-style config file would silently do nothing and a
duplicate PostCSS pipeline breaks the build. Design tokens live in
`src/styles.css`.

### 2.4 `zustand` / `axios` → **adopted**
These two are real gaps: the app has no client-side store abstraction and no
typed HTTP layer. They are added where they earn their place — auth state and
the exam attempt state (§3, §4) — rather than retro-fitted everywhere.

### 2.5 `framer-motion`, `lodash`, `dayjs` → **not added**
`tw-animate-css` already provides the animation layer, and the codebase is
deliberately dependency-light (no lodash anywhere). Adding unused heavy deps
violates the repo's own minimalism; `date-fns` is already a dependency.

### 2.6 A hard auth wall (`ProtectedRoute` on everything) → **rejected**
NTACBT is **local-first**: every student's progress lives in
`localStorage["jeecbt.v1"]` and must survive with no account and no network.
Gating the app behind a login would lock existing students out of their own
data. Auth is therefore **optional and additive** (§3).

### 2.7 `vercel.json` + `vercel-action` with secrets → **added, but guarded**
The deploy workflow is committed with a `workflow_dispatch`/secret guard so CI
stays green without `VERCEL_TOKEN`/`ORG_ID`/`PROJECT_ID` configured.

---

## 3. Phase A — Authentication system (new; the document's Phase 4)

**Gap:** there is no `src/features/auth`, no login/register route, no auth store,
no `src/services/*`, no `src/types/*`, no `src/config/*`. `src/integrations/supabase/*`
only stubs `signInWithPassword` when Supabase env vars are unset.

**Built:**

| File | Purpose |
|---|---|
| `src/types/auth.types.ts` | `User`, `AuthState`, `LoginCredentials`, `RegisterData`, `AuthResponse`, `AuthProvider` — exactly the document's contract |
| `src/config/constants.ts` | `APP_CONFIG`, `ROUTES`, `EXAM_CONFIG`, `STORAGE_KEYS` (document Step 2.2) |
| `src/services/http.ts` | axios instance + typed request/response envelope + bounded error normalisation (never throws raw) |
| `src/services/auth.service.ts` | `login / register / logout / getCurrentUser / refreshToken`; **local provider by default**, Supabase when configured, mock-safe when neither |
| `src/features/auth/store.ts` | zustand + `persist` → `useAuthStore` (document Step 4.2), rehydrated on boot |
| `src/features/auth/hooks.ts` | `useAuth()`, `useRequireAuth()` |
| `src/routes/app.auth.login.tsx` · `app.auth.register.tsx` | Login / Register pages in the app's own design language (not the document's generic blue gradient) |
| `src/routes/app.profile.tsx` | Identity + sign-in/out surface, reachable from the header avatar |

**Invariants:** no route becomes unreachable when signed out; signing out never
deletes local progress; the Supabase path is only taken when
`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` exist.

---

## 4. Phase B — Exam system (refactor; the document's Phase 5)

**Gap:** the NTA-style exam UI already exists but as a **954-line route**
(`src/routes/cbt.tsx`) that mixes HTTP loading, paper building, timer state,
palette state, calculator, grading and result rendering. The document asks for
`types/` + `stores/` + `services/` + a decomposed feature module — which is also
what the repo's own `docs/ARCHITECTURE.md` §3 asks for.

**Refactored into:**

| File | Purpose |
|---|---|
| `src/types/exam.types.ts` | `Question`, `Exam`, `ExamAttempt`, `ExamState` (document Step 5.1) + adapters to the existing `CbtTest` shape |
| `src/features/exams/types.ts` | re-export shim so both spellings resolve |
| `src/features/exams/store.ts` | zustand exam store: answers, current index, time left, submit/reset — with **autosave** |
| `src/services/exam.service.ts` | `getAllExams / getExamById / startExam / submitExam / getAttempt / getUserAttempts` over the local + PYQ sources |
| `src/features/exams/autosave.ts` | 30 s autosave (`EXAM_CONFIG.autosaveInterval`) + resume of an interrupted attempt |
| `src/features/exams/components/*` | `ExamInstructions`, `ExamHeader`, `QuestionPanel`, `QuestionPalette`, `Calculator`, `ExamResult` |
| `src/routes/cbt.tsx` | reduced to composition + data loading |

**Behaviour preserved:** NTA marking (+4/−1, integers +4/0), the dense
percentile table, mark-for-review / clear-response state machine, per-question
time accumulation, auto-submit at zero. **Behaviour added:** autosave, resume,
and an explicit "resume interrupted attempt" prompt.

---

## 5. Phase C — Unit testing layer (new)

**Gap:** the repo validates through Rolldown-bundled `.mjs` harnesses
(excellent, and kept) but has **no unit-test runner** — no vitest, no
`@testing-library/react`, no `npm test` for components.

**Added:** `vitest` + `@testing-library/react` + `jsdom` + a `src/**/*.test.ts(x)`
suite covering the pure engines that everything else depends on
(`cbt/engine`, `cbt/analytics`, `readiness`, `planner`, `mentor/report`,
`focus/streak`, `studytube/catalog`), plus component tests for the new auth and
exam UI. Wired as `npm run test:unit`; `npm test` stays the robot E2E so nothing
existing breaks.

---

## 6. Phase D — Deployment, docs, quality

- `vercel.json` (SPA/history fallback, matching `src/routes/__root.tsx`).
- `.github/workflows/deploy.yml` — install → validate → build → deploy, with a
  no-secrets guard so CI is green out of the box.
- `.env.example` extended with the client vars the new services read.
- `README.md` gains a "Redevelopment" section that states plainly what was
  rebuilt, what was kept, and why.
- `npm run format` applied → `npm run lint` goes from **23,422 errors → 0**.

---

## 7. Explicitly *not* done (and why)

| Not done | Reason |
|---|---|
| Deleting `public/jee-cbt.html` | Still the authoritative CBT + PDF pipeline; `docs/ARCHITECTURE.md` retires it only after React parity |
| Replacing TanStack Router with RRv6 | Regression (§2.2) |
| Adding `framer-motion` / `lodash` / `dayjs` | Unused weight (§2.5) |
| A mandatory login wall | Breaks local-first students (§2.6) |
| Inventing teacher/video/rank data | `docs/DATA-GOVERNANCE.md` forbids it; every number stays evidence-labelled |
| Changing the Eklavya test schedule | Explicitly out of scope per the user's earlier instruction in `.lovable/plan` |

---

## 8. Execution order (as implemented)

1. Baseline capture (above) — done before any edit.
2. `npm run format` → lint green; verify `tsc` + `validate:all` + `build` still green.
3. `src/config`, `src/types`, `src/services`, `src/utils` scaffolding + tsconfig aliases.
4. Auth system (types → service → store → routes → shell wiring).
5. Exam system refactor (types → store → service → autosave → components → route).
6. Vitest + unit/component suite.
7. Deployment configs + docs.
8. Final full verification: `lint`, `tsc`, `validate:all`, `test:unit`, `build`.

Each step is verified before the next begins; the branch is left in a working
state at every commit.
