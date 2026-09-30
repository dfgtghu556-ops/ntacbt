# Next phase — the app cannot see its own test results

Research note and plan. **Nothing here has been implemented.** This is the plan for
your approval, per the standing rule.

---

## Approved 2026-09-30

- **Scope:** Phase E only. Phase F (attempt list, reopenable results) comes back for
  approval once the data flow is fixed and verified.
- **F2 decision, recorded for when F runs:** store the questions with each attempt
  *and* degrade honestly if they are absent.
- **Legacy history:** **merge both stores on read.** Corrected from an initial
  mis-selected "react-only". The app still links students to `jee-cbt.html` from
  `/app/analytics` and `/app/tests`, so hiding that tool's results would contradict
  the app's own instructions — and `public/jee-cbt.html` is demoted, not deleted.

## Status

- **Phase E — shipped** (`d252ede`). Attempts from the React exam runner now reach
  `DataStore.attempts`; 20 tests, 11 of which fail without the merge.
- **Phase F — shipped** (see below). The paper is stored with each attempt, an
  attempt list renders on `/app/analytics`, and `/app/attempts/$attemptId` reopens
  a stored attempt as the full result screen. Attempts whose paper is absent
  degrade honestly.

## The finding

**Every attempt made in the modern exam runner is invisible to everything that
measures progress.**

Two stores hold student data:

- `ntacbt.cbt.v1` — the React app's own store. `exam.service.submitExam` writes a
  full `CbtAttemptRecord` here, including per-question `responses`.
- `jeecbt.v1` — one monolithic blob written by the **legacy** `jee-cbt.html` tool.
  `DataStore` reads it, and the React app never writes it.

`DataStore` is constructed in 11 places — `/app/analytics`, `/app/index`,
`/app/report`, `/app/focus`, `/app/map`, `/app/planner`, `/app/saarthi`,
`/app/search`, `/app/studytube`, memory and the nudge scheduler. Every one of them
reads `DataStore().attempts`, which is `jeecbt.v1`'s attempts.

`loadCbtStore().attempts` — the React store's attempts — is read **nowhere** in the
UI. `examService.getUserAttempts()` exists, is fully implemented, and is called by
nothing.

Proven at runtime, not inferred. Submitting a two-question paper through
`examService.submitExam` and then reading what each surface sees:

```
keys in localStorage: ntacbt.cbt.v1
ntacbt.cbt.v1 attempts: 1
legacy jeecbt.v1 attempts (what /app/analytics reads): 0
```

### What that costs a student

A student sits five mocks in this app and sees:

- `/app/analytics` — "No attempts yet", and a link telling them to go and take one
- readiness score — 0
- rank prediction — none
- mastery — empty
- the mentor report — "Too little data"
- the dashboard's whole "Learning OS" story — nothing

The only students who see any of it are those who previously used the legacy static
tool. The app's central promise — that it measures your preparation and tells you
what to do — is fed by a store it never writes to.

This also explains something that otherwise looks like a missing feature: the app
saves a complete per-question record of every attempt and has no way to show it to
anyone. `CbtAttemptRecord.responses` is the richest data in the product and it is
write-only.

---

## The plan

Two phases. The first is the data bug and is the one that matters; the second is
the UI that makes the fixed data visible.

### Phase E — make attempts flow

**E1. `DataStore.attempts` reads both stores.** Merge the legacy `jeecbt.v1`
attempts with the `ntacbt.cbt.v1` attempts, converting `CbtAttemptRecord` into
`AttemptSummary`. The read side unifies, so all 11 call sites are fixed at once and
nothing new has to be wired per-route.

Fixing the *read* rather than the *write* is deliberate: writing an `AttemptSummary`
into `jeecbt.v1` from the React app is explicitly forbidden — `src/test/onboarding.test.tsx`
asserts the wizard never touches the legacy blob, and the blob is the legacy tool's
to own.

**E2. Dedupe.** An attempt must not appear twice if it somehow exists in both.
Match on `id`; the CBT store's ids are `att-<base36 time>` and the legacy app's are
its own, so a collision is unlikely but a merge that silently doubled a student's
attempt count would be worse than the bug being fixed.

**E3. Preserve today's contract exactly.** `DataStore.attempts` currently filters to
`submittedAt` being a number and sorts ascending by it. Both stay — a draft that was
never submitted must not appear as a result, and the trend chart depends on the sort
order.

**E4. Bound it.** The CBT store caps at 60 attempts; the merged getter should not
return something unbounded if both stores are full.

**E5. Tests.** A React-app attempt becomes visible; a legacy attempt still is; both
together dedupe; an unsubmitted draft stays excluded; the sort order is unchanged;
and the readiness/analytics surfaces that read through `DataStore` now see a
submitted paper.

**Risk:** medium. This changes what 11 call sites see, so a student with existing
legacy data must not lose it and a student with React attempts must not see them
doubled. That is what E2 and E5 are for. No existing test asserts the current empty
behaviour — the suites that mention attempts pass them as explicit arguments.

### Phase F — let a student see their history

**F1. An attempt list on `/app/analytics`.** Every submitted attempt with its date,
marks, accuracy and time taken, newest first, above the trend chart. Today the page
shows aggregates only, so there is no way to answer "how did I do on the second
one?"

**F2. Reopen a result.** Clicking an attempt renders the full result page again from
the stored `responses` and the test definition — the same `ExamResult` the student
saw at submit time, with its "what should you do next" section.

**F3. `examService.getUserAttempts()` finally gets used** instead of being dead code.

**The hard part, and the one decision I need from you:** F2 needs the test
*definition* to still exist, and `ntacbt.cbt.v1` caps tests at 30 and attempts at 60.
If the definition is gone, the aggregate score and accuracy are still on the attempt
record and can be shown honestly, but the per-question review — which questions,
what the mistake-DNA analysis said — cannot. Three ways to handle it:

1. **Show what survives.** Score, accuracy, time and subject breakdown from the
   stored result; the question review is replaced with a plain statement that the
   paper is no longer on this device.
2. **Store the questions with the attempt.** Every attempt carries its own copy of
   the paper, so a result can always be reopened. Costs storage — a 75-question
   paper is roughly 30–40 KB, and 60 attempts would be ~2 MB, against a ~5 MB
   `localStorage` budget.
3. **Both.** Store the questions, and still degrade honestly if they are somehow
   absent.

I would take **3**: the storage is affordable and it is the only version where a
student can always reopen what they did, with the honest fallback for the case where
they cannot.

**Risk:** medium. F2 renders a scored result from stored state, so the tests are
about the degraded paths: no test definition, a truncated attempt, a result with no
`responses`.

---

## Decisions taken 2026-09-30

1. **F2** — **both**: store the questions with each attempt, and degrade honestly if
   they are absent. The storage estimate was checked rather than assumed: a
   75-question paper is ~10 KB serialised, so 60 attempts is ~600 KB against the
   ~5 MB budget. Affordable.
2. **Scope** — E first, then F.
3. **Legacy** — **merge both stores on read**, not react-only. The app still links
   students to `jee-cbt.html` from `/app/analytics` and `/app/tests`, so hiding that
   tool's results would contradict the app's own instructions.

## What shipped

**Phase E** (`d252ede`) — `DataStore.attempts` merges both stores, dedupes on `id`
with legacy winning a tie, preserves the ascending sort and the `submittedAt` filter,
and returns copies. The React read is guarded: a non-JSON key, `attempts` that is not
an array, an attempt with no result, or a null entry all fall back to "the legacy
blob still works" rather than throwing, because the getter runs on every `DataStore`
construction and a throw would take down the dashboard, not just the analytics card.
20 tests; 11 fail with the merge removed.

**Phase F** — three pieces:

- **The paper travels with the attempt.** `CbtAttemptRecord` gains an optional
  `test`; `exam.service.submitExam` writes the whole converted paper into it. This
  is the part that makes a result reopenable at all: the question review, the topic
  breakdown and the mistake doctor all read `test.questions`.
- **An attempt list on `/app/analytics`**, newest first, paginated, linking each row
  to its own reopen route. `AttemptSummary` carries no paper name, so the name is
  looked up from the React store; a legacy attempt with no name is labelled by date
  rather than given a fake one.
- **`/app/attempts/$attemptId`** renders the stored attempt through the same
  `ExamResult` the student saw at submit time.

**The degraded path is the point.** Two populations of attempts have no stored
paper: every attempt made before the field existed, and every attempt from the
legacy tool, which never wrote it. `AttemptDetail` shows what is real — the score,
the subject breakdown, when it was sat — and states plainly that the review is not
available. The three tempting shortcuts are all refused, and the tests assert on
their absence:

| Shortcut | Why it is refused | Pinned by |
| --- | --- | --- |
| Render an empty review list | Reads as "0 questions" — the student concludes they answered nothing | `never renders an empty review list` |
| Render from today's copy of the paper | Contradicts the score if the paper was edited since | `never falls back to the current copy of the paper` |
| Hide the attempt from the history | Silently loses the student's work — the failure E was fixed to stop | `is still in the history list` |

**A bug the route introduced, and fixed in the same pass.** The history renders the
merged view, so it links to legacy attempts - and the reopen route searched only the
React store. Every legacy row navigated to "Attempt not found", which tells a student
their work is not on a device that is holding it. Fixed by `findAttempt`, which
searches both stores. Seven tests fail with the dual lookup removed.

`findAttempt` is extracted from the route into `src/features/exams/attempt-lookup.ts`
so it is testable without a router harness. It also reads the legacy blob directly
rather than through `DataStore`, because `DataStore.attempts` returns
`AttemptSummary` - which drops `responses`. Checked against `public/js/app.js` rather
than assumed: the legacy tool *does* store per-question responses and a graded result,
in the same shapes the React engine produces. Only the paper is missing, which is what
routes a legacy attempt to the degraded screen. The blob is parsed with validation at
every step - a non-JSON value, a non-array `attempts`, a row that is not an object, a
missing `testId`, an unsubmitted attempt, a `result` that is not an object and an
unknown response status all degrade to "no such attempt" rather than a crash or a
fabricated result.

**F3, not done.** `examService.getUserAttempts()` is still called by nothing. The
reopen route reads `loadCbtStore().attempts` directly, because it needs the stored
paper and `getUserAttempts()` returns `ExamAttempt` — a different shape that does not
carry it. Wiring the service up would mean either widening `ExamAttempt` or adding a
second reader, and neither is needed while there is one caller. Left as a note
rather than a half-used abstraction.

**One storage note.** The snapshot is the *converted* `CbtTest`, not the `Exam` it
came from — `toCbtQuestion` maps `correctAnswer` to `answer` and `explanation` to
`sol`. That is the shape `ExamResult` consumes, which is the reason it is stored
converted rather than raw.
