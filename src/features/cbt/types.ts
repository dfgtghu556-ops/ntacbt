/**
 * CBT engine contracts (NTA-aligned).
 * Shared by the React CBT route, the post-test analytics, and the mistake doctor.
 */

export type Subject = "Physics" | "Chemistry" | "Mathematics";

export type QuestionType = "mcq" | "integer";

export interface CbtQuestion {
  id: string;
  no: number;
  subject: Subject;
  chapter?: string | undefined;
  topic?: string | undefined;
  type: QuestionType;
  text: string;
  options: Array<{ label: string; text: string }>;
  answer: string;
  /** Non-exact integer keys NTA published: range/any/bonus. */
  accept?:
    | { kind: "range"; lo: number; hi: number }
    | { kind: "any"; vals: number[] }
    | { kind: "all" }
    | undefined;
  sol?: string | undefined;
  /** Known mistake category (concept/formula/calculation/misread/silly/guessed) if provided by the paper. */
  tag?: string | undefined;
}

export interface CbtResponseState {
  ans: string | null;
  status: "notvisited" | "notanswered" | "answered" | "marked" | "answeredmarked";
  time: number;
  changes: number;
}

export interface CbtTest {
  id: string;
  name: string;
  createdAt: number;
  durationSec: number;
  questions: CbtQuestion[];
  chapter?: Record<string, unknown>;
  cloud?: boolean;
  practice?: boolean;
  pyq?: boolean;
}

export interface CbtAttemptRecord {
  id: string;
  testId: string;
  startedAt: number;
  submittedAt: number | null;
  responses: Record<string, CbtResponseState>;
  tabSwitches: number;
  timeTaken: number;
  result?: CbtResult;
}

export interface CbtResult {
  all: {
    correct: number;
    wrong: number;
    skipped: number;
    marks: number;
    neg: number;
    time: number;
    total: number;
    max: number;
    accuracy: number;
    percentage: number;
  };
  per: Record<Subject, SubjectResult>;
}

export interface SubjectResult {
  correct: number;
  wrong: number;
  skipped: number;
  marks: number;
  total: number;
  time: number;
  accuracy: number;
  max: number;
}

/** Deterministic NTA marking: MCQ +4/-1, numerical no negative penalty (2026 rule). */
export const MARK_CORRECT = 4;
export const MARK_WRONG = -1;
export const DEFAULT_TEST_MINUTES = 180;
