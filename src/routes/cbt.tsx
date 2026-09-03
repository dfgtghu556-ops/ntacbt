import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
  XCircle,
} from "lucide-react";
import {
  DEFAULT_TEST_MINUTES,
  type CbtAttemptRecord,
  type CbtQuestion,
  type CbtResponseState,
  type CbtResult,
  type CbtTest,
} from "@/features/cbt/types";
import { evaluate, ntaPercentile, SUBJECTS } from "@/features/cbt/engine";
import {
  analyseQuestions,
  classLabel,
  mistakeDoctor,
  topicBreakdown,
} from "@/features/cbt/analytics";
import { getCbtTest, saveCbtAttempt, saveCbtTest } from "@/features/cbt/store";

export const Route = createFileRoute("/cbt")({
  validateSearch: (search: Record<string, unknown>): CbtSearch => ({
    testId: typeof search["testId"] === "string" && search["testId"] ? search["testId"] : undefined,
    name: typeof search["name"] === "string" && search["name"] ? search["name"] : undefined,
  }),
  component: Cbt,
});

type Mode = "instructions" | "exam" | "result";

interface CbtSearch {
  testId?: string | undefined;
  name?: string | undefined;
}

function emptyResponse(): CbtResponseState {
  return { ans: null, status: "notvisited", time: 0, changes: 0 };
}

function buildInlineTest(
  name: string,
  questions: Array<{
    id: string;
    no: number;
    subject: "Physics" | "Chemistry" | "Mathematics";
    chapter?: string | undefined;
    topic?: string | undefined;
    type: "mcq" | "integer";
    text: string;
    options: Array<{ label: string; text: string }>;
    answer: string;
    accept?: CbtQuestion["accept"] | undefined;
    sol?: string | undefined;
  }>,
): CbtTest {
  return {
    id: `react-${Date.now().toString(36)}`,
    name,
    createdAt: Date.now(),
    durationSec: DEFAULT_TEST_MINUTES * 60,
    questions: questions.map((q) => ({ ...q })),
  };
}

function Cbt() {
  const search = useSearch({ from: Route.id });
  const [test, setTest] = useState<CbtTest | null>(null);
  const [mode, setMode] = useState<Mode>("instructions");
  const [cur, setCur] = useState(0);
  const [responses, setResponses] = useState<Record<string, CbtResponseState>>({});
  const [left, setLeft] = useState(0);
  const [calcOpen, setCalcOpen] = useState(false);
  const [computed, setComputed] = useState<CbtResult | null>(null);
  const [attempt, setAttempt] = useState<CbtAttemptRecord | null>(null);
  const startedAt = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const curRef = useRef(cur);
  const responsesRef = useRef(responses);
  const testRef = useRef(test);
  const submitRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    curRef.current = cur;
  }, [cur]);
  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);
  useEffect(() => {
    testRef.current = test;
  }, [test]);

  useEffect(() => {
    if (mode !== "exam" || !test) return;
    setLeft(test.durationSec);
    const qs = test.questions.map((q) => q.id);
    setResponses((prev) => {
      const next = { ...prev };
      for (const qid of qs) next[qid] = next[qid] || emptyResponse();
      return next;
    });
    startedAt.current = Date.now();
    timerRef.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          submitRef.current();
          return 0;
        }
        // Accumulate per-question time on the currently viewed question.
        const t = testRef.current;
        const i = curRef.current;
        const qid = t?.questions[i]?.id;
        if (t && qid) {
          const rr = responsesRef.current[qid];
          responsesRef.current = {
            ...responsesRef.current,
            [qid]: { ...(rr || emptyResponse()), time: (rr?.time || 0) + 1 },
          };
          setResponses((prev) => ({
            ...prev,
            [qid]: { ...(prev[qid] || emptyResponse()), time: (prev[qid]?.time || 0) + 1 },
          }));
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, test]);

  const submit = useCallback(
    (overrideResponses?: Record<string, CbtResponseState>) => {
      const t = test;
      if (!t) return;
      const source = overrideResponses || responsesRef.current;
      const withTime = Object.fromEntries(
        Object.entries(source).map(([id, r]) => [
          id,
          { ans: r.ans, time: r.time, status: r.status, changes: r.changes },
        ]),
      );
      const result = evaluate(t, withTime, true);
      const record: CbtAttemptRecord = {
        id: `att-${Date.now().toString(36)}`,
        testId: t.id,
        startedAt: startedAt.current,
        submittedAt: Date.now(),
        responses: withTime,
        tabSwitches: 0,
        timeTaken: t.durationSec - left,
        result,
      };
      setComputed(result);
      setAttempt(record);
      saveCbtAttempt(record);
      setMode("result");
    },
    [test, left],
  );

  submitRef.current = submit;

  function completeInstruction() {
    setMode("exam");
  }

  function reset() {
    setMode("instructions");
    setCur(0);
    setResponses({});
    setComputed(null);
    setAttempt(null);
    setLeft(0);
  }

  if (!test) {
    return <CbtEmpty />;
  }

  if (mode === "instructions") {
    return (
      <div className="mx-auto max-w-2xl space-y-5 p-4">
        <h1 className="text-2xl font-semibold tracking-tight">{test.name}</h1>
        <div className="rounded-xl border p-5">
          <h2 className="text-sm font-semibold">Instructions (NTA-style)</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>• Duration: {Math.round(test.durationSec / 60)} minutes.</li>
            <li>• Each section has MCQs (4 marks each) and numerical questions.</li>
            <li>• MCQ marking: +4 correct, −1 wrong, 0 unattempted.</li>
            <li>• Numerical/integer questions: +4 correct, 0 wrong (official 2026 rule).</li>
            <li>• Use Save & Next, Mark for Review, and the question palette to navigate.</li>
            <li>• The test auto-submits when time runs out.</li>
          </ul>
        </div>
        <div className="flex justify-end">
          <button
            onClick={completeInstruction}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Start test
          </button>
        </div>
      </div>
    );
  }

  if (mode === "result" && computed && attempt) {
    return <CbtResultView test={test} result={computed} attempt={attempt} />;
  }

  if (!test.questions[cur]) return <CbtEmpty />;
  const q = test.questions[cur] as CbtQuestion;
  const r = responses[q.id] || emptyResponse();
  const qs = test.questions;
  const answeredCount = qs.filter((x) => {
    const rr = responses[x.id];
    return rr && rr.ans != null && rr.ans !== "";
  }).length;

  function setAns(ans: string | null) {
    setResponses((prev) => {
      const curR = prev[q.id] || emptyResponse();
      const status =
        ans == null || ans === ""
          ? curR.status === "marked" || curR.status === "answeredmarked"
            ? "marked"
            : prev[q.id]?.status === "answered" || prev[q.id]?.status === "answeredmarked"
              ? "notanswered"
              : prev[q.id]?.status === "marked"
                ? "marked"
                : "notanswered"
          : curR.status === "marked" || curR.status === "answeredmarked"
            ? "answeredmarked"
            : "answered";
      return {
        ...prev,
        [q.id]: { ...curR, ans, status, changes: (curR.changes || 0) + 1, time: curR.time || 0 },
      };
    });
  }

  function move(delta: number) {
    // Commit answer time in 1s granularity: increment the current q's time.
    setResponses((prev) => ({
      ...prev,
      [q.id]: { ...(prev[q.id] || emptyResponse()), time: (prev[q.id]?.time || 0) + 1 },
    }));
    setCur((c) => Math.max(0, Math.min(qs.length - 1, c + delta)));
  }

  function markReview() {
    setResponses((prev) => {
      const curR = prev[q.id] || emptyResponse();
      const hadAns = curR.ans != null && curR.ans !== "";
      const status = hadAns
        ? curR.status === "answeredmarked" || curR.status === "answered"
          ? "answeredmarked"
          : curR.status === "marked"
            ? "answeredmarked"
            : "answeredmarked"
        : curR.status === "marked" || curR.status === "answeredmarked"
          ? curR.status === "marked"
            ? "notvisited"
            : "notanswered"
          : "marked";
      return { ...prev, [q.id]: { ...curR, status } };
    });
  }

  function clearAnswer() {
    setResponses((prev) => {
      const curR = prev[q.id] || emptyResponse();
      const status =
        curR.status === "marked" || curR.status === "answeredmarked" ? "marked" : "notanswered";
      return { ...prev, [q.id]: { ...curR, ans: null, status, changes: (curR.changes || 0) + 1 } };
    });
  }

  function fmtTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  const paletteClass = (rid: string, rr: CbtResponseState) => {
    const has = rr.ans != null && rr.ans !== "";
    if (rr.status === "answeredmarked") return "bg-blue-600 text-white";
    if (has || rr.status === "answered") return "bg-green-600 text-white";
    if (rr.status === "marked") return "bg-purple-600 text-white";
    return "bg-white text-foreground border";
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
        <div className="text-sm font-semibold">{test.name}</div>
        <div className="text-sm font-medium">
          {answeredCount}/{qs.length} answered
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCalcOpen((v) => !v)}
            className="rounded-md border border-input p-2 text-muted-foreground"
            aria-label="Calculator"
          >
            <Calculator className="h-4 w-4" />
          </button>
          <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground">
            <Clock className="h-4 w-4" /> {fmtTime(left)}
          </span>
          <button
            onClick={() => window.confirm("Submit test?") && submit()}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground"
          >
            Submit
          </button>
        </div>
      </header>

      <div className="grid flex-1 lg:grid-cols-[1fr_260px]">
        <div className="p-4">
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span
              className="font-semibold"
              style={{
                color:
                  q.subject === "Physics"
                    ? "#0b57a4"
                    : q.subject === "Chemistry"
                      ? "#1e9e57"
                      : "#7a3ec8",
              }}
            >
              {q.subject}
            </span>
            {q.chapter ? <span>· {q.chapter}</span> : null}
            {q.topic ? <span>· {q.topic}</span> : null}
            <span>· Q{q.no}</span>
            <span>· {q.type === "mcq" ? "MCQ" : "Integer"}</span>
          </div>

          <div className="rounded-xl border bg-background p-4">
            <p className="text-sm leading-relaxed">{q.text}</p>

            {q.type === "mcq" ? (
              <div className="mt-4 space-y-2">
                {q.options.map((o) => (
                  <label
                    key={o.label}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                      r.ans === o.label ? "border-primary bg-accent" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={r.ans === o.label}
                      onChange={() => setAns(o.label)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold">{o.label}.</span> {o.text}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <input
                value={r.ans ?? ""}
                onChange={(e) => setAns(e.target.value)}
                inputMode="numeric"
                placeholder="Enter numerical answer"
                className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>

          {calcOpen ? <BasicCalculator /> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => move(-1)}
              className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button
              onClick={markReview}
              className="rounded-md border border-input px-3 py-2 text-sm"
            >
              Mark for Review
            </button>
            <button
              onClick={clearAnswer}
              className="rounded-md border border-input px-3 py-2 text-sm"
            >
              Clear Response
            </button>
            <button
              onClick={() => move(1)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Save & Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-t bg-background p-3 lg:border-l lg:border-t-0">
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Question palette</h3>
          <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-5">
            {qs.map((x, i) => {
              const rr = responses[x.id] || emptyResponse();
              return (
                <button
                  key={x.id}
                  onClick={() => setCur(i)}
                  className={`h-8 w-8 rounded text-xs font-medium ${paletteClass(x.id, rr)} ${
                    i === cur ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="mr-1 inline-block h-2 w-2 rounded bg-green-600" /> Answered
            </p>
            <p>
              <span className="mr-1 inline-block h-2 w-2 rounded bg-purple-600" /> Marked / review
            </p>
            <p>
              <span className="mr-1 inline-block h-2 w-2 rounded bg-blue-600" /> Answered + marked
            </p>
            <p>
              <span className="mr-1 inline-block h-2 w-2 rounded bg-muted" /> Not visited
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BasicCalculator() {
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");
  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "C", "+"];
  function press(k: string) {
    if (k === "C") {
      setDisplay("0");
      setExpr("");
      return;
    }
    const next = expr + k;
    setExpr(next);
    try {
      const val = Function(`"use strict"; return (${next.replace(/[^0-9+\-*/.()]/g, "")})`)();
      if (typeof val === "number" && isFinite(val)) setDisplay(String(+val.toFixed(6)));
    } catch {
      /* keep typing */
    }
  }
  function backspace() {
    setExpr((e) => e.slice(0, -1));
  }
  return (
    <div className="mt-4 rounded-xl border p-3">
      <div className="rounded-md border px-3 py-2 text-right text-lg font-medium">{display}</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className="rounded-md border border-input py-2 text-sm"
          >
            {k}
          </button>
        ))}
        <button onClick={backspace} className="rounded-md border border-input py-2 text-sm">
          ⌫
        </button>
      </div>
    </div>
  );
}

function CbtResultView({
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

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <div className="rounded-xl bg-primary p-5 text-primary-foreground">
        <h1 className="text-xl font-semibold">Result</h1>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs opacity-80">Marks</div>
            <div className="text-2xl font-semibold">
              {result.all.marks}/{result.all.max}
            </div>
          </div>
          <div>
            <div className="text-xs opacity-80">Accuracy</div>
            <div className="text-2xl font-semibold">{result.all.accuracy}%</div>
          </div>
          <div>
            <div className="text-xs opacity-80">Est. percentile</div>
            <div className="text-2xl font-semibold">{pct}%</div>
          </div>
          <div>
            <div className="text-xs opacity-80">Time</div>
            <div className="text-2xl font-semibold">{Math.round(result.all.time / 60)}m</div>
          </div>
        </div>
      </div>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Breakdown</h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
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

      <section className="rounded-xl border p-4">
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

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Time × accuracy</h2>
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

      <section className="rounded-xl border p-4">
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

      <section className="rounded-xl border p-4">
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
        <button
          onClick={() => window.location.reload()}
          className="rounded-md border border-input px-3 py-2 text-sm"
        >
          Retake
        </button>
      </div>
    </div>
  );
}

function CbtEmpty() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="max-w-md rounded-xl border border-dashed p-8 text-center">
        <h1 className="text-lg font-semibold">No paper loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open a paper from the PYQ browser to start a full-length NTA-style test, or use the
          diagnostic drill on this page.
        </p>
        <Link
          to="/app/pyq"
          className="mt-4 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Open PYQ browser
        </Link>
      </div>
    </div>
  );
}

function demoQuestions(): Array<{
  id: string;
  no: number;
  subject: "Physics" | "Chemistry" | "Mathematics";
  type: "mcq" | "integer";
  text: string;
  options: Array<{ label: string; text: string }>;
  answer: string;
}> {
  return [
    {
      id: "demo-phy-1",
      no: 1,
      subject: "Physics",
      type: "mcq",
      text: "SI unit of force is:",
      options: [
        { label: "a", text: "Newton" },
        { label: "b", text: "Joule" },
        { label: "c", text: "Watt" },
        { label: "d", text: "Pascal" },
      ],
      answer: "a",
    },
    {
      id: "demo-chem-1",
      no: 2,
      subject: "Chemistry",
      type: "mcq",
      text: "Avogadro number is approximately:",
      options: [
        { label: "a", text: "6.022 × 10²³" },
        { label: "b", text: "3.141 × 10²³" },
        { label: "c", text: "9.8 × 10²³" },
        { label: "d", text: "1.602 × 10¹⁹" },
      ],
      answer: "a",
    },
    {
      id: "demo-math-1",
      no: 3,
      subject: "Mathematics",
      type: "integer",
      text: "If f(x) = x², find f(3).",
      options: [],
      answer: "9",
    },
  ];
}
