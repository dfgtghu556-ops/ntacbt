/**
 * NTA-style instruction screen shown before a paper starts.
 * The marking rules are read from `EXAM_MARKING`, never restated by hand.
 */
import { EXAM_MARKING, type Exam } from "@/types/exam.types";

export function ExamInstructions({
  exam,
  onStart,
  hasDraft,
  onResume,
}: {
  exam: Exam;
  onStart: () => void;
  hasDraft?: boolean;
  onResume?: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>

      <div className="rounded-xl border p-5">
        <h2 className="text-sm font-semibold">Instructions (NTA-style)</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>• Duration: {exam.duration} minutes.</li>
          <li>• Each section has MCQs (4 options) and numerical questions.</li>
          <li>
            • MCQ marking: +{EXAM_MARKING.correct} correct, {EXAM_MARKING.wrong} wrong,{" "}
            {EXAM_MARKING.skipped} unattempted.
          </li>
          <li>
            • Numerical/integer questions: +{EXAM_MARKING.integerCorrect} correct,{" "}
            {EXAM_MARKING.integerWrong} wrong (official 2026 rule).
          </li>
          <li>• Use Save &amp; Next, Mark for Review, and the question palette to navigate.</li>
          <li>• Your progress is autosaved — you can close the tab and come back.</li>
          <li>• The test auto-submits when time runs out.</li>
        </ul>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {hasDraft && onResume ? (
          <button
            type="button"
            onClick={onResume}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium"
          >
            Resume saved attempt
          </button>
        ) : null}
        <button
          type="button"
          onClick={onStart}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Start test
        </button>
      </div>
    </div>
  );
}
