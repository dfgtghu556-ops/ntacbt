/**
 * Exam store (zustand).
 *
 * Holds the live attempt: the paper, the answers, the cursor and the clock.
 * The *graded* result is deliberately not kept here — it is produced by the NTA
 * engine and persisted through `src/services/exam.service.ts`, so the store can
 * never disagree with the official marking scheme.
 *
 * Per-question response status (notvisited / answered / marked / …) is the
 * grading engine's vocabulary and stays in the route, which owns the wall-clock
 * and is the single writer of the autosave draft.
 */
import { create } from "zustand";
import type { Exam, ExamState } from "@/types/exam.types";

interface ExamStore extends ExamState {
  setCurrentExam: (exam: Exam | null) => void;
  setAnswer: (questionId: string, answer: string | null) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  goToQuestion: (index: number) => void;
  updateTimeRemaining: (time: number) => void;
  setSubmitting: (value: boolean) => void;
  resetExam: () => void;
  /** Bulk replace, used when resuming an autosaved draft. */
  hydrate: (state: Partial<ExamState>) => void;
}

export const useExamStore = create<ExamStore>()((set) => ({
  currentExam: null,
  currentAttempt: null,
  answers: {},
  currentQuestionIndex: 0,
  timeRemaining: 0,
  isSubmitting: false,

  setCurrentExam: (exam) => set({ currentExam: exam }),

  setAnswer: (questionId, answer) =>
    set((state) => ({
      answers: { ...state.answers, [questionId]: answer },
    })),

  nextQuestion: () =>
    set((state) => {
      const max = (state.currentExam?.questions.length || 1) - 1;
      return { currentQuestionIndex: Math.min(state.currentQuestionIndex + 1, max) };
    }),

  previousQuestion: () =>
    set((state) => ({
      currentQuestionIndex: Math.max(state.currentQuestionIndex - 1, 0),
    })),

  goToQuestion: (index) =>
    set((state) => {
      const max = (state.currentExam?.questions.length || 1) - 1;
      return { currentQuestionIndex: Math.max(0, Math.min(index, max)) };
    }),

  updateTimeRemaining: (time) => set({ timeRemaining: Math.max(0, time) }),

  setSubmitting: (value) => set({ isSubmitting: value }),

  resetExam: () =>
    set({
      currentExam: null,
      currentAttempt: null,
      answers: {},
      currentQuestionIndex: 0,
      timeRemaining: 0,
      isSubmitting: false,
    }),

  hydrate: (state) => set((prev) => ({ ...prev, ...state })),
}));

/** Selectors — keep components off raw store internals. */
export const selectExam = (s: ExamStore): Exam | null => s.currentExam;
export const selectAnswers = (s: ExamStore) => s.answers;
export const selectIndex = (s: ExamStore) => s.currentQuestionIndex;
export const selectTimeRemaining = (s: ExamStore) => s.timeRemaining;
export const selectIsSubmitting = (s: ExamStore) => s.isSubmitting;
