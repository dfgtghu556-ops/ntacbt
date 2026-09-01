# Rebuild NTACBT into a trustworthy study system

## Audit findings (what exists today)

- **One 11,277-line `public/jee-cbt.html**` holds the entire product: dashboard, CBT engine, planner, video screen, PYQ browser, analytics, settings, AI chat. The TanStack app only redirects `/` to it.
- **JEE 2026 data is incomplete**: 19 official PDFs sit in `JEE mains 2026/`, but only **5** papers are transcribed to JSON in `data/jee2026/transcribed/`. `IDENTITY.md` maps every PDF to its real date/shift (verified by OCR), so the remaining 14 are transcribable.
- **PYQ stats come from an external dataset** (`api/public/pyq-papers.ts`, HuggingFace snapshot) with no provenance shown in the UI.
- **Video recommendations are keyword search links**, not a ranked engine: `youtubeSearch(topic + "one shot" + source)` builds a YouTube search URL. Institute/teacher selection cannot be honoured because no video/teacher dataset exists — this is the root cause of "Physics Wallah selected, random videos returned".
- **Hardcoded institute/teacher name lists** (lines ~3800, ~6060, ~6151) with editorial claims ("India's most-followed…") — unverified.
- Planner uses a baked 96-test Eklavya schedule; no CBSE Class XII syllabus map exists anywhere.
- See you don't need to make any changes in the planner of Eklavya schedule because I don't want there and I don't need any planner for that I was specifically talking about AI planner a teachers and the videos engine for that AI planner
- Predicted rank/percentile are computed from local heuristics and presented without an "estimate" framing or evidence.

## Approach

Keep the working CBT engine, palette, timer, scoring, review, local persistence and cloud test library. Move them onto a shared data + state core instead of leaving them as one monolith. Ship in phases; each phase is independently usable and validated.

### Phase 1 — Trust core (data provenance + de-faking)

- Introduce a `Source` record on every factual dataset: `source`, `source_type`, `source_url`, `fetched_at`, `version`, `verification_status`.
- Sweep the whole app for fabricated numbers (frequency %, chapter probability, "expected questions", teacher/video quality claims, hard predictions). Replace with either a value computed from the verified question bank or an explicit `Not verified` / `Data unavailable` state.
- Rewrite rank/percentile/score prediction as clearly-labelled **Estimates** with the evidence behind them, and a "Not enough data to estimate reliably" fallback.
- Add `scripts/validate-*.mjs` (jee2026, syllabus, teachers, videos, links) wired to `bun run validate` and to the build, failing on critical integrity errors.

### Phase 2 — JEE Main 2026 dataset

- Transcribe the remaining 14 official PDFs into the same normalized JSON shape as the existing 5 (question, options, official answer/numeric value, subject, chapter, topic, solution when present, source URL, verification status).
- Dataset checks: duplicates, missing answers, bad option counts, question-number gaps, subject/shift mismatch, broken source links.
- Expose one indexed, searchable, paginated PYQ store used by the whole product; frequency shown only as raw counts ("47 verified questions across 3 years"), never as a prediction.

### Phase 3 — Student context + unified intelligence

- Single `StudentContext` (exam, board, class, subjects, institute, teacher prefs, syllabus version, progress, goals) persisted locally and consumed by every engine — fixes the Class 11/Class 12 and JEE/CBSE leakage.
- One mastery store per chapter/topic fed by tests, PYQ attempts and watched lessons; planner, videos, PYQs and the report all read from it. This is the learning loop.
- "My Preparation" combined report: per chapter — syllabus %, videos done, PYQs attempted, accuracy, latest test, priority, next action.

### Phase 4 — Syllabus + planner rebuild

- Official CBSE Class XII 2026–27 curriculum map (Board → Class → Subject → Unit → Chapter → Topic) with source/version stored, versioned so future syllabi drop in without code changes. Class XI never mixed into a Class XII selection.
- Planner regenerated from constraints: syllabus map + target date + daily hours + study days + weak topics from real test data + PYQ backlog. Existing Eklavya test schedule stays as a test-date layer on top.

### Phase 5 — Teacher + video engine

- Teacher/institute registry: institute, teacher, subject, exam/class, official channel URL, source, verification status, covered topics. Only entries verifiable against official institute sites/channels; no fabricated affiliations, no star ratings — evidence labels only.
- Video records with id, canonical URL, title, channel, teacher, institute, subject, class, exam, chapter, topic, duration, published, verified_at. Unverifiable metadata stays empty rather than invented.
- Recommendation engine: **hard filters first** (subject, exam/class, syllabus topic, selected institute, selected teacher) then scoring (exact topic > chapter > subject match, coverage, recency, prior interaction, prerequisite fit). Selecting PW → Electrostatics → Teacher X can only return that teacher's Electrostatics lectures, or an honest empty state.
- Study-first watch experience: search, watch page, history, watch later, playlists, followed teachers, continue watching, plus notes, timestamp bookmarks, "mark understood", "add to planner", "find PYQs for this video". Report-incorrect-video feeds back into the registry.

### Phase 6 — Design system, dashboard, results, QA

- Design system pass: spacing/type/radii/elevation scales, one button/input/tab/card/chart/modal vocabulary, calm Apple-like restraint, real empty/loading/error states.
- Dashboard reduced to: greeting → today's focus + one primary action → today's tasks → progress → 3–5 weak areas → continue learning → optional deep analytics behind disclosure.
- Result page reordered: header score → "What should I do next?" (revise / PYQs / lesson / retest) → strengths → weak areas → mistakes → time → review → full analytics.
- Navigation: Home · Learn · PYQs · Tests · Planner · Progress. Global search across PYQs, chapters, topics, videos, teachers, tests, notes.
- Accessibility + performance pass (virtualized lists, lazy dataset loading, pagination) and device QA at small phone / phone / tablet / laptop / desktop, light and dark.

## Technical notes

- Extract logic out of the monolith into `src/lib/` modules (`data/`, `services/`, `domain/`) consumed by both the existing HTML shell and new TanStack routes, so `VerifiedData → Services → Domain → UI` holds and raw source data never lands in a component.
- Verified datasets ship as versioned JSON under `data/` and are baked at build time (same pattern as `scripts/build-pyq.mjs`); student data stays local/IndexedDB, clearly separated from synced verified data with freshness shown.
- Teacher/video/syllabus verification requires live web research against official sources; anything unverifiable at build time is recorded as `unverified` and hidden from recommendations rather than guessed.

## Scope note

This is six substantial phases, not a single edit. I'll execute them in order, validating and QA-ing each before moving on, and report what could not be verified rather than filling gaps with invented data.