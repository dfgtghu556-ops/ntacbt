/**
 * NTACBT Academic Source-of-Truth contracts.
 *
 * These types are the single vocabulary used by the academic data layer,
 * the future React features, and the data validators. They encode the
 * governance rules in the repo: never mix official, verified, derived and
 * AI-generated data; never let one exam/year leak into another.
 */

import type { Source } from "./source";

export type ExamId = "JEE_MAIN" | "JEE_ADVANCED" | "CBSE_11" | "CBSE_12";

export const EXAM_IDS = ["JEE_MAIN", "JEE_ADVANCED", "CBSE_11", "CBSE_12"] as const;

/** The scope every academic read must be explicit about. */
export interface ExamScope {
  exam: ExamId;
  /** e.g. "2026-27", "2025-26". Strictly isolates the syllabus year. */
  academicYear: string;
}

export type Subject = "Physics" | "Chemistry" | "Mathematics";

export const SUBJECTS: Subject[] = ["Physics", "Chemistry", "Mathematics"];

/** Trust layer. Never silently mix these. */
export type DataCategory = "official" | "verified" | "derived" | "ai";

export type { VerificationStatus } from "./source";

/**
 * A per-record provenance reference. This is the canonical `Source` record
 * (see `academics/source.ts`) plus the trust-layer `category`, because a
 * record needs to say both *where it came from* and *how much to trust it*.
 *
 * `category` is required so an academic read can never silently mix official,
 * verified, derived and AI data.
 */
export interface SourceRef extends Source {
  category: DataCategory;
  /** Legacy alias for `fetchedAt`, kept so existing call sites keep working. */
  verifiedAt?: string | undefined;
}

/** One educational atomic unit (chapter/topic). */
export interface AcademicRecord {
  id: string;
  exam: ExamId;
  academicYear: string;
  classLevel: 11 | 12;
  subject: Subject;
  chapter: string;
  topic?: string | undefined;
  name: string;
  source: SourceRef;
  /** Human readable confidence note, e.g. "NTA Information Bulletin 2025-26". */
  note?: string | undefined;
}

export interface ExamScopeFactory {
  exam: ExamId;
  academicYear: string;
  label: string;
}

export const KNOWN_SCOPES: ExamScopeFactory[] = [
  { exam: "JEE_MAIN", academicYear: "2025-26", label: "JEE Main 2026" },
  { exam: "JEE_ADVANCED", academicYear: "2025-26", label: "JEE Advanced 2026" },
  { exam: "CBSE_11", academicYear: "2026-27", label: "CBSE Class 11 (2026-27)" },
  { exam: "CBSE_12", academicYear: "2026-27", label: "CBSE Class 12 (2026-27)" },
];

export function isExamId(value: unknown): value is ExamId {
  return typeof value === "string" && (EXAM_IDS as readonly string[]).includes(value);
}

export function isScope(scope: ExamScope): boolean {
  return (
    isExamId(scope?.exam) &&
    typeof scope.academicYear === "string" &&
    scope.academicYear.length >= 4
  );
}
