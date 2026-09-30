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
 *   - the container is a horizontal snap scroller below `sm`
 *   - exactly one sized wrapper is emitted per card
 *   - the wrapper carries the mobile width and the `sm` reset
 *
 * The point of the last two is regression-proofing the change itself. The old
 * markup passed `items.map(...)` straight into a grid, so there was no wrapper
 * to size; if someone reverts to that, the wrapper count drops to zero and this
 * fails rather than silently shipping a shelf that cannot scroll.
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
    const wrappers = container.querySelectorAll("div.w-\\[min\\(250px\\,66vw\\)\\]");
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
    // ...and it hands back to a grid from `sm` upwards.
    expect(scroller?.className).toContain("sm:grid");
    expect(scroller?.className).toContain("sm:grid-cols-2");
    expect(scroller?.className).toContain("lg:grid-cols-3");
    expect(scroller?.className).toContain("2xl:grid-cols-4");
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
      expect(s.className).toContain("w-[min(250px,66vw)]");
      expect(s.className).toContain("sm:w-auto");
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
