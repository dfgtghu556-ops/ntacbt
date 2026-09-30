# Next developments — what is actually worth building

Research note and plan. **Nothing here has been implemented.** This is the plan for
your approval, per the standing rule.

## Approved 2026-09-30

- **Scope:** all four phases (A, B, C, D).
- **Home for export/import:** `/app/profile`. It already holds student identity,
  and "your data" belongs with it. If language, theme and notification preferences
  later need a home of their own, a `/settings` route can be carved out then —
  which is cheaper than adding a nav entry for one section now.
- **Privacy policy wording:** **deferred.** The sentence claiming data leaves the
  device when you create an account stays wrong until it is revisited as its own
  decision. Flagged, not fixed, in this round.

Dropped by your instruction: paper transcription (Phase 2 of the rebuild plan),
A1 Snap & Solve (already shipped in Saarthi), A6 peer/leaderboard layer.

---

## What I measured

I went looking for gaps by walking the app as a student rather than by reading the
roadmap. Six findings, in descending order of how much they cost a student.

### 1. The privacy policy promises a sync that does not exist

`src/routes/privacy.tsx` tells students:

> "Everything below lives in your browser's local storage. It never leaves your
> device **unless you create an account**."

Creating an account does nothing of the kind. `src/services/auth.service.ts` has
two providers — `local` and `supabase` — and the Supabase one stores an identity
token and nothing else. Across all of `src/features/` and `src/services/` there is
**not one** `.insert()` or `.upsert()` call. Three tables are declared in
`src/integrations/supabase/types.ts` (`planner_imports`, `public_tests`, one more)
and **none is referenced anywhere in the app**.

So a student who creates an account specifically to protect their history — the
one reason the sentence gives them to do it — protects nothing. For a product
whose positioning is trustworthiness, an over-promising privacy policy is worse
than a missing feature: it converts an honest limitation into a broken promise.

### 2. There is no way to keep your own data

All student state lives in twelve `localStorage` keys — `ntacbt.cbt.v1`,
`.exam.v1`, `.focus.v1`, `.memory.v1`, `.streak.v1`, `.studytube.v1`, `.user.v1`,
`.profile.v1`, `.student.v1`, `.auth.v1`, `.lang.v1`, `.onboarded.v1`.

`Blob(` appears **zero** times in the entire codebase. There is no download of any
kind. Clear site data, switch browser, change phone, or lose the device, and every
attempt, every streak, every flashcard and every planner tick is gone.

The app spends a lot of effort building history it then makes unrecoverable —
humane streaks, XP, mastery, rank prediction. A rank prediction built on months of
attempts sits in one browser profile.

### 3. The PWA works offline and never says so

`manifest.webmanifest` promises "offline-first"; `__root.tsx` registers
`/sw.js`. But `navigator.onLine` appears **zero** times. A student on patchy
connectivity — the case the PWA exists for — has no way to tell whether the app
is offline, working from cache, or silently failing. This is the exact audience
the offline work was built for.

### 4. The exam runner has no keyboard support

`src/routes/cbt.tsx` contains **zero** `onKeyDown` or `keydown` handlers. Options
are buttons, so Tab and Enter work, but there is no A/B/C/D selection, no arrow
navigation, no Enter-to-save-and-next.

Real JEE Main is keyboard-driven. Students who practise here with a mouse sit the
actual exam with a keyboard. It is also the accessibility gap with the largest
blast radius: the timed, high-stakes surface is the one place a keyboard-only or
motor-impaired user is slowest.

### 5. No skip link

Zero occurrences of a skip-to-content link anywhere. Every page starts with the
header, then the sidebar, then the bottom bar before a keyboard user reaches
content.

### 6. A finished mock's analysis is trapped in the browser

`ExamResult.tsx` has no print, no download, no share. `src/styles.css` has no
`@media print` block. After a three-hour paper, the "what should you do next"
page cannot be saved, shown to a teacher, or kept for later.

---

## Proposed plan

Four phases, smallest-risk first, each independently revertible.

### Phase A — Own your data

The highest-value gap, and the one the product's own privacy policy already
implies should exist.

- **A1. Export.** Download every NTACBT key as one versioned JSON file. Reads only
  the twelve known keys — never a blind `localStorage` sweep, so an unrelated key
  from another app on the same origin is not copied into a student's backup.
  Includes a schema version and an export date so a future import can refuse a
  file it does not understand rather than silently corrupting state.
- **A2. Import/restore.** Pick a file, see what it contains before committing,
  then choose replace-or-merge. Validates shape and rejects an unknown version
  with a readable message. A malformed file must not be able to brick the app.
- **A3. A home for it.** There is no `/settings` route — only `/app/profile`. See
  the decisions below.
- **A4. Make the privacy policy true.** Either describe what an account actually
  does (identity only, no data leaves the device), or stop implying a sync exists.
  This is a wording decision I do not want to make alone — see decisions.

**Risk:** medium. Writing to twelve keys from a file is the one operation here
that can destroy data, so the import path gets the most test attention: unknown
version, truncated JSON, a file from a different app, and an empty file.

### Phase B — The exam runner

- **B1. Keyboard operation.** A/B/C/D and 1–4 select an option; arrow keys move
  between questions; Enter saves and advances. Follows the real NTA interface
  closely enough that muscle memory transfers.
- **B2. A visible legend.** A short, dismissible line stating the shortcuts, so
  they are discoverable rather than folklore.
- **B3. Guard the timed surface.** Shortcuts must not fire while a dialog is open,
  must not fire when focus is in a text field, and must never be able to submit
  the paper. The exit guard from Phase 2 stays the only way out.

**Risk:** medium. This touches a timed exam, so the tests are about what must
*not* happen: a stray keypress must not answer, advance, or submit.

### Phase C — Keep your work

- **C1. Print stylesheet** for the result page, so "Save as PDF" produces
  something worth keeping: score, strengths, weak areas, mistakes, time. Chrome
  and Safari hide navigation and backgrounds by default; the page has to be built
  for that rather than merely not broken by it.
- **C2. Offline indicator.** A quiet banner when `navigator.onLine` is false, and
  a distinct state when the app is serving from cache. Never blocks interaction —
  a student mid-test must not be interrupted by a connectivity toast.

**Risk:** low.

### Phase D — Small accessibility wins

- **D1. Skip link** on the app shell, visible on focus.
- **D2. Focus management** on the drawer and dialogs — focus moves in, is trapped
  while open, and returns to the trigger on close.

**Risk:** low.

---

## Decisions I need from you

**1. Where does "your data" live — `/app/profile` or a new `/settings` route?**
`/app/profile` already exists and already holds student identity. A settings
route would also be the natural home for future preferences (language, theme,
notification quiet hours — all of which are currently scattered or absent).
Creating `/settings` is a new route and a new nav entry; putting it in profile is
smaller but crams two jobs into one page.

**2. What should the privacy policy say about accounts?**
It currently promises a sync that does not exist. I can either (a) correct it to
describe reality — identity only, nothing leaves the device — or (b) leave it and
build the sync later. I would not ship (b) as-is, because the sentence is
actively misleading today. My recommendation is (a), plus export so students have
real control regardless.

**3. Scope.** All four phases, or a subset? Phase A is the one I would not skip —
it is the gap that costs students the most and the one the product's own copy
already assumes is solved.

---

## What I will not do

Not rebuilding anything. Every item above adds to what exists: a download button,
keyboard handlers, a print stylesheet, a banner. No new dependencies, no new
architecture, no rewrite. The exam runner keeps its existing flow, its autosave
and its exit guard.
