/**
 * Exam header: paper name, answered counter, clock and submit.
 * The clock turns destructive inside the warning window from `EXAM_CONFIG`.
 */
import { Calculator, Clock } from "lucide-react";
import { EXAM_CONFIG } from "@/config/constants";
import { countAnswered, formatClock } from "@/types/exam.types";

export function ExamHeader({
  title,
  answers,
  total,
  timeRemaining,
  calculatorOpen,
  onToggleCalculator,
  onSubmit,
}: {
  title: string;
  answers: Record<string, string | null>;
  total: number;
  timeRemaining: number;
  calculatorOpen: boolean;
  onToggleCalculator: () => void;
  onSubmit: () => void;
}) {
  const warning = timeRemaining <= EXAM_CONFIG.warningTime / 1000;

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-2">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-sm font-medium">
        {countAnswered(answers)}/{total} answered
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleCalculator}
          className="rounded-md border border-input p-2 text-muted-foreground"
          aria-label="Calculator"
          aria-pressed={calculatorOpen}
        >
          <Calculator className="h-4 w-4" />
        </button>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium ${
            warning
              ? "bg-destructive text-destructive-foreground"
              : "bg-primary text-primary-foreground"
          }`}
          aria-label="Time remaining"
        >
          <Clock className="h-4 w-4" /> {formatClock(timeRemaining)}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground"
        >
          Submit
        </button>
      </div>
    </header>
  );
}
