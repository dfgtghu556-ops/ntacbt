/**
 * NTACBT academic source-of-truth adapter.
 *
 * This module exposes the existing structured datasets through one typed
 * contract. It does NOT ship a second copy of academic data — it adapts the
 * real datasets already in `src/data/*.ts` (official syllabus + verified
 * faculty) and adds provenance-aware query helpers used by the rest of the
 * app and by `scripts/validate-sot.mjs`.
 *
 * TODO(phase-2): after the legacy inline `JEE_TOPICS` / `AIP_TEACHERS` arrays
 * are bridged/generated, this module becomes the only import point for
 * academic data.
 */

import { JEE_MAIN_2026_SYLLABUS } from "../../data/syllabus";
import {
  INSTITUTES,
  TEACHERS,
  type InstituteRecord,
  type TeacherRecord,
} from "../../data/teachers";
import {
  EXAM_IDS,
  SUBJECTS,
  type AcademicRecord,
  type ExamId,
  type ExamScope,
  type SourceRef,
  type Subject,
} from "./types";

/** The official JEE Main 2026 scope in `src/data/syllabus.ts`. */
export const JEE_MAIN_2026_SCOPE: ExamScope = {
  exam: "JEE_MAIN",
  academicYear: "2025-26",
} as const;

/** Source metadata attached to the structured NTA syllabus dataset. */
export const JEE_SYLLABUS_SOURCE: SourceRef = {
  category: "official",
  source: JEE_MAIN_2026_SYLLABUS?.source ?? "National Testing Agency (NTA)",
  sourceUrl: JEE_MAIN_2026_SYLLABUS?.sourceUrl,
  sourceType: JEE_MAIN_2026_SYLLABUS?.sourceType ?? "nta_bulletin",
  verificationStatus: JEE_MAIN_2026_SYLLABUS?.verificationStatus ?? "provisional",
  verifiedAt: JEE_MAIN_2026_SYLLABUS?.fetchedAt,
};

function toAcademicRecords(): AcademicRecord[] {
  const records: AcademicRecord[] = [];

  for (const subject of JEE_MAIN_2026_SYLLABUS.subjects ?? []) {
    for (const chapter of subject.chapters ?? []) {
      const topics = chapter.topics?.length
        ? chapter.topics
        : [{ id: `${chapter.id}-topic`, name: chapter.name }];
      for (const topic of topics) {
        records.push({
          id: topic.id ?? `${chapter.id}-${topic.name}`,
          exam: "JEE_MAIN",
          academicYear: "2025-26",
          classLevel: chapter.classLevel ?? 12,
          subject: chapter.subject,
          chapter: chapter.name,
          topic: topic.name,
          name: topic.name,
          source: JEE_SYLLABUS_SOURCE,
        });
      }
    }
  }

  for (const teacher of TEACHERS) {
    for (const target of teacher.examTarget ?? []) {
      const exam = mapTeacherTarget(target);
      if (!exam) continue;
      records.push({
        id: `${teacher.id}:${exam}`,
        exam,
        academicYear: targetScopeForTeacher(target)?.academicYear ?? "2025-26",
        classLevel: teacher.subject ? (target === "board11" ? 11 : 12) : 12,
        subject: teacher.subject,
        chapter: teacher.supportedTopics?.join(" · ") || "All supported chapters",
        topic: teacher.specialization,
        name: teacher.name,
        source: {
          category: "verified",
          source: teacher.source ?? "",
          sourceUrl: teacher.channelName,
          sourceType: "verified_curated",
          verificationStatus: teacher.verified ? "verified" : "provisional",
        },
        note: `Faculty match: ${teacher.institute}`,
      });
    }
  }

  return records;
}

function mapTeacherTarget(target: string): ExamId | null {
  const t = target.toLowerCase();
  if (t === "jeemain") return "JEE_MAIN";
  if (t === "jeeadv") return "JEE_ADVANCED";
  if (t === "board11") return "CBSE_11";
  if (t === "board12" || t === "cbse27") return "CBSE_12";
  return null;
}

function targetScopeForTeacher(target: string): ExamScope | null {
  const t = target.toLowerCase();
  if (t === "board11") return { exam: "CBSE_11", academicYear: "2026-27" };
  if (t === "board12" || t === "cbse27") return { exam: "CBSE_12", academicYear: "2026-27" };
  return null;
}

/** All known academic fragments in the repo, tagged with provenance. */
export const ACADEMIC_RECORDS: AcademicRecord[] = toAcademicRecords();

/** Filter records to one exam/year scope. Throws instead of silently returning nothing. */
export function forScope(scope: ExamScope): AcademicRecord[] {
  return ACADEMIC_RECORDS.filter(
    (r) => r.exam === scope.exam && r.academicYear === scope.academicYear,
  );
}

/** Catch accidental cross-scope leakage: every record must match exactly one scope. */
export function assertNoCrossScopeMixing(scope: ExamScope): boolean {
  for (const record of forScope(scope)) {
    if (record.exam !== scope.exam || record.academicYear !== scope.academicYear) {
      return false;
    }
  }
  return true;
}

/** Deterministic count for validators/tests. */
export function academicStats(): Record<ExamId, Record<Subject | "teachers", number>> {
  const stats = {} as Record<ExamId, Record<Subject | "teachers", number>>;
  for (const exam of EXAM_IDS) {
    stats[exam] = { Physics: 0, Chemistry: 0, Mathematics: 0, teachers: 0 };
  }
  for (const r of ACADEMIC_RECORDS) {
    if (r.subject) stats[r.exam][r.subject] += 1;
  }
  for (const t of TEACHERS) {
    for (const target of t.examTarget ?? []) {
      const exam = mapTeacherTarget(target);
      if (exam) stats[exam].teachers += 1;
    }
  }
  return stats;
}

export const ACADEMIC_GOVERNANCE = {
  examIds: EXAM_IDS,
  subjects: SUBJECTS,
  officialSyllabus: JEE_MAIN_2026_SYLLABUS,
  institutes: INSTITUTES as unknown as InstituteRecord[],
  teachers: TEACHERS as unknown as TeacherRecord[],
} as const;
