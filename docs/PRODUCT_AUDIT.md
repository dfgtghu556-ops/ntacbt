# Internal Product Audit — JEE Main Companion

> A full product-level audit performed before redevelopment. Classifies every
> part of the existing application so we **preserve the functional engine and
> rebuild the experience** — never a destructive rewrite.

## 1. Architecture map (what the app actually is)

| Layer | Where it lives | Role |
|---|---|---|
| **The product** | `public/jee-cbt.html` (~695 KB, vanilla HTML/CSS/JS, single file) | The entire study platform: dashboard, planner, StudyTube, practice, test engine, PDF parser, analytics, AI chat, focus, PYQ, onboarding |
| **API shell** | `src/routes/api/public/*.ts` (ai-chat, cloud-config, live-classes, pdf-reformat, pyq-papers, study-planner) | Thin TanStack/nitro server routes backing the client |
| **SPA shell** | `src/routes/index.tsx` | Redirects `/` → `/jee-cbt.html` |
| **Storage** | Browser `localStorage` + `IndexedDB` (images), Supabase (public test library + leaderboard) | All student data is local; only published tests go to the cloud |
| **PWA/Android** | `vite.config.ts` (workbox), `android/` | Offline + launcher-mode app |

**Decision (preserve):** the product is deliberately a single self-contained
HTML file per the README constraint. Migrating the whole engine to React would
be a destructive rewrite with no user-visible benefit and high regression risk.
We **keep the vanilla engine** and redevelop the *experience layer* (IA,
navigation, dashboard hierarchy, states) inside the same file.

## 2. Trace: user action → result (two critical journeys)

### PDF → 75-question CBT
```
Upload 3 PDFs → parsePaper() (6 layers: positional → Gemini fallback)
→ per-subject question packs → buildTest() merges 25×3=75
→ NTA exam shell (timer, palette, save&next, review) → evaluate() (2026 rules)
→ result + analyse() + mistake DNA → localStorage + optional cloud publish
```
Sound, layered, and already covered by the robot harness (scenario 3).

### Dashboard → next action
```
viewDash() → ~20 appended cards (hero, NBA, mentor, mission control, …)
```
This is where the product diverges from the target: **it is a wall of cards,
not a "Today" screen.** Every card "earned its place" individually, but together
they overwhelm and give no single clear primary action.

## 3. Classification

### KEEP (good, preserve)
- **Functional engine**: `parsePaper`, `buildTest`, `evaluate` (incl. the 2026 no-negative-on-numericals rule), `analyse`, `mistakeDNA`, percentile/rank.
- **NTA exam shell** — serious, distraction-free; reliability > decoration. Keep untouched.
- **Data ownership / one-source-of-truth**: single `S` state object in `localStorage`; `save()` is the only write path (with memo epoch). Multi-tab merge safety is in place.
- **Next Best Action engine** (`nextBestAction()`): deterministic, data-driven, already the right concept.
- **Mistake DNA / spaced review / daily 10 / contract / comeback** — strong, evidence-based study mechanics.
- **Contextual AI** (`AI_FAB_CTX`, `buildStudentContext`) — one intelligence layer, already route-aware.
- **Robust error boundary** in `render()` — a throwing view no longer blanks the screen.
- **Design system tokens** (CSS vars: color, radius, elevation, density, font-size, card style, accent) — genuine, not invented per-screen.
- **Security posture**: no secret keys in the frontend; server-only keys via `process.env`.

### IMPROVE (good idea, weak UX)
- **Navigation** — 15 flat top-level items = "15 equally important buttons". → **rebuild the IA** (primary 5 + overflow).
- **Dashboard hierarchy** — all cards equal weight; the single primary action isn't dominant. → re-frame as a "Today" screen.
- **StudyTube home** — currently "YouTube embedded" with a big search card up top; should be a study-first platform (Continue → For your plan → Weak topics → Revision) with search as secondary.
- **Loading/empty/error states** — partial; some screens still show raw "Loading…" rather than contextual progress.

### REFACTOR (architecture unnecessarily complex)
- `viewDash()` is one ~250-line function appending ~20 cards in fixed order → hard to reason about, easy to overload. → split into ordered section builders (safe, no behavior change).
- `public/jee-cbt.html` is one huge file → acceptable per the single-file constraint, but the *modularity inside it* can improve (already uses reusable functions).

### REBUILD (current impl blocks good UX)
- **Navigation / IA** (see IMPROVE → treat as REBUILD): replace flat 15-item bar with 5 primary destinations + a "More" overflow, keeping every route reachable.
- **Dashboard "Today" screen**: lead with ONE dominant Next Best Action; today's plan; a minimal progress snapshot; everything else behind calm, progressive disclosure — without deleting any functional card.

### REMOVE (redundant / confusing)
- **Nothing functionally valuable** should be deleted. A few cards can *collapse* behind disclosure (e.g. badges, weekly recap, latest-public-tests) rather than always occupying the home viewport.
- No dead routes or orphaned features found.

### ADD (needed for coherence)
- A **"What happens next"** line on the Next Best Action (time + follow-up) so the 10-second test passes.
- **Cross-system "next step" affordances** that already exist but should be surfaced more strongly (result → weak topic → StudyTube → practice → planner adjustment).
- A **primary-navigation consistency**: make the top nav reflect the 5 journeys everywhere.

## 4. Risks & safeguards
- Robot harness (`scripts/robot-test.mjs`, 112 checks) guards the engine: scoring, exam flow, calculator, onboarding, PDF parser, analytics.
- `npm run build` + `npm run dev` validated after every change.
- No secret exposure; PWA/Android config untouched.
