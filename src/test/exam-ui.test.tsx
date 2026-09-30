/**
 * Component tests for the exam UI and the auth pages.
 * These cover the parts that are pure presentation + local state, so jsdom is
 * enough — the grading engine is covered separately in `engine.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExamInstructions } from "@/features/exams/components/ExamInstructions";
import { ExamHeader } from "@/features/exams/components/ExamHeader";
import { QuestionPanel } from "@/features/exams/components/QuestionPanel";
import { Calculator } from "@/features/exams/components/Calculator";
import type { Exam } from "@/types/exam.types";

const exam: Exam = {
  id: "p1",
  title: "Diagnostic Drill",
  description: "2 questions",
  duration: 45,
  totalQuestions: 2,
  passingScore: 8,
  questions: [
    {
      id: "q1",
      no: 1,
      subject: "Physics",
      type: "mcq",
      text: "SI unit of force is:",
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
      text: "f(3) where f(x) = x^2",
      options: [],
      correctAnswer: "9",
      points: 4,
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ExamInstructions", () => {
  it("states the official marking scheme", () => {
    const { container } = render(<ExamInstructions exam={exam} onStart={() => {}} />);
    const items = Array.from(container.querySelectorAll("li")).map((li) => li.textContent ?? "");
    expect(items.some((t) => /MCQ marking: \+4 correct, -1 wrong, 0 unattempted/.test(t))).toBe(
      true,
    );
    expect(items.some((t) => /Numerical\/integer questions: \+4 correct, 0 wrong/.test(t))).toBe(
      true,
    );
    expect(items.some((t) => /autosaved/i.test(t))).toBe(true);
  });

  it("only offers resume when a draft exists", () => {
    const { rerender } = render(<ExamInstructions exam={exam} onStart={() => {}} />);
    expect(screen.queryByText(/Resume saved attempt/i)).not.toBeInTheDocument();
    rerender(<ExamInstructions exam={exam} onStart={() => {}} hasDraft onResume={() => {}} />);
    expect(screen.getByText(/Resume saved attempt/i)).toBeInTheDocument();
  });
});

describe("ExamHeader", () => {
  it("shows answered count and the clock", () => {
    render(
      <ExamHeader
        title="Diagnostic Drill"
        answers={{ q1: "a" }}
        total={2}
        timeRemaining={125}
        calculatorOpen={false}
        onToggleCalculator={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText("1/2 answered")).toBeInTheDocument();
    expect(screen.getByText("02:05")).toBeInTheDocument();
  });

  it("flags the warning window visually and semantically", () => {
    render(
      <ExamHeader
        title="t"
        answers={{}}
        total={2}
        timeRemaining={120}
        calculatorOpen={false}
        onToggleCalculator={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByLabelText("Time remaining").className).toContain("destructive");
  });

  it("calls submit", async () => {
    const onSubmit = vi.fn();
    render(
      <ExamHeader
        title="t"
        answers={{}}
        total={2}
        timeRemaining={999}
        calculatorOpen={false}
        onToggleCalculator={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByText("Submit"));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe("QuestionPanel", () => {
  it("renders MCQ options and reports the selection", async () => {
    const onAnswer = vi.fn();
    render(
      <QuestionPanel
        question={exam.questions[0]!}
        answer={null}
        index={0}
        total={2}
        onAnswer={onAnswer}
        onPrevious={() => {}}
        onNext={() => {}}
        onMarkReview={() => {}}
        onClear={() => {}}
      />,
    );
    await userEvent.click(screen.getByText("Newton"));
    expect(onAnswer).toHaveBeenCalledWith("a");
  });

  it("renders a numeric field for integer questions", () => {
    render(
      <QuestionPanel
        question={exam.questions[1]!}
        answer="9"
        index={1}
        total={2}
        onAnswer={() => {}}
        onPrevious={() => {}}
        onNext={() => {}}
        onMarkReview={() => {}}
        onClear={() => {}}
      />,
    );
    const field = screen.getByLabelText("Numerical answer") as HTMLInputElement;
    expect(field.value).toBe("9");
  });

  it("disables Previous on the first question and Next on the last", () => {
    const { rerender } = render(
      <QuestionPanel
        question={exam.questions[0]!}
        answer={null}
        index={0}
        total={2}
        onAnswer={() => {}}
        onPrevious={() => {}}
        onNext={() => {}}
        onMarkReview={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("Previous").closest("button")).toBeDisabled();
    expect(screen.getByText(/Save & Next/).closest("button")).toBeEnabled();

    rerender(
      <QuestionPanel
        question={exam.questions[1]!}
        answer={null}
        index={1}
        total={2}
        onAnswer={() => {}}
        onPrevious={() => {}}
        onNext={() => {}}
        onMarkReview={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText(/Save & Next/).closest("button")).toBeDisabled();
    expect(screen.getByText("Previous").closest("button")).toBeEnabled();
  });
});

describe("Calculator", () => {
  it("adds up a typed expression", async () => {
    render(<Calculator />);
    await userEvent.click(screen.getByText("7"));
    await userEvent.click(screen.getByText("+"));
    await userEvent.click(screen.getByText("8"));
    expect(screen.getByTestId("calc-display")).toHaveTextContent("15");
  });

  it("resets on C", async () => {
    render(<Calculator />);
    await userEvent.click(screen.getByText("5"));
    expect(screen.getByTestId("calc-display")).toHaveTextContent("5");
    await userEvent.click(screen.getByText("C"));
    expect(screen.getByTestId("calc-display")).toHaveTextContent("0");
  });
});
