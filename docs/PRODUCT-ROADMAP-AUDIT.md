# NTACBT — Deep-Research Product Roadmap (Evidence-Backed, Grounded)

> This is **not** generic advice. It is built from (a) real student voices from
> Reddit/JEE communities and coaching-crisis reporting, (b) the retention-design
> science behind Duolingo/PW/Unacademy, and (c) a direct map to files in THIS
> repo. Every recommendation names the file it touches and cites why it works.

---

## 0. The single biggest insight from the research

**The #1 reason students fail or quit JEE/NEET/boards is NOT ability, and NOT
even hard work — it is CONSISTENCY + CLARITY + BACKLOG-handling.** Students
repeatedly say the same thing in their own words:

> "The strategy is simple — study consistently for 2 years with modules and PYQs.
> But it's NOT easy to follow and stay consistent for 2 years straight. That is
> the difficult part." — r/JEE

> "Don't make rigid timetables — they're a myth. Make a **to-do list** and
> complete it whenever you get time. Consistency and efficiency matter, not
> hours." — r/JEE

> "Don't measure study **hours**. Measure **goals accomplished** that day."
> — r/JEENEETards

This is a **direct contradiction** with how most test-prep apps (incl. a lot of
NTACBT's current planner) work: they build a *rigid hour-by-hour timetable*.
The research says that exact pattern is what makes students **quit**.

**Therefore the "defining feature" is NOT another video or mock. It is a
system that replaces the rigid timetable with a goal-driven to-do engine that
(a) always tells you the one thing to do next, (b) rebuilds itself when you
fall behind (guilt-free backlog recovery), (c) keeps you consistent with a
humane streak, and (d) converts passive watching into active recall.**

That is the honest "guaranteed success" — not a fake 100% promise, but a
system where a student can never be blind, never be stuck, and never silently
fail.

---

## 1. Research findings → what they mean for NTACBT

### 1.1 Student pain points (the REAL problems to solve)
Source: r/JEE, r/JEENEETards, r/Indian_Academia, coaching-crisis reporting.

| # | Pain point (verbatim theme) | Defines the feature you need |
|---|---|---|
| 1 | **Information overload & no clarity** — "can't decide what to study and how much is enough" | A **single "Do THIS next" mission**, never a wall of options |
| 2 | **Consistency is the real test** — "staying consistent for 2 years is hardest" | **Streak + tiny 5-min action + streak-freeze recovery** |
| 3 | **Backlog → guilt spiral → quit** — "one missed topic becomes a week's delay" | **Auto re-plan on miss, guilt-free** (already partly built — finish it) |
| 4 | **Rigid timetables fail** — "timetables are myths; make a to-do list" | **Goal-based to-do engine, not hour-by-hour schedule** |
| 5 | **Passive revision is worthless** — "keep revising or you forget; do active recall" | **Active-recall micro-drills + spaced repetition** |
| 6 | **Low mock score → self-doubt** — "poor mock = I'll fail" | **Reassuring, actionable mock feedback, not a red score** |
| 7 | **Burnout & no breaks** — "study 12-16h, sleep 2h, mental drain" | **Wellness cues: sleep, breaks, identity beyond the exam** |
| 8 | **Comparing/marks pressure from parents** | **Private progress framing + "your progress, not loss" messaging** |

### 1.2 What successful apps do differently (Duolingo / PW / gap analysis)

From Duolingo retention design (widely cited):
- **Streaks + loss-aversion** are the strongest retention lever; users with a
  7+ day streak are 2.3× more likely to return daily.
- **Streak Freeze / Weekend Amulet** (recovery mechanics) *increase* retention
  — they prevent rage-quitting after losing a long streak. **Crucial:** a streak
  must be *recoverable*, not punishing.
- **Make the action tiny** — a 3–5 min lesson. Low friction = daily habit.
- **Progress must be always visible and continuous** (streak, XP, level, ring)
  — something advances even on bad days.
- **Frame reminders around LOSS, not reward:** "your streak ends in 10 min"
  converts better than "come learn."
- **Loss-framing must be ethical:** it's only OK if it creates real value.

From PW/Unacademy app reviews (the gaps you can beat):
- Users complain about: **unwanted notifications, promotions, blank screens,
  wrong dashboard data, everything paid, no discipline/consistency features, no
  referral.** 
- Users **love:** quality teachers, AI Guru / Saarthi doubt-solving, progress
  tracking, personalized recommendations.
- **Opportunity:** NTACBT is free, has Saarthi, has a real planner, and has real
  verified teachers — the gap is **trust (correct always-visible data),
  consistency mechanics, and a clean non-promotional UI.** That's your edge.

---

## 2. The NORTH-STAR feature: "Guaranteed System" (not a slogan)

One always-visible **"Am I on track?"** surface — the dashboard Mission card —
driven by a composable score:

```
SURVIVAL / ON-TRACK SCORE (0–100)
  = plan-completion% (real watch-time, not estimates)
  + weak-topic accuracy (readiness)
  + mistake-DNA severity (cbt/analytics)
  + consistency/streak
  + exam proximity
```

It **never lies** and always resolves to **one executable action**:
> "On track. Next: Electrostatics (weak) — 25 min. Start now."

This single component fixes pain #1 (clarity), #6 (fear), and #8 (trust) at once
and is the market differentiator. It builds directly on code you already have
(`readiness`, `planner/adapt`, `cbt/analytics`, `mentor`, the real-watch-time
work).

---

## 3. 10 evidence-driven features, ranked by impact

### Tier 1 — build these first (they fix the real problems)

**F1. Goal-based To-Do engine instead of rigid timetable**
Replace/augment the hour-by-hour planner with a **daily priority to-do list**
(the research: "make a to-do list, complete it whenever"). Each item = a goal
with effort minutes, auto-sorted by weakness + weightage. The student checks off
goals (goal-based progress), not "sat for X hours." 
→ `public/jee-cbt.html` `aipToday`/`aipGenerate`; `app.planner.tsx`.

**F2. "Am I on track?" Mission + Survival Score** (see §2)
→ Dashboard. `app.index.tsx` + `readiness.ts` + `planner/adapt.ts`.

**F3. Auto re-plan on missed/overrun (guilt-free recovery)**
Extend the existing rebalance: missed a day → automatically slot missed tasks +
rebalance; finished early → auto-pull the next task. This kills pain #3 (the
#1 quitting trigger).
→ `aipRebalance`/`aipRebalanceActual` in `jee-cbt.html`.

**F4. Active-recall micro-drills from Mistake DNA**
Take the student's top mistake tag (concept/formula/calculation/misread/silly)
+ weakest topic and generate a **5-question micro-drill** (active recall beats
passive revision). Post-video bridge already exists — extend it to be
mistake-aware.
→ `features/cbt/analytics.ts` → new `features/cbt/microDrill.ts`.

### Tier 2 — strong retention + differentiation

**F5. Humane Streak + Streak-Freeze**
Daily-consistency streak with **recovery** (freeze/grace), shown as a persistent
flame/ring. Use loss-framing *ethically* ("your streak ends in 5 min") only when
real value is at stake. Never punish a miss into a rage-quit.
→ Dashboard + a tiny `features/focus` streak util.

**F6. "Your progress, not your loss" reactivation message**
When a student returns after a gap, **lead with what they still have** ("your
progress isn't gone") rather than shaming the gap. Proven to raise return rate.
→ Dashboard empty/greeting state.

**F7. JEE + Board dual-lane readiness (the balanced promise, made visible)**
Show JEE readiness AND board readiness side-by-side with automatic time
splitting ("weekdays = JEE, weekends = boards"). This is genuinely scarce and
matches the app's whole identity.
→ `readiness.ts` + planner.

**F8. Tiny-action warm-up ("5-min micro win")**
The first thing on a tired day is a **5-minute** win (a formula recall, 3 quick
questions). Low friction keeps the habit alive — Duolingo's core trick.
→ Dashboard quick action.

### Tier 3 — polish & scale

**F9. Wellness/balance signals**
Sleep, breaks, "identity beyond the exam" nudges — not guilt. Burns trust.
→ Dashboard wellness strip.

**F10. Trust = correct, always-visible data**
The #1 PW complaint is "dashboard shows wrong data." Guarantee NTACBT's numbers
are correct (real watch-minutes already fixed) and show *how* each is computed.
→ `store.ts`, dashboard.

---

## 4. UI / UX modernisation (where it is boring → interesting)

1. **Dashboard = "War Room", one Mission card.** One big "Today, do THIS" card +
   a single animated progress ring (streak). Everything else below the fold.
2. **Unified card system** across StudyTube / PYQ / Review / Practice: rounded-2xl,
   soft shadow, hover lift, real thumbnails + subject gradient, subject + depth
   chips, a clear **Board vs JEE** tag. (Partly done — finish consistency.)
3. **The "choose" screens** (Planner Dream Team/Teacher, StudyTube Focus,
   Live filters): grouped choice + "Auto (best fit)" default + always a *why*.
   Never >7 options at once.
4. **Empty states are never dead-ends.** Every "No X right now" offers a
   one-tap "watch the best verified fallback now."
5. **One canonical shell.** Consolidate legacy `jee-cbt.html` and React `/app`
   into one consistent navigation (research shows two parallel apps = confusion).
6. **Segmented controls** (not dropdowns) for Focus mode / Live filters / target —
   obvious toggles, not buried options.

---

## 5. Prioritised 30/60/90 roadmap

**Week 1 — trust & no dead-ends:**
- F3 auto re-plan + F1 to-do engine (fixes the top quitting trigger).
- F10 correct, always-visible progress (real watch-minutes).
- Unify card design; fix empty states; consolidate nav shell.

**Week 2–3 — the moat:**
- F2 "Am I on track?" Mission + Survival Score on dashboard.
- F4 Mistake-DNA micro-drills.
- F5 humane streak + F8 5-min micro-win.

**Week 4–6 — retention & balance:**
- F7 JEE+Board dual-lane readiness.
- F6 "your progress, not your loss" reactivation.
- F9 wellness signals.

**Month 2–3 — scale:**
- Shared study room / parent accountability view.
- Full legacy→React migration for a single consistent product.
- Onboarding: goal → plan → first session in <2 minutes.

---

## 6. The honest "100% success guarantee"

You **cannot** guarantee the outcome — no platform can, and claiming it destroys
trust (students are sick of it). You **can** guarantee the **system**, which is
more believable and more differentiated:

> **"We guarantee you will never study blind and never get stuck."**
> Every day you open NTACBT you get: (1) exactly the one thing to do next,
> (2) proof of why, (3) an automatic guilt-free fix when you fall behind,
> (4) a humane consistency streak, (5) active recall not passive watching,
> (6) live accountability. Do that and you maximize your outcome — and every
> claim is shown as a real number on screen.

Put this as a **Guarantee Card** on the dashboard, backed by F2/F3/F4/F5.
That is your defining, honest, world-class differentiator.

---

## 7. Sources (research basis)

- r/JEE, r/JEENEETards, r/Indian_Academia — student planning/consistency/burnout
  threads (2023–2026) — the "consistency is the real test", "make a to-do list
  not a timetable", "don't measure hours measure goals" themes.
- Coaching-crisis & burnout reporting (Kota 2023; MDPI Psychology 2025;
  academic-stress research on NEET/JEE aspirants).
- Duolingo retention design analyses (streaks, streak-freeze, loss-framing,
  tiny actions, progress visibility, ethical loss-aversion, reactivation).
- Physics Wallah / Unacademy app reviews (gaps: unwanted notifications,
  promotions, wrong dashboard data, no consistency/discipline features,
  everything paid; strengths: teachers, AI/Saarthi doubt-solving, personalization).
- 2026 JEE Main syllabus/difficulty analysis (conceptual + accuracy > speed).

---

## 8. Recommended first 3 tickets (concrete, shippable)

1. **Dashboard "Today's Mission" + Survival Score widget**
   Files: `src/routes/app.index.tsx`, `src/features/readiness/readiness.ts`,
   `src/features/planner/adapt.ts`. Add `computeSurvival()` + one big mission card.

2. **Mistake-DNA micro-drill generator**
   Files: `src/features/cbt/analytics.ts` → new `src/features/cbt/microDrill.ts`.
   Top mistake tag + weakest topic → 5 active-recall questions.

3. **Auto re-plan on missed day + auto pull-forward**
   File: `public/jee-cbt.html` `aipToday`/`aipRebalanceActual`. Missed a day →
   auto-slot + rebalance; Today done → auto-pull next task.

Tackle in this order and NTACBT becomes the **"you can't fail silently" platform**
— the strongest, most honest, most defensive "guaranteed success" position in
test-prep.
