/**
 * StudentContext — the single persisted answer to "what am I preparing for".
 * Consumed by every engine so exam/class/board can never leak between scopes.
 */
export type { StudentContext, ExamGoal } from "./student-context";
export {
  DEFAULT_CONTEXT,
  EXAM_GOALS,
  GOAL_LABEL,
  checkScopeLeak,
  classLevelOf,
  goalForTarget,
  clearStudentContext,
  isBoardGoal,
  isExamGoal,
  loadStudentContext,
  normalizeContext,
  saveStudentContext,
  scopeOf,
  studyTubeTarget,
} from "./student-context";
export type { StudentContextActions } from "./use-student-context";
export { useStudentContext, useStudentContextActions } from "./use-student-context";
