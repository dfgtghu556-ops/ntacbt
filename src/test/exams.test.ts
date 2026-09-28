/**
 * Unit tests for the exam adapters, the calculator sanitiser, the autosave
 * draft and the palette tone mapping.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  countAnswered,
  emptyResponse,
  formatClock,
  fromCbtQuestion,
  fromCbtTest,
  toCbtQuestion,
  toCbtTest,
  type Exam,
} from "@/types/exam.types";
import { safeEvaluate } from "@/features/exams/components/Calculator";
import {
  clearDraft,
  hydrateResponses,
  loadDraft,
  remainingFromDraft,
  saveDraft,
} from "@/features/exams/autosave";
import { toneOf } from "@/features/exams/components/QuestionPalette";

const exam: Exam = {
  id: "paper-1",
  title: "Full Test 1",
  description: "3 questions",
  duration: 180,
  totalQuestions: 3,
  passingScore: 45,
  questions: [
    {
      id: "q1",
      no: 1,
      subject: "Physics",
      type: "mcq",
      text: "SI unit of force?",
      options: [
        { label: "a", text: "Newton" },
        { label: "b", text: "Joule" },
      ],
      correctAnswer: "a",
      points: 4,
    },
    {
      id: "q2",
      no: 2,
      subject: "Mathematics",
      type: "integer",
      text: "f(3) where f(x)=x^2",
      options: [],
      correctAnswer: "9",
      points: 4,
    },
    {
      id: "q3",
      no: 3,
      subject: "Chemistry",
      chapter: "Mole concept",
      type: "mcq",
      text: "Avogadro number?",
      options: [{ label: "a", text: "6.022e23" }],
      correctAnswer: "a",
      points: 4,
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("exam <-> cbt adapters", () => {
  it("round-trips a paper without losing a question", () => {
    const round = fromCbtTest(toCbtTest(exam));
    expect(round.questions).toHaveLength(3);
    expect(round.questions[0]?.correctAnswer).toBe("a");
    expect(round.questions[1]?.type).toBe("integer");
    expect(round.duration).toBe(180);
  });

  it("keeps the NTA marking constant in one place", () => {
    const q = toCbtQuestion(exam.questions[0]!);
    expect(q.answer).toBe("a");
    expect(fromCbtQuestion(q).correctAnswer).toBe("a");
  });

  it("does not invent a practice flag", () => {
    expect("practice" in toCbtTest(exam)).toBe(false);
    expect("practice" in toCbtTest({ ...exam, practice: true })).toBe(true);
  });
});

describe("helpers", () => {
  it("counts only non-empty answers", () => {
    expect(countAnswered({ a: "1", b: null, c: "" })).toBe(1);
  });

  it("formats the clock and clamps negatives", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("maps response states to palette tones", () => {
    expect(toneOf(undefined)).toBe("notvisited");
    expect(toneOf({ ...emptyResponse(), status: "answered" })).toBe("answered");
    expect(toneOf({ ...emptyResponse(), status: "marked" })).toBe("marked");
    expect(toneOf({ ...emptyResponse(), status: "answeredmarked" })).toBe("answeredmarked");
    expect(toneOf({ ...emptyResponse(), status: "notanswered" })).toBe("notanswered");
  });
});

describe("safeEvaluate", () => {
  it("evaluates arithmetic", () => {
    expect(safeEvaluate("2+3*4")).toBe(14);
    expect(safeEvaluate("(1+2)/3")).toBe(1);
  });

  it("rejects anything that is not arithmetic", () => {
    expect(safeEvaluate("alert(1)")).toBeNull();
    expect(safeEvaluate("window.location")).toBeNull();
    expect(safeEvaluate("1;2")).toBeNull();
    expect(safeEvaluate("")).toBeNull();
  });

  it("rejects non-finite results", () => {
    expect(safeEvaluate("1/0")).toBeNull();
  });
});

describe("autosave draft", () => {
  beforeEach(() => localStorage.clear());

  it("saves and restores a draft", () => {
    saveDraft({
      examId: "paper-1",
      examTitle: "Full Test 1",
      startedAt: Date.now(),
      elapsedSec: 30,
      durationSec: 180 * 60,
      currentQuestionIndex: 2,
      responses: { q1: { ...emptyResponse(), ans: "a", status: "answered" } },
    });
    const draft = loadDraft();
    expect(draft?.examId).toBe("paper-1");
    expect(draft?.currentQuestionIndex).toBe(2);
    expect(draft?.responses["q1"]?.ans).toBe("a");
  });

  it("clears a draft", () => {
    saveDraft({
      examId: "paper-1",
      examTitle: "x",
      startedAt: Date.now(),
      elapsedSec: 0,
      durationSec: 60,
      currentQuestionIndex: 0,
      responses: {},
    });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("discards a draft whose time has long expired", () => {
    saveDraft({
      examId: "paper-1",
      examTitle: "x",
      startedAt: Date.now() - 10 * 60 * 60 * 1000,
      elapsedSec: 0,
      durationSec: 60,
      currentQuestionIndex: 0,
      responses: {},
    });
    expect(loadDraft()).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    localStorage.setItem("ntacbt.exam.v1.draft", "{not json");
    expect(loadDraft()).toBeNull();
  });

  it("derives remaining seconds from the wall clock", () => {
    const draft = {
      schemaVersion: 1,
      examId: "p",
      examTitle: "p",
      startedAt: Date.now() - 60_000,
      elapsedSec: 0,
      durationSec: 180,
      currentQuestionIndex: 0,
      responses: {},
      savedAt: Date.now(),
    };
    expect(remainingFromDraft(draft)).toBeLessThanOrEqual(120);
    expect(remainingFromDraft(draft)).toBeGreaterThan(115);
  });

  it("hydrates a full response set, keeping draft answers", () => {
    const draft = {
      schemaVersion: 1,
      examId: exam.id,
      examTitle: exam.title,
      startedAt: Date.now(),
      elapsedSec: 0,
      durationSec: 180 * 60,
      currentQuestionIndex: 0,
      responses: { q1: { ...emptyResponse(), ans: "a", status: "answered" as const } },
      savedAt: Date.now(),
    };
    const hydrated = hydrateResponses(exam, draft);
    expect(Object.keys(hydrated)).toEqual(["q1", "q2", "q3"]);
    expect(hydrated["q1"]?.ans).toBe("a");
    expect(hydrated["q2"]?.status).toBe("notvisited");
  });
});
