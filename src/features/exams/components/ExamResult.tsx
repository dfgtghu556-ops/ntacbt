/**
 * Post-test result screen.
 *
 * Order follows the documented result contract in the rebuild plan: header
 * score → "What should you do next?" → strengths → weak areas → mistakes →
 * time → question review → full analytics.
 *
 * The order is the point. A student who has just sat three hours does not want
 * a percentage first; they want to know what to do about it. Everything that is
 * merely *interesting* (breakdown counts, subject percentages) sits after the
 * review, because a number nobody acts on is decoration.
 *
 * `src/test/result-page.test.ts` asserts this order, so the comment above
 * cannot drift from the code the way it did before.
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, X, XCircle } from "lucide-react";
import {
  analyseQuestions,
  classLabel,
  idealTimeFor,
  mistakeDoctor,
  topicBreakdown,
  type QuestionInsight,
} from "@/features/cbt/analytics";
import { ntaPercentile, SUBJECTS } from "@/features/cbt/engine";
import type { CbtAttemptRecord, CbtResult, CbtTest } from "@/features/cbt/types";

export function ExamResult({
  test,
  result,
  attempt,
}: {
  test: CbtTest;
  result: CbtResult;
  attempt: CbtAttemptRecord;
}) {
  const insights = useMemo(
    () => analyseQuestions(test, result, attempt.responses),
    [test, result, attempt.responses],
  );
  const topics = useMemo(() => topicBreakdown(test, insights), [test, insights]);
  const doctor = useMemo(
    () =>
      mistakeDoctor(
        insights,
        test.questions.map((q) => ({ q })),
      ),
    [insights, test.questions],
  );
  const pct = ntaPercentile(result.all.marks);

  const weakest = [...topics].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  const strongest = [...topics].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <h1 className="text-xl font-semibold">Result</h1>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Marks" value={`${result.all.marks}/${result.all.max}`} />
          <Metric label="Accuracy" value={`${result.all.accuracy}%`} />
          <Metric label="Est. percentile" value={`${pct}%`} />
          <Metric label="Time" value={`${Math.round(result.all.time / 60)}m`} />
        </div>
      </div>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">What should you do next?</h2>
        {weakest.length ? (
          <ul className="space-y-2 text-sm">
            {weakest.map((t) => (
              <li key={`${t.subject}-${t.chapter}-${t.topic}`} className="rounded-md border p-3">
                <span className="font-medium">
                  {t.subject} · {t.chapter}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {t.accuracy}% · {t.correct}/{t.total}
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    to="/app/studytube"
                    search={{ q: `${t.subject} ${t.chapter}` }}
                    className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    Revise with a lesson
                  </Link>
                  <Link
                    to="/app/pyq"
                    className="rounded-md border border-input px-2.5 py-1.5 text-xs"
                  >
                    Practice PYQs
                  </Link>
                  <Link
                    to="/cbt"
                    search={{ name: `${t.chapter} retest` }}
                    className="rounded-md border border-input px-2.5 py-1.5 text-xs"
                  >
                    Retest this topic
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No topic data yet — attempt a few more questions and this will fill in.
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border p-4">
          <h2 className="mb-3 text-sm font-semibold">Strengths</h2>
          {strongest.length ? (
            <ul className="space-y-1 text-sm">
              {strongest.map((t) => (
                <li key={`s-${t.subject}-${t.chapter}-${t.topic}`}>
                  {t.subject} · {t.chapter} — {t.accuracy}%
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not enough data.</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Weakest topics</h2>
        {topics.length ? (
          <ul className="space-y-2 text-sm">
            {topics.slice(0, 6).map((t) => (
              <li
                key={`${t.subject}-${t.chapter}-${t.topic}`}
                className="rounded-md border px-3 py-2"
              >
                <span className="font-medium">
                  {t.subject} · {t.chapter}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {t.accuracy}% · {t.correct}/{t.total}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {Math.round(t.time / 60)}m
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No topic data.</p>
        )}
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Mistake pattern</h2>
        {doctor.topClasses.length ? (
          <div className="flex flex-wrap gap-2">
            {doctor.topClasses.map((c) => (
              <span key={c.className} className="rounded-md border px-2.5 py-1.5 text-xs">
                {classLabel(c.className)}: {c.count}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No classified questions yet.</p>
        )}
        {doctor.pattern ? (
          <div className="mt-3 rounded-md border border-dashed p-3 text-sm">
            <p className="font-medium">
              {doctor.pattern.label} · {doctor.pattern.subject} ·{" "}
              {doctor.pattern.source === "heuristic"
                ? "heuristic tag (not a verified diagnosis)"
                : "verified question tag"}
            </p>
            <p className="mt-1 text-muted-foreground">{doctor.pattern.fix}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Time</h2>
        <TimePanel insights={insights} idealTime={idealTimeFor(test)} totalTime={result.all.time} />
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Question review</h2>
        <div className="space-y-2">
          {insights.map((ins) => {
            const q = test.questions.find((x) => x.id === ins.questionId);
            if (!q) return null;
            const r = attempt.responses[q.id];
            return (
              <details key={q.id} className="rounded-md border px-3 py-2 text-sm">
                <summary className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium text-white ${
                      ins.correct
                        ? "bg-green-600"
                        : ins.answered
                          ? "bg-red-500"
                          : "bg-muted-foreground/60"
                    }`}
                  >
                    {ins.correct ? "Correct" : ins.answered ? "Wrong" : "Skipped"}
                  </span>
                  <span>{classLabel(ins.className)}</span>
                  <span className="text-xs text-muted-foreground">
                    {q.subject} · Q{q.no} · {Math.round((ins.time / 60) * 10) / 10}m
                  </span>
                </summary>
                <p className="mt-2 whitespace-pre-line">{q.text}</p>
                {q.type === "mcq" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your answer:{" "}
                    {r?.ans
                      ? `${r.ans}. ${q.options.find((o) => o.label === r.ans)?.text || ""}`
                      : "—"}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Your answer: {r?.ans || "—"}</p>
                )}
                <p className="text-xs text-muted-foreground">Correct answer: {q.answer}</p>
                <p className="mt-1 text-xs">{ins.note}</p>
                {q.sol ? (
                  <p className="mt-1 whitespace-pre-line rounded-md bg-muted/50 p-2 text-xs">
                    <span className="font-semibold">Solution:</span> {q.sol}
                  </p>
                ) : null}
              </details>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Breakdown</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border p-3">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <div className="mt-1 font-medium">{result.all.correct} correct</div>
          </div>
          <div className="rounded-md border p-3">
            <XCircle className="h-4 w-4 text-red-500" />
            <div className="mt-1 font-medium">{result.all.wrong} wrong</div>
          </div>
          <div className="rounded-md border p-3">
            <X className="h-4 w-4 text-muted-foreground" />
            <div className="mt-1 font-medium">{result.all.skipped} skipped</div>
          </div>
          <div className="rounded-md border p-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="mt-1 font-medium">{result.all.neg} negative marks</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Subject performance</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SUBJECTS.map((s) => {
            const p = result.per[s];
            return (
              <div key={s} className="rounded-md border p-3">
                <p className="text-sm font-semibold">{s}</p>
                <p className="mt-1 text-2xl font-semibold">{p.accuracy}%</p>
                <p className="text-xs text-muted-foreground">
                  {p.marks} marks · {p.total} q
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/app/studytube"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Repair weak topic (StudyTube)
        </Link>
        <Link to="/app/pyq" className="rounded-md border border-input px-3 py-2 text-sm">
          More PYQ papers
        </Link>
        <Link to="/app/report" className="rounded-md border border-input px-3 py-2 text-sm">
          Full mentor report
        </Link>
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

/**
 * TimePanel — where the three hours actually went.
 *
 * The question bank carries no difficulty field, so nothing here is called
 * "too slow". A question that took four minutes may have been the hardest on
 * the paper, and saying otherwise would be a claim the data cannot support.
 * What the panel does instead is put the numbers next to the outcome so the
 * student draws the conclusion themselves:
 *
 *  - time on questions that ended up **blank** is the clearest loss, because it
 *    bought nothing at all;
 *  - time on questions answered **wrong** is second, because it cost marks as
 *    well as time;
 *  - the average is shown against the flat per-question budget the engine
 *    already uses, so the figure is checkable rather than mysterious.
 */
function TimePanel({
  insights,
  idealTime,
  totalTime,
}: {
  insights: QuestionInsight[];
  idealTime: number;
  totalTime: number;
}) {
  const answered = insights.filter((i) => i.answered);
  const avgAnswered = answered.length
    ? answered.reduce((n, i) => n + i.time, 0) / answered.length
    : 0;
  const onBlank = insights.filter((i) => !i.answered).reduce((n, i) => n + i.time, 0);
  const onWrong = insights.filter((i) => i.answered && !i.correct).reduce((n, i) => n + i.time, 0);

  const mmss = (sec: number) => `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Average per answered question</p>
        <p className="mt-1 text-xl font-semibold">{mmss(avgAnswered)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The flat budget is {mmss(idealTime)} per question.
        </p>
      </div>
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Time on questions left blank</p>
        <p className="mt-1 text-xl font-semibold">{mmss(onBlank)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This bought no marks — the clearest thing to reclaim.
        </p>
      </div>
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Time on questions answered wrong</p>
        <p className="mt-1 text-xl font-semibold">{mmss(onWrong)}</p>
        <p className="mt-1 text-xs text-muted-foreground">This cost marks as well as time.</p>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-3">
        {mmss(totalTime)} of the paper used. No question here is labelled slow: the bank carries no
        difficulty rating, so that would be a guess rather than a measurement.
      </p>
    </div>
  );
}
