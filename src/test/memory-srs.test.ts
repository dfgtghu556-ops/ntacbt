import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EASE,
  GRADE_QUALITY,
  MEMORY_KEY,
  MIN_EASE,
  cardIdFor,
  deckStats,
  dueCards,
  emptyDeck,
  isDue,
  loadDeck,
  makeCard,
  nextEase,
  retentionPct,
  reviewCard,
  saveDeck,
  seedCards,
  upsertCard,
  type MemoryCard,
  type SeedableAttempt,
} from "@/features/memory/srs";

const NOW = new Date("2026-09-29T12:00:00").getTime();
const DAY = 24 * 60 * 60 * 1000;

function card(patch: Partial<MemoryCard> = {}): MemoryCard {
  return {
    id: "c1",
    subject: "Physics",
    chapter: "Electrostatics",
    topic: "Electric Charges and Fields",
    front: "What is Coulomb's law?",
    back: "F = k q1 q2 / r^2",
    ease: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    due: NOW,
    reviews: 0,
    lapses: 0,
    createdAt: NOW,
    lastReviewedAt: null,
    ...patch,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("nextEase", () => {
  it("raises ease for an easy grade and lowers it for a hard one", () => {
    expect(nextEase(2.5, 5)).toBeGreaterThan(2.5);
    expect(nextEase(2.5, 3)).toBeLessThan(2.5);
    expect(nextEase(2.5, 4)).toBeCloseTo(2.5, 5);
  });

  it("never drops below the SM-2 floor, so a card stays schedulable", () => {
    // A student who fails a card twenty times must not end up with a card the
    // algorithm can no longer place.
    let ease = DEFAULT_EASE;
    for (let i = 0; i < 20; i++) ease = nextEase(ease, 0);
    expect(ease).toBe(MIN_EASE);
  });

  it("is rounded to two decimals so the stored value stays small", () => {
    expect(nextEase(2.5, 3)).toBe(Math.round(nextEase(2.5, 3) * 100) / 100);
  });
});

describe("reviewCard — the ladder", () => {
  it("uses 1 then 6 days for the first two successes", () => {
    const first = reviewCard(card(), "good", NOW);
    expect(first.intervalDays).toBe(1);
    expect(first.repetitions).toBe(1);
    expect(first.due).toBe(NOW + DAY);

    const second = reviewCard(first, "good", NOW + DAY);
    expect(second.intervalDays).toBe(6);
    expect(second.repetitions).toBe(2);
    expect(second.due).toBe(NOW + 7 * DAY);
  });

  it("multiplies by ease from the third success on", () => {
    let c = card();
    c = reviewCard(c, "good", NOW); // 1 day, rep 1
    c = reviewCard(c, "good", NOW + DAY); // 6 days, rep 2
    const third = reviewCard(c, "good", NOW + 7 * DAY);
    expect(third.intervalDays).toBe(Math.round(6 * third.ease));
    expect(third.intervalDays).toBeGreaterThan(6);
  });

  it("resets the ladder on a failure instead of merely deferring", () => {
    let c = card();
    c = reviewCard(c, "good", NOW);
    c = reviewCard(c, "good", NOW + DAY);
    c = reviewCard(c, "good", NOW + 7 * DAY);
    expect(c.intervalDays).toBeGreaterThan(6);

    const failed = reviewCard(c, "again", NOW + 20 * DAY);
    expect(failed.intervalDays).toBe(1);
    expect(failed.repetitions).toBe(0);
    expect(failed.lapses).toBe(1);
    expect(failed.due).toBe(NOW + 21 * DAY);
  });

  it("lengthens less for a hard grade than a good one", () => {
    const base = card({ repetitions: 3, intervalDays: 10 });
    const hard = reviewCard(base, "hard", NOW);
    const good = reviewCard(base, "good", NOW);
    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
  });

  it("lengthens most for an easy grade", () => {
    const base = card({ repetitions: 3, intervalDays: 10 });
    const easy = reviewCard(base, "easy", NOW);
    const good = reviewCard(base, "good", NOW);
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
  });

  it("never schedules sooner than a day", () => {
    const c = reviewCard(card({ intervalDays: 1, repetitions: 5, ease: 0.5 }), "good", NOW);
    expect(c.intervalDays).toBeGreaterThanOrEqual(1);
  });

  it("counts reviews and records the timestamp", () => {
    const c = reviewCard(card(), "good", NOW);
    expect(c.reviews).toBe(1);
    expect(c.lastReviewedAt).toBe(NOW);
    const d = reviewCard(c, "good", NOW + DAY);
    expect(d.reviews).toBe(2);
    expect(d.lastReviewedAt).toBe(NOW + DAY);
  });

  it("maps the four phone grades onto SM-2 quality", () => {
    // Fewer buttons that get pressed beat six that do not.
    expect(GRADE_QUALITY.again).toBeLessThan(3);
    expect(GRADE_QUALITY.hard).toBe(3);
    expect(GRADE_QUALITY.good).toBe(4);
    expect(GRADE_QUALITY.easy).toBe(5);
  });
});

describe("dueCards", () => {
  it("returns only cards whose due date has arrived", () => {
    const cards = [card({ id: "a", due: NOW - DAY }), card({ id: "b", due: NOW + DAY })];
    expect(dueCards(cards, NOW).map((c) => c.id)).toEqual(["a"]);
  });

  it("orders the most overdue first", () => {
    const cards = [
      card({ id: "late", due: NOW - 10 * DAY }),
      card({ id: "earlier", due: NOW - 2 * DAY }),
      card({ id: "now", due: NOW }),
    ];
    expect(dueCards(cards, NOW).map((c) => c.id)).toEqual(["late", "earlier", "now"]);
  });

  it("breaks a tie by lapse count, so the weakest card comes first", () => {
    const cards = [card({ id: "solid", due: NOW }), card({ id: "shaky", due: NOW, lapses: 3 })];
    expect(dueCards(cards, NOW)[0]?.id).toBe("shaky");
  });

  it("respects the limit and clamps a negative one", () => {
    const cards = Array.from({ length: 30 }, (_, i) => card({ id: `c${i}`, due: NOW }));
    expect(dueCards(cards, NOW, 5)).toHaveLength(5);
    expect(dueCards(cards, NOW, -1)).toHaveLength(0);
  });

  it("treats a card due exactly now as due", () => {
    expect(isDue(card({ due: NOW }), NOW)).toBe(true);
    expect(isDue(card({ due: NOW + 1 }), NOW)).toBe(false);
  });
});

describe("deckStats", () => {
  it("counts new, learning and mature cards separately", () => {
    const cards = [
      card({ id: "new", reviews: 0 }),
      card({ id: "learning", reviews: 2, intervalDays: 3 }),
      card({ id: "mature", reviews: 5, intervalDays: 21 }),
    ];
    const s = deckStats(cards, NOW);
    expect(s.total).toBe(3);
    expect(s.new).toBe(1);
    expect(s.learning).toBe(1);
    expect(s.mature).toBe(1);
    expect(s.due).toBe(3); // all due NOW
  });

  it("counts reviews from the last seven days only", () => {
    const cards = [
      card({ id: "recent", lastReviewedAt: NOW - 2 * DAY }),
      card({ id: "old", lastReviewedAt: NOW - 30 * DAY }),
      card({ id: "never", lastReviewedAt: null }),
    ];
    expect(deckStats(cards, NOW).reviewedThisWeek).toBe(1);
  });

  it("is all zeroes for an empty deck", () => {
    expect(deckStats([], NOW)).toEqual({
      total: 0,
      due: 0,
      new: 0,
      learning: 0,
      mature: 0,
      reviewedThisWeek: 0,
    });
  });
});

describe("retentionPct", () => {
  it("is null when nothing has been reviewed", () => {
    // Null, not 0: an unreviewed deck has no retention to report.
    expect(retentionPct([card({ reviews: 0 })])).toBeNull();
    expect(retentionPct([])).toBeNull();
  });

  it("reports the mature share of reviewed cards", () => {
    const cards = [
      card({ id: "a", reviews: 3, intervalDays: 21 }),
      card({ id: "b", reviews: 3, intervalDays: 2 }),
    ];
    expect(retentionPct(cards)).toBe(50);
  });
});

describe("persistence", () => {
  it("round-trips through localStorage", () => {
    const deck = upsertCard(emptyDeck(), card());
    saveDeck(deck);
    expect(loadDeck().cards).toHaveLength(1);
    expect(loadDeck().cards[0]?.id).toBe("c1");
  });

  it("uses a namespaced versioned key", () => {
    expect(MEMORY_KEY).toBe("ntacbt.memory.v1");
  });

  it("returns an empty deck when nothing is stored", () => {
    expect(loadDeck().cards).toEqual([]);
  });

  it("returns an empty deck on corrupt JSON rather than throwing", () => {
    localStorage.setItem(MEMORY_KEY, "{not json");
    expect(loadDeck().cards).toEqual([]);
  });

  it("drops malformed cards and keeps the good ones", () => {
    localStorage.setItem(
      MEMORY_KEY,
      JSON.stringify({ cards: [card(), { id: "bad" }, null, "nope", card({ id: "c2" })] }),
    );
    const loaded = loadDeck();
    expect(loaded.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("does not throw when localStorage is unavailable", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("private mode");
    };
    expect(() => saveDeck(upsertCard(emptyDeck(), card()))).not.toThrow();
    Storage.prototype.setItem = original;
  });

  it("replaces a card by id instead of duplicating it", () => {
    let deck = upsertCard(emptyDeck(), card());
    deck = upsertCard(deck, card({ intervalDays: 9 }));
    expect(deck.cards).toHaveLength(1);
    expect(deck.cards[0]?.intervalDays).toBe(9);
  });
});

describe("seedCards — never an empty feature", () => {
  const attemptA: SeedableAttempt = {
    id: "t1::q1",
    subject: "Physics",
    chapter: "Electrostatics",
    topic: "Coulomb's law",
    question: "State Coulomb's law.",
    answer: "F = k q1 q2 / r^2",
  };
  const attemptB: SeedableAttempt = {
    id: "t1::q2",
    subject: "Chemistry",
    chapter: "Solutions",
    topic: "Raoult's law",
    question: "State Raoult's law.",
    answer: "P = P0 x",
  };
  const attempts = [attemptA, attemptB];

  it("creates a card from every real wrong answer", () => {
    const made = seedCards(attempts, [], NOW);
    expect(made).toHaveLength(2);
    expect(made[0]?.front).toBe("State Coulomb's law.");
    expect(made[0]?.back).toBe("F = k q1 q2 / r^2");
    // A new card is due immediately, so the deck is never empty on first open.
    expect(made[0]?.due).toBe(NOW);
  });

  it("never re-seeds a card that already exists", () => {
    const existing = seedCards([attemptA], [], NOW);
    expect(seedCards(attempts, existing, NOW)).toHaveLength(1);
    expect(seedCards(attempts, existing, NOW)[0]?.id).toBe("t1::q2");
  });

  it("skips a question with no readable text instead of inventing a card", () => {
    const made = seedCards(
      [
        { ...attemptA, question: "   " },
        { ...attemptB, answer: "" },
        { id: "t1::q3", subject: "Physics", chapter: "X", topic: "", question: "Q", answer: "A" },
      ],
      [],
      NOW,
    );
    expect(made.map((c) => c.id)).toEqual(["t1::q3"]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...attemptA, id: `q${i}` }));
    expect(seedCards(many, [], NOW, 10)).toHaveLength(10);
  });

  it("deduplicates within one batch", () => {
    expect(seedCards([attemptA, attemptA], [], NOW)).toHaveLength(1);
  });

  it("builds a stable id so re-seeding is idempotent", () => {
    expect(cardIdFor("t1", "q1")).toBe("t1::q1");
    expect(cardIdFor("t1", "q1")).toBe(cardIdFor("t1", "q1"));
    expect(cardIdFor("t1", "q1")).not.toBe(cardIdFor("t2", "q1"));
  });
});
