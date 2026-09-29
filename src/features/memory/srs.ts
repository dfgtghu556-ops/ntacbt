/**
 * MEMORY LOCKER — spaced repetition (A2)
 *
 * The research doc asks for Anki-style SM-2 scheduling so cards resurface
 * *just before you forget*, auto-generated from wrong answers, and — the part
 * that decides whether the feature survives — "never an empty feature".
 *
 * **Why SM-2 and not the legacy interval ladder.** `public/js/app.js` ships a
 * fixed 1→3→7→21→45-day ladder. It is a schedule, not a schedule that adapts: a
 * card a student keeps failing comes back on the same ladder as one they find
 * trivial. SM-2 carries a per-card ease factor, so repeated failures shorten the
 * interval and repeated successes lengthen it. That is the whole point of spaced
 * repetition, and it is the difference between a deck that helps and one that
 * nags.
 *
 * **The card comes from real evidence, never from a guess.** A card is seeded
 * from a question the student actually got wrong, so its front is the real
 * question text and its back is the real answer. There is no "suggested formula"
 * invention anywhere in this module — the legacy app's formula deck is a separate
 * thing and stays where it is.
 *
 * **Grades are four, not six.** Anki's 0–5 scale is for a desktop user with a
 * keyboard. On a phone the honest options are Again / Hard / Good / Easy, mapped
 * onto SM-2's quality scale. Fewer buttons that get pressed beat six that do not.
 */

/** The four grades a student can give a card. */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

/**
 * The SM-2 quality each grade maps onto.
 *
 * 0–2 is a failure in SM-2 (the card is re-learned from a one-day interval), so
 * "again" is 1 and "hard" is 3 — the lowest passing score, which lengthens the
 * interval only slightly and barely moves ease.
 */
export const GRADE_QUALITY: Record<ReviewGrade, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

/** SM-2 bounds on the ease factor. */
export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

/** The intervals SM-2 uses for the first two successful repetitions. */
export const FIRST_INTERVAL_DAYS = 1;
export const SECOND_INTERVAL_DAYS = 6;

/** A card never comes back sooner than a day, or it is not spaced at all. */
export const MIN_INTERVAL_DAYS = 1;

export interface MemoryCard {
  /** Stable id, so the same question never becomes two cards. */
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  /** The prompt the student sees. */
  front: string;
  /** The answer they must recall. */
  back: string;
  /** SM-2 ease factor, ≥ MIN_EASE. */
  ease: number;
  /** Current interval in days. */
  intervalDays: number;
  /** Successful repetitions in a row. */
  repetitions: number;
  /** Epoch ms when this card is next due. */
  due: number;
  /** How many times it has been reviewed. */
  reviews: number;
  /** How many times it was failed (grade < 3). */
  lapses: number;
  createdAt: number;
  lastReviewedAt: number | null;
}

export interface MemoryDeck {
  schemaVersion: number;
  cards: MemoryCard[];
}

export const MEMORY_KEY = "ntacbt.memory.v1";
export const MEMORY_SCHEMA_VERSION = 1;

/** The SM-2 ease update. Bounded below by MIN_EASE so a card can never become unschedulable. */
export function nextEase(ease: number, quality: number): number {
  const raw = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return Math.max(MIN_EASE, Math.round(raw * 100) / 100);
}

/**
 * Apply one review to a card, returning the next card state.
 *
 * A failing grade (quality < 3) resets the repetition count and puts the card
 * back on a one-day interval — it is re-learned, not merely deferred.
 */
export function reviewCard(card: MemoryCard, grade: ReviewGrade, now: number): MemoryCard {
  const quality = GRADE_QUALITY[grade];
  const ease = nextEase(card.ease, quality);
  const day = 24 * 60 * 60 * 1000;

  let intervalDays: number;
  let repetitions: number;
  let lapses = card.lapses;

  if (quality < 3) {
    // Failed: start the ladder again from one day.
    repetitions = 0;
    intervalDays = FIRST_INTERVAL_DAYS;
    lapses += 1;
  } else {
    repetitions = card.repetitions + 1;
    if (repetitions === 1) intervalDays = FIRST_INTERVAL_DAYS;
    else if (repetitions === 2) intervalDays = SECOND_INTERVAL_DAYS;
    // Never shrink below a day, whatever the ease does.
    else intervalDays = Math.max(MIN_INTERVAL_DAYS, Math.round(card.intervalDays * ease));
  }

  return {
    ...card,
    ease,
    intervalDays,
    repetitions,
    lapses,
    due: now + intervalDays * day,
    reviews: card.reviews + 1,
    lastReviewedAt: now,
  };
}

/** A new card, due immediately so it is seen on the first session. */
export function makeCard(input: {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  front: string;
  back: string;
  now: number;
}): MemoryCard {
  return {
    id: input.id,
    subject: input.subject,
    chapter: input.chapter,
    topic: input.topic,
    front: input.front,
    back: input.back,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    due: input.now,
    reviews: 0,
    lapses: 0,
    createdAt: input.now,
    lastReviewedAt: 0,
  };
}

/** True when a card's due date has arrived. */
export function isDue(card: MemoryCard, now: number): boolean {
  return card.due <= now;
}

/**
 * The cards to review now, due first.
 *
 * Ordering is by due date, then by how often the card has been failed, so the
 * weakest cards surface first within a due batch.
 */
export function dueCards(cards: MemoryCard[], now: number, limit = 20): MemoryCard[] {
  return cards
    .filter((c) => isDue(c, now))
    .sort((a, b) => a.due - b.due || b.lapses - a.lapses || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

export interface DeckStats {
  total: number;
  due: number;
  /** Cards never reviewed. */
  new: number;
  /** Cards currently in the learning ladder. */
  learning: number;
  /** Cards whose interval has reached a week or more. */
  mature: number;
  /** Reviews recorded in the last 7 days. */
  reviewedThisWeek: number;
}

export function deckStats(cards: MemoryCard[], now: number): DeckStats {
  const week = 7 * 24 * 60 * 60 * 1000;
  return {
    total: cards.length,
    due: cards.filter((c) => isDue(c, now)).length,
    new: cards.filter((c) => c.reviews === 0).length,
    learning: cards.filter((c) => c.reviews > 0 && c.intervalDays < 7).length,
    mature: cards.filter((c) => c.intervalDays >= 7).length,
    reviewedThisWeek: cards.filter(
      (c) => c.lastReviewedAt !== null && now - c.lastReviewedAt <= week,
    ).length,
  };
}

/** The retention a deck is tracking: mature cards as a share of reviewed ones. */
export function retentionPct(cards: MemoryCard[]): number | null {
  const reviewed = cards.filter((c) => c.reviews > 0);
  if (reviewed.length === 0) return null;
  const mature = reviewed.filter((c) => c.intervalDays >= 7).length;
  return Math.round((mature / reviewed.length) * 100);
}

/* ------------------------------------------------------------------ *
 * Persistence
 *
 * One versioned key, small and isolated from `jeecbt.v1`, following the
 * StudyTube progress store's pattern. Every read is defensive: a corrupt or
 * hand-edited entry degrades to an empty deck rather than throwing.
 * ------------------------------------------------------------------ */

export function emptyDeck(): MemoryDeck {
  return { schemaVersion: MEMORY_SCHEMA_VERSION, cards: [] };
}

function isCard(value: unknown): value is MemoryCard {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<MemoryCard>;
  return (
    typeof c.id === "string" &&
    typeof c.front === "string" &&
    typeof c.back === "string" &&
    typeof c.due === "number" &&
    typeof c.ease === "number" &&
    typeof c.intervalDays === "number" &&
    typeof c.repetitions === "number"
  );
}

/** Read the deck. Never throws; a bad payload yields an empty deck. */
export function loadDeck(): MemoryDeck {
  if (typeof localStorage === "undefined") return emptyDeck();
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return emptyDeck();
    const parsed = JSON.parse(raw) as Partial<MemoryDeck>;
    const cards = Array.isArray(parsed?.cards) ? parsed.cards.filter(isCard) : [];
    return { schemaVersion: MEMORY_SCHEMA_VERSION, cards };
  } catch {
    return emptyDeck();
  }
}

/** Write the deck. A storage failure is swallowed — the deck is an enhancement. */
export function saveDeck(deck: MemoryDeck): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      MEMORY_KEY,
      JSON.stringify({ schemaVersion: MEMORY_SCHEMA_VERSION, cards: deck.cards }),
    );
  } catch {
    /* ignore */
  }
}

/** Add or replace a card by id, so the same question can never duplicate. */
export function upsertCard(deck: MemoryDeck, card: MemoryCard): MemoryDeck {
  const cards = deck.cards.filter((c) => c.id !== card.id);
  cards.push(card);
  return { ...deck, cards };
}

/* ------------------------------------------------------------------ *
 * Auto-seeding
 *
 * The doc's requirement: "auto-generate from videos/notes/your wrong
 * answers ... so it's never an empty feature." A student who has just
 * finished a test should open the Memory Locker and find the questions
 * they got wrong waiting for them.
 *
 * The card front and back are the REAL question and answer. Nothing is
 * invented: a question with no readable text is skipped rather than
 * turned into a placeholder card.
 * ------------------------------------------------------------------ */

export interface SeedableAttempt {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  /** The question text as shown to the student. */
  question: string;
  /** The correct answer. */
  answer: string;
}

/**
 * Cards to create from a batch of wrong answers, skipping any that already
 * exist and any with no usable text.
 *
 * Returns the new cards only — the caller merges them with `upsertCard`.
 */
export function seedCards(
  attempts: SeedableAttempt[],
  existing: MemoryCard[],
  now: number,
  limit = 20,
): MemoryCard[] {
  const have = new Set(existing.map((c) => c.id));
  const out: MemoryCard[] = [];
  const seen = new Set<string>();
  for (const a of attempts) {
    if (out.length >= limit) break;
    const front = (a.question || "").trim();
    const back = (a.answer || "").trim();
    // No readable question or answer means no honest card.
    if (!front || !back) continue;
    if (have.has(a.id) || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(
      makeCard({
        id: a.id,
        subject: a.subject,
        chapter: a.chapter,
        topic: a.topic,
        front,
        back,
        now,
      }),
    );
  }
  return out;
}

/** A stable card id for a question, so re-seeding is idempotent. */
export function cardIdFor(testId: string, questionId: string): string {
  return `${testId}::${questionId}`;
}
