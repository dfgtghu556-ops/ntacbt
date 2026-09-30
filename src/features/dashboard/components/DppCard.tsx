/**
 * DppCard — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { Play, Target } from "lucide-react";
import { saveCbtTest } from "@/features/cbt/store";
import { type DailyPracticeSet } from "@/features/practice/dpp";
import type { CbtTest } from "@/features/cbt/types";
import { MIN_DPP_SIZE } from "@/features/practice/dpp";
import { DPP_SEC_PER_QUESTION } from "@/features/practice/dpp";
import { dppToCbtTest } from "@/features/practice/dpp";
import { useNavigate } from "@tanstack/react-router";

export function DppCard({ set }: { set: DailyPracticeSet }) {
  const navigate = useNavigate();
  if (set.questions.length === 0) return null;
  const runnable = set.questions.length >= MIN_DPP_SIZE;

  function start() {
    const test = dppToCbtTest(set, Date.now());
    if (!test) return;
    // Saving it first means /cbt can resolve it by id, and the attempt lands in
    // the same store every other test uses.
    saveCbtTest(test as unknown as CbtTest);
    navigate({ to: "/cbt", search: { testId: test.id } });
  }

  return (
    <section className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-primary" /> Today&apos;s DPP
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{set.note}</p>
        </div>
        <button
          onClick={start}
          disabled={!runnable}
          title={runnable ? undefined : "Not enough questions on this device for a timed set."}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> Start {set.questions.length} questions
        </button>
      </div>

      {set.focus.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {set.focus.slice(0, 4).map((f) => (
            <li key={`${f.subject}-${f.chapter}`} className="rounded-md border px-3 py-2 text-xs">
              <span className="font-medium">
                {f.subject} — {f.chapter}
              </span>
              <span className="mt-0.5 block text-muted-foreground">{f.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-[11px] text-muted-foreground">
        {Math.round((set.questions.length * DPP_SEC_PER_QUESTION) / 60)} min · no difficulty labels:
        the question bank does not carry them, and a wrong label would be worse than none.
      </p>
    </section>
  );
}
