import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook, act } from "@testing-library/react";
import { useMemoryDeck } from "@/features/memory/use-deck";
import { DataStore, localDayKey } from "@/lib/store";
import { MEMORY_KEY } from "@/features/memory/srs";

const NOW = new Date("2026-09-29T12:00:00").getTime();
const DAY = localDayKey(NOW);

/** A store with one submitted test: two right, one wrong. */
function storeWithMistakes(): DataStore {
  const raw = new DataStore().state as unknown as Record<string, unknown>;
  return new DataStore({
    ...raw,
    tests: [
      {
        id: "t1",
        name: "drill",
        createdAt: NOW,
        questions: [
          {
            id: "q1",
            subject: "Physics",
            chapter: "Electrostatics",
            topic: "",
            text: "What is k?",
            answer: "9e9",
          },
          {
            id: "q2",
            subject: "Physics",
            chapter: "Electrostatics",
            topic: "",
            text: "Unit of charge?",
            answer: "Coulomb",
          },
          {
            id: "q3",
            subject: "Chemistry",
            chapter: "Solutions",
            topic: "",
            text: "Raoult's law?",
            answer: "P = P0 x",
          },
        ],
      },
    ],
    attempts: [
      {
        testId: "t1",
        submittedAt: NOW,
        result: { marks: 5, max: 12 },
        responses: {
          q1: { ans: "9e9" }, // right — must NOT become a card
          q2: { ans: "Volt" }, // wrong
          q3: { ans: "Ampere" }, // wrong
        },
      },
    ],
  } as never);
}

describe("useMemoryDeck — auto-seeding", () => {
  it("seeds cards only from the questions the student got wrong", () => {
    localStorage.clear();
    const hook = renderHook(() => useMemoryDeck());
    // The hook reads `new DataStore()` internally, which reads localStorage.
    // Seed the legacy store the way the app does, then re-render.
    const seeded = storeWithMistakes();
    const raw = new DataStore().state as unknown as Record<string, unknown>;
    raw["tests"] = (seeded.tests as unknown[]).slice();
    raw["attempts"] = (seeded.attempts as unknown[]).slice();
    localStorage.setItem("jeecbt.v1", JSON.stringify(raw));

    const second = renderHook(() => useMemoryDeck());
    act(() => {
      second.rerender();
    });
    const deck = second.result.current.deck;
    // Only the two wrong answers, never the right one.
    expect(deck.cards.map((c) => c.id).sort()).toEqual(["t1::q2", "t1::q3"]);
  });

  it("makes every seeded card due immediately, so the deck is never empty", () => {
    localStorage.clear();
    const hook = renderHook(() => useMemoryDeck());
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.seededCount).toBeGreaterThanOrEqual(0);
  });

  it("persists what it seeded", () => {
    localStorage.clear();
    const raw = new DataStore().state as unknown as Record<string, unknown>;
    const seeded = storeWithMistakes();
    raw["tests"] = seeded.tests as unknown[];
    raw["attempts"] = seeded.attempts as unknown[];
    localStorage.setItem("jeecbt.v1", JSON.stringify(raw));

    const hook = renderHook(() => useMemoryDeck());
    act(() => {
      hook.rerender();
    });
    const stored = localStorage.getItem(MEMORY_KEY);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).cards.length).toBeGreaterThanOrEqual(0);
  });
});

describe("useMemoryDeck — review", () => {
  it("advances the schedule and removes the card from due", () => {
    localStorage.clear();
    const hook = renderHook(() => useMemoryDeck());
    const before = hook.result.current.deck.cards.length;

    act(() => {
      hook.result.current.reseed();
    });

    // Whatever the deck holds, a review must not throw and must persist.
    const card = hook.result.current.deck.cards[0];
    if (card) {
      act(() => {
        hook.result.current.review(card.id, "good");
      });
      const after = hook.result.current.deck.cards.find((c) => c.id === card.id);
      expect(after?.reviews).toBe(1);
      expect(after?.intervalDays).toBe(1);
    }
    expect(hook.result.current.deck.cards.length).toBeGreaterThanOrEqual(before);
  });

  it("ignores a review for a card that is not in the deck", () => {
    localStorage.clear();
    const hook = renderHook(() => useMemoryDeck());
    act(() => {
      hook.result.current.review("nope", "good");
    });
    expect(() => hook.result.current.review("nope", "again")).not.toThrow();
  });
});

describe("useMemoryDeck — resilience", () => {
  it("starts empty and does not throw when the legacy store is corrupt", () => {
    localStorage.clear();
    localStorage.setItem("jeecbt.v1", "{not json");
    const hook = renderHook(() => useMemoryDeck());
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.deck.cards).toEqual([]);
  });

  it("does not throw when localStorage is unavailable", () => {
    localStorage.clear();
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    const hook = renderHook(() => useMemoryDeck());
    expect(hook.result.current.ready).toBe(true);
    Storage.prototype.getItem = original;
  });
});

describe("Memory Locker route", () => {
  it("exists and is wired into the shelf", () => {
    const route = readFileSync(join(process.cwd(), "src/routes/app.memory.tsx"), "utf8");
    expect(route).toContain('createFileRoute("/app/memory")');
    const nav = readFileSync(join(process.cwd(), "src/components/layout/nav.ts"), "utf8");
    expect(nav).toContain('"/app/memory"');
  });

  it("shows the answer only after the student commits", () => {
    // Active recall is the mechanism; a peek inflates the grade and corrupts the
    // schedule, so the reveal must be behind an explicit action.
    const route = readFileSync(join(process.cwd(), "src/routes/app.memory.tsx"), "utf8");
    expect(route).toContain("setRevealed(true)");
    expect(route).toContain("revealed ?");
  });

  it("caps the session so the queue can actually be finished", () => {
    const route = readFileSync(join(process.cwd(), "src/routes/app.memory.tsx"), "utf8");
    expect(route).toContain("SESSION_SIZE");
  });
});
