# NTA JEE Main CBT Platform — Full Audit Report

---

## 1. Architecture

**Two disconnected applications share one repo:**

| Layer | What it is | Status |
|---|---|---|
| **The Real App** | `public/jee-cbt.html` — a 25,421-line monolithic vanilla HTML/CSS/JS file containing the entire CBT exam engine, PDF parser, analytics, AI chat, planner, PYQ viewer, practice modes, mistake notebook, and more | **Active, working** |
| **The React Shell** | TanStack Start + React 19 + 46 shadcn/ui components + Supabase client + 6 server API routes | **Mostly scaffolding; redirects to the HTML file** |

The TanStack `src/routes/index.tsx` does nothing but `window.location.replace("/jee-cbt.html")`. The 46 shadcn/ui components in `src/components/ui/` are imported by no route. The Supabase client exists but is only used by the API routes, not by any React UI.

**Server-side API routes** (6 total, in `src/routes/api/public/`):
- `ai-chat.ts` — OpenRouter + Gemini with failover, rate limiting, Socratic mode, web search
- `pdf-reformat.ts` — Gemini fallback PDF parser (Layer 6)
- `pyq-papers.ts` — PYQ paper serving with Parquet/Rows-API fallback
- `study-planner.ts` — YouTube scraping + ranking for educational video discovery
- `live-classes.ts` — YouTube live class finder
- `cloud-config.ts` — Exposes Supabase credentials to client

**Database**: Supabase (PostgreSQL) with 3 tables: `public_tests`, `test_scores`, `planner_imports`. 6 SQL migrations. RLS enabled. Anonymous access for test publishing and score posting.

**Build system**: Vite + TanStack Start plugin + PWA (service worker via vite-plugin-pwa). A pre-build script (`scripts/build-pyq.mjs`) fetches PYQ data from HuggingFace Parquet + GitHub Samkarya repo and bakes it into `public/pyq/`.

**Android**: WebView wrapper (`.github/workflows/build-apk.yml`) published as sideload APK via GitHub Releases.

---

## 2. Existing Features

**Exam Engine** (all inside `jee-cbt.html`):
- NTA-faithful CBT interface: question palette (green/red/purple/white), timer, fullscreen, Save & Next / Mark for Review / Clear Response
- 3-tab subject navigation (Physics / Chemistry / Maths)
- Auto-submit with countdown warnings (30/10/5/1 min)
- PDF upload x 3 (Physics/Chemistry/Maths) -> auto-parse -> 75-question test
- 6-layer PDF parser (position-based layers 1-5 + Gemini LLM fallback Layer 6)
- JEE Main marking scheme: +4 correct / -1 wrong / 0 skipped; numerical questions = no negative marking (2026 rule)

**PYQ Library**: 150+ papers baked from AIEEE 2002 -> JEE Main 2026 (January + April sessions). Data from HuggingFace `ruh-ai/grafite-jee-mains-qna-no-img` (11,392 rows) + Samkarya GitHub repo.

**Analytics**: Subject-wise marks, accuracy, time trends, chapter-wise weakness heatmap, percentile/rank estimation, mistake DNA (concept/calculation/careless/formula tagging).

**AI Doubt Solver ("Saarthi")**: OpenRouter (primary, free tier) + Gemini (vision + failover). Live web search via DuckDuckGo + Wikipedia. Socratic mentor mode. Voice-to-text via Web Speech API. Student context personalization.

**AI Study Planner**: YouTube scraping for topic-matched educational videos. Teacher/institute preference. Language/target/depth filtering. 6-hour in-memory cache.

**Live Classes**: YouTube live class discovery. Real-time filter. 3-minute cache.

**Dashboard**: Streak tracking, stats cards, quick-start buttons.

**Practice Modes**: Wrong questions test, skipped questions test, weak chapter test, bookmarked questions test, mixed revision test.

**Mistake Notebook**: Question bookmarking with mistake-type tagging.

**Planner**: Calendar, study schedule, Pomodoro timer.

**Supabase Cloud Features**: Public test sharing (publish PDF -> shareable URL). Anonymous score leaderboard per test (Your score vs average vs top).

**PWA + Offline**: Service worker with cache-first for CDN libs, stale-while-revalidate for assets, network-first for pages.

**1905-line teacher database** + **1175-line syllabus database** (Physics/Chemistry/Maths chapters with JEE weightage and CBSE board marks).

**Custom PDFs**: `data/jee2026/` contains 5 transcribed 2026 papers (862 lines each, MCQ + integer with answers/solutions) plus 19 raw PDFs with OCR identity metadata.

---

## 3. Critical Problems

### 3a. The Monolith
The 25,421-line `jee-cbt.html` is the single most critical problem. It is:
- **Uneditable**: Any change risks breaking unrelated features. No imports, no module boundaries, no tree-shaking.
- **Untestable at scale**: The robot test (`scripts/robot-test.mjs`) exercises core flows but can't cover 25K lines of interleaved CSS + JS + HTML.
- **Unreviewable**: No code review, no static analysis possible on this file.
- **Conflicts with the React scaffold**: The shadcn/ui components, TanStack Router, Supabase client, and 6 server APIs exist for a React UI that was never built. They are dead weight in the current architecture.

### 3b. YouTube Scraping is Fragile
Three API routes (`study-planner.ts`, `live-classes.ts`, and partially `ai-chat.ts`'s DuckDuckGo search) scrape YouTube's internal `ytInitialData` JSON by parsing raw HTML. YouTube changes this format frequently. Any change breaks the study planner and live classes silently (returns empty results, no crash -> user sees nothing, no error).

### 3c. No Auth for Score Data
`test_scores` table accepts anonymous inserts with no identity. A script could flood it with garbage scores, corrupting the leaderboard comparison for all users. There's no write rate limit at the database level.

### 3d. `cloud-config.ts` Exposes Supabase Credentials
`GET /api/public/cloud-config` returns `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to any caller. While the publishable key is designed for client use, exposing it via a dedicated endpoint encourages direct database access patterns. More critically, the endpoint has no rate limit.

---

## 4. Data / Source-of-Truth Problems

| Data | Source | Problem |
|---|---|---|
| PYQ questions | `build-pyq.mjs` fetches from HuggingFace + GitHub at build time | Dataset snapshot is pinned (good), but if the build fails silently (network timeout + existing `index.json`), stale data serves without warning |
| 2026 transcribed papers | `data/jee2026/transcribed/` — hand-verified JSON | Only 5 of 19 known papers transcribed; the `IDENTITY.md` says 16 are net-new but only 5 exist |
| Syllabus | `src/data/syllabus.ts` — hardcoded TypeScript | Verified against NTA bulletin (good), but any syllabus change requires a code deploy |
| Teachers | `src/data/teachers.ts` — 1905 lines of hardcoded data | No mechanism for updates without code changes |
| Student performance | Browser `localStorage` | Lost on browser clear/cache wipe. No export/import. The README promises "Store everything using browser LocalStorage" but there's no backup strategy |
| Published tests + scores | Supabase | Anonymous writes, no identity. Only protects published tests via RLS SELECT |
| AI chat history | `localStorage` via `save_aiChatHistory()` | Same fragility as all localStorage data |

---

## 5. Reliability Risks

| Risk | Severity | Details |
|---|---|---|
| **YouTube HTML parsing breaks** | HIGH | Study planner + live classes go silent (no error shown) |
| **OpenRouter free tier exhaustion** | MEDIUM | Automatic failover to Gemini exists, but if both are down, chat shows 503 |
| **localStorage data loss** | HIGH | Any browser data clear destroys all test history, analytics, bookmarks, settings |
| **Service worker cache staleness** | LOW | `autoUpdate` SW may serve old JS while new code deploys; users get inconsistent state |
| **PDF parser failure on unknown layouts** | MEDIUM | Layers 1-5 are position-based; Layer 6 (Gemini) is the safety net but requires API key |
| **Build breaks from network** | MEDIUM | `build-pyq.mjs` exits 0 if `index.json` already exists (good resilience), but new PYQ data silently doesn't appear |
| **Supabase anonymous score flooding** | MEDIUM | No write rate limit at DB level; leaderboard can be gamed |
| **Rate limit in-memory (serverless)** | LOW | In-memory rate limit buckets (`rlBuckets`) reset on each cold start in serverless deploy |

---

## 6. UI/UX Problems

- **Nomenclature clash**: README says "no React, no frameworks" but the project IS React. The HTML file says "Someshwar JEE Main CBT Platform" while metadata says "NTA JEE Main CBT Platform." The root page `<title>` varies across files.
- **OG image URL** in `__root.tsx` points to `storage.googleapis.com/gpt-engineer-file-uploads` — looks like a leftover from a different project.
- **The HTML file is the product; the React framework is decoration**: A user landing on `/` gets a loading spinner, then a redirect to `/jee-cbt.html`. The entire React/TanStack stack is wasted effort for this one redirect.
- **46 shadcn/ui components** exist but render nothing. They add bundle size to the build even though no route imports them.
- **Dark mode**: Implemented in the HTML file via CSS custom properties (`html.dark` toggle). The React shell has a separate Tailwind dark mode setup. Two dark mode systems coexist.
- **Mobile**: The HTML file is responsive. PWA manifest supports any orientation. The `use-mobile.tsx` hook exists for the React shell but is unused.

---

## 7. Performance / Security Concerns

**Performance:**
- The 25K-line HTML file loads everything upfront — exam engine, PDF parser, analytics charts, AI chat, planner, PYQ viewer, practice modes, settings, formula cards. No code splitting.
- PDF upload parsing runs synchronously in the main thread for the position-based layers.
- The PYQ fallback API (`pyq-papers.ts`) loads an 11,392-row Parquet file into memory on first request and never frees it.
- Study planner fires 4 parallel YouTube scrapes per request with 9-second timeouts.

**Security:**
- `cloud-config.ts` serves Supabase publishable key to anyone — this is by design but should be behind auth for production.
- AI chat rate limiting is IP-based and in-memory; behind a CDN, multiple users share an IP (all rate-limited together). Serverless cold starts reset the buckets.
- The PDF reformat endpoint accepts up to 4 images x 6MB each (24MB payload) from anonymous callers — a potential abuse vector for Gemini API costs.
- `GEMINI_API_KEY` is used for both PDF parsing and AI chat; a single leaked key compromises both features.
- No Content-Security-Policy headers. The HTML file loads Google Fonts, Google analytics (via OG image), and external CDN resources without integrity checks.

---

## 8. KEEP / IMPROVE / REBUILD / REMOVE

### KEEP

| What | Why |
|---|---|
| `public/jee-cbt.html` (as-is for now) | It works. It's the product. Breaking it breaks everything. |
| `scripts/build-pyq.mjs` | Well-designed, resilient build pipeline with network fallbacks |
| `scripts/robot-test.mjs` | Valuable test harness; should be expanded |
| All `data/` and `public/pyq/` | Core data assets; well-structured JSON |
| Supabase migrations + schema | Clean, minimal, RLS-protected |
| `ai-chat.ts` system prompt | Excellent Socratic mentor persona; gold-tier prompt engineering |
| `pdf-reformat.ts` Layer 6 prompt | Comprehensive format knowledge base; handles edge cases |
| Android wrapper + CI | Working sideload APK pipeline |
| PWA manifest + service worker config | Offline-first design is correct for the use case |

### IMPROVE

| What | How |
|---|---|
| `jee-cbt.html` | Incremental extraction: pull out modules one at a time (PDF parser -> analytics -> chat widget -> exam engine) into separate JS files loaded by the HTML shell |
| PYQ coverage | 16 papers identified in `IDENTITY.md` but only 5 transcribed. Complete the remaining 11. |
| Robot test coverage | Add tests for analytics correctness, PYQ loading, planner ranking logic, and PDF parser layers |
| Rate limiting | Move from in-memory to Supabase RLS check + database function for persistent limits |
| `cloud-config.ts` | Add auth check or move behind login |
| Student data persistence | Add export/import to localStorage; consider Supabase for cross-device sync |
| Rate limits on PDF reformat | Tighten: 6/min is generous for an LLM-backed endpoint serving anonymous users |

### REBUILD

| What | Why |
|---|---|
| The React framework (TanStack Start + 46 shadcn components) | Currently dead weight. Either (a) use it to replace the HTML file module-by-module, or (b) remove it entirely and ship the HTML file as a pure static site |
| `study-planner.ts` YouTube scraping | Fragile HTML parsing. Replace with YouTube Data API v3 (free tier: 10,000 units/day) or at minimum add error surfacing to the user |
| `live-classes.ts` YouTube scraping | Same fragility. Same fix. |
| Anonymous score leaderboard | Add device fingerprint or simple token to prevent score flooding |

### REMOVE

| What | Why |
|---|---|
| All 46 `src/components/ui/*.tsx` files | No route imports them. They add build time and confusion. Remove or defer until a real React UI is built. |
| `src/hooks/use-mobile.tsx` | Unused |
| `src/lib/error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts` | Only used by the React SSR error wrapper, which only matters if the React shell is actually used |
| The redirect in `src/routes/index.tsx` | If the HTML file is the product, serve it directly. The React redirect adds latency and a flash of blank content |

---

## 9. Recommended Implementation Phases

### Phase 0 — Stabilize (Week 1-2)

**Goal**: Stop the bleeding. No new features.

1. **Complete 2026 PYQ transcription** — finish the 11 remaining papers identified in `IDENTITY.md`
2. **Fix the `cloud-config.ts` endpoint** — add rate limiting or remove it
3. **Harden anonymous score writes** — add a database-level rate limit function
4. **Fix OG image URL** in `__root.tsx` (point to actual app icon)
5. **Run existing robot tests** — verify they pass, identify any regressions
6. **Run lint + typecheck** — fix any errors that block CI

### Phase 1 — Clean Up (Week 2-3)

**Goal**: Remove dead code. Establish a clean baseline.

1. **Delete unused React components** (`src/components/ui/*`, `src/hooks/use-mobile.tsx`, error reporting libs)
2. **Simplify the React shell** — if keeping TanStack Start, reduce `index.tsx` to serve the HTML file directly (no JS redirect)
3. **Consolidate data sources** — move the 5 transcribed papers into the same format as the build pipeline expects; ensure `build-pyq.mjs` includes them
4. **Add a proper build health check** — log PYQ paper count after bake; fail CI if count drops below threshold
5. **Document the architecture** — a single `ARCHITECTURE.md` explaining: HTML file = product, React shell = hosting layer, API routes = server-side services

### Phase 2 — Extract Modules from HTML File (Week 3-6)

**Goal**: Break the monolith into manageable pieces without changing behavior.

Extract from `jee-cbt.html` into separate `.js` files loaded by the same HTML:
1. **PDF parser** (layers 1-5) -> `pdf-parser.js`
2. **Analytics engine** (marks calculation, percentile, mistake DNA) -> `analytics.js`
3. **AI chat widget** (UI + API calls) -> `ai-chat.js`
4. **PYQ viewer** -> `pyq-viewer.js`
5. **Study planner client** -> `planner.js`
6. **Exam engine core** (question palette, timer, navigation) -> `exam-engine.js`

Each extraction: extract -> verify robot tests still pass -> commit. No behavior changes.

### Phase 3 — Replace Fragile Scraping (Week 5-7)

**Goal**: Stop depending on YouTube HTML parsing.

1. **Study planner**: Replace `ytInitialData` scraping with YouTube Data API v3 search endpoint (free tier). Cache results in Supabase `planner_imports` table instead of in-memory.
2. **Live classes**: Same migration. Use `type=video&videoCategoryId=28` (Education) + `eventType=live`.
3. **AI chat web search**: Keep DuckDuckGo + Wikipedia (these are stable public APIs, not HTML scraping).

### Phase 4 — Data Resilience (Week 7-9)

**Goal**: Never lose student data.

1. **Supabase student profiles table** — anonymous device-token-based, stores: test history, bookmarks, mistake tags, settings, streak
2. **Export/import** — JSON download/upload of all local data
3. **Cross-device sync** — on load, merge localStorage with Supabase (last-write-wins per field)
4. **PYQ build verification** — CI step that fetches baked data, checks paper count, compares checksums

### Phase 5 — Optional React Migration (Week 9+)

**Goal**: Only if justified by scale needs (multi-user, shared analytics, teacher dashboard).

Migrate the HTML file's modules into React components one at a time, using the existing shadcn/ui shell. Start with the lowest-risk module (PYQ viewer), end with the exam engine (highest risk). This phase is optional — the HTML file works fine for personal use.

---

**Bottom line**: The product works. The codebase around it is 80% scaffolding that was never used. Stabilize and clean up first. Then chip away at the monolith incrementally — never rewrite from scratch.
