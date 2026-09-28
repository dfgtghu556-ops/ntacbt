/**
 * Exam service.
 *
 * Owns everything about *getting* a paper and *storing* an attempt. Two
 * sources, in priority order:
 *
 *   1. the local CBT store (`src/features/cbt/store.ts`) — saved full-length
 *      tests and past attempts, always available offline;
 *   2. the baked PYQ JSON under `public/pyq/` — the verified question bank
 *      shipped with the app.
 *
 * It never invents a paper: when nothing can be loaded it says so instead of
 * fabricating questions.
 */
import { getCbtTest, loadCbtStore, saveCbtAttempt, saveCbtTest } from "@/features/cbt/store";
import { evaluate } from "@/features/cbt/engine";
import type { CbtAttemptRecord, CbtResponseState, CbtTest } from "@/features/cbt/types";
import { fromCbtAttempt, toCbtTest, type Exam, type ExamAttempt } from "@/types/exam.types";

const PYQ_BASE = "/pyq";

export const examService = {
  /** Every paper saved on this device, newest first. */
  async getAllExams(): Promise<Exam[]> {
    return loadCbtStore().tests.map((t) => ({
      id: t.id,
      title: t.name,
      description: `${t.questions.length} questions`,
      duration: Math.round(t.durationSec / 60),
      totalQuestions: t.questions.length,
      passingScore: 0,
      questions: [],
      createdAt: new Date(t.createdAt).toISOString(),
      updatedAt: new Date(t.createdAt).toISOString(),
      practice: t.practice,
    }));
  },

  async getExamById(id: string): Promise<Exam | null> {
    const local = getCbtTest(id);
    if (local) {
      return {
        id: local.id,
        title: local.name,
        description: `${local.questions.length} questions`,
        duration: Math.round(local.durationSec / 60),
        totalQuestions: local.questions.length,
        passingScore: 0,
        questions: [],
        createdAt: new Date(local.createdAt).toISOString(),
        updatedAt: new Date(local.createdAt).toISOString(),
        practice: local.practice,
      };
    }
    const baked = await examService.loadBakedPaper(id);
    return baked;
  },

  /**
   * Load a baked PYQ paper by slug. Returns `null` (never a synthetic paper)
   * when the file is missing or malformed, so the caller can render an honest
   * empty state.
   */
  async loadBakedPaper(slug: string): Promise<Exam | null> {
    try {
      const response = await fetch(`${PYQ_BASE}/${encodeURIComponent(slug)}.json`, {
        cache: "no-store",
      });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        questions?: unknown;
        paper?: { questions?: unknown };
      };
      const raw = data.questions ?? data.paper?.questions;
      if (!Array.isArray(raw)) return null;
      const questions = raw
        .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === "object")
        .map((q) => ({
          id: String(q["id"] ?? `q-${String(q["no"])}`),
          no: Number(q["no"]) || 0,
          subject: String(q["subject"] ?? "Physics"),
          chapter: typeof q["chapter"] === "string" ? q["chapter"] : undefined,
          topic: typeof q["topic"] === "string" ? q["topic"] : undefined,
          type: q["type"] === "integer" ? ("integer" as const) : ("mcq" as const),
          text: String(q["text"] ?? ""),
          options: Array.isArray(q["options"])
            ? (q["options"] as Array<{ label: string; text: string }>)
            : [],
          answer: String(q["answer"] ?? ""),
          sol: typeof q["sol"] === "string" ? q["sol"] : undefined,
        }))
        .filter((q) => q.text && q.answer);
      if (questions.length === 0) return null;
      const test: CbtTest = {
        id: slug,
        name: slug,
        createdAt: Date.now(),
        durationSec: 180 * 60,
        pyq: true,
        questions: questions.map((q, i) => ({
          ...q,
          no: q.no || i + 1,
          subject: (["Physics", "Chemistry", "Mathematics"].includes(q.subject)
            ? q.subject
            : "Physics") as CbtTest["questions"][number]["subject"],
        })),
      };
      saveCbtTest(test);
      return {
        id: test.id,
        title: test.name,
        description: `${test.questions.length} questions`,
        duration: 180,
        totalQuestions: test.questions.length,
        passingScore: 0,
        questions: [],
        createdAt: new Date(test.createdAt).toISOString(),
        updatedAt: new Date(test.createdAt).toISOString(),
        practice: false,
      };
    } catch {
      return null;
    }
  },

  /**
   * Grade and persist an attempt. Delegates to the NTA engine so the marking
   * scheme exists in exactly one place.
   */
  async submitExam(
    exam: Exam,
    responses: Record<string, CbtResponseState>,
    startedAt: number,
    timeTaken: number,
  ): Promise<{ attempt: CbtAttemptRecord; examAttempt: ExamAttempt }> {
    const test = toCbtTest(exam);
    const clean = Object.fromEntries(
      Object.entries(responses).map(([id, r]) => [
        id,
        { ans: r.ans, time: r.time, status: r.status, changes: r.changes },
      ]),
    );
    const result = evaluate(test, clean, true);
    const record: CbtAttemptRecord = {
      id: `att-${Date.now().toString(36)}`,
      testId: test.id,
      startedAt,
      submittedAt: Date.now(),
      responses: clean,
      tabSwitches: 0,
      timeTaken,
      result,
    };
    saveCbtAttempt(record);
    return { attempt: record, examAttempt: fromCbtAttempt(record, "local") };
  },

  async getUserAttempts(): Promise<ExamAttempt[]> {
    return loadCbtStore()
      .attempts.filter((a) => a.submittedAt)
      .map((a) => fromCbtAttempt(a, "local"));
  },
};
