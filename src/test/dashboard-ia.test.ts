/**
 * Dashboard information architecture (Phase 6).
 *
 * The rebuild plan specifies the dashboard as a sequence, not a pile of cards:
 *
 *   greeting → today's focus + ONE primary action → today's tasks → progress →
 *   3–5 weak areas → continue learning → **optional deep analytics behind
 *   disclosure**
 *
 * The last clause is the one this suite exists for. Everything after "continue
 * learning" is interesting rather than actionable, and a student who has just
 * been told what to do should not have to scroll past four charts and a rank
 * estimate to act on it.
 *
 * These are source-order assertions rather than render assertions. The
 * dashboard reads six stores in an effect, so rendering it means fabricating a
 * full student history to see a card order that is a static property of the
 * JSX. Asserting the order of the JSX tests the thing that is actually
 * specified, and does not break every time a store adds a field.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = "src/routes/app.index.tsx";
const read = () => readFileSync(join(process.cwd(), SRC), "utf8");

/** Byte offset of a marker in the dashboard's render tree. */
function at(src: string, marker: string): number {
  const i = src.indexOf(marker);
  expect(i, `dashboard does not contain ${marker}`).toBeGreaterThan(-1);
  return i;
}

describe("Phase 6 — the dashboard follows the specified sequence", () => {
  it("puts today's focus before anything optional", () => {
    const src = read();
    const focus = at(src, "TodayStrip");
    const deep = at(src, "Deep analytics");
    expect(focus).toBeLessThan(deep);
  });

  it("puts continue learning after the focus and before deep analytics", () => {
    const src = read();
    const focus = at(src, "TodayStrip");
    const keepGoing = at(src, "Keep going");
    const deep = at(src, "Deep analytics");
    expect(focus).toBeLessThan(keepGoing);
    expect(keepGoing).toBeLessThan(deep);
  });

  it("continue learning links to the learning surface and the planner", () => {
    const src = read();
    const block = src.slice(at(src, "Keep going"), at(src, "Deep analytics"));
    expect(block).toMatch(/to="\/app\/studytube"/);
    expect(block).toMatch(/to="\/app\/planner"/);
  });
});

describe("Phase 6 — deep analytics sits behind a disclosure", () => {
  it("is inside a <details>, so it is collapsed by default", () => {
    const src = read();
    const start = src.indexOf("<details");
    expect(start).toBeGreaterThan(-1);
    // Not open by default: an `open` attribute would defeat the disclosure.
    const tag = src.slice(start, src.indexOf(">", start));
    expect(tag).not.toMatch(/\bopen\b/);
  });

  it("wraps everything from the key stats to the mock CTA", () => {
    const src = read();
    const open = src.indexOf("<details");
    const close = src.lastIndexOf("</details>");
    const inside = src.slice(open, close);
    // These are the "interesting, not actionable" surfaces.
    for (const marker of ["Key stats", "DualLane", "RankPredictor", "Quick actions", "micro-win"]) {
      expect(inside, `disclosure should contain ${marker}`).toContain(marker);
    }
  });

  it("has a labelled <summary>, so the disclosure is keyboard-operable", () => {
    const src = read();
    const block = src.slice(src.indexOf("<details"), src.indexOf("</details>"));
    expect(block).toMatch(/<summary/);
    expect(block).toMatch(/Deep analytics/);
  });

  it("says what is inside rather than a bare 'show more'", () => {
    const src = read();
    const block = src.slice(src.indexOf("<summary"), src.indexOf("</summary>"));
    // A disclosure that says only "More" makes the student guess.
    expect(block).toMatch(/Readiness|rank|trends|Nothing measured/i);
  });

  it("tells a student with no data why it is empty", () => {
    const src = read();
    const block = src.slice(src.indexOf("<summary"), src.indexOf("</summary>"));
    expect(block).toMatch(/Nothing measured yet/i);
  });
});

describe("the card system still holds on the new surfaces", () => {
  it("both new sections use the rounded-2xl bordered card", () => {
    const src = read();
    const keepGoing = src.slice(at(src, "Keep going") - 200, at(src, "Keep going"));
    expect(keepGoing).toMatch(/rounded-2xl border/);
    // Slice the tag itself, not the text before it.
    const tagStart = src.indexOf("<details");
    expect(src.slice(tagStart, src.indexOf(">", tagStart))).toMatch(/rounded-2xl border/);
  });
});
