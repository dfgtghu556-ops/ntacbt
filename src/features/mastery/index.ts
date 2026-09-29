/**
 * Chapter/topic mastery — the learning loop.
 *
 * One derived store per chapter, fed by test attempts (CBT and PYQ papers are
 * both `CbtTest`s), watched-lesson handshakes and the planner. Readiness, the
 * mentor report and the dashboard all read from it, so "videos done",
 * "PYQs attempted" and "accuracy" for the same chapter can finally be answered
 * in one row.
 */
export type {
  AttemptEvidence,
  ChapterMastery,
  LessonEvidence,
  MasteryState,
  PreparationRow,
} from "./mastery";
export {
  MIN_SAMPLE,
  WEAK_ACCURACY,
  buildMastery,
  priorityChapters,
  preparationRows,
} from "./mastery";
export type { MasterySummary } from "./collect";
export { masteryFromStores, summariseMastery } from "./collect";
