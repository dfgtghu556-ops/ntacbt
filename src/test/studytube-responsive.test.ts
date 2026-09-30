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
 * Pull a top-level `@media` block out of the stylesheet, matched by its query
 * text. Comments are blanked to spaces first so a `}` inside a comment cannot
 * end the block early - the same reason `legacy-dark-mode.test.ts` does it.
 */
function mediaBlock(query: string): string {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  const at = src.indexOf(`@media ${query}`);
  if (at === -1) return "";
  const open = src.indexOf("{", at);
  if (open === -1) return "";
  let depth = 1;
  for (let i = open + 1; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    if (depth === 0) return src.slice(open + 1, i);
  }
  return "";
}

describe("legacy StudyTube on a phone", () => {
  it("styles the standalone search-results grid like the shelves", () => {
    // The grid at app.js is `<div data-searchResults class="yt-grid">`, a direct
    // child of the `.yt-main` column and outside every `.yt-shelf`. The rule
    // that matches exactly that is `.yt-main > .yt-grid`.
    const block = mediaBlock("(max-width: 900px)");
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
    const block = mediaBlock("(max-width: 380px)");
    expect(block, "the 380px block vanished").not.toBe("");
    expect(block).toMatch(/\.yt-main\s*>\s*\.yt-grid\s*\{[^}]*minmax\(0,\s*1fr\)/);
  });

  it("leaves the next carousel card peeking in as the swipe cue", () => {
    const block = mediaBlock("(max-width: 900px)");
    expect(block).toMatch(/width:\s*min\(250px,\s*66vw\)/);
    expect(block).not.toMatch(/width:\s*min\(250px,\s*72vw\)/);
  });
});

describe("React StudyTube on a phone", () => {
  const carousel =
    /scrollbar-none -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 2xl:grid-cols-4/;

  it("renders each shelf as a snap carousel below sm", () => {
    // Both the loading skeleton grid and the real items grid.
    const matches = SHELF.match(new RegExp(carousel.source, "g")) ?? [];
    expect(matches.length).toBe(2);
  });

  it("sizes the carousel cards and lets the grid take over from sm up", () => {
    // The wrapper carries the mobile width; `sm:w-auto` hands sizing back to the
    // grid so nothing is capped once it is a grid again.
    expect(SHELF).toMatch(/w-\[min\(250px,66vw\)\] shrink-0 snap-start sm:w-auto/);
    // The skeleton uses the same width so the loading state matches the result.
    expect(SHELF).toMatch(
      /h-52 w-\[min\(250px,66vw\)\] shrink-0 snap-start animate-pulse/,
    );
  });

  it("keeps the responsive grid it always had from sm upwards", () => {
    // The change is additive below `sm`; the tablet and desktop layout is the
    // same 2 / 3 / 4 column progression as before.
    expect(SHELF).toMatch(/sm:grid-cols-2 sm:gap-4 sm:overflow-visible/);
    expect(SHELF).toMatch(/lg:grid-cols-3 2xl:grid-cols-4/);
  });
});
