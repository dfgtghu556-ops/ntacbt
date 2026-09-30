import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DPP_SEC_PER_QUESTION,
  MIN_DPP_SIZE,
  buildDailyPracticeSet,
  dppQuestionId,
  dppSubjects,
  dppToCbtTest,
  type BankQuestion,
  type WeakChapterInput,
} from "@/features/practice/dpp";

const DAY = "2026-09-29";
const NOW = new Date("2026-09-29T12:00:00").getTime();

/** The real baked bank, when the build produced it. */
function realBank(): BankQuestion[] {
  try {
    const dir = join(process.cwd(), "public/pyq");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");
    const out: BankQuestion[] = [];
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        paper?: { questions?: Array<Record<string, unknown>> };
      };
      // The baked files nest the questions under `paper`, matching what
      // `loadDiagnosticTest` reads in cbt.tsx.
      for (const q of data.paper?.questions ?? []) {
        const text = q["text"];
        const subject = q["subject"];
        if (typeof text !== "string" || typeof subject !== "string") continue;
        out.push({
          id: `${f}::${String(q["no"] ?? out.length)}`,
          subject,
          chapter: String(q["chapter"] ?? ""),
          topic: String(q["topic"] ?? ""),
          type: q["type"] === "integer" ? "integer" : "mcq",
          text,
          options: Array.isArray(q["options"]) ? (q["options"] as BankQuestion["options"]) : [],
          answer: String(q["answer"] ?? ""),
          ...(typeof q["sol"] === "string" ? { sol: q["sol"] as string } : {}),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

const BANK = realBank();
const HAS_BANK = BANK.length > 0;

/** A synthetic bank, so the tests do not depend on the bake succeeding. */
function fakeBank(): BankQuestion[] {
  const chapters: Array<[string, string]> = [
    ["Physics", "Electrostatics"],
    ["Physics", "Current Electricity"],
    ["Chemistry", "Solutions"],
    ["Chemistry", "Electrochemistry"],
    ["Mathematics", "Integrals"],
    ["Mathematics", "Matrices"],
  ];
  const out: BankQuestion[] = [];
  for (const [subject, chapter] of chapters) {
    for (let i = 0; i < 5; i++) {
      out.push({
        id: `${subject}-${chapter}-${i}`,
        subject,
        chapter,
        topic: `${chapter} topic ${i}`,
        type: i % 2 === 0 ? "mcq" : "integer",
        text: `${subject} ${chapter} question ${i}?`,
        options: [
          { label: "1", text: "a" },
          { label: "2", text: "b" },
        ],
        answer: "a",
        sol: "Because.",
      });
    }
  }
  return out;
}

describe("buildDailyPracticeSet — determinism", () => {
  it("returns the same set for the same day, so a reload does not reshuffle", () => {
    const a = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY });
    const b = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY });
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
  });

  it("returns a different set for a different day", () => {
    const a = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY });
    const b = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: "2026-09-30" });
    expect(a.questions.map((q) => q.id)).not.toEqual(b.questions.map((q) => q.id));
  });

  it("never repeats a question within a set", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY, size: 20 });
    const ids = set.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildDailyPracticeSet — weakness-first selection", () => {
  const weak: WeakChapterInput[] = [
    { subject: "Chemistry", chapter: "Electrochemistry", accuracy: 20, attempts: 5 },
    { subject: "Physics", chapter: "Electrostatics", accuracy: 40, attempts: 4 },
    { subject: "Mathematics", chapter: "Integrals", accuracy: 80, attempts: 6 },
  ];

  it("draws from the weakest measured chapter first", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 6 });
    const focus = set.focus.map((f) => f.chapter);
    expect(focus[0]).toBe("Electrochemistry");
    expect(set.questions[0]?.fromWeakChapter).toBe(true);
    expect(set.evidenceBased).toBe(true);
  });

  it("puts a strong chapter last, never first", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 6 });
    expect(set.focus[set.focus.length - 1]?.chapter).not.toBe("Electrochemistry");
  });

  it("names the evidence in the focus reason", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 3 });
    const electro = set.focus.find((f) => f.chapter === "Electrochemistry");
    expect(electro?.reason).toContain("20% accuracy across 5 attempts");
  });

  it("gives every question a reason", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 10 });
    for (const q of set.questions) {
      expect(q.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("buildDailyPracticeSet — a thin sample is not a weak chapter", () => {
  it("treats one attempt as unmeasured, not as failing", () => {
    // One wrong answer must not put a chapter at the top of the list as "weak".
    const set = buildDailyPracticeSet({
      bank: fakeBank(),
      weak: [{ subject: "Physics", chapter: "Electrostatics", accuracy: 0, attempts: 1 }],
      dayKey: DAY,
      size: 5,
    });
    const focus = set.focus.find((f) => f.chapter === "Electrostatics");
    expect(focus?.reason).toContain("Only 1 attempt so far");
    expect(set.questions.filter((q) => q.fromWeakChapter)).toHaveLength(0);
  });

  it("says so in the note when there is no evidence at all", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY });
    expect(set.evidenceBased).toBe(false);
    expect(set.note).toContain("No attempt evidence yet");
    expect(set.questions.length).toBeGreaterThan(0);
  });
});

describe("buildDailyPracticeSet — never invents a difficulty label", () => {
  it("does not claim any question is easy, medium or hard", () => {
    const set = buildDailyPracticeSet({
      bank: fakeBank(),
      weak: [{ subject: "Physics", chapter: "Electrostatics", accuracy: 10, attempts: 5 }],
      dayKey: DAY,
    });
    const all = JSON.stringify(set).toLowerCase();
    expect(all).not.toContain('"difficulty"');
    expect(all).not.toMatch(/"easy"|"medium"|"hard"/);
    expect(set.note).toContain("Difficulty is not labelled");
  });

  it("keeps the real question text, options, answer and solution", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY, size: 3 });
    for (const q of set.questions) {
      expect(q.text.length).toBeGreaterThan(0);
      expect(q.answer.length).toBeGreaterThan(0);
      expect(q.sol).toBe("Because.");
    }
  });
});

describe("buildDailyPracticeSet — shape and resilience", () => {
  it("numbers questions from 1", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY, size: 4 });
    expect(set.questions.map((q) => q.no)).toEqual([1, 2, 3, 4]);
  });

  it("respects the size and never exceeds the bank", () => {
    const small = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY, size: 3 });
    expect(small.questions).toHaveLength(3);
    const huge = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY, size: 999 });
    expect(huge.questions).toHaveLength(fakeBank().length);
  });

  it("spreads across subjects rather than handing over one subject", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak: [], dayKey: DAY, size: 6 });
    expect(dppSubjects(set).length).toBe(3);
  });

  it("returns an honest empty set when there is no bank", () => {
    const set = buildDailyPracticeSet({ bank: [], weak: [], dayKey: DAY });
    expect(set.questions).toEqual([]);
    expect(set.note).toContain("No questions are available");
    expect(set.evidenceBased).toBe(false);
  });

  it("drops a question with no readable text instead of showing a blank", () => {
    const bank = fakeBank();
    const blank = bank[0];
    if (!blank) throw new Error("fixture bank is empty");
    bank[0] = { ...blank, text: "   " };
    const set = buildDailyPracticeSet({ bank, weak: [], dayKey: DAY, size: 999 });
    expect(set.questions.every((q) => q.text.trim().length > 0)).toBe(true);
  });

  it("survives a null or malformed bank", () => {
    for (const bad of [null as never, undefined as never, "nope" as never]) {
      const set = buildDailyPracticeSet({ bank: bad, weak: [], dayKey: DAY });
      expect(set.questions).toEqual([]);
    }
  });

  it("builds a stable question id per day and position", () => {
    expect(dppQuestionId(DAY, 1)).toBe(`dpp-${DAY}-1`);
    expect(dppQuestionId(DAY, 1)).not.toBe(dppQuestionId(DAY, 2));
  });
});

describe("buildDailyPracticeSet — against the real baked bank", () => {
  it.skipIf(!HAS_BANK)("builds a set from the real questions", () => {
    const set = buildDailyPracticeSet({
      bank: BANK,
      weak: [{ subject: "Physics", chapter: "Electrostatics", accuracy: 25, attempts: 6 }],
      dayKey: DAY,
      size: 10,
    });
    expect(set.questions).toHaveLength(10);
    for (const q of set.questions) {
      expect(q.text.length).toBeGreaterThan(10);
      // Only MCQ questions carry options; an integer question has none, and
      // asserting otherwise would fail on a perfectly valid paper.
      if (q.type === "mcq") expect(q.options.length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!HAS_BANK)("never shows the same real question twice", () => {
    const set = buildDailyPracticeSet({ bank: BANK, weak: [], dayKey: DAY, size: 30 });
    const ids = set.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.skipIf(!HAS_BANK)("is deterministic over the real bank too", () => {
    const a = buildDailyPracticeSet({ bank: BANK, weak: [], dayKey: DAY, size: 15 });
    const b = buildDailyPracticeSet({ bank: BANK, weak: [], dayKey: DAY, size: 15 });
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
  });
});

describe("dppToCbtTest — launching a set as a real test", () => {
  const weak: WeakChapterInput[] = [
    { subject: "Physics", chapter: "Electrostatics", accuracy: 20, attempts: 5 },
    { subject: "Chemistry", chapter: "Solutions", accuracy: 30, attempts: 4 },
  ];

  it("converts a set into the same CbtTest shape the PYQ browser produces", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 10 });
    const test = dppToCbtTest(set, NOW);
    expect(test).not.toBeNull();
    expect(test?.questions).toHaveLength(10);
    expect(test?.practice).toBe(true);
    // Numbered from 1, exactly like a baked paper.
    expect(test?.questions.map((q) => q.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const q of test?.questions ?? []) {
      expect(["Physics", "Chemistry", "Mathematics"]).toContain(q.subject);
      expect(q.text.length).toBeGreaterThan(0);
      expect(q.answer.length).toBeGreaterThan(0);
    }
  });

  it("times the set as a short focused run, not a three-hour paper", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 10 });
    const test = dppToCbtTest(set, NOW);
    // 10 questions at 90s each is 15 minutes — a set that actually fits a day.
    expect(test?.durationSec).toBe(10 * DPP_SEC_PER_QUESTION);
  });

  it("names the set after the day so it is recognisable in the test list", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 8 });
    expect(dppToCbtTest(set, NOW)?.name).toBe(`Today's DPP · ${DAY}`);
  });

  it("returns null for a set too small to be worth a timed run", () => {
    // A three-question "test" produces a result that looks like evidence and is
    // not, so it is not offered.
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 3 });
    expect(set.questions).toHaveLength(3);
    expect(dppToCbtTest(set, NOW)).toBeNull();
  });

  it("keeps the solution so the result page can explain the answer", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 6 });
    const test = dppToCbtTest(set, NOW);
    expect(test?.questions.every((q) => q.sol === "Because.")).toBe(true);
  });

  it("is stable across calls for the same day", () => {
    const set = buildDailyPracticeSet({ bank: fakeBank(), weak, dayKey: DAY, size: 10 });
    const a = dppToCbtTest(set, NOW);
    const b = dppToCbtTest(set, NOW + 5000);
    expect(a?.questions.map((q) => q.id)).toEqual(b?.questions.map((q) => q.id));
  });
});
