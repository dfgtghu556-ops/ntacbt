/**
 * Exam feature types.
 *
 * The canonical contracts live in `src/types/exam.types.ts` (the shape the
 * redevelopment plan asks for). This module re-exports them so feature code can
 * import from `@/features/exams/*` and the two spellings never drift.
 */
export type {
  Question,
  Exam,
  ExamAttempt,
  ExamAttemptStatus,
  ExamState,
  Subject,
  QuestionType,
  ResponseState,
} from "@/types/exam.types";
export {
  EXAM_MARKING,
  emptyResponse,
  formatClock,
  countAnswered,
  toCbtTest,
  toCbtQuestion,
  fromCbtTest,
  fromCbtQuestion,
  fromCbtAttempt,
} from "@/types/exam.types";
