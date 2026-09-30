# UI/UX, theme and information design — corrected findings

Research pass, 2026-09-30, revised after the user's report.

---

## The correction that matters

I originally concluded "dark mode is unreachable." That is true of the React app at
`/app` — nothing applies the `.dark` class there and there is no toggle. But it is
**not where the user is**.

`/` redirects to `jee-cbt.html` (`src/routes/index.tsx` does
`window.location.replace("/jee-cbt.html")` on mount). That tool has a real theme
toggle, and `public/js/app.js` shows how:

```js
function applyTheme() {
  const dark = st.theme === "dark" || (st.theme === "system" && systemDark());
  root.classList.toggle("dark", dark);
  ...
}
// default: theme: "system"  (public/js/app.js:655)
```

`"system"` means it follows `prefers-color-scheme`. So the user did not enable dark
mode — **their device did**, and the legacy tool went dark automatically. That is the
screen they are looking at, and the one with the bugs.

---

## What I need from you — answered

**Brand colour.** You said: don't change everything, improve what isn't properly in
place. Understood — the token set is fine, it just isn't reached. Dropped from scope.

**The language toggle.** Plain version: the top-bar button cycles English / हिंदी /
Hinglish and changes no words. `useLang()` is read in `src/routes/app.index.tsx:162`
and `src/routes/app.tsx:33` and its value gates nothing; the only consumer in the
codebase is `src/lib/speech.ts`, choosing a read-aloud voice. Two sentences are
half-translated:

```
src/routes/app.index.tsx:662
  "Full-length ya diagnostic run. Marking NTA rules (+4/−1, numerical no penalty)
   follow karta hai aur result aapke Mistake Doctor + readiness model me feed hota hai."
src/routes/app.saarthi.tsx:117
  "Image read nahi ho payi — dobara try karo."
```

Recommendation: remove the toggle, make those two sentences clean English. Making it
real means translating the whole app.

---

## The two reported bugs

### 1. Dark mode leaves white panels invisible

The legacy tool themes through tokens. `public/css/legacy.css` defines light values in
`:root` and overrides them in `html.dark`:

```css
:root    { --panel: #ffffff; --bg: #fbf7f4; --ink: #1b1b3a; --line: #eadfd7; }
html.dark{ --panel: #1e1b29;  --bg: #14121c; --ink: #f2ece6; --line: #332e42; }
```

So every rule using `var(--panel)` themes correctly. **Every rule with a hardcoded
`#fff` / `white` / light hex does not** — it stays white on a dark background, which is
the "invisible" symptom, on the front page and in the planner.

The fix is CSS-only in `public/css/legacy.css`. The theme logic lives in
`public/js/app.js`, which is off-limits, but nothing there needs to change: adding
`html.dark` overrides is enough.

### 2. The YouTube section is not optimised for all devices

Read the components. The pieces in place:

- `src/features/studytube/components/VideoCard.tsx` — `Thumb` uses
  `aspect-video w-full`, the title `line-clamp-2`, the row `flex gap-2.5` with
  `min-w-0 flex-1`, buttons `flex-wrap`. This part is sound.
- `src/routes/app.studytube.$video.tsx` — the player is
  `<iframe className="aspect-video w-full">` inside
  `grid gap-4 lg:grid-cols-[1fr_340px]`, collapsing to one column below `lg`. Sound.
- `src/routes/app.studytube.tsx:950` — the grid is
  `grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4`. Sound.

What is **not** sound, and needs measuring rather than guessing:

- Line 603, the filter bar:
  `grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap`.
  It switches from a grid to a flex row at `lg`, so the control count and sizing
  differ per breakpoint — the kind of thing that looks fine on a laptop and crowded
  on a tablet.
- `ChannelCard` is a fixed `w-44 shrink-0` in a horizontal strip — it does not reflow,
  it scrolls.
- The lesson page's tab strip (`Notes / Chapter / Formulae / PYQs`) and its panels
  have not been checked at 360px.

Needs a real check at 360 / 390 / 768 / 1024 / 1440 before anything is changed. There
is no browser in this sandbox, so this has to be done by reading the breakpoints
against the markup, and it should be verified against the production bundle.

---

## Blocker — the sandbox shell is dead

Every bash call returns `shell_error` with no output, including `echo`, `git`,
`python3` and `ls`. File reads and writes still work. Roughly fifteen attempts across
several minutes, including waits.

Consequence: I cannot run the type-check, the tests, the build, or commit. Anything I
edited now would be unverified and unpushed, and a sandbox rollback would lose it.
So no code changes were made this turn.

## Plan, for when the shell recovers

1. Sweep `public/css/legacy.css` for hardcoded light backgrounds and dark-on-light
   text, and add `html.dark` overrides. Front page and planner first, since those are
   the two the user named.
2. Check the StudyTube breakpoints at 360 / 390 / 768 / 1024 / 1440 and fix what
   actually breaks, starting with the line-603 filter bar.
3. Remove the language toggle from `src/routes/app.tsx` and fix the two
   half-translated strings.
4. Full gate — type-check, tests, build — then commit and push.
5. Nothing else. No redesign, no new brand colour, no token changes.
