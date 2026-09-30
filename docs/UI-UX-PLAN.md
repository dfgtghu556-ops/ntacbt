# UI/UX, theme and information design — findings

Research and remediation record. Started 2026-09-30; all three reported defects
are now fixed and shipped.

This document used to be a *plan* that proposed a redesign and a new brand
colour. That proposal was rejected. It is kept as a findings record so the
measurements behind the shipped fixes stay available, and so the next person
does not re-propose the redesign.

---

## What was reported

Three defects, in the user's words:

1. **Device optimisation** — *"The YouTube section is not optimized for all
   devices. In fact, the entire app needs to be optimized for every device."*
2. **Dark mode** — *"some elements on the front remain white, making them
   invisible. Similarly, in the planner section, certain elements also remain
   white and cannot be seen when dark mode is on."*
3. **Language toggle** — explain what it is, then implement.

## The correction that shaped everything below

The first draft of this document proposed a new brand colour, a token overhaul
and a visual redesign. The user rejected it:

> *"My goal for this re-development isn't to rip out the existing features and
> start over; it's to improve what's already there and present it in a better
> way."*

> *"I don't want you to change everything completely. I just want improvements
> on the elements that are not properly in place. Please keep them in place, but
> represent them in a better way."*

So there is no redesign here, no new brand system, and no token overhaul. Every
change is a targeted fix to a specific broken element.

---

## Defect 1 — Dark mode left elements white and invisible

### Where the dark mode actually lives

The dark mode a student sees is **not** in the React app. `/` redirects to
`public/jee-cbt.html`, and that tool has a real theme toggle in
`public/js/app.js`:

```js
function applyTheme() {
  const dark = st.theme === "dark" || (st.theme === "system" && systemDark());
  root.classList.toggle("dark", dark);
}
// default: theme: "system"
```

`"system"` means it follows `prefers-color-scheme`. **The user never turned dark
mode on — their device did**, and the legacy tool followed automatically. That
is the screen with the bugs.

The React app at `/app` has no reachable dark mode at all: the `.dark` block in
`src/styles.css` is dead, because nothing ever applies the class. Making `/app`
themeable is a separate, larger piece of work and was not attempted.

### The legacy tool themes through tokens

`public/css/legacy.css` sets light values in `:root` and overrides them in
`html.dark`, so any rule using `var(--panel)` / `var(--ink)` / `var(--line)`
themes correctly. Any rule with a hardcoded light value does not — it stays a
bright slab on a dark page.

### Root cause of the reported bug

The two tab bars the user named are `<button class="chip">` sitting on a bar
whose background is inline `var(--bg)`:

| Screen | Tabs |
|---|---|
| Dashboard (`data-dtab`) | ☀️ Aaj · 📈 Progress · 🎯 Practice |
| Planner (`data-atab`) | 🎯 Aaj · 🗺️ Plan · 🧠 Memory · 🧰 Tools |

`.chip` declared a border and **no background of its own**. A bare `<button>`
therefore painted the browser's UA default `buttonface` — a light grey — and
`buttonface` answers to `prefers-color-scheme`, **never to a `.dark` class**.

That is the whole reason earlier sweeps found nothing: the light surface was
never written in the stylesheet. It was in the browser. No amount of grepping
`legacy.css` for `#fff` was ever going to find it.

### The fix — CSS only, `public/js/app.js` untouched

1. The global form reset now declares `background: transparent;
   background-image: none;`. It had been setting font, size and colour and
   stopping one property short.
2. `.chip` names its own surface — `var(--panel)` for the background,
   `var(--ink)` for the text — plus a `.chip[aria-selected="true"]` rule that
   carries the accent border and ink the JS was previously setting inline.
3. The same reset also covers `.swatch`, `.aip-budget` and `.mc-item`, the other
   button classes that had no background of their own.

Shipped in `4d14a2d` ("Fix the dark-mode tabs: browsers do not theme a bare
button"). Pinned by `src/test/legacy-dark-mode.test.ts`, which was verified to
bite: deleting the reset fails the suite with
`AssertionError: the reset must clear the background`.

### Deliberately exempt light surfaces — do not "fix" these

- `@media print` — browsers print computed colours and ignore
  `prefers-color-scheme`, so print is always light.
- `html[data-nta="on"] #examView` — a faithful TCS-iON / NTA console replica.
  The real exam console is white paper with black ink and Verdana.
- Amber and red warning states — `.timer.warn`, `.timer.crit`, `.btn.warn`,
  `.offline-bar`. Dark ink on a saturated light background is readable in both
  themes.
- `.live-thumb .lbadge` and its dot — white on the red LIVE badge; the red is
  dark enough to carry white either way.
- `.qfig`, `.qsvg svg`, `.imgzoom-body img` — a question image is ink on paper,
  so it keeps a light surround.

---

## Defect 2 — The app is not optimised for every device

### The audit came back mostly clean, which is worth recording

Measured rather than guessed:

| Check | Result |
|---|---|
| All 42 multi-column grids in the React app | Every one has a `sm:`/`lg:` prefix or an explicit `grid-cols-1` base — no grid starts at 2+ columns on a phone |
| YouTube iframes, legacy and React | `position:absolute; inset:0; width:100%; height:100%` — fully fluid |
| Viewport meta | `width=device-width, initial-scale=1, maximum-scale=5` — pinch-zoom allowed |
| Legacy StudyTube sidebar | Collapses to a horizontal strip at ≤900px |
| Legacy question palette | Becomes a bottom sheet at ≤860px |
| `.hero-stats` / `.ov-grid` | Step 4→2→1 columns correctly |
| All 22 fixed widths ≥180px in `legacy.css` | 15 are `max-width` caps or decorative blur orbs inside `overflow:hidden` parents — harmless |
| `100vw`, `w-screen`, `flex-nowrap` | Zero occurrences |

**No screen was found to break.** The method has a limit worth stating plainly:
there is no browser in this environment, so this was a code-level audit against
the markup, not a rendered one.

### Three real defects, all phone-only, all in StudyTube

**1. The legacy search-results grid was the one grid that was not a carousel.**
`public/js/app.js` renders `<div data-searchResults class="yt-grid">` as a direct
child of the `.yt-main` column, **outside every `.yt-shelf`**. The carousel rule
is scoped `.yt-shelf .yt-grid`, so it never reached that element. On a phone,
search results rendered as one full-width ~300px column sitting directly above
seven compact swipeable carousels — the same component, two different phone
layouts.

It now gets the same density: two-up on phones, back to one-up below 380px where
two thumbnails get unreadable. The results header carries an inline
`grid-column: 1/-1`, so it keeps spanning the full row at each of those widths.

**2. The carousels hid their scrollbar with no other cue that they swipe.**
`.yt-shelf .yt-grid` sets `scrollbar-width: none` and
`::-webkit-scrollbar { display: none }`, and left nothing else. On a phone you
saw one card and a sliver with no indication there was more. Cards went from
`min(250px, 72vw)` to `min(250px, 66vw)`, leaving ~60px of the next card peeking
in on a 320px screen. Above ~380px the 250px cap wins, so tablets and large
phones are untouched.

**3. The React StudyTube had no mobile carousel at all.** Each shelf was a
single tall column while the legacy one swiped, so the same shelf behaved two
ways depending on which StudyTube you were in. Below `sm` each React shelf is
now a snap carousel with matching card sizing; from `sm` up it is the same
2 / 3 / 4-column responsive grid it always was.

### The fix

`bf38d72` ("Make both StudyTubes behave the same on a phone") plus `97e94ea`
("Fix the responsive test's `@media` lookup"). Pinned by
`src/test/studytube-responsive.test.ts`.

All legacy-side changes are CSS-only. **`public/js/app.js` is untouched** — it
is on the do-not-edit list, and none of these fixes needed it.

---

## Defect 3 — The language toggle

### What it actually is

A pill in the `/app` header, next to Search, labelled `Hinglish` / `English` /
`हिंदी`. Clicking it cycles the three and persists the choice to
`localStorage["ntacbt.lang"]` via `src/lib/lang.ts`.

### What it actually does — the complete list

1. **It changes the read-aloud voice.** `src/lib/speech.ts` maps `hi → hi-IN`
   and everything else to `en-IN`, and sets `utterance.lang`. So it changes the
   language **Saarthi, the AI mentor, speaks in**.
2. **It changes three labels on one dashboard card.** `SurvivalMission.tsx`
   reads `t("onTrack")`, `t("doThisNext")` and `t("nextMission")`.
3. **Nothing else.** `useLang()` is consumed in exactly two files, `t()` in
   exactly one component. The dictionary holds seven keys and four of them are
   read by nothing.

### The mismatch

The button said "Change language", but a student who tapped हिंदी still got an
English app. That is a half-finished feature rather than a bug in the usual
sense — all the plumbing exists (it persists the choice, the dictionary holds
three languages), but only three strings were ever connected to it. Wiring the
whole app means translating hundreds of strings across ~30 screens, and a
*partly* translated app is often worse than a clean single-language one.

### The decision

**Scope it honestly rather than promise what does not exist.** The button is
relabelled to `aria-label="Change read-aloud language"` with the tooltip
*"Saarthi's read-aloud voice: Hinglish / English / Hindi"*. The unused `t`
import was removed from `app.index.tsx`, where the only `t` in scope was a
local `.filter((t) => t.isWeakTarget)` arrow parameter shadowing it.

Extending the dictionary to the high-traffic surfaces, or translating the whole
app, are both still available as deliberate follow-ups. Neither was done,
because a half-translated UI is a worse outcome than a clearly-scoped one.

---

## Standing design decisions from this work

- **No redesign, no new brand colour, no token overhaul.** The existing token
  set is fine; it just was not reached in the places that were broken.
- **`public/js/app.js` is not edited.** The theme logic and the StudyTube
  markup live there and none of these fixes required touching it.
- **`public/css/legacy.css` is the place for legacy visual fixes.** It is not on
  the do-not-touch list.
- **Base UI copy is uniformly English.** Seven Hinglish fragments were fixed in
  an earlier pass. Exempt from the one-language rule: `src/lib/lang.ts`, whose
  dictionary is meant to hold Hinglish, and the AI mentor's system prompt in
  `src/routes/api/public/ai-chat.ts`, whose voice is deliberately Hinglish.
- **The React app's lack of dark mode is a known, separate gap**, not something
  these fixes papered over.

---

## Open items

- **`/app` has no dark mode.** The `.dark` block in `src/styles.css` is dead
  because nothing applies the class. Students see the legacy tool's dark mode.
- **`src/config/theme.ts` drifts.** It claims to mirror `styles.css` but uses
  `hsl()` with different values. Its palette is dead code; only
  `SUBJECT_COLORS` is live.
- **`scripts/validate-survival.mjs` fails 2 checks** — "strong tier named" and
  "jeeadv target returns a tier" in the rank / college predictor. This is
  pre-existing and unrelated to any UI work; it also sits *outside* the
  `validate:all` gate, which does not run that script.
- **Privacy-policy wording remains deferred** — the user's decision, and not to
  be edited unilaterally.
- **`src/routes/app.studytube.$video.tsx`** was read and found sound (fluid
  iframe, `lg:grid-cols-[1fr_340px]` collapsing to one column below `lg`), but
  like the rest of the responsive audit it has not been verified on a real
  rendered device.
