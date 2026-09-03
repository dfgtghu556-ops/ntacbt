# NTACBT — JEE / CBSE Learning Operating System

NTACBT is a single integrated learning system for JEE Main, JEE Advanced, and CBSE Class 11/12 students. It combines adaptive planning, NTA-style CBT practice, PYQ practice, deep analytics, intent-aware video discovery, focus tools, and a context-aware AI tutor (Saarthi) around one central loop:

**GOAL → SYLLABUS → DIAGNOSTIC → PLAN → LEARN → PRACTICE → PYQ → TEST → ANALYSE → FIX WEAKNESS → REVISE → RETEST → ADAPT**

## Current technical state (Phase 0 + Phase 1 complete)

- **Framework:** TanStack Start + Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui.
- **React app shell (`/app`):** Mission Control dashboard, adaptive planner view, StudyTube discovery, PYQ paper browser, analytics, focus timer, and Saarthi AI chat — all reading the existing legacy data without destroying it.
- **Legacy product (`public/jee-cbt.html`):** still the authoritative NTA-style CBT + PDF pipeline + deep analytics. The `/` route and "Full platform" link open it. React features read its `localStorage["jeecbt.v1"]` state.
- **Server routes:** `/api/public/study-planner`, `/live-classes`, `/ai-chat`, `/pdf-reformat`, `/pyq-papers`, `/cloud-config`.
- **Data:** structured official JEE syllabus (`src/data/syllabus.ts`), verified faculty catalog (`src/data/teachers.ts`), baked PYQ papers (`public/pyq/`), Supabase public test library + planner imports + anonymous score leaderboard.
- **New persistence contracts:** `src/lib/store.ts` (versioned, read-only bridge over legacy state), `src/features/academics/*` (source-of-truth types), `src/features/readiness/readiness.ts` (deterministic mission/readiness engine).
- **Android:** Focus-Guard accessibility app with launcher mode and reminders (`android/`).
- **PWA:** offline-capable service worker (note: precache currently reports empty; runtime caching still works after first load — a known Phase 8 item).

Read the full audit and migration plan in [`docs/PHASE0-AUDIT.md`](docs/PHASE0-AUDIT.md), the target structure in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the data governance rules in [`docs/DATA-GOVERNANCE.md`](docs/DATA-GOVERNANCE.md).

## Why not a blind rewrite

The legacy app contains a working, valuable NTA-style CBT engine and rich analytics. The plan is incremental migration: keep `jee-cbt.html` alive as the compatibility surface, add progressively-migrated React feature routes, split the data into a single typed source-of-truth, and never fabricate academic data.

## Development

```sh
npm install
npm run dev
```

## Validation & build

```sh
npm run lint
npm run validate:all
npm run build
```

## Key contracts

- Academic source-of-truth: `src/features/academics/`
- Syllabus: `src/data/syllabus.ts`
- Teachers/institutes: `src/data/teachers.ts`
- PYQ bake: `scripts/build-pyq.mjs`
- CBSE syllabus builder: `scripts/build-cbse-syllabus.mjs`
- Android app: `android/`

## Project history note

This repository was originally generated with [Lovable](https://lovable.dev); see `AGENTS.md` for the history-preservation policy before pushing/rebasing shared branches.
