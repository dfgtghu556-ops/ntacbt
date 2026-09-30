/**
 * The question itself: MCQ radios or a numeric field, plus the NTA action row.
 *
 * Answer *selection* is reported upward; the response-status state machine
 * (answered / marked / answeredmarked / …) lives in the route so there is a
 * single owner of the engine's vocabulary.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SUBJECT_COLORS } from "@/config/theme";
import type { Question } from "@/types/exam.types";

export function QuestionPanel({
  question,
  answer,
  index,
  total,
  onAnswer,
  onPrevious,
  onNext,
  onMarkReview,
  onClear,
  children,
}: {
  question: Question;
  answer: string | null;
  index: number;
  total: number;
  onAnswer: (value: string | null) => void;
  onPrevious: () => void;
  onNext: () => void;
  onMarkReview: () => void;
  onClear: () => void;
  /** Slot for the calculator. */
  children?: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="font-semibold" style={{ color: SUBJECT_COLORS[question.subject] }}>
          {question.subject}
        </span>
        {question.chapter ? <span>· {question.chapter}</span> : null}
        {question.topic ? <span>· {question.topic}</span> : null}
        <span>· Q{question.no}</span>
        <span>· {question.type === "mcq" ? "MCQ" : "Integer"}</span>
      </div>

      <div className="rounded-xl border bg-background p-4">
        <p className="whitespace-pre-line text-sm leading-relaxed">{question.text}</p>

        {question.type === "mcq" ? (
          <div className="mt-4 space-y-2" role="radiogroup" aria-label="Options">
            {question.options.map((o) => (
              <label
                key={o.label}
                className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                  answer === o.label ? "border-primary bg-accent" : ""
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  checked={answer === o.label}
                  onChange={() => onAnswer(o.label)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">{o.label}.</span> {o.text}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <input
            value={answer ?? ""}
            onChange={(e) => onAnswer(e.target.value)}
            inputMode="numeric"
            placeholder="Enter numerical answer"
            aria-label="Numerical answer"
            className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        )}
      </div>

      {children}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={index === 0}
          className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <button
          type="button"
          onClick={onMarkReview}
          className="rounded-md border border-input px-3 py-2 text-sm"
        >
          Mark for Review
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-input px-3 py-2 text-sm"
        >
          Clear Response
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={index >= total - 1}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Save &amp; Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
