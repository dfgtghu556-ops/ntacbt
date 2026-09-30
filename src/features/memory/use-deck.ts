/**
 * useMemoryDeck — the React binding for the Memory Locker.
 *
 * Owns the deck in state, persists on every change, and — the part that decides
 * whether the feature survives — **auto-seeds from the student's real wrong
 * answers** so the deck is never empty on first open.
 *
 * Seeding is idempotent and derived, not stored twice: the seed comes from the
 * same legacy test store the mastery engine reads, so a card can never disagree
 * with a question the student actually got wrong.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataStore } from "../../lib/store";
import {
  cardIdFor,
  dueCards,
  emptyDeck,
  loadDeck,
  makeCard,
  reviewCard,
  saveDeck,
  seedCards,
  upsertCard,
  type MemoryCard,
  type MemoryDeck,
  type ReviewGrade,
} from "./srs";

/** How many cards one auto-seed pass may add. */
const SEED_LIMIT = 20;

/**
 * Every wrong answer in the legacy store, as a seedable card.
 *
 * Reads the same two stores `collectAttempts` reads: the test (with its
 * questions) and the attempt rows carrying the student's responses. A question
 * with no readable text or no answer is skipped by `seedCards`, so nothing is
 * ever invented.
 */
function wrongAnswersFromStore(store: DataStore): Array<{
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  question: string;
  answer: string;
}> {
  const out: Array<{
    id: string;
    subject: string;
    chapter: string;
    topic: string;
    question: string;
    answer: string;
  }> = [];
  for (const test of store.tests) {
    const attempts = store.attempts.filter((a) => a.testId === test.id && a.result);
    if (!attempts.length) continue;
    for (const q of test.questions || []) {
      if (!q.subject || !q.chapter) continue;
      // The correct answer, in the shape the store keeps it.
      const answer = q.answer;
      if (answer === undefined || answer === null || answer === "") continue;
      const answered = attempts.filter((a) => {
        const r = a.responses?.[q.id];
        return r && r.ans !== null && r.ans !== "";
      });
      if (!answered.length) continue;
      // Only questions the student actually got wrong become cards.
      const wrong = answered.some((a) => {
        const given = a.responses?.[q.id]?.ans;
        if (given === null || given === undefined) return false;
        if (typeof answer === "number" && typeof given === "number") return answer !== given;
        return String(answer).trim().toLowerCase() !== String(given).trim().toLowerCase();
      });
      if (!wrong) continue;
      out.push({
        id: cardIdFor(test.id, q.id),
        subject: q.subject,
        chapter: q.chapter,
        topic: q.topic || "",
        question: q.text || "",
        answer: String(answer),
      });
    }
  }
  return out;
}

export interface MemoryDeckState {
  deck: MemoryDeck;
  due: MemoryCard[];
  /** Cards created by the auto-seed pass, so the UI can say where they came from. */
  seededCount: number;
  ready: boolean;
  review: (id: string, grade: ReviewGrade) => void;
  /** Re-run the auto-seed from the store. */
  reseed: () => void;
}

export function useMemoryDeck(): MemoryDeckState {
  const [deck, setDeck] = useState<MemoryDeck>(emptyDeck);
  const [seededCount, setSeededCount] = useState(0);
  const [ready, setReady] = useState(false);

  // Load, then auto-seed once so the deck is never empty for a student who has
  // already attempted something.
  useEffect(() => {
    const stored = loadDeck();
    let next = stored;
    let added = 0;
    try {
      const store = new DataStore();
      const made = seedCards(wrongAnswersFromStore(store), stored.cards, Date.now(), SEED_LIMIT);
      for (const card of made) next = upsertCard(next, card);
      added = made.length;
    } catch {
      // A malformed store must not block the deck; it simply stays as loaded.
    }
    setDeck(next);
    setSeededCount(added);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveDeck(deck);
  }, [deck, ready]);

  const review = useCallback((id: string, grade: ReviewGrade) => {
    setDeck((current) => {
      const found = current.cards.find((c) => c.id === id);
      if (!found) return current;
      return upsertCard(current, reviewCard(found, grade, Date.now()));
    });
  }, []);

  const reseed = useCallback(() => {
    try {
      const store = new DataStore();
      setDeck((current) => {
        const made = seedCards(wrongAnswersFromStore(store), current.cards, Date.now(), SEED_LIMIT);
        let next = current;
        for (const card of made) next = upsertCard(next, card);
        setSeededCount(made.length);
        return next;
      });
    } catch {
      /* ignore */
    }
  }, []);

  const due = useMemo(() => dueCards(deck.cards, Date.now()), [deck]);

  return { deck, due, seededCount, ready, review, reseed };
}

/** A card in its editable form, for a manual add. */
export function cardFromInput(input: {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  front: string;
  back: string;
}): MemoryCard {
  return makeCard({ ...input, now: Date.now() });
}
