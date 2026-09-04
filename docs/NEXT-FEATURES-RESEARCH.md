# NTACBT — What We Can Add NEXT (Research + UI/UX Focus)

> **This is research only.** Nothing here has been implemented. It answers:
> *"Abhi kya aur add kar sakte hain, aur UI/UX ko how to make world-class?"*
> Every recommendation is evidence-backed (2025–2026 edtech/data + UX law
> sources cited inline) and mapped to where it would plug into THIS repo.
>
> The prompt was **"research and tell me"** — so I'm telling, not building.
> You pick what to implement; I'll do it then.

---

## TL;DR — the 3 big gaps right now

1. **No "photo a question → get a step-by-step solution" AI doubt solver.** This
   is the single most expected post-Doubtnut feature in India and the #1 way
   latest competitors (SATHEE, AI Sir, SolveKar, PYQverse) all converge.
2. **No true spaced-repetition flashcard engine + rank simulator.** We have a
   streak/micro-drill, but not an Anki-style memory scheduler nor "mock score →
   predicted rank + college tier." Both are high-trust, high-value.
3. **Two parallel apps (legacy `jee-cbt.html` + React `/app`) = confusion.**
   UX research says one consistent shell wins. That's the top UI/UX fix.

---

# PART A — FEATURE ADDITIONS (ranked by impact)

## A1. "Snap & Solve" AI Doubt Solver  (HIGHEST impact)
**What:** Photo/upload/type a problem from a textbook, coaching module, mock or
PYQ → instantaneous **step-by-step solution**, with "ask a follow-up", and the
answer grounded in the student's own uploaded notes (RAG) + verified solved
examples.
**Why it wins (evidence):** Every leading India competitor ships this —
SATHEE (IIT Kanpur) calls it an "AI Visual Solver," AI Sir is "photo question
solver," SolveKar "snap & solve," PYQverse "scan-to-solve" with Socratic hints
and concept maps. Students consistently rank *instant doubt resolution 24/7* as
the top value. Doubtnut's whole brand is the "11 PM I'm stuck" moment. [humanli,
sathee, aisir, solvekar]
**Where it plugs in:** new `features/saarthi` (or extend existing Saarthi route)
→ `src/routes/app.saarthi.tsx`. Needs an LLM/vision call + a small curated
"solution style" template (Given data → observations → method → answer) so the
output *looks like a topper's attempt*, not a wall of text. Add **bilingual
(English/Hindi)** toggle here first — that's the differentiator.
**Honesty guard:** mark AI solutions as "AI-drafted — re-check the final step,"
never fabricate a claim to be NTA-official.

## A2. True Spaced-Repetition (SRS) Flashcards + Auto Card Creation
**What:** Anki-style SM-2 scheduling so cards resurface *just before you forget*,
auto-generated from videos/notes/your wrong answers; atomic cloze cards.
**Why it wins (evidence):** Spaced practice beats cramming by **50–200%** (Cepeda
2006, 254-study meta) and active recall beats re-reading by **100–200%**
(Roediger & Karpicke). Consistent 15-min daily review "beats a weekly 2-hour
session." A 2023 *Cureus* cohort found SRS users scored **6–13% higher**.
Automatic card creation from YouTube/notes is exactly the friction Anki users
hate. [learnpathhub, learnlog, flashrecall]
**Where it plugs in:** extend the existing `formulaSRS` + mistake-DNA into a full
SRS store → new `features/memory/srs.ts`; surface as "Memory Locker" on `/app`.
Auto-seed cards from wrong answers (mistake DNA) and from the 5-min micro-win,
so it's never an empty feature.

## A3. Rank / College Predictor ("Mock → Reality")
**What:** Enter a mock score (or feed it automatically) → **predicted JEE rank,
expected college tier (NIT/IIIT/IIT), and exact "what to fix"** list.
**Why it wins (evidence):** SATHEE ships a "Rank Simulator" and "Exam Anxiety
Coach." Students' #1 fear is a low mock → "I'll fail"; a reassuring, actionable,
explainable predictor converts that fear into a plan. It also reinforces the
honest "guaranteed system" positioning (never a blind score). [sathee]
**Where it plugs in:** reuse `ntaPercentile`/`ntaRank` (already in analytics) +
the Survival engine → a new `features/readiness/predict.ts`; add a card on `/app`
and in the mock-test result flow.

## A4. Adaptive question difficulty + Daily Practice Problems (DPP)
**What:** Practice sets auto-adjust difficulty to your level (Prodigy-style) and
daily "DPP" sets (NCERT exemplar + PYQ topic-grouped) with instant solutions.
**Why it wins (evidence):** "Adaptive quiz difficulty" is a listed must-have;
Prodigy/adaptive engines show 30–40% faster targeting; a **course path** with
prerequisites is a core edtech pattern. DPP is a PW/Unacademy staple students
expect. [cleveroad, agencypartner, polychat]
**Where it plugs in:** extend the `practice` route to accept a difficulty guess
from readiness; add a "Today's DDP" generated from weak topics + weightage.

## A5. Parent / Mentee accountability dashboard (shareable)
**What:** A read-only weekly report (attendance, completion, weak topics, next
steps) a student can share with a parent or a mentor — with no shame and no
private data leakage.
**Why it wins (evidence):** Parent/mentor dashboards are a listed high-value
feature ("complete the learning workflow"); they build **accountability** and
trust. Forest's "everyone's tree dies" shows peer accountability drives focus.
[cleveroad, eklavvya, iamprasadtech]
**Where it plugs in:** new `features/report/share.ts` + a `/app/report` render
that exports a clean one-pager (reuse mentor `report.ts`).

## A6. Peer / study-accountability layer (optional, later)
**What:** Shared Pomodoro rooms, a public **leaderboard**, and a "find a study
partner for the same exam/subject" flow (Peerzy's whole pitch: *"no one should
prepare alone"*). Streak + challenge features.
**Why it wins (evidence):** Study-group apps (Study Together, Focusmate, Stream,
Academync) credit **community accountability** (2 AM "300 people online") as
the reason people stay. Leaderboards raise engagement but must be **private /
rotating** to avoid rage-quit (ethical gamification). [academync, cohorty, peerzy]
**Caveat:** this is the most effort + it can backfire (comparison/pressure).
Do it *after* A1–A5. Add "no one should prepare alone" messaging.

## A7. Concept maps / topic prerequisite graph
**What:** A visual map of topics with prerequisite links + "you're weak here, so
this depends on that." Pairs perfectly with the planner's weak-first ordering.
**Why it wins (evidence):** SATHEE "Concept Maps" and PYQverse "Inline
Visualizer" generate diagrams showing the big picture; prerequisite ordering is
a core adaptive-learning pattern. [sathee, pyqverse]
**Where it plugs in:** `data/syllabus.ts` already has weightages — add a light
`prerequisites` field; render a tree on `/app`.

## A8. Global bilingual (EN/HI/Hinglish) + audio summaries
**What:** One toggle flips UI copy + AI explanations across EN/HI; add short
**audio summaries** ("study reels") for on-the-go revision.
**Why it wins (evidence):** SATHEE works in English AND Hindi and is free;
"audio summaries and study reels" for learning on the go is a listed feature.
Large Indian student base is Hindi-first. [sathee]
**Where it plugs in:** an `i18n` alias + a `useLang()` hook; planner already has
a language field — promote it to a global setting.

## A9. Micro-wins / badges / levels (gamification done right)
**What:** XP, levels, badges, progress skill-tree, "beat your last streak." All
must be **earning-based, never guilt** (we already have humane streak + freeze).
**Why it wins (evidence):** Gamification raises completion **25–35%** (skill
trees/progress bars) and Duolingo's 60% retention is gamification-driven;
AI-enhanced gamification tailors challenges to skill. Keep leaderboards private,
badges meaningful (Madeline-style Kano). [polychat, enfin, earthchasers]
**Where it plugs in:** a small `features/focus/achievements.ts` reading streak/
focus/accuracy/survival → award badges; show on `/app`. No ads/promos anywhere.

## A10. Smart, ethical notifications + PWA install
**What:** Loss-framed reminder ("streak ends in 5 min") + "today's one thing"
push; respect quiet hours; **install to home screen** + **offline-first** shell.
**Why it wins (evidence):** PWAs work with poor/inconsistent networks (core for
India), pre-cache the shell, sync background progress, and avoid "you're
offline" dead-ends (skeleton screens instead of spinners). Smart notifications
(reference "what you're currently doing") drive returns. [progressier,
dazzlebirds, forasoft]
**Where it plugs in:** `public/sw.js` exists (service worker) — extend cache for
the app shell; add a notification-permission + preference UI on settings.

---

# PART B — UI/UX DESIGN UPGRADES (the "world-class" look & feel)

> UX laws applied to THIS app. Goal: **clean, fast, one-hand, zero confusion,
> no promotional clutter** — that is our edge over PW/Unacademy (whose biggest
> complaint is wrong dashboard data + unwanted promotions).

## B1. One canonical shell (highest-impact UX fix)
**Problem:** legacy `jee-cbt.html` and React `/app` are two different apps with
different nav.
**Fix:** a single consistent navigation (bottom tab on mobile, top bar on
desktop) with the same 5 items in the same order. Reduce decision load.

## B2. Thumb-zone + touch targets (mobile-first)
- Primary CTA anchored **bottom-center**, 16 px above the safe-area inset.
- Touch targets **≥ 44×44 pt / 48×48 dp**, spaced ≥ 8 px.
- Critical actions in the lower third; informational stuff up top.
- Don't put destructive actions under the resting thumb.

## B3. Navigation via design law
- **Miller's Law:** ≤ 5 primary nav items; group long lists.
- **Hick's Law:** never 7+ choices at once — "Auto (best fit)" default + a *why*.
  (Already partly done: Focus/roadmap segmented controls.)
- **Fitts' Law:** bigger, reachable interactive elements.
- **Law of Proximity:** group related items (subject cards near subject lessons).
- **Visibility:** always show "you've done X, next is Y" (status) — the Survival
  card does this; make it consistent across screens.
- **Recognition over recall:** inline help, not buried settings.

## B4. Accessibility (a real brand trust signal)
- Contrast **≥ 4.5:1** body / **3:1** large text.
- **Dynamic type to 200%** without layout break.
- Touch target min + 8 px spacing.
- Never rely on color alone (add labels/patterns to the survival ring states).
- Proper ARIA labels on every chip/tab (most already present).

## B5. Perceived quality (aesthetic-usability)
- **Skeleton screens** during load, not spinners.
- **Micro-animations + hover lift** on cards (mostly done) — keep consistent on
  every card (StudyTube, PYQ, Review, Practice, Planner).
- One **card system**: rounded-2xl, soft shadow, subject gradient, subject+depth
  chips, clear **Board vs JEE** tag. Standardize.
- **Segmented controls, not dropdowns**, for target/Focus/Live filters.
- Classic, type-scale, spacing tokens so the app never looks "outdated."

## B6. Onboarding (goal → first session in <2 min)
- Minimal input, value-first, **progressive disclosure**, **skip option**.
- Show progress + success states; permissions timely/transparent.
- (We already have `lastVisit` reactivation — extend to a first-run wizard.)

## B7. No dark patterns
- Symmetric opt-in/opt-out, transparent "how we computed" (already in trust
  panel), reversible choices, **no fake countdowns/promo spam**.
- Ethical loss-framing only where real value is at stake (streak, or a due
  review) — never to fabricate urgency.

---

# PART C — PLATFORM / MOBILE

- **PWA install + offline-first** (A10): critical for low-connectivity India.
- **Fast load:** cache-first assets, lazy-load images, defer non-critical JS.
- **≤ 3 taps to every screen** from home (deep-linkable content).
- **Responsive** breakpoints across phone/tablet/desktop; test on real devices.

---

# PART D — PRIORITISED 30/60/90 (what to build next)

**Weeks 1–2 (highest value, low effort):**
- A5 Shareable parent/mentee report (reuses existing mentor/report).
- A3 Rank predictor (reuses existing percentile/rank + survival).
- A8 Global EN/HI/Hinglish toggle + audio summary (planner language → global).

**Weeks 3–4 (the moat):**
- A1 Snap & Solve AI doubt solver (biggest "wow", biggest competitor overlap).
- A4 Adaptive difficulty + Today's DPP.
- B1/B5 Unify the two apps into one shell + standardized card system.

**Weeks 5–8 (retention):**
- A2 True SRS flashcards + auto card creation.
- A9 XP/badges/levels (earning-based, ethical).
- A10 PWA install + offline-first + smart notifications.
- A7 Concept-map / prerequisite graph.

**Later:**
- A6 Peer / study-group / leaderboard layer (only after trust built).

---

# PART E — SOURCES

- Gamification research (progress bars/skill trees +25–35% completion; Duolingo
  60% retention): polychatapp, earthchasers, spellings, enfin, cleveroad.
- Spaced repetition & active recall (Cepeda meta 50–200%; Roediger+Karpicke
  recall +100–200%; Cureus 2023 SRS +6–13%): learnpathhub, learnlog, flashrecall.
- India doubt-solver landscape (SATHEE/IIT-K visual solver + rank simulator +
  bilingual; AI Sir photo solver; SolveKar snap&solve; PYQverse scan+concept
  maps): humanli.ai, sathee, aisir, solvekar, pyqverse.
- Study-group / accountability (Study Together, Focusmate, Stream, Academync,
  Peerzy "no one should prepare alone"): academync, cohorty, peerzy, blog.cohorty.
- PWA / offline-first for low-connectivity: progressier, dazzlebirds, medium.
- UX laws (Hick, Fitts, Miller, Proximity, Aesthetic-Usability, Kano, Fogg,
  Visibility) + 2026 mobile UX best practices (thumb zone, 44–48 px targets,
  4.5:1 contrast, ≤5 bottom-nav, ≤3 taps): wearetenet, forasoft, deventiatech,
  uistudioz, businessofapps.
- EdTech must-have features (dashboard, course path, adaptive quiz, offline,
  notifications, gamification, parent dashboards): cleveroad, agencypartner,
  eklavvya.

---

## How to choose (my honest recommendation)
Build **A1 (doubt solver) + A3 (rank predictor) + A8 (bilingual)** first — they
are the three things a serious student looks for the moment they open a test-prep
app, and they directly challenge PW/Unacademy's weak spots (paid, no real
planner, no bilingual, wrong dashboard data). Then unify the shell (B1) so the
whole thing *feels* like one world-class product instead of two apps.

**Batao — kaunsa pehle?** Main uske hisaab se implement karta hoon.
