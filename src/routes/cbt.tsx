/**
 * CBT route — the NTA-style exam runner.
 *
 * This file is now *composition and data loading only*. The exam UI lives in
 * `src/features/exams/components/*`, the live-attempt state in
 * `src/features/exams/store.ts`, persistence in `src/features/cbt/store.ts`, and
 * grading in `src/features/cbt/engine.ts`.
 *
 * Behaviour preserved from the original monolith route:
 *   - NTA marking (+4/−1, integers +4/0) and the dense percentile table
 *   - the answered / marked / answeredmarked response state machine
 *   - per-question time accumulation in 1s granularity
 *   - auto-submit at zero
 * Behaviour added: autosave every 30s + resume of an interrupted attempt.
 */
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { evaluate } from "@/features/cbt/engine";
import { getCbtTest } from "@/features/cbt/store";
import { loadPaperQuestions } from "@/features/pyq/store";
import type {
  CbtAttemptRecord,
  CbtQuestion,
  CbtResponseState,
  CbtResult,
  CbtTest,
} from "@/features/cbt/types";
import { emptyResponse, fromCbtQuestion, fromCbtTest, type Exam } from "@/types/exam.types";
import { useExamStore } from "@/features/exams/store";
import { examService } from "@/services/exam.service";
import {
  AUTOSAVE_INTERVAL_MS,
  clearDraft,
  hydrateResponses,
  loadDraft,
  remainingFromDraft,
  saveDraft,
  type AttemptDraft,
} from "@/features/exams/autosave";
import { ExamInstructions } from "@/features/exams/components/ExamInstructions";
import { ExamHeader } from "@/features/exams/components/ExamHeader";
import { QuestionPanel } from "@/features/exams/components/QuestionPanel";
import { QuestionPalette } from "@/features/exams/components/QuestionPalette";
import { Calculator } from "@/features/exams/components/Calculator";
import { ExamResult } from "@/features/exams/components/ExamResult";

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

interface DiagnosticPaper {
  questions?: Array<{
    no: number;
    subject: string;
    chapter?: string;
    topic?: string;
    type: "mcq" | "integer";
    text: string;
    options: Array<{ label: string; text: string }>;
    answer: string;
    sol?: string;
  }>;
  paper?: { questions?: DiagnosticPaper["questions"] };
}

const DIAGNOSTIC_PAPER = "jee-main-2026-online-22-january-morning-shift";
const DIAGNOSTIC_PER_SUBJECT = 5;

function diagnosticSubject(s: string): CbtQuestion["subject"] {
  if (s === "Physics" || s === "Chemistry" || s === "Mathematics") return s;
  return "Physics";
}

/** Pick a balanced slice from a full paper so a diagnostic stays short. */
function buildDiagnostic(
  questions: DiagnosticPaper["questions"] | undefined,
  name: string,
): CbtTest | null {
  const qs = questions || [];
  if (!qs.length) return null;
  const buckets: Record<CbtQuestion["subject"], NonNullable<DiagnosticPaper["questions"]>> = {
    Physics: [],
    Chemistry: [],
    Mathematics: [],
  };
  for (const q of qs) {
    if (!q.text || !q.answer) continue;
    (buckets[diagnosticSubject(q.subject)] ||= []).push({
      ...q,
      options: Array.isArray(q.options) ? q.options : [],
    });
  }
  const selected: NonNullable<DiagnosticPaper["questions"]> = [];
  for (const sub of ["Physics", "Chemistry", "Mathematics"] as const) {
    for (const q of buckets[sub] || []) {
      if (selected.filter((x) => x.subject === sub).length >= DIAGNOSTIC_PER_SUBJECT) break;
      selected.push(q);
    }
  }
  const byNo = [...selected].sort((a, b) => a.no - b.no);
  if (byNo.length < 6) return null;
  return {
    id: `diag-${Date.now().toString(36)}`,
    name,
    createdAt: Date.now(),
    durationSec: 45 * 60,
    practice: true,
    questions: byNo.map((q, i) => ({
      id: `diag-${i}-${q.no}`,
      no: i + 1,
      subject: diagnosticSubject(q.subject),
      chapter: q.chapter,
      topic: q.topic,
      type: q.type === "integer" ? "integer" : "mcq",
      text: q.text,
      options: q.options,
      answer: q.answer,
      sol: q.sol,
    })),
  };
}

async function loadDiagnosticTest(name: string): Promise<CbtTest | null> {
  // 1) Baked paper (offline-friendly). Start from the fullest 2026 paper we ship.
  try {
    const data = await loadPaperQuestions(DIAGNOSTIC_PAPER);
    const t = buildDiagnostic(data, name);
    if (t) return t;
  } catch {
    /* fall through */
  }
  // 2) Full historical API (older years / more sessions if the server can reach it).
  try {
    const r = await fetch(`/api/public/pyq-papers?paper=${encodeURIComponent(DIAGNOSTIC_PAPER)}`, {
      cache: "no-store",
    });
    if (r.ok) {
      const data = (await r.json()) as { paper?: { questions?: DiagnosticPaper["questions"] } };
      const t = buildDiagnostic(data.paper?.questions, name);
      if (t) return t;
    }
  } catch {
    /* fall through */
  }
  // 3) Last-resort demo so the practice page never dead-ends.
  return buildDiagnostic(
    demoQuestions().map((q, i) => ({
      no: i + 1,
      subject: q.subject,
      type: q.type,
      text: q.text,
      options: q.options,
      answer: q.answer,
    })),
    name,
  );
}

function Cbt() {
  const search = useSearch({ from: Route.id });
  const [test, setTest] = useState<CbtTest | null>(null);
  const [loadingTest, setLoadingTest] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<Mode>("instructions");
  const [responses, setResponses] = useState<Record<string, CbtResponseState>>({});
  const [computed, setComputed] = useState<CbtResult | null>(null);
  const [attempt, setAttempt] = useState<CbtAttemptRecord | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [draft, setDraft] = useState<AttemptDraft | null>(null);

  const startedAt = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitRef = useRef<() => void>(() => undefined);

  const exam: Exam | null = useMemo(() => (test ? fromCbtTest(test) : null), [test]);
  const examQuestions = useMemo(() => (test ? test.questions.map(fromCbtQuestion) : []), [test]);
  const {
    answers,
    setAnswer,
    currentQuestionIndex: cur,
    goToQuestion,
    nextQuestion,
    previousQuestion,
    timeRemaining: left,
    updateTimeRemaining,
    setSubmitting,
    resetExam,
    hydrate,
    setCurrentExam,
  } = useExamStore();

  /* ---------------- load the paper ---------------- */
  useEffect(() => {
    let alive = true;
    async function load() {
      setLoadingTest(true);
      setLoadError("");
      if (search.testId) {
        const saved = getCbtTest(search.testId);
        if (saved) {
          if (!alive) return;
          setTest(saved);
          setLoadingTest(false);
          return;
        }
      }
      const name = search.name || search.testId || "Quick mixed diagnostic drill";
      try {
        const t = await loadDiagnosticTest(name);
        if (!alive) return;
        if (t) {
          setTest(t);
          setMode("instructions");
        } else {
          setLoadError(
            "No questions could be loaded on this device yet. Open a paper from the PYQ browser.",
          );
        }
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "Could not prepare this test.");
      } finally {
        if (alive) setLoadingTest(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [search.testId, search.name]);

  /* ---------------- offer to resume an interrupted attempt ---------------- */
  useEffect(() => {
    if (!exam || mode !== "instructions") return;
    const saved = loadDraft();
    if (saved && saved.examId === exam.id) setDraft(saved);
    else setDraft(null);
  }, [exam, mode]);

  /* ---------------- start / resume ---------------- */
  const begin = useCallback(
    (resumeDraft: AttemptDraft | null) => {
      if (!test) return;
      const hydrated = hydrateResponses(fromCbtTest(test), resumeDraft);
      setResponses(hydrated);
      hydrate({
        answers: Object.fromEntries(Object.entries(hydrated).map(([id, r]) => [id, r.ans])),
        currentQuestionIndex: resumeDraft?.currentQuestionIndex ?? 0,
      });
      setCurrentExam(fromCbtTest(test));
      startedAt.current = resumeDraft?.startedAt ?? Date.now();
      updateTimeRemaining(resumeDraft ? remainingFromDraft(resumeDraft) : test.durationSec);
      setMode("exam");
    },
    [test, hydrate, updateTimeRemaining, setCurrentExam],
  );

  /* ---------------- the clock ---------------- */
  useEffect(() => {
    if (mode !== "exam" || !test) return;
    timerRef.current = setInterval(() => {
      updateTimeRemaining(left - 1);
      // Accumulate per-question time on the currently viewed question.
      const qid = test.questions[cur]?.id;
      if (qid) {
        setResponses((prev) => ({
          ...prev,
          [qid]: { ...(prev[qid] || emptyResponse()), time: (prev[qid]?.time || 0) + 1 },
        }));
      }
      if (left <= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        submitRef.current();
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, test, left, cur, updateTimeRemaining]);

  /* ---------------- autosave ---------------- */
  useEffect(() => {
    if (mode !== "exam" || !test) return;
    const write = () => {
      saveDraft({
        examId: test.id,
        examTitle: test.name,
        startedAt: startedAt.current,
        elapsedSec: test.durationSec - left,
        durationSec: test.durationSec,
        currentQuestionIndex: cur,
        responses,
      });
    };
    autosaveRef.current = setInterval(write, AUTOSAVE_INTERVAL_MS);
    return () => {
      if (autosaveRef.current) clearInterval(autosaveRef.current);
    };
  }, [mode, test, left, cur, responses]);

  /* ---------------- submit ---------------- */
  const submit = useCallback(() => {
    const t = test;
    if (!t) return;
    setSubmitting(true);
    const withTime = Object.fromEntries(
      Object.entries(responses).map(([id, r]) => [
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
      timeTaken: Math.max(0, t.durationSec - left),
      result,
    };
    setComputed(result);
    setAttempt(record);
    void examService.submitExam(fromCbtTest(t), responses, startedAt.current, record.timeTaken);
    clearDraft();
    setSubmitting(false);
    setMode("result");
  }, [test, responses, left, setSubmitting]);

  submitRef.current = submit;

  function reset() {
    clearDraft();
    resetExam();
    setResponses({});
    setComputed(null);
    setAttempt(null);
    setMode("instructions");
  }

  /* ---------------- render ---------------- */
  if (!test) {
    return loadingTest ? <CbtLoading /> : <CbtEmpty error={loadError} />;
  }

  if (mode === "instructions") {
    return (
      <ExamInstructions
        exam={fromCbtTest(test)}
        onStart={() => begin(null)}
        hasDraft={Boolean(draft)}
        onResume={() => begin(draft)}
      />
    );
  }

  if (mode === "result" && computed && attempt && test) {
    return <ExamResult test={test} result={computed} attempt={attempt} />;
  }

  const q = test.questions[cur] as CbtQuestion;
  if (!q) return <CbtEmpty />;
  const r = responses[q.id] || emptyResponse();

  function setAns(ans: string | null) {
    setAnswer(q.id, ans);
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
    setResponses((prev) => ({
      ...prev,
      [q.id]: { ...(prev[q.id] || emptyResponse()), time: (prev[q.id]?.time || 0) + 1 },
    }));
    if (delta > 0) nextQuestion();
    else previousQuestion();
  }

  function markReview() {
    setResponses((prev) => {
      const curR = prev[q.id] || emptyResponse();
      const hadAns = curR.ans != null && curR.ans !== "";
      const status = hadAns
        ? "answeredmarked"
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
    setAnswer(q.id, null);
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <ExamHeader
        title={test.name}
        answers={answers}
        total={test.questions.length}
        timeRemaining={left}
        calculatorOpen={calcOpen}
        onToggleCalculator={() => setCalcOpen((v) => !v)}
        onSubmit={() => {
          if (window.confirm("Submit test?")) submit();
        }}
      />

      <div className="grid flex-1 lg:grid-cols-[1fr_260px]">
        <QuestionPanel
          question={examQuestions[cur] ?? fromCbtQuestion(q)}
          answer={r.ans}
          index={cur}
          total={test.questions.length}
          onAnswer={setAns}
          onPrevious={() => move(-1)}
          onNext={() => move(1)}
          onMarkReview={markReview}
          onClear={clearAnswer}
        >
          {calcOpen ? <Calculator /> : null}
        </QuestionPanel>

        <QuestionPalette
          questions={examQuestions}
          responses={responses}
          current={cur}
          onJump={goToQuestion}
        />
      </div>

      <button type="button" onClick={reset} className="sr-only">
        Reset
      </button>
    </div>
  );
}

function CbtEmpty({ error }: { error?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="max-w-md rounded-xl border border-dashed p-8 text-center">
        <h1 className="text-lg font-semibold">No paper loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ||
            "Open a paper from the PYQ browser to start a full-length NTA-style test, or use the diagnostic drill on this page."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            to="/app/pyq"
            className="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Open PYQ browser
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex rounded-md border border-input px-3 py-2 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

function CbtLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-3">
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl border bg-muted/40" />
        <div className="h-10 w-1/2 animate-pulse rounded bg-muted" />
        <p className="text-center text-xs text-muted-foreground">
          Preparing your test from the verified question bank…
        </p>
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
