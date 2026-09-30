/**
 * Memory Locker (A2)
 *
 * The spaced-repetition surface: what is due now, one card at a time, four
 * grades. The scheduling lives in `features/memory/srs.ts`; this is the review
 * session.
 *
 * **Design decisions that follow from the evidence.**
 *
 *  - **One card at a time, answer hidden.** Active recall is the mechanism;
 *    showing the front and back together turns it into re-reading, which the
 *    research doc notes is 100–200% weaker.
 *  - **The back is shown only after the student commits.** There is no
 *    "peek" — a peek inflates the grade and corrupts the schedule.
 *  - **A session is 20 cards, not "all of them".** The doc cites consistent
 *    15-minute daily review beating a weekly two-hour session. A queue that
 *    never empties is a queue that gets abandoned.
 *  - **The deck is never empty.** `useMemoryDeck` seeds from the student's own
 *    wrong answers, so a student who has just finished a test opens this and
 *    finds the questions they missed waiting.
 */

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BrainCircuit, Check, Layers, RotateCcw, Sparkles } from "lucide-react";
import { useMemoryDeck } from "@/features/memory/use-deck";
import { deckStats, retentionPct, type ReviewGrade } from "@/features/memory/srs";
import { socialMeta } from "@/config/site";

export const Route = createFileRoute("/app/memory")({
  head: () => ({
    meta: [
      { title: "Spaced Repetition for JEE — Revision Cards That Actually Come Back" },
      {
        name: "description",
        content:
          "A spaced-repetition locker built on SM-2, seeded automatically from the questions you got wrong.",
      },

      // Open Graph + Twitter + canonical. Without this every route inherits
      // the root card, so sharing this page previews the root title.
      ...socialMeta(
        "Spaced Repetition Revision Cards for JEE",
        "Revision cards scheduled with real spaced repetition, seeded from the questions you got wrong.",
        "/app/memory",
      ),
    ],
  }),
  component: MemoryLocker,
});

/** The four grades, with what each one actually does to the schedule. */
const GRADES: Array<{ grade: ReviewGrade; label: string; hint: string; tone: string }> = [
  {
    grade: "again",
    label: "Again",
    hint: "Back tomorrow",
    tone: "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
  {
    grade: "hard",
    label: "Hard",
    hint: "Short gap",
    tone: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    grade: "good",
    label: "Good",
    hint: "Longer gap",
    tone: "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  {
    grade: "easy",
    label: "Easy",
    hint: "Much longer gap",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
];

/** Cards per session. A queue that never empties gets abandoned. */
const SESSION_SIZE = 20;

function MemoryLocker() {
  const { deck, due, seededCount, ready, review, reseed } = useMemoryDeck();
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const stats = useMemo(() => deckStats(deck.cards, Date.now()), [deck]);
  const retention = useMemo(() => retentionPct(deck.cards), [deck]);
  const queue = due.slice(0, SESSION_SIZE);
  const current = queue[0];

  function grade(g: ReviewGrade) {
    if (!current) return;
    review(current.id, g);
    setRevealed(false);
    setReviewed((n) => n + 1);
  }

  if (!ready) {
    return <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BrainCircuit className="h-6 w-6 text-primary" /> Memory Locker
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cards come back just before you forget them. Seeded from the questions you actually got
            wrong.
          </p>
        </div>
        <button
          onClick={reseed}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-medium"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Re-check for new mistakes
        </button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Due now" value={String(stats.due)} />
        <Stat label="In the deck" value={String(stats.total)} />
        <Stat label="Never reviewed" value={String(stats.new)} />
        <Stat
          label="Reaching a week+"
          value={retention === null ? "not enough data" : `${retention}%`}
        />
      </section>

      {seededCount > 0 ? (
        <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <Sparkles className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-primary" />
          {seededCount} new card{seededCount === 1 ? "" : "s"} added from your recent wrong answers.
        </p>
      ) : null}

      {current ? (
        <section className="rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {current.subject} · {current.chapter}
            </span>
            <span className="tabular-nums">
              {Math.min(reviewed + 1, queue.length)} of {queue.length} this session
            </span>
          </div>

          <p className="mt-4 text-lg font-medium leading-relaxed">{current.front}</p>

          {revealed ? (
            <div className="mt-4 rounded-xl border bg-muted/40 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Answer
              </p>
              <p className="mt-1 text-base">{current.back}</p>
            </div>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <Check className="h-4 w-4" /> Show answer
            </button>
          )}

          {revealed ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => (
                <button
                  key={g.grade}
                  onClick={() => grade(g.grade)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${g.tone}`}
                >
                  <span className="block">{g.label}</span>
                  <span className="block text-[10px] font-normal opacity-80">{g.hint}</span>
                </button>
              ))}
            </div>
          ) : null}

          <p className="mt-3 text-[11px] text-muted-foreground">
            Grade honestly — the schedule is built from what you say. A generous grade makes the
            card come back too late.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed p-8 text-center">
          <Check className="mx-auto h-8 w-8 text-green-600" />
          <h2 className="mt-3 font-semibold">
            {stats.total === 0 ? "No cards yet" : "All caught up"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {stats.total === 0
              ? "Cards appear here automatically from the questions you get wrong in a test or a PYQ paper. Finish one and come back."
              : `${stats.total} card${stats.total === 1 ? "" : "s"} in the deck, none due right now. The next one comes back on its own schedule.`}
          </p>
        </section>
      )}

      {reviewed > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {reviewed} card{reviewed === 1 ? "" : "s"} reviewed this session.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
