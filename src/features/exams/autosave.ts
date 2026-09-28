/**
 * Attempt autosave + resume.
 *
 * A dropped tab, a dead battery or an accidental navigation must never cost a
 * student a finished paper. Every `autosaveInterval` ms the live attempt is
 * written to `localStorage`, and on the next visit the app offers to resume it.
 *
 * The snapshot is *not* an attempt record — it is a work-in-progress draft that
 * is dropped on submit, so it can never be mistaken for a graded result.
 */
import { EXAM_CONFIG, STORAGE_KEYS } from "@/config/constants";
import { emptyResponse, type Exam } from "@/types/exam.types";
import type { CbtResponseState } from "@/features/cbt/types";

const DRAFT_KEY = `${STORAGE_KEYS.EXAM_STATE}.draft`;

export interface AttemptDraft {
  schemaVersion: number;
  examId: string;
  examTitle: string;
  startedAt: number;
  /** Seconds already elapsed when the snapshot was taken. */
  elapsedSec: number;
  durationSec: number;
  currentQuestionIndex: number;
  responses: Record<string, CbtResponseState>;
  savedAt: number;
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function saveDraft(draft: Omit<AttemptDraft, "schemaVersion" | "savedAt">): void {
  if (!canStore()) return;
  const payload: AttemptDraft = {
    ...draft,
    schemaVersion: 1,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* quota — the in-memory attempt keeps running */
  }
}

export function loadDraft(): AttemptDraft | null {
  if (!canStore()) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AttemptDraft>;
    if (
      typeof parsed.examId !== "string" ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.durationSec !== "number" ||
      typeof parsed.responses !== "object" ||
      parsed.responses === null
    ) {
      return null;
    }
    // Reject anything that could not still be running.
    const elapsed = (Date.now() - parsed.startedAt) / 1000;
    if (elapsed > parsed.durationSec + 60) {
      clearDraft();
      return null;
    }
    return {
      schemaVersion: 1,
      examId: parsed.examId,
      examTitle: typeof parsed.examTitle === "string" ? parsed.examTitle : "Saved attempt",
      startedAt: parsed.startedAt,
      elapsedSec: typeof parsed.elapsedSec === "number" ? parsed.elapsedSec : 0,
      durationSec: parsed.durationSec,
      currentQuestionIndex:
        typeof parsed.currentQuestionIndex === "number" ? parsed.currentQuestionIndex : 0,
      responses: parsed.responses as Record<string, CbtResponseState>,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (!canStore()) return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Seconds left, derived from wall-clock so a closed tab cannot gain time. */
export function remainingFromDraft(draft: AttemptDraft): number {
  const elapsed = Math.floor((Date.now() - draft.startedAt) / 1000);
  return Math.max(0, draft.durationSec - elapsed);
}

/** Fill in any response slot the draft does not know about yet. */
export function hydrateResponses(exam: Exam, draft: AttemptDraft | null) {
  const base: Record<string, CbtResponseState> = {};
  for (const q of exam.questions) {
    base[q.id] = draft?.responses[q.id] ?? emptyResponse();
  }
  return base;
}

export const AUTOSAVE_INTERVAL_MS = EXAM_CONFIG.autosaveInterval;
