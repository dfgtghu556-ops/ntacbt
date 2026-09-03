/**
 * NTACBT Academic Source-of-Truth contracts.
 *
 * These types are the single vocabulary used by the academic data layer,
 * the future React features, and the data validators. They encode the
 * governance rules in the repo: never mix official, verified, derived and
 * AI-generated data; never let one exam/year leak into another.
 */

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

export type VerificationStatus = "verified" | "provisional" | "unverified";

export interface SourceRef {
  category: DataCategory;
  source: string;
  sourceUrl?: string | undefined;
  sourceType:
    "official_pdf" | "nta_bulletin" | "cbse_curriculum" | "verified_curated" | "derived" | "ai";
  verificationStatus: VerificationStatus;
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
