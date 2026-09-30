/**
 * The StudyTube shelf must actually render as a carousel on a phone.
 *
 * `studytube-responsive.test.ts` proves the class strings are present in the
 * source and that Tailwind compiles them. That is necessary but not sufficient:
 * it cannot show that the component renders without crashing, or that the card
 * wrapper is really emitted around each card rather than only written down.
 *
 * So this renders the shelf for real and asserts on the DOM it produces:
 *
 *   - the container is a horizontal snap scroller, at every width
 *   - exactly one sized wrapper is emitted per card
 *   - the wrapper carries the phone width and the `sm` card basis
 *   - the paging arrows exist and are labelled
 *
 * The point of the wrapper count is regression-proofing the change itself. The
 * old markup passed `items.map(...)` straight into a grid, so there was no
 * wrapper to size; if someone reverts to that, the wrapper count drops to zero
 * and this fails rather than silently shipping a shelf that cannot scroll.
 *
 * The row used to become a grid from `sm` up. It no longer does - YouTube's
 * home is horizontal shelves with arrows, and a shelf that turns into a grid
 * has nothing for the arrows to page. `sm:w-auto` is the tell: an unsized card
 * in a flex row collapses, so it can only ever have belonged to a grid.
 */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Play } from "lucide-react";
import { Shelf } from "@/routes/app.studytube";
import type { StudyTubeVideo } from "@/features/studytube/types";

function video(i: number): StudyTubeVideo {
  return {
    id: `vid${i}`,
    title: `Lecture ${i}`,
    channel: "Some Channel",
    durationSec: 600 + i,
    score: 1,
    why: "because",
    subject: "Physics",
  };
}

const items = [video(1), video(2), video(3)];

function renderShelf() {
  return render(
    <Shelf
      title="Continue watching"
      subtitle="Finish what you started"
      icon={Play}
      items={items}
      loading={false}
      fallback={false}
      onPlay={vi.fn()}
      onSave={vi.fn()}
      onDone={vi.fn()}
      watchLaterIds={[]}
      watchedIds={{}}
    />,
  );
}

describe("StudyTube shelf renders as a carousel", () => {
  it("renders without crashing and shows every card", () => {
    const { container } = renderShelf();
    // A thrown render would surface here as an empty container.
    expect(container.textContent).toContain("Lecture 1");
    expect(container.textContent).toContain("Lecture 2");
    expect(container.textContent).toContain("Lecture 3");
    expect(container.querySelectorAll("article").length).toBe(3);
  });

  it("emits one sized wrapper per card, so the shelf can scroll", () => {
    const { container } = renderShelf();
    const scroller = container.querySelector("div.overflow-x-auto");
    expect(scroller).not.toBeNull();
    // Count the sized wrappers by class name rather than by a CSS selector:
    // `w-[min(250px,72vw)]` is not a legal class selector without escaping
    // every bracket, paren and comma, and the escaping bought nothing.
    const wrappers = [...(scroller?.children ?? [])].filter((el) =>
      el.className.includes("w-[min(250px,72vw)]"),
    );
    // One wrapper per card. Zero means the map is emitting bare cards into a
    // grid again, which is the regression this guards.
    expect(wrappers.length).toBe(3);
  });

  it("puts the cards inside a snap scroller, not a plain grid", () => {
    const { container } = renderShelf();
    const scroller = container.querySelector("div.overflow-x-auto");
    expect(scroller).not.toBeNull();
    expect(scroller?.className).toContain("snap-x");
    expect(scroller?.className).toContain("snap-mandatory");
    // ...and it stays a scroller at every width. It must NOT hand back to a
    // grid above `sm`: a grid leaves the arrows with nothing to page.
    expect(scroller?.className).not.toMatch(/(^|\s)sm:grid(\s|$)/);
    expect(scroller?.className).not.toContain("sm:grid-cols-2");
    expect(scroller?.className).not.toContain("sm:overflow-visible");
  });

  it("pages the row with two labelled arrows", () => {
    const { container } = renderShelf();
    const labels = [...container.querySelectorAll("button[aria-label]")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toContain("Scroll Continue watching left");
    expect(labels).toContain("Scroll Continue watching right");
    // Hidden below lg, because a phone swipes.
    for (const b of container.querySelectorAll("button[aria-label]")) {
      expect(b.className).toContain("lg:flex");
      expect(b.className).toContain("hidden");
    }
  });

  it("renders the loading skeleton with the same card sizing", () => {
    const { container } = render(
      <Shelf
        title="Continue watching"
        subtitle="Finish what you started"
        icon={Play}
        items={[]}
        loading
        fallback={false}
        onPlay={vi.fn()}
        onSave={vi.fn()}
        onDone={vi.fn()}
        watchLaterIds={[]}
        watchedIds={{}}
      />,
    );
    const skeletons = container.querySelectorAll("div.animate-pulse");
    expect(skeletons.length).toBe(6);
    for (const s of skeletons) {
      // Same width as the real card, and the same `sm` basis - a skeleton that
      // sizes differently from the result shifts the row when it resolves.
      expect(s.className).toContain("w-[min(250px,72vw)]");
      expect(s.className).toContain("sm:w-[17rem]");
    }
  });

  it("falls back to the empty state when there is nothing to show", () => {
    const { container } = render(
      <Shelf
        title="Continue watching"
        subtitle="Finish what you started"
        icon={Play}
        items={[]}
        loading={false}
        fallback={false}
        onPlay={vi.fn()}
        onSave={vi.fn()}
        onDone={vi.fn()}
        watchLaterIds={[]}
        watchedIds={{}}
      />,
    );
    expect(container.textContent).toContain("Nothing matches this filter");
  });
});
