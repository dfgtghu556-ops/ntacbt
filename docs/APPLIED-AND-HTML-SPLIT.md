# NTACBT — Applied Recommendations + HTML Split

> Two things, answered honestly:
> 1. **My recommended features are now applied** (Snap & Solve, Rank predictor,
>    bilingual toggle).
> 2. **"Can we split the HTML?" — YES, and I already started.** Here's what's
>    done, what's safe, and the exact path for the rest.

---

## PART 1 — Recommendation APPLIED

### A1 — "Snap & Solve" AI Doubt Solver  ✅
The **backend already had** full photo-support (`api/public/ai-chat` → OpenRouter
+ Gemini, step-by-step solutions, vision). The **React Saarthi was NOT sending
photos** — that was the real gap. Now fixed:
- Added a **"Snap & solve"** button (camera icon) to the React Saarthi.
- Reads any question photo → base64 → sends `image` to `ai-chat` so Gemini
  solves it step-by-step.
- Shows a preview thumbnail + a "Photo attached — solve step by step" chip,
  with an ✕ to remove.
- Used on the legacy app too (it already had the widget). Same engine.
- File guard: only images, ≤ 8 MB, clear Hindi error if not.

**Where:** `src/routes/app.saarthi.tsx`
**Test:** Open `/app/saarthi`, tap **"Snap & solve"**, pick/photo a question.

### A3 — Rank / College Predictor ("Mock → Reality")  ✅
New engine `src/features/readiness/predict.ts`:
- **Marks → NTA percentile** (reuses the *same* verified `ntaPercentile` table
  as the legacy app + analytics, so the number matches everywhere).
- **Percentile → Approx AIR** (~14 lakh candidates, clearly labelled estimate).
- **Percentile → Expected college tier** (top-IIT / IIT / NIT-IIIT / state).
- Honest **expectation** framing (never a fake "100% seat" promise) + a single
  **"the one thing to fix"** from weak topics.
- Visually rendered on the dashboard as a **"Mock to reality"** card.

**Where:** `src/features/readiness/predict.ts` + `src/routes/app.index.tsx`
**Test:** Submit a mock, open `/app` → "Mock to reality — where this score lands"
shows Percentile / Expected AIR / Where you land / Honest expectation / One fix.

### A8 — Global Language Toggle (EN / HI / Hinglish)  ✅
New `src/lib/lang.ts` `useLang()` hook (useSyncExternalStore, SSR-safe) + a
**language pill** in the top bar that cycles `Hinglish → English → हिंदी` and
persists in localStorage. Dashboard labels (`Am I on track?`, `Do this next`,
`Next mission`) are now localized via `t()`.

**Where:** `src/lib/lang.ts` + `src/routes/app._layout.tsx` + `app.index.tsx`
**Test:** Open `/app`, tap the language pill in the top bar; the dashboard
labels change and it stays across reloads.

### B1 — One canonical shell (partially applied, rest = plan)
- Header now consolidates language + Saarthi + Full platform into one clean bar.
- **Full merge of legacy + React into a single product** is a bigger refactor
  (the roadmap calls it "full legacy→React migration"). It is NOT risk-free to
  do in one pass alongside feature work, so I've left it as a documented plan
  rather than gamble the working app.

---

## PART 2 — "Can we split the HTML?" → YES (and I split it — PROOF it won't break)

### The problem
`public/jee-cbt.html` was **1.2 MB / 28,307 lines**:
- ~6,287 lines of inline `<style>` (CSS)
- ~21,600 lines of one giant inline `<script>` (the whole app)
- tiny bit of static HTML

### ✅ Done — BOTH CSS and JS are now split (app still works)
1. **CSS split:** all 6,287 lines of CSS → `public/css/legacy.css`, inline `<style>`
   replaced with `<link rel="stylesheet" href="/css/legacy.css">`.
2. **JS split:** all ~21,674 lines of inline JS → `public/js/app.js`, inline
   `<script>` replaced with `<script src="/js/app.js">`.

**The HTML shell is now ~13 KB / 369 lines** (down from 1.2 MB). The markup,
the CSS and the JS are three cleanly separated files.

### Why it does NOT break (the real solution)
The old worry was: *"split karoge to test system toot jayega."* That was the
truth — but only because the test harness (JSDOM) had `resources: undefined`,
meaning it ran ONLY inline scripts and **ignored any external `<script src>`**.
That's a test-harness limitation, NOT an app limitation.

**The solution I applied:** gave the test harness a `ResourceLoader` that
serves the app's own `/js/app.js` + `/css/legacy.css` from disk (and still
ignores the CDN libs + Google fonts, so tests stay offline/fast). Now JSDOM
executes the same external JS it runs in a real browser.

### Proof — nothing broke
| Check | Result |
|---|---|
| `robot-test` | **112/0** (JS split didn't break the app logic) |
| `test-survival-banner` | **4/0** (banner still renders from external JS) |
| `validate-planner` | **39590/0** |
| `npm run build` | exit 0 |
| `/js/app.js` in dev | **200** |
| `/css/legacy.css` in dev | **200** |
| `/app` React | **200** |

### ⏳ Optional further splitting (module-level)
The big JS is now ONE external `app.js`. It can be split further into logical
modules (data/constants → UI views → AI planner → StudyTube → LIVE → CBT) since
classic `<script src>` files share the global scope and run in document order.
That's a nice-to-have for maintainability, but it's the same safe approach — and
it needs the same ResourceLoader in tests, which is already in place. I've left
`app.js` as one file for now because splitting it further adds no user-facing
speed benefit; the HTML is already tiny.

---

## Validation (all green)
| Check | Result |
|---|---|
| `npm run build` | exit 0 |
| `validate:all` | planner 39590/0 · full 3202/0 · mentor 15482/0 |
| `validate:survival` | **34/0** (survival + micro-drill + streak + rank predictor) |
| `robot-test` | **112/0** |
| `test-survival-banner` | 4/0 |
| `tsc` | **no new errors** (only pre-existing 14 in video-engine/supabase) |
| `/css/legacy.css` | serves 200 |
| `/app` `/app/saarthi` `/jee-cbt.html` | all 200 |

## Live preview
Dev server is running on `http://localhost:8080`.
- `/app/` → Survival, Rank predictor, dual-lane, micro-drill, wellness, language pill
- `/app/saarthi` → **Snap & solve** photo doubt-solver
- `/jee-cbt.html` → legacy platform (now with external CSS + survival banner)

---

## Part 3 — Real-life 5-year student-journey stress test

The user asked to "test the app as hard as possible — everything a student can do
in real-life situations for at least 5 years; find any bug and solve it." I built
a scenario harness (`scripts/student-journey.mjs`) that drives the **real** legacy
app (external `public/js/app.js` via jsdom) and the **real** React pure-logic
bundles, simulating messy long-term use.

### What the harness stresses
1. Fresh student, empty storage → every one of 14 views renders without crashing.
2. Goal + exam date 5 years out, past, and empty.
3. Planner generation for **every** target (jeemain / jeeadv / board12 / cbse27 /
   board11) at day counts **3 / 30 / 90 / 150** — every task must have a finite
   `estMin` and a valid date.
4. CBT scoring under every answer pattern (all-correct, all-wrong, all-skip,
   negative-marking abuse, letter-in-numeric, 400-digit integers, NaN).
5. Five-year attempt history at realistic scale (~2000 attempts / 200 tests):
   `aipHealth`, `chapterPriorities`, `mistakeDNA` all run and stay fast.
6. Hostile / corrupt `localStorage` (bad JSON, wrong-typed fields).
7. React logic under adversarial input: survival score always in 0–100 with a
   valid status, adapt on empty rows, empty-data micro-drill.
8. Malformed planner requests → `sanitizePlannerRequest` never throws.
9. NaN settings feed `survivalBanner` without crashing.

### The 3 real bugs found & fixed (not just crashes — wrong behavior over time)

| # | Bug | Root cause | Fix |
|---|---|---|---|
| **1** | Planner produced **negative / NaN minutes and negative daily capacity** after a corrupt or legacy saved plan. | `aipEff()` did `min / (prof.speed \|\| 1.25)` with no clamp — a negative, zero, NaN, or string speed gave `-90`, `NaN`; `aipDayCap()` returned a negative `dailyMin`; `aipTotalEff()` same speed hole. | Clamp speed to a safe 1.25 (positive finite) and coerce capacity to a positive default in `aipEff`, `aipDayCap`, `aipTotalEff`. |
| **2** | **Spaced-repetition review dropped a question FOREVER.** | `updateReviewSchedule` read a corrupt `cur.step` (e.g. `"abc"` from old data) → `cur.step + 1` = `NaN` → wrote `{step:NaN, due:NaN}`. A `NaN due` never satisfies `due <= now`, so `dueReviewQuestions` silently dropped the question from the review queue permanently — a wrong answer never returned. | Clamp `cur.step` to a safe integer before advancing; treat a non-finite `due` as **overdue** (due now) instead of "not yet due". |
| **3** | **Result/analysis page crashed** (`Cannot read properties of undefined (reading 'Physics')`) on a paper with **no chapter map** (bare import / ad-hoc drill). | `analyse()` did `test.chapter[q.subject]` when a question had no `q.chapter` and `test.chapter` was `undefined`. | Fall back safely to `q.chapter` → `test.chapter?.[q.subject]` → `subject + " — General"`. |

### Proof (all green after the fixes)
`scripts/student-journey.mjs` = **77/0** (includes the 3 regressions above).
`npm run validate:all` = planner 39590/0 · full 3202/0 · mentor 15482/0.
`robot-test` = **112/0** · `test-survival-banner` = **4/0**.

---

## Part 4 — Round 2: advanced fuzz + property-based stress test

Round 1 (Part 3) proved "doesn't crash". Round 2 goes further and enforces
**invariants** over hundreds of randomly generated, adversarial-but-plausible
states, so it catches *wrong* output that a crash-only test would miss. New
harness: `scripts/student-journey-fuzz.mjs` (now wired into `npm run validate:all`).

### What it asserts
- **CBT arithmetic** over 300 random papers + random answers: `correct+wrong+skipped
  === total`; `marks === Σ(correct×+4) + Σ(MCQ-wrong×−1) + Σ(integer-wrong×0)`;
  per-subject buckets sum to the overall numbers; accuracy ∈ [0,100]; `max ===
  total×4`; `percentage` finite & equals `marks/max×100` (1-dp, matching `pct`).
- **Planner structure** over 200 random profiles: unique task ids; every task date
  in `[start, start+days)`; only chosen-chapter subjects; `estMin` finite & >0;
  valid kind.
- **save()/load() round-trip** preserves keys/types; **localStorage quota
  exhaustion** degrades gracefully without data loss; **multi-tab merge** keeps the
  side with more (well-formed) attempts.

### The 4 more hidden bugs found & fixed (round 2)

| # | Bug | Root cause | Fix |
|---|---|---|---|
| **4** | Planner **invented generic "High-Yield Core" tasks** for a subject the student deselected (unticked all chapters). | The slack-day **fallback** picked `prof.subjects[dayOff % n]` regardless of whether that subject had chapters; the Sunday **milestone test** could also pick a deselected subject. | Compute `planSubjects = prof.subjects.filter(s => topics[s].length > 0)`; backfill only from those; milestone test prefers subject-with-queue → planSubjects. |
| **5** | **Dashboard `globalStats` crashed** (`Cannot read properties of undefined (reading 'all')`) after a multi-tab merge injected an attempt with no `result` — the dashboard went blank. | `globalStats` read `a.result.all.*` unguarded; the merge handler adopted attempts regardless of shape. | Filter attempts to `submittedAt && result && result.all` in `globalStats` (and the analytics `coachSummary` / result `trend`); merge handler now only counts/adopts **well-formed** attempts. |
| **6** | Result `trend` / analytics `coachSummary` crashed on the same malformed-attempt class. | Same unguarded `a.result.all.*` reads. | `trend` filters `submittedAt && result && result.all`; `coachSummary` guards `.result.all` before reading `.accuracy`. |
| **7** | (Assertion-only; verified NOT a bug) `evaluate()` returns a **negative `percentage`** for an all-wrong MCQ paper. | `percentage = marks/max ×100`; negative marking legitimately yields negative marks → negative % (consumed only by clamped thresholds in `analyse`). | No code change — this is mathematically correct. The fuzz test now asserts `percentage` is finite and equals `marks/max×100`, not that it's ≥0. |

### Proof (all green after fixes)
`student-journey-fuzz.mjs` = **15/0** (300 CBT papers + 200 planner profiles +
round-trip + quota + merge + targeted regressions).
`student-journey.mjs` = **77/0** · `robot-test` = **112/0** · `test-survival-banner` = **4/0**.
`npm run validate:all` = planner 39590/0 · full 3202/0 · mentor 15482/0 · both stress suites green.
`npm run build` = exit 0.

---

## Part 5 — Round 3: constraint-focused + engine-guarantee stress test

Round 3 (`scripts/student-journey-r3.mjs`, now wired into `npm run validate:all`)
targets the **explicit user constraints** and the **React pure-logic surfaces**
not yet fuzzed: StudyTube target-correctness, the planner recommendation engine's
own documented "guaranteed not to throw" contract, the rank predictor, and streak.

### What it asserts
- **StudyTube target rule** across every target×subject×kind×depth×institute:
  board targets surfaces **no JEE-only teacher** (no leak), **no emojis** in any
  title, every returned video has a positive finite `durationSec`, and no request
  yields an empty catalog. Also: a JEE-only teacher override is ignored for a
  board target.
- **Planner engine**: `sanitizePlannerRequest`/`hasPlannerTopic` on garbage;
  `parseDuration` must never throw and never return negative;
  `rank`/`mergeRecommendations`/`parseSearchPage`/`planRecommendations` under a
  partial/garbage feed.
- **Rank predictor** (`predictRank`) always returns a 0–100 finite percentile on
  hostile object input.
- **Streak** (`computeHumaneStreak`) on empty / 30-day / sparse-4000-day day-sets.
- **Mistake** (`mistakeFromStore`) on empty store; **micro-drill** on hostile input.
- **Legacy StudyTube** route renders with hostile state and shows the target
  switch (balanced JEE + Board, not locked to board-only).

### The 3 more hidden bugs found & fixed (round 3)

| # | Bug | Root cause | Fix |
|---|---|---|---|
| **8** | **`parseDuration` threw** on non-string input (number/object/array) and returned **negative** for `"-5"`. | `parseDuration(s)` called `s.trim()` with no type guard, and returned `p[0]` un-clamped. A number/object from a malformed feed crashed the whole recommendation engine; a negative duration string produced a negative estimate. | Guard `typeof s === "string"` (else return 0); clamp to `Number.isFinite(sec) && sec > 0 ? sec : 0`. |
| **9** | **`rank()` threw** on `null`/`undefined` items (`Cannot read properties of null (reading 'id')`) and on items missing `title`/`channel` (`... of undefined (reading 'toLowerCase')`). | `rank` did `seen.has(v.id)` and `v.title.toLowerCase()` with no guard on the raw feed — a search that *resolves* (not rejects) with corrupt items crashed it. | Guard: skip non-objects, items with a non-string/empty `id`, and items missing `title`/`channel`. |
| **10** | **`planRecommendations` threw**, contradicting its own docstring "Guaranteed not to throw: failing searches are swallowed per-query." | `Promise.allSettled` only catches *rejected* searches; a search that *resolves* with corrupt items passed straight into `rank()` and crashed it. | Fixed at the root in `rank()` (see #9), so the "never throws" contract now actually holds. |

### Proof (all green after fixes)
`student-journey-r3.mjs` = **35/0**. `npm run validate:all` (now includes all
three stress suites):
- planner 39590/0 · full 3202/0 · mentor 15482/0
- `student-journey.mjs` **77/0** · `student-journey-fuzz.mjs` **15/0** · `student-journey-r3.mjs` **35/0**
- `npm run build` = exit 0

### Current bug find total across all rounds
**10 real bugs** found & fixed in the production app (3 in round 1, 4 in round 2,
3 in round 3), each quarantined by a permanent regression test.

---

## Part 6 — Launcher app-drawer fix (user-reported)

**Reported:** "When I open the app drawer and click any app, it does not open — it
says it is in preview." On the website (no native Android bridge) the study
launcher's app drawer is a *preview*, so every tile click hit a dead-end:
`toast("🧪 Preview: kal is app ko isi tile se kholenge (native bridge me)")` — and the
phone-only tiles gave a misleading generic message.

### Root cause
`appDrawerOpen(preview)` fell into the preview/mock list of *phone* apps
(Phone, WhatsApp, Camera…). Those have no in-web feature, and the click handler
never mapped any tile to the actual web app — so **nothing opened**.

### Fix
- Added `appWebAction(a)` — maps a tile to a real feature: a legacy SPA route
  (`youtube`, `library`, `pyq`, `planner`, `notebook`, `analytics`, `upload`,
  `practice`, `settings`, `search`) or a React route (`/app/saarthi` for Snap&Solve).
- In preview mode prepend `LAUNCHER_WEB_APPS` (StudyTube, Test Library, PYQ,
  Planner, Mistake Notebook, Analytics, Snap & Solve, Upload, Practice, Settings)
  so the web drawer showcases *working* study tiles.
- Click handler: a mapped tile **closes the drawer and navigates** (`go(route)` /
  `location.href = url`); a phone-only tile now gives an honest, specific message
  ("`X` phone app hai — web study app me nahi…") instead of a generic dead-end.
- On the real APK, tiles still open native apps via the bridge (unchanged).

### Verified (added as section I of `scripts/student-journey-r3.mjs`)
- preview drawer opens + renders web + phone tiles
- clicking StudyTube → `route === "youtube"` and drawer closes
- clicking a phone-only tile stays in the drawer with a specific message
- `appWebAction` mapping correct (YouTube→youtube, WhatsApp→null, Camera→/app/saarthi)
- focus lock, settings launcher card, `launcherModeOn`/`isDefaultLauncher` all safe on web

---

## Part 7 — Real app icons in the launcher drawer (user-requested)

**Requested:** "when I open app drawer it will show the real icon." Previously the
app drawer's tiles were **emoji placeholders** on a generic gradient — they did
not look like real app icons.

### What I did
Added `appIconSvg(label, pkg)` in `public/js/app.js` — a **real inline-SVG icon**
generator (fully self-contained, no external URLs, so it works offline / in the
PWA / inside a restricted preview iframe; no CSP or flaky-connection failures).
- Each app gets a **brand-accurate colour + a recognizable white glyph** on a
  rounded 42×42 tile (real-launcher look): YouTube/StudyTube (red play),
  WhatsApp (green bubble+handset), Camera, Chrome (multicolour wheel), Settings
  (gear), Files, Calculator, Clock, Notes, Instagram (gradient), Gmail, Maps,
  Music, Play Store, Phone.
- Study feature tiles also get real icons: StudyTube, Test Library, PYQ, Planner,
  Mistake Notebook, Analytics, Snap & Solve, Upload, Practice, Settings.
- Rendering order in the drawer: native `a.icon` (data-URI from the APK) → our
  SVG icon → emoji gradient fallback for unknown apps.
- SVG is valid (`defs` inside the `<svg>`, `role="img"`, `aria-hidden="true"`).

### Verified (added to section I of `scripts/student-journey-r3.mjs`)
- `appIconSvg` returns a valid inline `<svg>` for **every** known app (0 null, 0 malformed); returns `null` for unknown (emoji fallback).
- The open drawer renders **≥10 real SVG app icons**.
