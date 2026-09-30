/**
 * A stored attempt, reopened as a result page.
 *
 * Two populations of attempts can reach this screen, and they are not the same
 * kind of thing:
 *
 *   1. **Attempts that carry the paper.** `exam.service.submitExam` now writes the
 *      whole paper into the attempt, so these reopen as the full result screen -
 *      question review, topic breakdown, mistake analysis, time panel.
 *
 *   2. **Attempts that do not.** Every attempt made before the paper was stored,
 *      plus every attempt that came from the legacy `jee-cbt.html` tool, which
 *      never wrote the paper at all. Their score, subject totals and timing
 *      survived; the paper did not.
 *
 * Case 2 is where this component earns its keep. The honest move is to show
 * everything that *is* real - the score, the subject breakdown, when it was sat -
 * and say plainly that the question-by-question review is not available for it.
 * The dishonest moves, all of which were available and none of which is taken:
 *
 *   - Render an empty review list. The student reads "0 questions" and concludes
 *     they answered nothing.
 *   - Render the review from the *current* copy of the paper. If the paper was
 *     edited since, the review contradicts the score - answers to questions that
 *     were never asked.
 *   - Hide the attempt from the history list entirely. It silently loses the
 *     student's work, which is the failure this whole area was fixed to stop.
 *
 * The score header is deliberately reproduced rather than extracted from
 * `ExamResult`, because `ExamResult` takes a `CbtTest` and there isn't one here.
 * Duplicating four numbers is cheaper than making `ExamResult` accept a partial
 * paper it would then have to defend against everywhere downstream.
 */

import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { ExamResult } from "./ExamResult";
import { ntaPercentile, SUBJECTS } from "@/features/cbt/engine";
import type { CbtAttemptRecord } from "@/features/cbt/types";

function ScoreHeader({ attempt }: { attempt: CbtAttemptRecord }) {
  const r = attempt.result;
  if (!r) {
    return (
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <h1 className="text-xl font-semibold">Result</h1>
        <p className="mt-2 text-sm opacity-90">This attempt was never graded.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
      <h1 className="text-xl font-semibold">Result</h1>
      <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Marks" value={`${r.all.marks}/${r.all.max ?? r.all.total}`} />
        <Metric label="Accuracy" value={`${r.all.accuracy}%`} />
        <Metric label="Est. percentile" value={`${ntaPercentile(r.all.marks)}%`} />
        <Metric label="Time" value={`${Math.round(r.all.time / 60)}m`} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

/** What survives an attempt that has no stored paper. */
function GradedWithoutPaper({ attempt }: { attempt: CbtAttemptRecord }) {
  const r = attempt.result;
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <ScoreHeader attempt={attempt} />

      {/* The subject breakdown is the one aggregate that is still fully real, so
          it is shown rather than withheld - the student's subject-wise marks are
          not affected by the missing paper. */}
      {r ? (
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 text-sm font-semibold">Subject performance</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {SUBJECTS.map((s) => {
              const p = r.per[s];
              if (!p) return null;
              return (
                <div key={s} className="rounded-md border p-3">
                  <p className="text-sm font-semibold">{s}</p>
                  <p className="mt-1 text-2xl font-semibold">{p.accuracy}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.marks} marks · {p.total} q
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-dashed p-6" data-testid="review-unavailable">
        <FileQuestion className="h-6 w-6 text-muted-foreground" />
        <h2 className="mt-2 font-semibold">Question review not available</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The paper was not saved with this attempt, so the question-by-question review, topic
          breakdown and mistake analysis cannot be shown. Your score and subject marks above are
          unaffected - those were recorded at the time.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          New attempts save the paper automatically, so this only affects attempts made earlier, or
          those from the older test library.
        </p>
        <Link
          to="/app/pyq"
          className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Practise more questions
        </Link>
      </section>
    </div>
  );
}

export function AttemptDetail({ attempt }: { attempt: CbtAttemptRecord }) {
  if (attempt.test && attempt.test.questions.length > 0 && attempt.result) {
    return <ExamResult test={attempt.test} result={attempt.result} attempt={attempt} />;
  }
  return <GradedWithoutPaper attempt={attempt} />;
}
