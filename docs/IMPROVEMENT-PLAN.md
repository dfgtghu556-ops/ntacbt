# NTACBT — Improvement plan (for approval)

> **Nothing in this document has been implemented.** It is a proposal. Every
> claim in the audit section was measured against the code on `a1b9062`, not
> assumed. Approve, amend, or cut items and I will work only from what you sign
> off on.
>
> **Your stated goal:** improve what already exists and present it better — not
> rip out features and start over. Every item below is scoped to that.

---

## Where we are

`a1b9062` — the rollback of the site-root change that stopped your CBT window
opening. Verified on the production bundle: `/` serves the meta-refresh to
`jee-cbt.html`, `/jee-cbt.html` returns 200 with 13 KB, and the app routes
return 200.

**Still in place from earlier work** (you chose to keep these — none of them
change how the app opens):

| Commit    | What it did                                        |
| --------- | -------------------------------------------------- |
| `166e33b` | Server-rendered the PYQ paper list                 |
| `9c3c064` | Per-route titles and descriptions                  |
| `aa3c908` | Sitemap, robots directive, JSON-LD                 |
| `e60edab` | `/privacy` `/terms` `/about`                       |
| `95f6646` | Fixed the tab title on a failed render             |
| `ca53e4a` | Per-route social cards + a real og-image           |
| `66059be` | Server-rendered the syllabus map and study shelves |

**The app itself:** 48,102 lines across 221 files, 22 features, 46 UI
components, 18 routes, 42 test files (736 tests passing).

---

## Audit — what I measured

### 1. Mobile navigation is the biggest defect

The sidebar is `hidden … lg:flex` (`src/routes/app._layout.tsx:117`). There is
**no hamburger, no drawer, no Sheet** anywhere in the layout — I grepped for it.

So on a phone, the only navigation is the 6-item bottom bar. These are
**unreachable from any navigation surface** on mobile:

- `/app/memory` — Memory Locker (spaced repetition)
- `/app/map` — Syllabus map
- `/app/focus` — Focus timer
- `/app/saarthi` — the AI tutor
- `/app/report` — the shareable progress report

They exist only as deep links buried inside page content. For a JEE prep app
used mostly on phones in India, five of eighteen routes being invisible on
mobile is the single most damaging thing in the product right now.

**Severity: critical.** This is Phase 1.

### 2. The exam runner has no exit guard

`src/routes/cbt.tsx` has no `beforeunload`, no `useBlocker`, nothing. A student
40 minutes into a paper who swipes back or refreshes gets **no warning at all**.
A draft does persist (`DRAFT_KEY`), so the work isn't lost — but nothing tells
them that, so they believe it is and start again.

Separately, submitting uses `window.confirm("Submit test?")` (`cbt.tsx:453`) —
a raw native browser dialog, in the one flow where the app should look most
trustworthy.

**Severity: high.** The CBT runner is the product's namesake.

### 3. Dark mode is broken on the dashboard

The hero card is `bg-gradient-to-br from-blue-50 via-background to-violet-50`
(`app.index.tsx:286`). `blue-50` and `violet-50` are fixed light colours with no
`dark:` variant — so in dark mode you get a pale blue-and-lilac card floating on
a near-black background.

There is exactly **one** `dark:` declaration in the entire 1,532-line dashboard
file.

**Severity: high, and cheap to verify** — switch the theme and look at it.

### 4. The dashboard is one 1,532-line file

`app.index.tsx` is 1,532 lines. `app.studytube.tsx` is 974. Every "present it
better" change means editing a file that big, where a mistake anywhere breaks
the whole page. This is why presentation work is slow and risky here.

**Severity: medium** — a maintainability tax that makes Phase 3 expensive.

### 5. Test coverage has holes in the wrong places

Zero dedicated test files for:

- `cbt` — the namesake feature
- `academics`
- `readiness`

Meanwhile `planner` has 4 and `curriculum` has 4. The scoring logic that decides
a student's marks is less covered than the syllabus data it draws from.

**Severity: medium.**

### 6. Accessibility is partially guarded, not finished

49 uses of `outline-none` against 17 uses of `focus-visible:`. There is an
`accessibility.test.ts` that checks some of this, so it is not unguarded — but
the ratio says most focus rings were removed without a replacement being
written.

**Severity: medium.** Needs measuring per-component, not assumed.

---

## The plan

Each phase is independently shippable and independently revertible. I will stop
and show you after each one.

### Phase 1 — Make every feature reachable on a phone

**Goal:** every one of the 18 routes is reachable in two taps from any screen,
on mobile and desktop.

- Add a mobile drawer (the project already ships `sheet.tsx`) opened by a
  hamburger in the header, containing the full nav: SHELF + NAV + Focus +
  Saarthi + the routes that are currently orphaned.
- Keep the 6-item bottom bar exactly as it is — it is grid-locked to
  `NAV.length` and `nav.test.ts` guards that, and changing it is not needed.
- Do **not** renumber or reorder the primary nav. That is a product decision
  and I will bring you options rather than pick one.

**Risk:** low. Additive — a new component plus a button. The existing sidebar
and bottom bar are untouched.

**Verified by:** a new test asserting every route in the app is reachable from
the nav contract, so a route added later cannot go orphaned again; plus manual
check at 375 px width.

### Phase 2 — Stop the exam runner losing work

**Goal:** a student can never lose an attempt by accident, and the submit flow
looks like it belongs to this app.

- Add a `beforeunload` guard that fires only when an attempt is genuinely in
  progress — never on a finished or abandoned test, because a warning you can't
  act on is just noise.
- Add a router blocker so in-app navigation away from a live attempt asks first.
- Replace `window.confirm("Submit test?")` with the app's own dialog, using the
  `alert-dialog` component that already exists in `src/components/ui/`.
- Keep the existing draft-resume behaviour exactly as it is — it works, and it
  is what makes the guard safe to add.

**Risk:** low-medium. A blocker that fires too eagerly is worse than none, so
the condition for "in progress" is the part I will be most careful about and
will show you before finishing.

**Verified by:** new tests for the guard's trigger condition, and a manual
mid-test refresh.

### Phase 3 — Present the dashboard better

**Goal:** the home screen communicates in five seconds what to do next, without
losing a single feature.

- **First, split the file.** Extract the ~10 sections of `app.index.tsx` into
  components under `src/features/dashboard/`. No visual change at all in this
  step — it is pure refactor, verified by tests, and it is what makes everything
  after it safe.
- **Then** reorder and regroup: establish one clear hierarchy instead of ten
  equal-weight cards. The Phase 6 dashboard IA already documented in
  `docs/REDEVELOPMENT-STATUS.md` (greeting → TodayStrip → DPP → Awards → "Keep
  going" → disclosure) is the intent; this makes it actually read that way.
- **Then** fix dark mode on the hero and audit every other gradient and tinted
  surface in the app for the same light-only-colour bug.

**Risk:** medium. The refactor step is mechanical and test-guarded; the visual
step is where I will show you screenshots before calling it done.

**Verified by:** existing dashboard tests still green after the split; light and
dark screenshots at mobile and desktop widths.

### Phase 4 — Polish pass

**Goal:** the app feels finished rather than assembled.

- Audit every `outline-none` for a replacement focus indicator, using the
  existing brace-aware scanner in `accessibility.test.ts` rather than by eye.
- Empty states: give `app.focus` and the thinner routes a real empty state
  instead of a bare heading — "no sessions yet, here's what one looks like"
  beats a blank card.
- Consistency sweep on spacing, radii and card treatment so the same kind of
  thing looks the same everywhere.
- Raw `alert`/`confirm`/`prompt` — there is exactly one left (`cbt.tsx:453`,
  fixed in Phase 2); confirm the count is zero.

**Risk:** low. Each item is small and independently revertible.

**Verified by:** the accessibility test extended to cover the new cases;
screenshots.

### Phase 5 — Test the parts that decide marks

**Goal:** the scoring and readiness logic is as well covered as the syllabus
data.

- Unit tests for `cbt` scoring, `academics` and `readiness` — the three features
  with no dedicated test files, two of which decide what a student is told about
  their own performance.
- Tests written against the existing behaviour first, so they document what the
  app does today. **If a test reveals the behaviour is wrong, I stop and bring
  it to you** rather than quietly changing the scoring.

**Risk:** low, and it is the phase most likely to surface real bugs — which is
the point.

**Verified by:** the gate, plus a written note of anything the tests found.

---

## Rules of engagement — so this doesn't happen again

The mistake I made was treating a working entry point as a defect because a
checklist said so. Concretely:

1. **No change to how the app opens.** `/` → `jee-cbt.html` stays. If I ever
   think it should change, I bring you a proposal and nothing else.
2. **No feature is removed, renamed or re-scoped.** Improvements are additive
   or visual.
3. **No new dependency, no new architectural pattern** without asking first.
4. **No file is deleted** — including `public/jee-cbt.html`, `public/js/app.js`,
   and the legacy data.
5. **I show you the result of each phase before starting the next one**, and
   anything ambiguous goes to you as a question rather than a decision I make.
6. **The gate stays green at every step:** `tsc` 0, `eslint` 0 errors, `vitest`
   all passing, `validate:all` 0, `build` 0 — verified against the production
   bundle, not the dev server.

---

## What I need from you

1. **Approve the phases**, or tell me which to cut. My recommendation is to do
   Phase 1 and 2 first — they are the two things actively costing you students.
2. **Phase 1 has one open question I will not decide for you:** should the
   mobile drawer show everything (SHELF + NAV + Focus + Saarthi + Memory + Map +
   Report), or should we also reconsider what deserves a slot in the 6-item
   bottom bar? Both are defensible and it is your product.
3. **Phase 3 has one open question:** how much visual change do you want on the
   dashboard — reorder within the current design language, or a genuine redesign?

If you'd rather I just start with Phase 1 and 2 and leave 3–5 until you've seen
them, say so and that's what I'll do.
