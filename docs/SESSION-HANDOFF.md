# NTACBT — Session Handoff

**Written:** 2026-10-16, 18:20–18:35 UTC
**Written by:** Arena AI agent (verification pass, no product changes)
**Purpose:** a truthful handover. Every field below was measured in this session
or is explicitly marked *unverified*. Nothing here is a guess.

**How to read this file.** Fields that could not be established from the
repository or the network are marked **UNVERIFIED** with the reason. They are not
filled with plausible-sounding values. Section I holds exactly one action.

---

## A. Project identity

| Field | Value |
| --- | --- |
| Product | NTACBT — JEE / CBSE Learning Operating System |
| Live URL (user-supplied) | <https://ntacbt.lovable.app> — **live, but not on HEAD** (see B) |
| Secondary URL in every canonical | `https://ntacbt.vercel.app` — **serves a different, older app** (see G-1/G-2) |
| Repository | <https://github.com/dfgtghu556-ops/ntacbt> |
| Goal | Improve and redesign the existing JEE/Class 12 learning application **without losing working functionality or student data** |
| Tools | ChatGPT, Lovable, Arena AI |
| Stack | TanStack Start + Vite 8 + React 19 + TypeScript + Tailwind v4 + shadcn/ui |
| Source size | 267 `.ts`/`.tsx` files under `src/`, 54,462 lines; 22 feature modules; 36 routes |
| Legacy surface | `public/jee-cbt.html` + `public/js/app.js` (27,457 lines) + `public/css/legacy.css` — authoritative CBT/PDF/analytics engine, still alive |

---

## B. Current verified state

| Field | Verified value |
| --- | --- |
| Date and time | 2026-10-16, 18:20–18:35 UTC |
| Current branch | `arena/0dfc5fa9-ntacbt` (session branch), forked from `main` @ `041ff13` |
| Latest verified commit | `041ff139681edc094a51f7e3fe40ac268b3d9117` — "Merge pull request #14 from dfgtghu556-ops/arena/01a0e8ab-ntacbt", authored 2026-09-30T19:27:07Z |
| Working tree | **clean** (verified `git status --short` empty at end of session) |
| Current deployed version | **Not HEAD.** See the three rows below — this is the single biggest finding of this session. |
| Build status | **PASS.** `npm run build` → exit 0, emits `.vercel/output/` (Vercel Build Output API v3). `NITRO_PRESET=node-server npx vite build` → exit 0, 24 routes 200 / 1× 307 / 1× 404, SSR HTML 32–133 KB per route |
| Automated test status | **PASS** — full table below |
| Manual test status | **NOT DONE — no browser in this sandbox.** Verified: no `chromium` / `chromrome` / `google-chrome` / Playwright / Puppeteer binary. Nothing has ever been visually confirmed at any viewport width (also stated in `docs/DEPLOYMENT-READINESS.md` §"What could NOT be verified") |
| Evidence checked | See the command/evidence table below |

### B.1 Automated test status — every gate, run in this session

| Gate | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | **0 errors** |
| Unit + component | `npx vitest run` | **979 passed / 0 failed, 56 files** |
| Data + engine + harnesses | `npm run validate:all` | **exit 0** (10 validators + 4 harnesses + the full vitest suite) |
| Legacy E2E | `npm test` (`scripts/robot-test.mjs`) | **112 passed / 0 failed** |
| Lint | `npx eslint scripts src` | **0 errors, 9 warnings** (all pre-existing `react-refresh/only-export-components`) |
| Lint, strict | `npx eslint scripts src --max-warnings=0` | exit **1** — by design, on those same 9 warnings. Not a regression |
| Dead-wire audit | `node scripts/audit-wires.mjs` | 0 hard failures, 0 warnings (64 `go()` targets, 51 element ids, 6 API routes) |
| Click audit | `node scripts/audit-clicks.mjs` | 20 passed, 0 failed, 0 external navs |
| Responsive audit | `node scripts/audit-responsive.mjs` | 0 high, 0 medium, 0 low, 16 info (11 unused `ui/*` primitives + 5 `min-h-screen` containers) |
| Production build | `npm run build` | exit 0 |
| Production bundle routes | `node .output/server/index.mjs` | 24× 200, `/app/search` 307 (documented), unknown path 404 |

> **Two traps worth knowing before the next session trusts a red build.**
> 1. `npm run validate:all` **fails on a clean tree** with
>    `Cannot read …/public/pyq: ENOENT`. `public/pyq/` is gitignored and is
>    *baked at build time* by `scripts/build-pyq.mjs`. The validator chain has no
>    bake step, and it is an `&&` chain — so one missing artifact aborts the
>    remaining 12 validators. **Run `npm run build` (or `npm run bake-pyq`) first.**
> 2. `npx vitest run` reports **976 passed + 3 skipped** before the bake and
>    **979 passed** after it. 3 tests are conditional on the baked PYQ store.

### B.2 Current deployed version — three separate facts, all verified

| Host | What it actually serves | Evidence |
| --- | --- | --- |
| `https://ntacbt.lovable.app` | **The app, but a build from before 2026-09-29T08:00:20Z** — roughly 17 days behind HEAD | `/app/memory` → **404** (route created 2026-09-29T08:00:20Z, `9c329851`); `/app/map` → **404** (created 2026-09-29T08:51:25Z, `32675bc9`); `/sitemap.xml` → **404**; `/robots.txt` is the pre-2026-09-29 version (no `Disallow`, no `Sitemap:` directive); `/app/studytube` still renders the pre-PR-14 layout with "Open in YouTube" outbound links, not the YouTube-shaped theater |
| `https://ntacbt.vercel.app` | **A completely different, older app** — the "JEE CBT Dashboard — Premium Education" single-page build (Telegram channel credit, `dashboard-cleanup-23.preview.emergentagent.com` image). `/app/analytics` → **404**. Not this repository's current code | `fetch_page` on `/` and `/app/analytics` |
| GitHub deployment records | **Every Vercel deployment is recorded as `failure`** — including Production for `041ff13` and three Previews | `gh api repos/…/deployments` + `/deployments/{id}/statuses` → `state: "failure"`, "Deployment has failed — run this Vercel CLI command: npx vercel inspect dpl_9AKNmNgwFDuhQ3NK4mCy4n6HDdZr --logs" |

**What works on the live Lovable host (verified by fetching it):** `/` (redirects
to `jee-cbt.html#dash`), `/app`, `/app/analytics`, `/app/pyq`, `/app/focus`,
`/app/report`, `/app/studytube`, and `/api/public/pyq-papers` (returns the full
historical library). The legacy `jee-cbt.html` dashboard renders with all its
feature surfaces.

**What HEAD serves that the live host does not:** `/app/map`, `/app/memory`,
`/sitemap.xml`, the new `robots.txt`, the YouTube-shaped StudyTube, the
per-route social cards and JSON-LD, and the publishing round's SSR content.

---

## C. Product decisions

### Approved product vision
From `README.md` and `docs/REDEVELOPMENT-STATUS.md`, all previously agreed:

- NTACBT is a **JEE/CBSE Learning OS**, not a generic CBT shell. The central
  loop is `GOAL → SYLLABUS → DIAGNOSTIC → PLAN → LEARN → PRACTICE → PYQ → TEST
  → ANALYSE → FIX WEAKNESS → REVISE → RETEST → ADAPT`.
- **Incremental migration, never a blind rewrite.** A "clean slate" rebuild was
  explicitly **rejected** — it would have destroyed working, validated,
  data-bearing product (`docs/REDEVELOPMENT-PLAN.md` §2.1).
- **Local-first.** An account is optional and never gates a student's own data.
- **Honesty is a product feature.** No fabricated academic data, no predicted
  rank, no public leaderboard, no ads. Estimates are labelled as estimates with
  their evidence attached, and "not enough data to estimate reliably" is an
  accepted answer.
- **Bilingual copy** — Hinglish in student-facing surfaces, plain English in
  engineering surfaces.

### Approved design direction

- Orange brand identity; mission-control dashboard; two lanes (JEE / Board).
- **YouTube-shaped StudyTube** (PR #14): horizontal shelves at every width with
  paging arrows from `lg`, sticky filter row above the shelves, search in the
  sticky toolbar, hero compacted *inside* the card.
- **Dark mode is CSS-only** — `public/js/app.js` is not to be touched for theme
  work (`docs/UI-UX-PLAN.md`).
- **Page-hero pattern is pinned by a test**: `rounded-2xl … p-6 sm:p-8` on every
  page. Changing one hero alone is a regression (`src/test/dashboard-ia.test.ts`).
- Mobile-first; a 9th-grade student on a low-end phone is the target device.

### Approved navigation

- **Two surfaces, deliberately.** `/` opens the legacy `public/jee-cbt.html`
  (the authoritative NTA-style CBT + PDF pipeline + deep analytics). The React
  Learning OS lives at `/app` and reads the same `localStorage["jeecbt.v1"]`
  state.
- The root redirect was made real-content and then **reverted** on 2026-09-29
  (`7db4549` → `a1b90627`, "Revert the site-root change that stopped the CBT
  window opening"). **The redirect is intentional in HEAD.**
- `/app` shell already has a `sticky top-0 z-30 h-14` header with a centred
  `max-w-xl` search and a `fixed top-14 bottom-0 left-0 w-52` sidebar rendering
  `NavPanel`. Do not build duplicates of these.

### Non-negotiable requirements

1. **Preserve student data.** The legacy blob `jeecbt.v1` and the `ntacbt.*`
   keys are the students' own progress. Never migrate destructively.
2. **Never fabricate academic content.** Every dataset carries a canonical
   `Source` record; `scripts/validate-sources.mjs` enforces it.
3. **The full gate must stay green**: `tsc --noEmit` · `eslint` · `vitest` ·
   `validate:all` · `build`.
4. **Do not rewrite published git history** — no force-push, no rebase/amend of
   pushed commits. Lovable syncs from the connected branch and the user loses
   project history (`AGENTS.md`).
5. **NTA keys and solutions must stay exact** (ranges, accepted values, bonus
   questions).
6. **No public leaderboard, no ads, no blind CSP, no AstroJS rewrite.**
7. **No browser exists in this sandbox** — never claim a visual/manual result.

### Decisions still awaiting user approval

| # | Decision | Why it is open |
| --- | --- | --- |
| 1 | **Which host is the production domain of record** — `ntacbt.lovable.app` (live, stale) or `ntacbt.vercel.app` (failing, serving an unrelated old app)? | Every canonical, `og:url`, sitemap entry and `robots.txt` `Sitemap:` line points at `ntacbt.vercel.app` via `src/config/site.ts` `FALLBACK` and `scripts/build-sitemap.mjs` `SITE_URL`. Overridable with `VITE_SITE_URL` at build time. **Not decided.** |
| 2 | **Re-deploy now?** | The live host is ~17 days stale and every Vercel deploy is failing. Nothing has been cut from HEAD. |
| 3 | **CI vs Vercel Git integration** | `.github/workflows/deploy.yml` is written but untracked (GitHub App lacks `workflows` permission). Today nothing runs the gate automatically. `docs/DEPLOYMENT-READINESS.md` §3. |
| 4 | **AI secrets in Vercel, or accept the 503s** | `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `LOVABLE_API_KEY` unset ⇒ Saarthi chat and PDF reformat return a clear 503. `docs/DEPLOYMENT-READINESS.md` §2. |
| 5 | **Teacher channel URLs** | No teacher record has a verifiable channel URL. Supply URLs, or accept honest labelling instead of hiding the teacher picker. |
| 6 | **Legacy PDF paper builder** | The React planner still cannot parse an arbitrary student PDF; the legacy shell can and is kept for exactly that. Product decision, not engineering. |
| 7 | **A6 peer/study-partner layer** | Deliberately deferred — highest-risk feature in the set; there is no peer data source, so a leaderboard would be a rendered lie. |
| 8 | **A1 Snap & Solve** | Needs a vision-model API key the environment does not have. |

---

## D. Completed work

### D.1 This session (2026-10-16)

| What changed | Files | Commit | Tests | Manual evidence | Limitations |
| --- | --- | --- | --- | --- | --- |
| Full state verification; no product code touched | — | see D.2 | `tsc` 0 · `vitest` 979/979 · `validate:all` exit 0 · `robot` 112/112 · `eslint` 0 errors · `audit` ×3 clean · `build` exit 0 · 24 routes 200 on the production bundle | Live-host route probes (`/`, `/app`, `/app/analytics`, `/app/pyq`, `/app/focus`, `/app/report`, `/app/studytube`, `/app/map`, `/app/memory`, `/sitemap.xml`, `/robots.txt`, `/api/public/pyq-papers`) | No browser ⇒ no visual confirmation |
| `.vercel/` added to `.gitignore` — the Vercel Build Output artifact is 8.8 MB and was one `git add -A` away from being committed. This is item 1 of "Must be done before deployment" in `docs/DEPLOYMENT-READINESS.md` | `.gitignore` | included in D.2 commit | `git status` clean; `.vercel/` now ignored | `git check-ignore -v .vercel` | None |
| This handoff document | `docs/SESSION-HANDOFF.md` | included in D.2 commit | — | — | — |

### D.2 Prior milestones (all merged into `main`; 14 merged PRs, no open PRs)

| # | PR | Merged | What shipped |
| --- | --- | --- | --- |
| 1–4 | #1–#4 | 2026-08-21 | Premium UI, swipe navigation, AI upgrades, swipe-lag + chat-jitter fixes, real NTA percentile/rank data, hybrid PDF parsing, insight engine, tabbed layouts, SVG icons |
| 5 | #5 | 2026-08-22 | Saarthi 2.0 (OpenRouter + personal mentor) and video solutions on every question |
| 6 | #6 | 2026-08-22 | Complete platform upgrade: hybrid PDF parsing, insight engine, tabbed layouts, SVG icons, NTA exam flow, bug fixes |
| 7 | #7 | 2026-08-23 | Device optimization pass, subtle swipe animation, free Live Classes finder |
| 8 | #8 | 2026-08-24 | PYQ papers 2002–2026 baked into the site |
| 9 | #9 | 2026-08-25 | PYQ persistence, review restore, clean question text, baked images, community compare, chapter-wise PYQ, weekly report |
| 10 | #10 | 2026-09-01 | Uploaded PDFs routed to the on-device PYQ section |
| 11 | #11 | 2026-09-03 | Full orange JEE platform + improvement pass (readiness, analytics, launcher, play/practice/sync) |
| 12 | #12 | 2026-09-04 | Split legacy HTML → external CSS/JS, applied research, 10+ real bugs, launcher drawer, real icons |
| 13 | #13 | 2026-09-06 | Deploy hardening: dead-button + crash audit, instant app drawer, static & click audits |
| 14 | #14 | 2026-09-30 | Measured device optimisation, YouTube-shaped StudyTube (`5d84fb5`→`5f81666`→`4872c278`) |

**Non-PR work on `main` between them** (commits, not PRs): the Phase 0–6 rebuild
(Phases A–E, auth, exam refactor, 182→979 unit tests, StudentContext scope
isolation, provenance, mastery, curriculum map, dashboard IA, parent/mentor
report, audio summary, PWA, Memory Locker, Today's DPP, XP/badges, pagination,
accessibility, notifications, shell bridge, onboarding, goal-based to-do engine,
auto re-plan, result-page order, deep-analytics disclosure, build integrity
gate, dataset loading and review pagination), the deploy-target fix (§29), and
the publishing round `166e33b` → `7db4549` (SSR content, per-route meta, sitemap
+ robots, JSON-LD, legal pages, 500 page, social cards, `/app/map` and
`/app/studytube` server-rendered).

---

## E. Current task

> **Status: PROPOSED — not user-approved.** It is the highest-value task that
> the verified state in B supports, and it is what section I points at. Confirm
> with the user before changing product code.

| Field | Value |
| --- | --- |
| Task ID | `NTACBT-01` |
| Task name | **Restore deployment parity and fix the canonical domain** |
| User problem | A student opening <https://ntacbt.lovable.app> gets a build that is ~17 days behind the repository: the Syllabus Map, Memory Locker, sitemap and the YouTube-shaped StudyTube are simply not there. Meanwhile every canonical tag, `og:url`, sitemap entry and `robots.txt` points at `https://ntacbt.vercel.app`, which serves a *different* app and 404s on `/app/*`. The site tells search engines its real pages live on a host that does not have them. |
| Expected outcome | The live host serves the current `main` build; the canonical host matches the live host; the Vercel deployments stop failing. |
| Scope **included** | (a) Decide the production domain of record (decision C-1) and set `VITE_SITE_URL` at build time; (b) make the Vercel deploy succeed and/or cut a fresh Lovable build from `main`; (c) align `src/config/site.ts` `FALLBACK` and `scripts/build-sitemap.mjs` `SITE_URL` with that decision; (d) re-verify the 24 routes on the real production bundle. |
| Scope **excluded** | Any redesign or new feature. Any change to the exam engine, grading, PYQ keys, planner logic, or the legacy `jee-cbt.html` behaviour. Any migration of student data. Any change to the analytics/readiness maths. |
| Files / components involved | `src/config/site.ts`, `scripts/build-sitemap.mjs`, `public/sitemap.xml`, `public/robots.txt`, `vercel.json`, `.github/workflows/deploy.yml` (to be committed), `vite.config.ts` (Nitro preset), `src/routes/index.tsx` (root redirect — do not change), `docs/DEPLOYMENT-READINESS.md` |
| Acceptance criteria | 1. `https://ntacbt.lovable.app/app/map`, `/app/memory`, `/sitemap.xml` all return **200**.<br>2. Exactly **one** canonical per route, all on the live host.<br>3. `robots.txt` carries the `Sitemap:` directive pointing at the live host.<br>4. All 16 sitemap URLs return 200 on the deployed host.<br>5. `npm run build` exit 0; `.vercel/output/` present and not committed.<br>6. `tsc` 0 · `vitest` 979/979 · `validate:all` exit 0 · `robot` 112/112 · `eslint` 0 errors.<br>7. Student data intact: the `jeecbt.v1` blob and `ntacbt.*` keys are unchanged by the deploy. |
| Required tests | The full gate in B.1, plus a route sweep of the **deployed** host (not the dev server, not a local preview) — the failure mode that matters is one that only appears in production. |
| Dependencies and risks | **Risk: a fresh deploy could break the working live build.** The live build is the only artifact students currently have; `041ff13` has never been confirmed on any host. Mitigation: cut the new build to a *preview* first, sweep the 24 routes, and only then promote. **Risk: Lovable's build pipeline is opaque** — it may not run `npm run build` (which is what bakes `public/pyq/` and the sitemap). **Risk: `public/pyq` bake depends on HuggingFace reachability**, which failed in this sandbox. **Risk: changing `SITE_URL` alters every canonical** — treat it as one atomic change, never partially. |

---

## F. Existing functionality to preserve

Status is *verified in this session* unless marked. "Verified" = present in the
code, exercised by the suite, and (where noted) confirmed on the live host.

| Area | Status | Evidence / notes |
| --- | --- | --- |
| **PYQ bank and datasets** | ✅ Working — 5 papers / 375 questions bake in this sandbox; the API serves the **full historical library** (verified live: 2023 & 2024 sessions/shifts returned) | `data/jee2026/transcribed/*.json` (5 files, committed), `scripts/build-pyq.mjs` → `public/pyq/` (gitignored, baked), `src/routes/api/public/pyq-papers.ts` (HuggingFace parquet), `scripts/validate-jee2026.mjs`, `validate-pyq-store.mjs`, `validate-sources.mjs` |
| **CBT exam engine, timer, autosave, scoring** | ✅ Working, refactored and tested | `src/routes/cbt.tsx` + `src/features/exams/{store,autosave,types,attempt-lookup,use-exam-keys}` + `src/features/exams/components/*` + `src/types/exam.types.ts` + `src/services/exam.service.ts`; legacy engine in `public/js/app.js`; tests `engine`, `engines`, `exams`, `exam-ui`, `cbt-exit-guard` |
| **Class 11 / Class 12 separation** | ✅ Working, enforced at import | `src/features/curriculum/map.ts` + `assertClassLevelIsolation` (throws at import if a chapter id/name/number repeats across class levels); `scripts/validate-curriculum.mjs` loads the registry and checks both maps |
| **JEE Main / JEE Advanced / CBSE workflows** | ✅ Working | `src/data/syllabus.ts`, `src/data/sot/legacy-inline.json`, `src/features/context` scope (one persisted `StudentContext` read by every surface) + `checkScopeLeak`; CBSE syllabus builder `scripts/build-cbse-syllabus.mjs` |
| **Planner and task persistence** | ✅ Working | `src/features/planner/*` (engine, adapt, coverage, scope, today, todo, todo-store, normalize) + `src/features/planner/todo-store.ts`; keys `ntacbt.todo.done.v1` and legacy `jeecbt.v1`; `scripts/validate-planner.mjs` (1,212 scenarios) |
| **StudyTube and watch progress** | ✅ Working — **but the live host runs the OLD StudyTube** | `src/features/studytube/{progress,service,catalog,types,components}`; key `ntacbt.studytube.v1`; watch→practice handshake; theater at `/app/studytube/$video`. Live host still shows "Open in YouTube" links (pre-PR-14) |
| **Saarthi AI and analytics** | ✅ Working; **AI needs a key to be live** | `src/features/mentor/{report,speech}`, `src/features/readiness/*`, `src/routes/app.saarthi.tsx`, `src/routes/api/public/ai-chat.ts` (503 with a clear message when no key — correct degradation); `scripts/validate-mentor.mjs` (600 synthetic students), `validate-analytics.mjs`, `validate-full.mjs` (3,202 cases) |
| **Notes, bookmarks, saved progress, settings** | ✅ Working | Legacy `jeecbt.v1` blob + `jeecbt.pyqIndex`, `jeecbt.userPyq`, `jeecbt.resume`, `jeecbt.ytTarget`; React `ntacbt.profile.v1`, `ntacbt.user.v1`, `ntacbt.backup` (`src/features/backup/*`), `ntacbt.lang`, `ntacbt.student.v1` |
| **Authentication, APIs and integrations** | ✅ Working, optional | `src/features/auth/{store,hooks}`, `src/services/auth.service.ts`, `src/types/auth.types.ts`, `src/integrations/supabase/*`, 6 migrations in `supabase/migrations/`; 6 server routes under `src/routes/api/public/`; `src/routes/app.auth.{login,register}.tsx`, `/app/profile` |
| **Focus tools, PWA, Android** | ✅ Working | `src/features/focus/{focus,streak,achievements,active-days}`, `src/features/pwa/{install,OfflineBanner}`, `public/sw.js` + `public/sw-classify.js` + `public/manifest.webmanifest` + `public/offline.html`; Android Focus-Guard app in `android/` (9 source files), released as GitHub release `app-latest` (2026-08-27), built by `.github/workflows/build-apk.yml` |

**Local-storage contract — do not break these keys:**
`jeecbt.v1` · `jeecbt.admin` · `jeecbt.aichat.v1` · `jeecbt.pyqIndex` · `jeecbt.resume`
· `jeecbt.userPyq` · `jeecbt.ytTarget` · `jeecbt.onboarded.v1` · `jeecbt.tab.*` ·
`ntacbt.auth.v1` · `ntacbt.backup` · `ntacbt.cbt.v1` · `ntacbt.exam.v1` ·
`ntacbt.focus.v1` · `ntacbt.lang` · `ntacbt.memory.v1` · `ntacbt.notify.quietHours` ·
`ntacbt.onboarded.v1` · `ntacbt.profile.v1` · `ntacbt.pwa.dismissedAt` ·
`ntacbt.streak.v1` · `ntacbt.student.v1` · `ntacbt.studytube.v1` ·
`ntacbt.todo.done.v1` · `ntacbt.user.v1` · `ntacbt.v2`

---

## G. Open issues and blockers

Ordered by severity. All were reproduced in this session unless marked.

### G-1 — Every Vercel deployment is failing · **Severity: Critical**

- **Description.** The GitHub deployment record for this repo shows Vercel
  builds that all end in `state: "failure"`, including the Production
  deployment of the current `main` (`041ff13`).
- **Reproduction.** `gh api repos/dfgtghu556-ops/ntacbt/deployments` then
  `gh api repos/…/deployments/{id}/statuses` → `state: "failure"`, description
  "Deployment has failed — run this Vercel CLI command: npx vercel inspect
  dpl_9AKNmNgwFDuhQ3NK4mCy4n6HDdZr --logs".
- **Expected vs actual.** Expected: a successful Production deployment of
  `041ff13`. Actual: failure, and `https://ntacbt.vercel.app` serves a
  completely different, older "Premium Education" dashboard app (its
  `/app/analytics` 404s).
- **Evidence / files.** `vercel.json` (buildCommand `npm run build`, no
  `outputDirectory` — the build emits `.vercel/output/`, the Build Output API
  layout); `vite.config.ts` (Nitro preset `vercel`); `docs/DEPLOYMENT-READINESS.md`.
- **Investigation so far.** The build artifact itself is **correct** — this is
  not a build failure, it is a *deploy* failure. `npx vercel inspect` could not
  be run: no Vercel credentials in this environment ("No existing credentials
  found").
- **Next diagnostic action.** Get Vercel credentials, then
  `npx vercel inspect dpl_9AKNmNgwFDuhQ3NK4mCy4n6HDdZr --logs` and read the
  build log to find the actual failure reason.

### G-2 — Live site is ~17 days behind HEAD · **Severity: Critical**

- **Description.** `https://ntacbt.lovable.app` serves a build that predates
  2026-09-29T08:00:20Z. Missing: `/app/map`, `/app/memory`, `/sitemap.xml`,
  the new `robots.txt`, per-route social cards and JSON-LD, and the
  YouTube-shaped StudyTube from PR #14.
- **Reproduction.** `fetch` `https://ntacbt.lovable.app/app/memory` → 404;
  `/app/map` → 404; `/sitemap.xml` → 404; `/robots.txt` → the pre-2026-09-29
  body with no `Disallow` and no `Sitemap:` line.
- **Expected vs actual.** Expected: the live host matches `main`. Actual: it
  does not, and it silently 404s on routes that exist in the repository.
- **Evidence.** Route creation dates from the GitHub API: `app.memory.tsx`
  `9c329851` 2026-09-29T08:00:20Z; `app.map.tsx` `32675bc9` 2026-09-29T08:51:25Z;
  `public/sitemap.xml` + build-time robots `aa3c908e` 2026-09-29T14:03:21Z.
- **Investigation so far.** The live build **does** contain the React `/app`
  and the legacy `jee-cbt.html`, so it is post-rebuild. It is a Lovable-side
  build, not a Vercel one. The Lovable build command and build env are not
  readable from this repository.
- **Next diagnostic action.** Check the Lovable project's build settings
  (build command, and whether `VITE_SITE_URL` / Supabase / AI secrets are set),
  then trigger a fresh build of `main` and diff the live route list.

### G-3 — Canonical host points at the wrong domain · **Severity: High**

- **Description.** Every absolute URL the app emits points at
  `https://ntacbt.vercel.app` — a host that does not serve this app. The live
  app is `https://ntacbt.lovable.app`.
- **Reproduction.** Production bundle: `curl localhost:3000/app | grep og:url`
  → `property="og:url" content="https://ntacbt.vercel.app/app"`. Built
  `public/sitemap.xml` → 16 `<loc>` entries all on `ntacbt.vercel.app`.
  `public/robots.txt` → `Sitemap: https://ntacbt.vercel.app/sitemap.xml`.
- **Expected vs actual.** Expected: canonicals on the live host. Actual: they
  point at a host that 404s on `/app/*` — a crawler is told to index pages
  that do not exist there.
- **Evidence / files.** `src/config/site.ts:13` `const FALLBACK = "https://ntacbt.vercel.app";`
  (overridable by `VITE_SITE_URL`); `scripts/build-sitemap.mjs:27`
  `const SITE_URL = (process.env.VITE_SITE_URL || "https://ntacbt.vercel.app")…`.
- **Investigation so far.** Whether the Lovable build sets `VITE_SITE_URL` is
  **UNVERIFIED** — that env lives in the Lovable project settings, not in the
  repo.
- **Next diagnostic action.** Read the live `/app` HTML for its `og:url` /
  `canonical` value. If it says `vercel.app`, set `VITE_SITE_URL` in the
  Lovable/Vercel build env and align both constants.

### G-4 — `npm run validate:all` fails on a clean tree · **Severity: Medium**

- **Description.** `npm run validate:all` aborts at the second validator with
  `Cannot read /home/user/ntacbt/public/pyq: ENOENT`, so the other 12
  validators and 4 harnesses never run.
- **Reproduction.** Fresh clone → `npm install` → `npm run validate:all`.
- **Expected vs actual.** Expected: the validation suite runs standalone.
  Actual: it requires a build artifact that only `npm run build` produces.
- **Evidence / files.** `scripts/validate-pyq-store.mjs` ("Run
  `node scripts/build-pyq.mjs` first — the store is baked at build time");
  `package.json` `validate:all` is an `&&` chain; `.gitignore` ignores
  `public/pyq/`.
- **Next diagnostic action.** Either add `node scripts/build-pyq.mjs &&` to the
  front of `validate:all`, or bake into a `pretest`/`prevalidate:all` hook.

### G-5 — `public/sitemap.xml` is tracked *and* regenerated at build time · **Severity: Low**

- **Description.** Every build rewrites `public/sitemap.xml` with today's
  `lastmod`, so the working tree is dirty after every build. The diff for this
  session was 16 lines changed (`2026-09-30` → `2026-10-16`).
- **Reproduction.** `npm run build` → `git status` shows ` M public/sitemap.xml`.
- **Evidence / files.** `scripts/build-sitemap.mjs:94` `const today = new
  Date().toISOString().slice(0,10);` writes into the tracked `public/` file.
- **Next diagnostic action.** Either gitignore the generated file and serve it
  from the build output only, or make the generator write a stable
  `lastmod` derived from git history.

### G-6 — No CI; the gate only runs when a human runs it · **Severity: Medium**

- **Description.** `.github/workflows/deploy.yml` is not in the repository
  (only `build-apk.yml` is tracked) because the GitHub App lacks the
  `workflows` permission. Nothing enforces `lint`/`tsc`/`validate:all`/`build`
  on push or PR.
- **Reproduction.** `gh api repos/dfgtghu556-ops/ntacbt/actions/workflows` →
  one workflow, "Build Android APK".
- **Evidence / files.** `docs/REDEVELOPMENT-STATUS.md` §9,
  `docs/DEPLOYMENT-READINESS.md` §3.
- **Next diagnostic action.** User decision: grant the App the `workflows`
  permission (then commit the file), or paste it via the GitHub web UI.

### G-7 — Live `/app/pyq` degrades to the baked fallback · **Severity: Medium**

- **Description.** The live PYQ page shows "Full library is temporarily
  unreachable — showing the papers baked into this build" and "Loading papers…",
  while `/api/public/pyq-papers` returns the full library on the same host.
- **Reproduction.** `fetch https://ntacbt.lovable.app/app/pyq`.
- **Expected vs actual.** Expected: the page loads the library the API can
  serve. Actual: the page falls back to the 5 baked papers.
- **Evidence / files.** `src/routes/app.pyq.tsx:115` —
  `fetch("/api/public/pyq-papers", { cache: "no-store" })`, with the catch
  falling through to `loadPaperIndex()` (the baked store).
- **Investigation so far.** The API route fetches a HuggingFace parquet with
  `AbortSignal.timeout(60_000)` (`src/routes/api/public/pyq-papers.ts:232`).
  A cold, uncached 60-second upstream fetch on the server is the most likely
  cause; `cache: "no-store"` guarantees the client never reuses a good
  response. The sandbox cannot reach HuggingFace at all (network allowlist:
  github.com, codeload, api.github.com, registry.npmjs.org, pypi.org,
  files.pythonhosted.org), so the same degradation reproduces locally for a
  different reason.
- **Next diagnostic action.** Add server-side caching to the API route and
  raise the client cache policy from `no-store` to a short `stale-while-
  revalidate`, then measure a cold page load on the deployed host.

### G-8 — `.env` is git-tracked · **Severity: Low (already downgraded once)**

- **Description.** `.env` is tracked in git. It contains
  `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` and their
  `VITE_` mirrors.
- **Correcting an older claim.** `docs/REDEVELOPMENT-STATUS.md` open item 1 says
  the tracked `.env` includes `SUPABASE_SERVICE_ROLE_KEY` and advises rotation.
  **That is stale.** The tracked `.env` has six keys and **no** service-role
  key; `docs/DEPLOYMENT-READINESS.md` §"`.env` holds only publishable values"
  already corrected this. The publishable/anon key is designed to be
  client-visible and the app is local-first, so the practical exposure is low.
- **Next diagnostic action.** Still worth `git rm --cached .env` + ignore,
  **but only after confirming the deploy pipeline does not read it from the
  repo** — that confirmation needs the user.

### G-9 — Documentation drift · **Severity: Low**

- **Description.** `docs/REDEVELOPMENT-STATUS.md` §"Publishing round" still
  lists "Site root is real content, not a redirect ✅ done `7db4549`". That
  change was **reverted** 13 minutes later by `a1b90627` ("Revert the site-root
  change that stopped the CBT window opening"). The status doc was written at
  15:54Z, the revert landed at 16:06Z, and the doc was never updated.
- **Expected vs actual.** Expected: the doc matches HEAD. Actual: it tells the
  next session the root is real content, when it is an intentional redirect.
- **Next diagnostic action.** Correct that one row in the publishing-round table
  and note the revert and its reason.

### G-10 — Phase 6 device QA never done · **Severity: Medium**

- **Description.** No layout has ever been visually confirmed at 320 / 375 /
  768 / 1440 px, in light or dark. Dark mode is applied by `public/js/app.js`,
  which no test exercises. StudyTube carousels have never been swipe-tested on
  a touch device.
- **Evidence.** `docs/DEPLOYMENT-READINESS.md` §"What could NOT be verified";
  no browser binary in this sandbox.
- **Next diagnostic action.** Run the app in a real browser (or a Playwright
  container) and walk the 5 breakpoints × light/dark matrix, capturing
  screenshots as evidence.

### G-11 — Carried-over open items (unchanged, from `docs/REDEVELOPMENT-STATUS.md` §"Open items for the user")

| Item | Severity | Next step |
| --- | --- | --- |
| 14 further JEE 2026 papers not transcribed (source PDFs gitignored and absent) | Low | Needs the source files from the user |
| A1 Snap & Solve needs a vision-model API key | Low | User supplies a key, or it stays dark |
| A6 peer/study-partner layer | Deferred on purpose | Do not build without a real peer data source |
| Legacy PDF paper builder vs React planner | Product decision | See C-6 |
| Teacher channel URLs | Medium | User supplies URLs or accepts honest labelling |
| Service-worker precache reports empty (runtime caching works after first load) | Low | Known Phase 8 item; worth a look when the app is redeployed |

---

## H. Git and recovery status

| Field | Value |
| --- | --- |
| Current branch and commit | `arena/0dfc5fa9-ntacbt` @ `041ff139681edc094a51f7e3fe40ac268b3d9117` (session branch, forked from `main`) |
| Last known-good commit | `041ff13` — the merge of PR #14, and the current `main` on the remote. The whole gate is green on it. `2818ffc` ("Measure device optimisation instead of asserting it") is the commit `docs/DEPLOYMENT-READINESS.md` was verified against |
| Uncommitted changes | **None.** The working tree was clean at session start; the build dirtied `public/sitemap.xml` and produced `.vercel/` and `.output/`, all of which were reverted/removed. `.gitignore` (`.vercel/`) and `docs/SESSION-HANDOFF.md` are the only intended changes |
| Open pull requests | **None.** 14 PRs, all merged. `gh pr list --state all` shows no open or draft PR |
| Remote branches | `main` = `041ff13` (identical to session HEAD), plus `ai-development` and `dfgtghu556-ops-patch-1` (both untouched, not ours) |
| Shallow clone | **Yes — `git rev-list --count HEAD` = 1.** The local repo has a single commit and a `.git/shallow` file. History was reconstructed from the GitHub API. Unshallow with `git fetch --unshallow` before doing any history-dependent work (bisect, rebase, `git log` on a file) |
| Migration or data risks | Student data lives in browser `localStorage` — **it is per-device and per-browser**, so a redeploy cannot lose it as long as the localStorage key names are unchanged (§F). The real risks are: (a) a redeploy that changes the root redirect or the `/app` shell would strand a student mid-session; (b) `public/pyq/` is a **build-time** bake — a build that cannot reach HuggingFace silently ships only 5 papers; (c) the tracked `.env` means a rotation would break the shared-library feature until the new values are deployed |
| Recovery / rollback instructions | `git checkout main && git pull` returns to the last known-good tree. To roll the *deployment* back, redeploy the previous good commit (`main` was never broken, so `041ff13` or any earlier merge is a valid rollback target). Because the local clone is shallow, unshallow first: `git fetch --unshallow origin`. **Never** force-push, rebase, amend or squash a pushed commit — `AGENTS.md` records that this rewrites history on Lovable's side and the user loses project history |
| Deployment status | **Lovable:** live at `https://ntacbt.lovable.app`, but on a **pre-2026-09-29T08:00Z** build (G-2). **Vercel:** every recorded deployment **failed**; `https://ntacbt.vercel.app` serves an unrelated older app (G-1). **Android:** release `app-latest` published 2026-08-27, built by `.github/workflows/build-apk.yml` (the only workflow in the repo) |

---

## I. Exact next action

> **Do this first, in this order, and stop before changing product code:**
>
> **Open the Vercel project and read the failed build log for the Production
> deployment of `041ff13`.**
>
> ```sh
> npx vercel login          # or export VERCEL_TOKEN
> npx vercel inspect dpl_9AKNmNgwFDuhQ3NK4mCy4n6HDdZr --logs
> ```
>
> That deployment id is the `Production` deployment recorded for `main` on
> 2026-09-30T19:27:29Z, and its recorded status is `failure`. The Vercel CLI
> credentials are not present in this environment, which is the only reason
> this has not already been read.
>
> **Why this and not something else:** the build artifact is already proven
> correct (24 routes 200 on the production bundle), every gate is green, and
> the only thing standing between `041ff13` and a live `041ff13` is this
> failure. The log will name the cause, and it will also tell us whether the
> `ntacbt.lovable.app` build (G-2) and the canonical-host mismatch (G-3) share
> it. Fixing anything else first risks polishing a build that cannot ship.
>
> **Then, before writing code, get the user's decision on C-1** (which host is
> the production domain of record) — it changes every canonical in the app and
> must be one atomic change.

---

## J. Instructions for the next ChatGPT session

1. **Read this handoff first**, then `README.md`,
   `docs/DEPLOYMENT-READINESS.md` (most recent, 2026-10-01),
   `docs/REDEVELOPMENT-STATUS.md` (the long log, 74 KB) and
   `docs/REDEVELOPMENT-PLAN.md`.
2. **Inspect the actual repository state before trusting any summary in this
   file, or in any other document.** Note the two known-stale statements:
   `REDEVELOPMENT-STATUS.md` open item 1 (the service-role-key claim) and its
   publishing-round row 9 (the site-root claim). The local clone is
   **shallow** — unshallow before any history-dependent work.
3. **Confirm the active task and the outstanding decisions** (C-1 … C-8) with
   the user. `NTACBT-01` in section E is **proposed, not approved**.
4. **Do not repeat completed work.** PRs #1–#14 and the rebuild/publishing
   rounds are done and merged; `docs/REDEVELOPMENT-STATUS.md` lists them.
5. **Do not modify files until the task scope and safety requirements are
   clear.** Two build-order traps: `npm run validate:all` needs
   `npm run build` (or `npm run bake-pyq`) first, and `npx vitest run` reports
   3 fewer tests before the bake. `npx eslint scripts src --max-warnings=0`
   exits 1 on 9 pre-existing warnings — that is the baseline, not a
   regression.
6. **Preserve existing functionality and student data.** The localStorage key
   contract in §F is the student-data contract. Do not rename keys, do not
   change the exam engine's grading, and do not change the root redirect
   without understanding the `a1b90627` revert.
7. **Report verified findings separately from assumptions.** Use the
   *verified* / *UNVERIFIED* distinction this file uses. A claim without
   evidence is not a finding.
8. **Update this handoff at the end of every milestone** — sections B, D, G
   and I in particular — and keep the date/time line at the top current.
9. **Stop at approval gates.** The deployment decisions (C-1, C-2, C-3, C-4)
   and the `.env` untracking (G-8) need the user. Cutting a production deploy
   is an approval gate in itself: **build to a preview first, sweep the 24
   routes, then promote.**
10. **Never claim that a test, commit, deployment or document update succeeded
    without evidence.** There is no browser in this environment, so no visual
    or manual result can be claimed at all. "Not verified" is a complete and
    acceptable answer.

---

## Appendix — commands used to produce this handoff

```sh
# state
git status --short && git branch -a && git log --oneline -20
git rev-list --count HEAD && ls .git/shallow
git ls-remote --heads origin && gh pr list --state all --limit 20

# install (the default `npm install` FAILS on a peer conflict:
# @testing-library/react@14 wants react@^18, the app is on react@19)
npm install --legacy-peer-deps

# gates
npx tsc --noEmit
npx vitest run
npx eslint scripts src
npm run validate:all     # AFTER npm run build
npm test                  # legacy robot E2E
npm run build
node scripts/audit-wires.mjs && node scripts/audit-clicks.mjs && node scripts/audit-responsive.mjs

# production bundle route sweep
NITRO_PRESET=node-server npx vite build && node .output/server/index.mjs
# then: 24× 200, /app/search 307, unknown path 404

# live host (curl/node fetch are BLOCKED in this sandbox — only the
# fetch_page tool reaches the internet)
#   https://ntacbt.lovable.app/{,app,app/pyq,app/map,app/memory,app/analytics,
#     app/focus,app/report,app/studytube,sitemap.xml,robots.txt,
#     api/public/pyq-papers}
#   https://ntacbt.vercel.app/{,app/analytics}

# deployments
gh api repos/dfgtghu556-ops/ntacbt/deployments
gh api repos/dfgtghu556-ops/ntacbt/deployments/{id}/statuses
gh api repos/dfgtghu556-ops/ntacbt/actions/workflows
```

### Sandbox network allowlist (for the next session)
Reachable: `github.com`, `codeload.github.com`, `api.github.com`,
`registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, and the
`fetch_page` tool's own egress.
**Not reachable:** `ntacbt.lovable.app`, `ntacbt.vercel.app`, HuggingFace,
`vercel.com`. Any check of those must go through `fetch_page`, which returns
rendered markdown, not raw HTML and not status codes for assets.
