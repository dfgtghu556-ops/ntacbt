/**
 * Mistake-DNA Micro-Drill generator.
 *
 * Converts a student's top mistake tag (concept/formula/calculation/misread/
 * silly/guessed) + weakest topic into a 5-question ACTIVE-RECALL micro-drill.
 * Active recall beats passive revision — the student must retrieve the answer,
 * then flip to self-check. Deterministic and honest: these are recall
 * checkpoints derived from evidence, NOT imaginary "verified" exam questions.
 */

import type { WeakTopic, MicroDrillCard } from "../dashboard/types";
import type { MistakePattern } from "./analytics";

export interface MicroDrillInput {
  weak: WeakTopic[];
  mistake: MistakePattern | null;
  subjectPref?: string;
  count?: number;
}

const SUBJECT_WORDS: Record<string, string[]> = {
  Physics: ["Electrostatics", "Mechanics", "Rotational Motion", "Optics", "Thermodynamics", "Waves", "Gravitation", "Current Electricity", "Magnetism", "Modern Physics"],
  Chemistry: ["Chemical Bonding", "Thermodynamics", "Electrochemistry", "GOC", "Equilibrium", "Aldehydes", "p-Block", "d-Block", "Coordination", "Solutions"],
  Mathematics: ["Limits", "Differentiation", "Integration", "Determinants", "Probability", "Vectors", "Trigonometry", "Complex Numbers", "Conic Sections", "Matrices"],
};

/** Deterministic recall templates keyed by mistake tag + subject. Each returns
 *  a {prompt, answer, recallType, options?} shaped card body. */
function recallBody(
  subject: string,
  topic: string,
  tag: string,
): Pick<MicroDrillCard, "prompt" | "answer" | "recallType" | "options" | "correctOption"> | null {
  const s = SUBJECT_WORDS[subject]?.[0] || topic || "this chapter";

  switch (tag) {
    case "formula":
      return {
        prompt: `Write the key formula that connects the quantities in "${topic}" and name every symbol with its unit.`,
        answer: `If you can name the formula and each symbol+unit for "${topic}" without looking, you own it. If you fumbled even one unit, that's exactly the leak to fix.`,
        recallType: "formula",
      };
    case "calculation":
      return {
        prompt: `Solve a quick numeric on "${topic}" in under 60 seconds: write out your rough work in two columns.`,
        answer: `The seal of a clean calculation is a two-column rough work and re-checking the final line. If you rushed the last step, slow down 10%.`,
        recallType: "quick-calc",
      };
    case "misread":
      return {
        prompt: `Re-read this stem aloud in 2 lines: "Which of the following is NOT true about ${topic}?" Before answering, restate what the question actually asks.`,
        answer: `You likely misread the "NOT"/"false" stem. Pause, restate the ask, then lock the answer. This single habit saves marks.`,
        recallType: "misread-check",
      };
    case "silly":
    case "guessed":
      return {
        prompt: `For "${topic}", state the first principle it relies on and whether it needs a formula or a definition.`,
        answer: `These mistakes are about speed over accuracy. If you aren't sure between 3 options, skip — negative marking eats guesses.`,
        recallType: "concept",
      };
    case "concept":
    default:
      return {
        prompt: `Define "${topic}" in one sentence and give one real example or application.`,
        answer: `A clear one-sentence definition + one example shows the concept is truly retained, not just seen. If you talked around it, review the theory first.`,
        recallType: "concept",
      };
  }
}

function tagLabel(tag: string): string {
  const map: Record<string, string> = {
    concept: "Concept gap",
    formula: "Formula recall",
    calculation: "Calculation",
    misread: "Misread stem",
    silly: "Silly mistake",
    guessed: "Guess",
  };
  return map[tag] ?? "Active recall";
}

/** Build 5 active-recall cards. Uses the top mistake tag to shape prompts and
 *  the weakest topics to pick the subject/topic content. Always returns at
 *  least 1 card so the surface is never a dead-end. */
export function buildMicroDrill(input: MicroDrillInput): MicroDrillCard[] {
  const count = Math.max(1, Math.min(6, input.count ?? 5));
  const weak = input.weak ?? [];
  const mistake = input.mistake;
  const tag = mistake?.tag ?? "concept";
  const subject = mistake?.subject ?? input.subjectPref ?? weak[0]?.subject ?? "Physics";

  const w0 = weak[0] as WeakTopic | undefined;
  const baseTopic =
    w0
      ? w0.topic || w0.chapter
      : SUBJECT_WORDS[subject]?.[0] ?? "core concept";

  const cards: MicroDrillCard[] = [];
  const words = SUBJECT_WORDS[subject] ?? [];
  const wordsLen = words.length;
  for (let i = 0; i < count; i++) {
    const idx = i % (wordsLen || 1);
    const candidate = wordsLen > 0 ? (words[idx] as string | undefined) : undefined;
    const topic = i === 0 ? baseTopic : (candidate ?? baseTopic);
    const body = recallBody(subject, topic, tag);
    if (!body) continue;
    const card: MicroDrillCard = {
      id: `md-${i}-${topic}`.replace(/\s+/g, "-").toLowerCase(),
      prompt: body.prompt,
      answer: body.answer,
      tag,
      tagLabel: tagLabel(tag),
      topic,
      subject,
      recallType: body.recallType,
    };
    if (body.options) card.options = body.options;
    if (body.correctOption !== undefined) card.correctOption = body.correctOption;
    cards.push(card);
  }
  // Guarantee non-empty.
  if (cards.length === 0) {
    cards.push({
      id: "md-fallback",
      prompt: `Recall the definition and one example of "${baseTopic}" in your own words.`,
      answer: `If you can state it in a sentence and give one example, the concept is retained. Write it down — that's active recall.`,
      tag: "concept",
      tagLabel: "Concept gap",
      topic: baseTopic,
      subject,
      recallType: "concept",
    });
  }
  return cards;
}
