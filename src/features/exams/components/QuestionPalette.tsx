/**
 * Question palette with the NTA colour legend.
 * Colours are paired with the text label so state is never colour-only.
 */
import type { CbtResponseState } from "@/features/cbt/types";
import type { Question } from "@/types/exam.types";

export type PaletteTone = "answered" | "marked" | "answeredmarked" | "notanswered" | "notvisited";

export function toneOf(response: CbtResponseState | undefined): PaletteTone {
  if (!response) return "notvisited";
  if (response.status === "answeredmarked") return "answeredmarked";
  if (response.status === "answered") return "answered";
  if (response.status === "marked") return "marked";
  if (response.status === "notanswered") return "notanswered";
  return "notvisited";
}

const TONE_CLASS: Record<PaletteTone, string> = {
  answered: "bg-green-600 text-white",
  marked: "bg-purple-600 text-white",
  answeredmarked: "bg-blue-600 text-white",
  notanswered: "bg-white text-foreground border",
  notvisited: "bg-muted text-muted-foreground",
};

export function QuestionPalette({
  questions,
  responses,
  current,
  onJump,
}: {
  questions: Question[];
  responses: Record<string, CbtResponseState>;
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="border-t bg-background p-3 lg:border-l lg:border-t-0">
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Question palette</h3>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
        {questions.map((q, i) => {
          const tone = toneOf(responses[q.id]);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Question ${i + 1}, ${LEGEND[tone]}`}
              aria-current={i === current ? "true" : undefined}
              className={`h-8 w-8 rounded text-xs font-medium ${TONE_CLASS[tone]} ${
                i === current ? "ring-2 ring-primary" : ""
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {(Object.keys(LEGEND) as PaletteTone[]).map((tone) => (
          <p key={tone}>
            <span className={`mr-1 inline-block h-2 w-2 rounded ${TONE_CLASS[tone]}`} />{" "}
            {LEGEND[tone]}
          </p>
        ))}
      </div>
    </div>
  );
}

const LEGEND: Record<PaletteTone, string> = {
  answered: "Answered",
  marked: "Marked for review",
  answeredmarked: "Answered + marked",
  notanswered: "Not answered",
  notvisited: "Not visited",
};
