# NTACBT — JEE / CBSE Learning Operating System

NTACBT is a single integrated learning system for JEE Main, JEE Advanced, and CBSE Class 11/12 students. It combines adaptive planning, NTA-style CBT practice, PYQ practice, deep analytics, intent-aware video discovery, focus tools, and a context-aware AI tutor (Saarthi) around one central loop:

**GOAL → SYLLABUS → DIAGNOSTIC → PLAN → LEARN → PRACTICE → PYQ → TEST → ANALYSE → FIX WEAKNESS → REVISE → RETEST → ADAPT**

## Current technical state (Phases 0–3 landed)

- **Framework:** TanStack Start + Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui.
- **React app shell (`/app`):** Mission Control dashboard, adaptive planner view, StudyTube discovery, PYQ paper browser, analytics, focus timer, and Saarthi AI chat — all reading the existing legacy data without destroying it.
- **Legacy product (`public/jee-cbt.html`):** still the authoritative NTA-style CBT + PDF pipeline + deep analytics. The `/` route and "Full platform" link open it. React features read its `localStorage["jeecbt.v1"]` state.
- **Server routes:** `/api/public/study-planner`, `/live-classes`, `/ai-chat`, `/pdf-reformat`, `/pyq-papers`, `/cloud-config`.
- **Data:** structured official JEE syllabus (`src/data/syllabus.ts`), verified faculty catalog (`src/data/teachers.ts`), baked PYQ papers (`public/pyq/`), Supabase public test library + planner imports + anonymous score leaderboard.
- **New persistence contracts:** `src/lib/store.ts` (versioned, read-only bridge over legacy state), `src/features/academics/*` (source-of-truth types), `src/features/readiness/readiness.ts` (deterministic mission/readiness engine).
- **Academic source of truth (Phase 2):** `src/features/academics/index.ts` now adapts official syllabus + verified faculty + the legacy planner literals (`src/data/sot/legacy-inline.json`). The legacy literals are extracted non-destructively by `npm run extract:legacy` and validated by `npm run validate:sot`. React StudyTube reads the legacy planner/faculty data for today's topic, weak topic and teacher preference.
- **StudyTube (Phase 3):** `src/features/studytube/progress.ts` stores watched/notes/watch-later/handshake state under `ntacbt.studytube.v1`. `/app/studytube/$video` is Study Theater: embedded official YouTube player + learning workspace (Notes, Chapter, Formulae, PYQs, Saarthi, Progress) and the watch→practice handshake (active recall → targeted PYQs → mastery → schedule revision). List cards now navigate into the theater instead of opening a raw YouTube tab.
- **Android:** Focus-Guard accessibility app with launcher mode and reminders (`android/`).
- **PWA:** offline-capable service worker (note: precache currently reports empty; runtime caching still works after first load — a known Phase 8 item).

Read the full audit and migration plan in [`docs/PHASE0-AUDIT.md`](docs/PHASE0-AUDIT.md), the AI-planner robustness audit in [`docs/PLANNER-AUDIT.md`](docs/PLANNER-AUDIT.md), the full-platform audit in [`docs/FULL-PLATFORM-AUDIT.md`](docs/FULL-PLATFORM-AUDIT.md), the target structure in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the data governance rules in [`docs/DATA-GOVERNANCE.md`](docs/DATA-GOVERNANCE.md).

## Why not a blind rewrite

The legacy app contains a working, valuable NTA-style CBT engine and rich analytics. The plan is incremental migration: keep `jee-cbt.html` alive as the compatibility surface, add progressively-migrated React feature routes, split the data into a single typed source-of-truth, and never fabricate academic data.

## Development

```sh
npm install
npm run dev
```

## Testing

```sh
npm test               # legacy app E2E (112 robot checks)
npm run test:unit      # vitest unit + component suite (151 tests)
npm run test:watch     # vitest in watch mode
npm run validate:all   # every data validator + harness + unit tests
```

## Validation & build

```sh
npm run lint
npm run validate:all        # every validator + all harnesses (no network)
npm run validate:planner    # AI-planner harness (1,212 scenarios / 39k+ assertions, incl. verified board videos)
npm run validate:full       # full-platform harness (3,202 cases)
npm run validate:mentor     # AI Mentor report harness (600 synthetic students / 618 reports)
npm run robot-test          # legacy app E2E (112 checks)
npm run build
```

## Key contracts

- Academic source-of-truth: `src/features/academics/`
- Syllabus: `src/data/syllabus.ts`
- Teachers/institutes: `src/data/teachers.ts`
- PYQ bake: `scripts/build-pyq.mjs`
- CBSE syllabus builder: `scripts/build-cbse-syllabus.mjs`
- Android app: `android/`

---

## Redevelopment round (2026-09-28)

A "rebuild from scratch" brief (`redevlopment.txt`) was supplied alongside this
repo. It describes the project as _"a basic CBT application requiring complete
modernization"_ and asks for a clean-slate `npm create vite` rebuild with a
generic login / exam / dashboard skeleton.

**That premise no longer matches reality**, so the round was replanned instead of
executed literally: NTACBT is now a JEE/CBSE learning OS with 113 TS/TSX modules,
a typed NTA grading engine, an AI planner, a StudyTube engine, a deterministic
mentor-report engine, verified syllabus/teacher data, an Android app and a PWA —
all covered by 9 validators and 5 harnesses. Wiping it would have destroyed
working, validated, data-bearing product and replaced it with something strictly
less capable.

The brief's _intent_ was kept and its _method_ dropped. What actually shipped:

| Brief item                                                                               | Outcome                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Clean slate" rebuild                                                                    | **Rejected** — see [`docs/REDEVELOPMENT-PLAN.md`](docs/REDEVELOPMENT-PLAN.md) §2.1                                                                                                               |
| Auth system (Phase 4)                                                                    | **Built** — `src/types/auth.types.ts`, `src/services/auth.service.ts`, `src/features/auth/*`, `/app/auth/login`, `/app/auth/register`, `/app/profile`                                            |
| Exam system (Phase 5)                                                                    | **Refactored** — the 954-line `/cbt` route split into `src/types/exam.types.ts`, `src/features/exams/{store,autosave,components/*}`, `src/services/exam.service.ts`; **autosave + resume added** |
| Unit tests (vitest / RTL)                                                                | **Added** — 131 tests across engine, auth, exams, exam UI, search, nav, StudentContext and its React binding                                                                                     |
| Zero ESLint errors                                                                       | **Fixed** — 23,422 prettier errors → 0 errors (9 warnings, all in vendored `src/components/ui/*`)                                                                                                |
| Deployment (Vercel / CI)                                                                 | **Added** — `vercel.json`, `.github/workflows/deploy.yml` (guarded so CI is green without Vercel secrets)                                                                                        |
| `react-router-dom`, `tailwind.config.js`, `postcss.config.js`, `framer-motion`, `lodash` | **Not adopted** — TanStack Router and Tailwind v4 already do these jobs better; see §2.2–2.5                                                                                                     |
| Mandatory login wall                                                                     | **Rejected** — NTACBT is local-first; an account is optional and never gates a student's own data                                                                                                |
| Cross-scope leakage (a CBSE student shown JEE content)                                   | **Fixed** — `src/features/context/*`: one persisted `StudentContext` read by every surface, seeded from the legacy blob, plus `checkScopeLeak`                                                   |
| Data provenance / fabricated numbers                                                     | **Fixed** — `src/features/academics/source.ts`: one canonical `Source` record on every dataset, a `SOURCE_RECORDS` registry, and `scripts/validate-sources.mjs` (35 checks) in `validate:all`    |
| Rank / percentile prediction presented as fact                                           | **Fixed** — `src/features/readiness/predict.ts`: labelled estimates with the evidence attached, and "Not enough data to estimate reliably" instead of a confident AIR from one attempt           |

Full reasoning, the measured baseline, and the explicit not-done list are in
[`docs/REDEVELOPMENT-PLAN.md`](docs/REDEVELOPMENT-PLAN.md) and
[`docs/REDEVELOPMENT-STATUS.md`](docs/REDEVELOPMENT-STATUS.md).

## Project history note

This repository was originally generated with [Lovable](https://lovable.dev); see `AGENTS.md` for the history-preservation policy before pushing/rebasing shared branches.
