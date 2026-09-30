/**
 * The two StudyTubes must behave the same on a phone.
 *
 * There are two StudyTube implementations and a student meets both:
 *
 *   - the legacy tool at `public/jee-cbt.html` (the front door - `/` redirects
 *     here), whose stylesheet is `public/css/legacy.css`; and
 *   - the React app at `/app/studytube`.
 *
 * The legacy one already had a considered mobile treatment: below 900px its
 * sidebar collapses to a horizontal strip and every shelf becomes a snap
 * carousel. The React one rendered a single full-width column instead, so the
 * same shelf was swipeable in one StudyTube and a tall stack in the other.
 *
 * Two defects are pinned here.
 *
 * 1. The legacy search-results grid was the one `.yt-grid` sitting outside a
 *    `.yt-shelf`, so the carousel rule - scoped `.yt-shelf .yt-grid` - never
 *    reached it. Search results stayed a full-width column beside seven
 *    compact carousels. It now gets the same density (two-up on phones, one-up
 *    again on the smallest handsets where two thumbnails get unreadable).
 *
 * 2. The carousels hid their scrollbar (`scrollbar-width: none` plus a
 *    `::-webkit-scrollbar { display: none }`) and left no other cue, so on a
 *    phone you saw one card and a sliver with nothing to say "swipe". Cards are
 *    now `min(250px, 66vw)` instead of `72vw`, which leaves ~60px of the next
 *    card peeking in on a 320px screen. Above ~380px the 250px cap wins, so
 *    tablets and large phones are untouched.
 *
 * Both are CSS-only: `public/js/app.js` is off-limits, and neither fix needs it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const CSS = read("public/css/legacy.css");
const APP = read("public/js/app.js");
const SHELF = read("src/routes/app.studytube.tsx");

/**
 * Pull a `@media` block out of the stylesheet, matched by its query text *and*
 * by a marker rule it must contain. The marker is not optional: this file has
 * more than one `@media (max-width: 900px)`, so matching on the query alone
 * silently returns the wrong block. Comments are blanked to spaces first so a
 * `}` inside a comment cannot end the block early - the same reason
 * `legacy-dark-mode.test.ts` does it.
 */
function mediaBlock(query: string, marker: string): string {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  const needle = `@media ${query}`;
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at === -1) return "";
    const open = src.indexOf("{", at);
    if (open === -1) return "";
    let depth = 1;
    let end = open + 1;
    for (; end < src.length; end++) {
      if (src[end] === "{") depth++;
      else if (src[end] === "}") depth--;
      if (depth === 0) break;
    }
    const body = src.slice(open + 1, end);
    if (body.includes(marker)) return body;
    from = end + 1;
  }
}

describe("legacy StudyTube on a phone", () => {
  it("styles the standalone search-results grid like the shelves", () => {
    // The grid at app.js is `<div data-searchResults class="yt-grid">`, a direct
    // child of the `.yt-main` column and outside every `.yt-shelf`. The rule
    // that matches exactly that is `.yt-main > .yt-grid`.
    const block = mediaBlock("(max-width: 900px)", ".yt-shelf .yt-grid");
    expect(block, "the 900px block vanished").not.toBe("");
    expect(block).toMatch(/\.yt-main\s*>\s*\.yt-grid\s*\{/);
    expect(block).toMatch(/repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("keeps the search-results markup carrying the class the rule targets", () => {
    // If the element is ever renamed or nested, the CSS rule above silently
    // stops matching and the two StudyTubes drift apart again. This is the
    // other half of that wiring.
    expect(APP).toMatch(/data-searchResults class="yt-grid"/);
  });

  it("falls back to one readable column on the smallest handsets", () => {
    const block = mediaBlock("(max-width: 380px)", ".yt-main > .yt-grid");
    expect(block, "the 380px block vanished").not.toBe("");
    expect(block).toMatch(/\.yt-main\s*>\s*\.yt-grid\s*\{[^}]*minmax\(0,\s*1fr\)/);
  });

  it("leaves the next carousel card peeking in as the swipe cue", () => {
    const block = mediaBlock("(max-width: 900px)", ".yt-shelf .yt-grid");
    expect(block).toMatch(/width:\s*min\(250px,\s*66vw\)/);
    expect(block).not.toMatch(/width:\s*min\(250px,\s*72vw\)/);
  });
});

describe("React StudyTube on a phone", () => {
  // The shelf's scroller, pinned exactly. It is a flex snap row at EVERY width:
  // there is no `sm:grid` handover, because a grid leaves the arrows with
  // nothing to page.
  const scroller =
    /scrollbar-none -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:gap-4 sm:px-0 sm:pb-0/;

  it("renders each shelf as a snap carousel", () => {
    // Both the loading skeleton row and the real items row.
    const matches = SHELF.match(new RegExp(scroller.source, "g")) ?? [];
    expect(matches.length).toBe(2);
  });

  it("sizes the carousel cards and keeps them sized from sm up", () => {
    // The wrapper carries the phone width; `sm:w-[17rem]` gives the row a fixed
    // card basis at every larger width, because the row no longer becomes a
    // grid - an unsized card in a flex row would collapse.
    expect(SHELF).toMatch(/w-\[min\(250px,72vw\)\] shrink-0 snap-start sm:w-\[17rem\]/);
    // The skeleton uses the same width so the loading state matches the result.
    const skeleton = /h-52 w-\[min\(250px,72vw\)\] shrink-0 snap-start animate-pulse/;
    expect(SHELF).toMatch(skeleton);
  });

  it("keeps every shelf a horizontal row at all widths", () => {
    // Scoped to the scroller string itself. A whole-file `not.toMatch(/sm:grid/)`
    // would be wrong: the preferences panel elsewhere in this file legitimately
    // uses `sm:grid-cols-2`, and the assertion has to check the shelf, not the
    // file.
    const rows = SHELF.match(new RegExp(scroller.source, "g")) ?? [];
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row).not.toMatch(/grid/);
    }
    // `sm:w-auto` is the other tell. An unsized card in a flex row collapses, so
    // it can only ever have belonged to a grid.
    expect(SHELF).not.toMatch(/sm:w-auto/);
  });

  it("pages the row with arrows that are hidden until lg", () => {
    // Arrows are `lg:flex` and `hidden` below that, because a phone swipes. The
    // buttons must exist and be labelled, or the row is unreachable by keyboard
    // on a desktop.
    const left = SHELF.match(/aria-label=\{`Scroll \$\{title\} left`\}/g) ?? [];
    const right = SHELF.match(/aria-label=\{`Scroll \$\{title\} right`\}/g) ?? [];
    expect(left.length).toBe(2);
    expect(right.length).toBe(2);
    expect(SHELF).toMatch(/hover:border-primary hover:text-primary lg:flex/);
  });
});

describe("StudyTube filter row", () => {
  // YouTube puts its chip row immediately above the content it filters. The
  // React StudyTube used to bury it inside the hero card, below the brand, two
  // selects, the focus chips and a paragraph - on a phone that is most of a
  // screen of scrolling before a student can narrow anything.
  it("sits above the shelves rather than inside the hero", () => {
    // The old inline chip block, and its five-deep nested ternary, are gone.
    expect(SHELF).not.toContain("{/* Quick subject chips */}");
    expect(SHELF).not.toContain(': f === "oneshot"');
    // The mapping now lives in one place and the row renders from it.
    expect(SHELF).toMatch(/FILTERS\.map\(\(\[value, label\]\) =>/);
  });

  it("stays reachable while the shelves scroll past it", () => {
    // Sticky under the shell's own 3.5rem header. `top-14` is not arbitrary: the
    // shell header is `h-14` and `sticky top-0`, so anything sticky inside the
    // content has to start below it or it tucks underneath and is lost.
    expect(SHELF).toMatch(/sticky top-14 z-20/);
    expect(SHELF).toMatch(/bg-background\/90 px-3 py-2\.5 backdrop-blur/);
  });

  it("shares the toolbar with the search, so both stay reachable", () => {
    // One sticky container holds the search form and the filter row. If they
    // were split into two sticky elements they would stack and eat the screen;
    // if the search went back in the hero it would scroll away again.
    const toolbar = /sticky top-14 z-20[^]*?role="group"/;
    expect(SHELF).toMatch(toolbar);
    // The search is inside that same block, above the filter row.
    const at = SHELF.indexOf('aria-label="Search a topic, chapter or teacher"');
    const filters = SHELF.indexOf('aria-label="Filter lectures"');
    expect(at).toBeGreaterThan(-1);
    expect(filters).toBeGreaterThan(at);
  });

  it("is a labelled group, not a bare row of buttons", () => {
    // Without the role and label a screen reader announces six unlabelled
    // toggles with no statement of what they filter.
    expect(SHELF).toMatch(/role="group"\s*\n?\s*aria-label="Filter lectures"/);
  });

  it("keeps the same filter values and the same student-facing labels", () => {
    // The mapping is unchanged from the inline ternary it replaced. "Mathematics"
    // reads as "Maths" and "oneshot" as "One-shots"; renaming either silently
    // changes what a student is filtering by.
    expect(SHELF).toMatch(/\["all", "All"\]/);
    expect(SHELF).toMatch(/\["Mathematics", "Maths"\]/);
    expect(SHELF).toMatch(/\["oneshot", "One-shots"\]/);
    expect(SHELF).toMatch(/\["revision", "Revision"\]/);
  });
});

describe("StudyTube search toolbar", () => {
  // The search used to be a bare input with an onKeyDown handler inside the
  // hero, so it scrolled away and Enter was the only way to run it.
  it("submits through a form, so Enter and the button both work", () => {
    expect(SHELF).toMatch(/<form[\s\S]*?onSubmit=\{\(e\) => \{[\s\S]*?preventDefault\(\)/);
    // The button that runs it is a submit button, not a click handler.
    expect(SHELF).toMatch(/type="submit"[\s\S]*?>\s*Search\s*</);
    // The bare onKeyDown search trigger is gone - a form owns that now.
    expect(SHELF).not.toContain('onKeyDown={(e) => e.key === "Enter" && openSearchQuery(query)}');
  });

  it("does not let the Preferences toggle submit the search form", () => {
    // Both buttons now sit inside the form. Without an explicit type the
    // Preferences toggle would default to submit and run a search every time a
    // student opened their preferences.
    const prefs = /<button\s+type="button"\s+onClick=\{\(\) => setOpen\(\(v\) => !v\)\}/;
    expect(SHELF).toMatch(prefs);
  });

  it("is not a second copy of the shell's global search bar", () => {
    // The shell header already searches the whole app. Duplicating its centred
    // search inside StudyTube would read as a bug, so this one stays section
    // scoped and keeps its own label.
    expect(SHELF).toMatch(/aria-label="Search a topic, chapter or teacher"/);
    expect(SHELF).not.toMatch(/aria-label="Search NTACBT"/);
  });
});
