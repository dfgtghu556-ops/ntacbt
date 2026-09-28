/**
 * Exam-system contracts.
 *
 * These are the *product-level* shapes the redeveloped exam UI, store and
 * services speak. The NTA grading engine keeps its own richer shape
 * (`src/features/cbt/types.ts`) — `Exam`/`ExamAttempt` are the stable surface
 * everything else codes against, and the adapters below convert between them
 * so no grading rule is duplicated.
 */
import type {
  CbtAttemptRecord,
  CbtQuestion,
  CbtResponseState,
  CbtResult,
  CbtTest,
  QuestionType,
  Subject,
} from "@/features/cbt/types";

export type { Subject, QuestionType };

export interface Question {
  id: string;
  /** 1-based position shown to the student. */
  no: number;
  subject: Subject;
  chapter?: string | undefined;
  topic?: string | undefined;
  type: QuestionType;
  text: string;
  options: Array<{ label: string; text: string }>;
  /** Official answer key: option label for MCQ, numeric string for integer. */
  correctAnswer: string;
  explanation?: string | undefined;
  difficulty?: "easy" | "medium" | "hard" | undefined;
  points: number;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  /** Minutes. */
  duration: number;
  totalQuestions: number;
  passingScore: number;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
  /** True for practice/diagnostic papers — excluded from rank-style stats. */
  practice?: boolean | undefined;
}

export type ExamAttemptStatus = "in-progress" | "completed" | "abandoned";

export interface ExamAttempt {
  id: string;
  examId: string;
  userId: string;
  answers: Record<string, string | null>;
  score: number;
  percentage: number;
  startedAt: string;
  completedAt?: string | undefined;
  /** Seconds. */
  timeSpent: number;
  status: ExamAttemptStatus;
}

export interface ExamState {
  currentExam: Exam | null;
  currentAttempt: ExamAttempt | null;
  answers: Record<string, string | null>;
  currentQuestionIndex: number;
  /** Seconds remaining. */
  timeRemaining: number;
  isSubmitting: boolean;
}

/* ------------------------------------------------------------------ *
 * Adapters — one place where the two shapes meet
 * ------------------------------------------------------------------ */

/** NTA marking used by the engine. Kept here so the UI never re-derives it. */
export const EXAM_MARKING = {
  correct: 4,
  wrong: -1,
  skipped: 0,
  integerCorrect: 4,
  integerWrong: 0,
} as const;

export function toCbtTest(exam: Exam): CbtTest {
  return {
    id: exam.id,
    name: exam.title,
    createdAt: Date.parse(exam.createdAt) || Date.now(),
    durationSec: Math.max(1, Math.round(exam.duration * 60)),
    ...(exam.practice === undefined ? {} : { practice: exam.practice }),
    questions: exam.questions.map((q) => toCbtQuestion(q)),
  };
}

export function toCbtQuestion(q: Question): CbtQuestion {
  return {
    id: q.id,
    no: q.no,
    subject: q.subject,
    chapter: q.chapter,
    topic: q.topic,
    type: q.type,
    text: q.text,
    options: q.options,
    answer: q.correctAnswer,
    sol: q.explanation,
  };
}

export function fromCbtTest(test: CbtTest): Exam {
  const createdAt = new Date(test.createdAt).toISOString();
  return {
    id: test.id,
    title: test.name,
    description: `${test.questions.length} questions · ${Math.round(test.durationSec / 60)} minutes`,
    duration: Math.round(test.durationSec / 60),
    totalQuestions: test.questions.length,
    passingScore: Math.round((test.questions.length * EXAM_MARKING.correct) / 4),
    questions: test.questions.map(fromCbtQuestion),
    createdAt,
    updatedAt: createdAt,
    practice: test.practice,
  };
}

export function fromCbtQuestion(q: CbtQuestion): Question {
  return {
    id: q.id,
    no: q.no,
    subject: q.subject,
    chapter: q.chapter,
    topic: q.topic,
    type: q.type,
    text: q.text,
    options: q.options,
    correctAnswer: q.answer,
    explanation: q.sol,
    points: EXAM_MARKING.correct,
  };
}

/** Response states are the engine's vocabulary; re-exported for the UI. */
export type ResponseState = CbtResponseState;

export function emptyResponse(): CbtResponseState {
  return { ans: null, status: "notvisited", time: 0, changes: 0 };
}

/** Convert an engine attempt record into the product-level attempt. */
export function fromCbtAttempt(record: CbtAttemptRecord, userId: string): ExamAttempt {
  const result: CbtResult | undefined = record.result;
  return {
    id: record.id,
    examId: record.testId,
    userId,
    answers: Object.fromEntries(Object.entries(record.responses).map(([id, r]) => [id, r.ans])),
    score: result?.all.marks ?? 0,
    percentage: result?.all.percentage ?? 0,
    startedAt: new Date(record.startedAt).toISOString(),
    completedAt: record.submittedAt ? new Date(record.submittedAt).toISOString() : undefined,
    timeSpent: record.timeTaken,
    status: record.submittedAt ? "completed" : "in-progress",
  };
}

/** Progress helpers shared by the palette and the header. */
export function countAnswered(answers: Record<string, string | null>): number {
  return Object.values(answers).filter((a) => a !== null && a !== "").length;
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
