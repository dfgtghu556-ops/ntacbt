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

## What I need from you

**1. The F2 decision above** — show-what-survives, store-the-questions, or both?

**2. Scope.** E alone is the highest-value change in this session: it is a data bug
that silently disables the product's core measurement. E+F is the complete fix. I
would not ship E without F, because E makes the analytics page start working and F
is what makes it usable — but if you want E verified on its own first, that is a
reasonable way to sequence it.

**3. Is the legacy `jee-cbt.html` still a supported path?** If it is, the merge in E1
is right. If the React app is now the only exam runner that matters, I could instead
make `DataStore` read *only* the React store and drop the legacy read — simpler, but
it would hide any history a student built up in the old tool. I have assumed the
merge.
