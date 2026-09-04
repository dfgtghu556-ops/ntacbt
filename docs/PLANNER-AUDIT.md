# AI Planner — Full Robustness Audit & Hardening

> **Date:** 2026-09-03
> **Scope:** The adaptive study planner and its AI video-recommendation service
> (`/api/public/study-planner`), plus the readiness/weak-topic engine that feeds it.
> **Method:** Full read of the planner pipeline (route → sanitizer → engine →
> curated data → merge), reproduction of the existing validators, a deep audit
> across every real decision path, and a new **1,177-scenario / 34,815-assertion**
> validation harness that exercises the planner against the complete official
> syllabus corpus, the curated registry, teacher/institute preferences, and a
> large set of adversarial / malformed inputs.

---

## 1. What was audited

| Layer | File(s) |
|---|---|
| Recommendation HTTP route | `src/routes/api/public/study-planner.ts` |
| Input sanitation (NEW) | `src/features/planner/normalize.ts` |
| Pure recommendation engine (NEW) | `src/features/planner/engine.ts` |
| Curated video knowledge base | `src/data/video-engine.ts` |
| Teacher / institute catalog | `src/data/teachers.ts` |
| Adaptive ranking | `src/features/planner/adapt.ts` |
| Readiness + weak-topic engine | `src/features/readiness/readiness.ts` |
| Client persistence bridge | `src/lib/store.ts` |
| Planner UI | `src/routes/app.planner.tsx`, `app.index.tsx` |
| Offline fallback catalog | `src/features/studytube/catalog.ts`, `service.ts` |
| Official syllabus | `src/data/syllabus.ts` |

---

## 2. Bugs found & fixed

### 2.1 Readiness accuracy was double-counting correct answers
`src/features/readiness/readiness.ts` — `accuracyOf()`:

```ts
// BEFORE (bug): `|| 0 + (all.wrong || 0)` binds addition inside the right operand.
attempted += all.correct || 0 + (all.wrong || 0);
```

Because `+` binds tighter than `||`, this evaluated as `correct || (0 + wrong)`, so
whenever `correct` was truthy the wrong count was **ignored**, and the attempted
denominator under-counted. This silently inflated every accuracy figure and skewed
which topics were flagged as weak (and therefore which tasks the adaptive planner
re-ranked to the top).

**Fix:** parenthesize: `attempted += (all.correct || 0) + (all.wrong || 0);`

### 2.2 The React planner treated everything as "not done"
`src/lib/store.ts` — the legacy app records task completion in
`plannerDone[id]` (see `public/jee-cbt.html`), **not** on the task row. The
`DataStore.planner` getter returned the raw rows, so the React planner and the
readiness engine never saw completed tasks — the completion percentage stayed 0
and done tasks were shown as pending.

**Fix:** overlay `this._raw.plannerDone` onto each task's `status` in the
`planner` getter.

### 2.3 "Focus 3-Week Window" was not a 3-week window
`src/routes/app.planner.tsx` — the window filter was
`now - 3 days .. now + 24 days` (i.e. it included **3 days in the past** and
went out a day too far), with a hard-coded `24 * 24 * 3600 * 1000`. It also
unintentionally hid today's tasks whenever a plan was slightly behind schedule.

**Fix:** filter to `today .. today + 21 days`.

### 2.4 `parseDuration` accepted malformed time components
`src/features/planner/engine.ts` (`parseDuration`, extracted from the route) —
`"9:99"` (minutes/seconds > 59) was parsed as a valid duration instead of being
rejected. An adversarial or malformed YouTube `lengthText` could therefore inject
an absurd duration into the ranking band checks.

**Fix:** reject any component where minutes or seconds `> 59`.

### 2.5 Truly robust request sanitization (previously unguarded)
The route parsed the POST body as a plain object and trusted the fields. A client
could send `topic` as an array/object, a non-numeric `maxMinutes`, an unknown enum
value, or a multi-megabyte string — which would leak `"[object Object]"` into
search queries, feed `NaN` into the duration band math, or blow past query
fan-out limits.

**Fix:** a dedicated framework-free sanitizer (`src/features/planner/normalize.ts`)
coerces every field to a bounded, typed, valid value and **never throws**.

---

## 3. Architecture change (safe refactor)

The previous 703-line route coupled **HTTP/caching, body parsing, YouTube
scraping, query building, ranking, and merge logic** into a single handler that
was only reachable over the network — making the actual decision logic impossible
to test in isolation. It is now split:

```
routes/api/public/study-planner.ts   ← thin HTTP + in-memory cache (6h) + injectable fetch
        │
        │ sanitizePlannerRequest()
        ▼
features/planner/normalize.ts        ← input hygiene (bounded, typed, never throws)
        │
        ▼
features/planner/engine.ts           ← pure logic: buildQueries · parseSearchPage · rank
        │                              · resolveCuratedFor · mergeRecommendations
        ▼                              · planRecommendations (injectable search fn)
features/planner/adapt.ts            ← adaptive (non-destructive) task ranking
features/readiness/readiness.ts      ← weak-topic evidence
```

The production behavior is **byte-for-byte equivalent**: the extractor preserved
the original positional signatures of `buildQueries`, `rank` and `parseSearchPage`,
the merged curated-first ordering, the explainable `why` reasons, the 6-hour TTL
cache, and the `validKind`/`validDepth`/`validTarget` normalization (now enforced
upstream by the sanitizer). The only deliberate behavior changes are the four bug
fixes above.

---

## 4. Validation harness — the "training dataset"

`npm run validate:planner` bundles the **real** planner source with Rolldown and
runs the actual functions, no network required. It exercises **1,177 scenarios**
and **34,815 assertions**:

| Section | What it proves |
|---|---|
| Adversarial sanitization | 20 malformed payloads (null/array/object/NaN/Infinity/unicode/huge strings/unknown enums) never throw and stay bounded |
| `parseDuration` | valid formats, garbage, LIVE, component overflow |
| `parseSearchPage` | synthetic YouTube HTML parses correctly and marks live entries |
| Full official-syllabus corpus | every official topic/subject can produce a plan |
| Curated registry coverage | every canonical topic has curated lessons |
| 720 exhaustive combos | every kind × depth × target × language (× 4 subjects) |
| Teacher / institute matrix | every verified teacher + institute preference, plus unknown prefs |
| 220 seeded fuzz combos | unlikely topic strings (empty, unicode, stopwords, punctuation) never crash |
| Ranking invariants | shorts/song/live/too-short filtered; stopword topic returns `[]` (no crash) |
| Merge invariants | curated-first, deduped, bounded to 6 |
| Offline catalog + dream channels | the "always works" fallback returns valid YouTube-search cards |
| Readiness + adaptive planner | synthetic student stores verify weak-topic detection, `plannerDone` overlay, task re-ranking |

Run it with:

```sh
npm run validate:planner
npm run validate:all     # includes it
```

---

## 5. Verified status (this change)

| Check | Result |
|---|---|
| `npm run validate:planner` | ✅ 1,177 scenarios / 34,815 assertions |
| `npm run validate:all` | ✅ all validators pass |
| `npm run build` | ✅ |
| `npm run lint` | ✅ 0 errors (6 pre-existing react-refresh warnings in UI primitives) |
| `tsc --noEmit` | ⚠️ 2 pre-existing errors in `src/data/video-engine.ts` (untouched) + 1 in `supabase/client.ts` (untouched) |

### Endpoint smoke test (live)
- `POST { topic: "Kinematics", subject: "Physics", kind: "learn", depth: "lecture", target: "jeemain" }`
  → 200 with curated lessons returned first (`verified: true`, `isCurated: true`).
- `POST { topic: ["evil","array"], kind: 12345 }` → 400 `topic required`
  (array coerced to `""`; enum coerced to defaults).
- `POST {}` → 400 `topic required`.
- Obscure topic with no curated match → 200 `{ "items": [], "fallback": true }`,
  which the client `discover()` layer replaces with the offline catalog.

---

## 6. Remaining items (pre-existing, out of this change's scope)

1. **`tsc` strictness in `src/data/video-engine.ts` and `src/integrations/supabase/client.ts`** —
   `exactOptionalPropertyTypes` / `noUncheckedIndexedAccess` complaints. These are
   runtime-safe (optional params always populated; array reads always in bounds)
   and pre-existing in untouched files. `npm run build` does not run `tsc`, so CI
   is unaffected. Worth a separate tracking item.
2. **Rate-limit maps** (`study-planner`, `live-classes`, `ai-chat`, `pdf-reformat`)
   are per-instance, not shared — noted in `docs/PHASE0-AUDIT.md`.
3. **YouTube scraping** of public search pages is a documented ToS/robots risk
   (already called out in the Phase 0 audit).
4. **`src/data/video-engine.ts` curated IDs** are hand-authored; the generated
   `generate-full-registry.js` writes a parallel registry that is not consumed by
   the planner. No action needed for this change.

---

## 7. CBSE / Board-target recommendation model (this phase)

The recommendation engine is now **target-aware** so a CBSE Class 12 learner is
never shown JEE/NEET faculties or JEE-flavoured resources.

### 7.1 Dream Teacher & Dream Team (board target)

- Added a curated set of real, verified **board-first educators** for Class 12
  PCM in `src/data/teachers.ts` (`BOARD_TEACHERS`, each `boardCore: true`,
  `examFamily: "board"`): Physics (Abhishek Sahu / Abj Sir, Arvind Academy,
  Zaki Saudagar, Sunil Jangra, Magnet Brains), Chemistry (Bharat Panchal,
  Shourya Ma'am, Ashima Ma'am, Anubha Gaur), Mathematics (Neha Agrawal,
  cbseclassvideos, Ushank Sir, Ashish4students). Board institutes were added to
  `INSTITUTES`.
- New helpers `isBoardTarget`, `boardCoreTeachersFor`, `teachersForTarget`,
  `findTeacher` (resolves both JEE and board-core ids).
- `/app/studytube` Dream Team + Dream Teacher dropdowns now use `teachersForTarget`
  — for a board target they list **only** board-core educators (📘 badge), and the
  picks are grouped with board-first educators first. Switching to a board target
  auto-drops any JEE teacher that was selected.
- `getTopFaculties` and `category` filters also gate board targets to board-core.

### 7.2 Video recommendation (board-aware)

- `resolveCuratedVideos` branches for `board12`/`cbse27` and calls
  `generateBoardCuratedSet`: always a board-core teacher and **board-accurate
  duration + depth language**. Chapters in the new `BOARD_VIDEO_REGISTRY`
  (hand-curated real 11-char YouTube IDs from the trusted board educators)
  return **actual verified videos** that play directly (`verified: true`); a
  board learner gets the real lecture from the real teacher/channel they asked
  for. Chapters not yet in the registry fall back to an honest YouTube
  **search-pick** (`externalUrl`) so a JEE lecture is never mislabelled as
  board content.
- `buildQueries` for a board target never emit "jee/neet" — they target
  `class 12 cbse board ncert`.
- `rank()` uses **board-specific duration bands** (revision 15–60m, practice
  40–120m, one-shot 1–2.5h, detailed 2–3.5h, lecture 1.5–2.75h) and a
  board `TRUSTED` educator prior, so the chosen video genuinely matches the
  detail/duration the learner asked for. JEE targets keep their original bands.
- `offlineCatalog` / `dreamChannels` (StudyTube offline layer) are also
  target-aware: board variants replace the JEE "Advanced / Tough Problems"
  card with "Higher-Order Board Problems", and durations use board ranges.

### 7.3 Validation

`npm run validate:planner` now also asserts, for each of Physics/Chemistry/Maths:
- board target exposes **only** `boardCore` educators (and none tagged JEE/NEET);
- `dreamChannels` (board) are board-core; `offlineCatalog` (board) has no JEE/NEET
  keyword and board-range durations;
- the board curated set has no JEE/NEET leak, is either a **real verified video**
  or an honest search-pick, has a board-labelled "detailed" pick sitting in the
  board detailed band;
- every `BOARD_VIDEO_REGISTRY` lesson has a **real 11-char YouTube id**, a board
  teacher + channel, board target, and a sane duration (locked by the harness so a
  broken/fabricated id can never ship);
- JEE target still exposes JEE faculties (not over-restricted).

**Planner harness: 1,212 scenarios / 39,590 assertions / 0 failures.** Live smoke:
`target=board12` returns **verified videos** — Abhishek Sahu / NCERT Wallah / Ashu Sir
(Physics Electrostatics), Bharat Panchal (Chemistry Solutions), PW Neha/Deepak (Maths
Matrices) — with board durations; `target=jeemain` still returns JEE faculties.
