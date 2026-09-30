/**
 * Result page — the order is the feature (Phase 6).
 *
 * The rebuild plan specifies the result contract exactly: header score →
 * "What should I do next?" → strengths → weak areas → mistakes → time →
 * review → full analytics.
 *
 * That order is not cosmetic. A student who has just sat three hours does not
 * want a percentage first; they want to know what to do about it. Everything
 * merely *interesting* — the raw breakdown counts, the subject percentages —
 * belongs after the review, because a number nobody acts on is decoration.
 *
 * The page's own header comment used to claim this order while the code did
 * something else: "Breakdown" and "Subject performance" sat between strengths
 * and weak areas, and the "time" step was missing entirely. This suite pins the
 * order so the comment cannot drift from the code again.
 *
 * It also guards the two honesty defects found while reordering:
 *
 *  1. A skipped question was classified `slow-correct`, so the review line
 *     showed the badge "Skipped" next to the label "Slow + Correct" — a false
 *     claim on a single line — and inflated the mistake-pattern count with
 *     questions nobody got right.
 *  2. The time panel must not label anything "too slow". The bank carries no
 *     difficulty rating, so that would be a guess dressed as a measurement.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  analyseQuestions,
  classLabel,
  idealTimeFor,
  mistakeDoctor,
} from "../features/cbt/analytics";
import { pageWindow, paginate } from "../features/ui/pagination";
import type { CbtQuestion, CbtResult, CbtTest } from "../features/cbt/types";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** Section headings in the order the component renders them. */
function sectionOrder(): string[] {
  const src = read("src/features/exams/components/ExamResult.tsx");
  return [...src.matchAll(/<h2 className="mb-3 text-sm font-semibold">([^<]+)<\/h2>/g)].map(
    (m) => m[1] ?? "",
  );
}

describe("Phase 6 — the result page follows the documented contract", () => {
  it("puts 'what should I do next' immediately after the score", () => {
    const order = sectionOrder();
    expect(order[0]).toBe("What should you do next?");
  });

  it("orders the rest as strengths → weak areas → mistakes → time → review", () => {
    const order = sectionOrder();
    const at = (h: string) => order.indexOf(h);
    expect(at("Strengths")).toBeGreaterThan(at("What should you do next?"));
    expect(at("Weakest topics")).toBeGreaterThan(at("Strengths"));
    expect(at("Mistake pattern")).toBeGreaterThan(at("Weakest topics"));
    expect(at("Time")).toBeGreaterThan(at("Mistake pattern"));
    expect(at("Question review")).toBeGreaterThan(at("Time"));
  });

  it("keeps the merely-interesting numbers after the review", () => {
    const order = sectionOrder();
    const review = order.indexOf("Question review");
    // These are decoration until the student has acted on the advice above.
    expect(order.indexOf("Breakdown")).toBeGreaterThan(review);
    expect(order.indexOf("Subject performance")).toBeGreaterThan(review);
  });

  it("has a Time section at all — the contract names one and it was missing", () => {
    expect(sectionOrder()).toContain("Time");
  });

  it("the header comment describes the order the code actually renders", () => {
    const src = read("src/features/exams/components/ExamResult.tsx");
    // The comment must not name a step the page does not have.
    const comment = src.slice(0, src.indexOf("*/") + 2);
    for (const step of ["What should you do next", "weak areas", "time", "review"]) {
      expect(comment.toLowerCase()).toContain(step.toLowerCase());
    }
    // The comment uses the rebuild plan's vocabulary, the headings use the
    // UI's. Both are recorded here so a rename on either side is caught.
    const aliases: Record<string, string> = {
      "Weakest topics": "weak areas",
      "Mistake pattern": "mistakes",
      "Question review": "review",
      Breakdown: "breakdown counts",
      "Subject performance": "subject percentages",
    };
    for (const h of sectionOrder()) {
      const named = aliases[h] ?? h;
      expect(comment.toLowerCase(), `comment does not name "${h}"`).toContain(named.toLowerCase());
    }
  });
});

describe("a skipped question is never labelled correct", () => {
  const test: CbtTest = {
    id: "t1",
    name: "Diagnostic",
    createdAt: 0,
    durationSec: 180,
    practice: true,
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
        answer: "a",
      },
      {
        id: "q2",
        no: 2,
        subject: "Chemistry",
        type: "mcq",
        text: "Avogadro number?",
        options: [
          { label: "a", text: "6.022e23" },
          { label: "b", text: "3.14e23" },
        ],
        answer: "a",
      },
      {
        id: "q3",
        no: 3,
        subject: "Mathematics",
        type: "integer",
        text: "f(3) for f(x)=x^2?",
        options: [],
        answer: "9",
      },
      {
        id: "q4",
        no: 4,
        subject: "Physics",
        type: "mcq",
        text: "Unit of capacitance?",
        options: [
          { label: "a", text: "Farad" },
          { label: "b", text: "Henry" },
        ],
        answer: "a",
      },
    ],
  } as unknown as CbtTest;

  const result = {
    all: { marks: 8, max: 16, accuracy: 50, correct: 2, wrong: 0, skipped: 2, neg: 0, time: 180 },
    per: {
      Physics: { marks: 4, max: 8, accuracy: 50, total: 2, correct: 1, wrong: 0, skipped: 1 },
      Chemistry: { marks: 4, max: 4, accuracy: 100, total: 1, correct: 1, wrong: 0, skipped: 0 },
      Mathematics: { marks: 0, max: 4, accuracy: 0, total: 1, correct: 0, wrong: 0, skipped: 1 },
    },
  } as unknown as CbtResult;

  const responses = {
    q1: { ans: "a", time: 40 },
    q2: { ans: "a", time: 40 },
    // Left blank after a short look — the plain "skipped" branch.
    q3: { ans: null, time: 20 },
    // Left blank after a long think — the "wasted" branch (100s > 1.5 x 45s).
    q4: { ans: null, time: 100 },
  };

  it("classifies a short blank as skipped, not slow-correct", () => {
    const insights = analyseQuestions(test, result, responses);
    const blank = insights.find((i) => i.questionId === "q3");
    expect(blank?.answered).toBe(false);
    expect(blank?.correct).toBe(false);
    expect(blank?.className).toBe("skipped");
    expect(classLabel(blank?.className ?? "")).toBe("Skipped");
  });

  it("never pairs the Skipped badge with a 'Correct' label", () => {
    const insights = analyseQuestions(test, result, responses);
    for (const i of insights) {
      if (!i.answered) {
        expect(classLabel(i.className)).not.toMatch(/correct/i);
      }
    }
  });

  it("keeps skipped questions out of the mistake-pattern speed counts", () => {
    const insights = analyseQuestions(test, result, responses);
    const doctor = mistakeDoctor(
      insights,
      test.questions.map((q) => ({ q })),
    );
    const countOf = (label: string) =>
      doctor.topClasses.find((c) => classLabel(c.className) === label)?.count ?? 0;
    // Two questions were answered correctly and quickly; none slowly.
    expect(countOf("Fast + Correct")).toBe(2);
    // The bug was that the two blanks were counted here instead.
    expect(countOf("Slow + Correct")).toBe(0);
    expect(countOf("Skipped")).toBe(1);
    expect(countOf("Wasted Time")).toBe(1);
  });

  it("still reports a long think on a blank question as wasted time", () => {
    const insights = analyseQuestions(test, result, responses);
    const blank = insights.find((i) => i.questionId === "q4");
    expect(blank?.className).toBe("wasted");
    // Even the wasted case is not called correct.
    expect(classLabel(blank?.className ?? "")).not.toMatch(/correct/i);
  });
});

describe("the time panel states facts, not judgements", () => {
  const src = read("src/features/exams/components/ExamResult.tsx");

  it("never labels a question slow — the bank has no difficulty rating", () => {
    const panel = src.slice(src.indexOf("function TimePanel"));
    // The word may appear only in the sentence that explains why it is absent.
    const mentions = [...panel.matchAll(/slow/gi)].length;
    expect(mentions).toBeLessThanOrEqual(1);
    expect(panel).toMatch(/no\s+difficulty\s+rating/i);
  });

  it("quotes the same per-question budget the classifier used", () => {
    expect(src).toContain("idealTimeFor(test)");
  });

  it("separates time that bought nothing from time that cost marks", () => {
    const panel = src.slice(src.indexOf("function TimePanel"));
    expect(panel).toMatch(/questions left blank/i);
    expect(panel).toMatch(/questions answered wrong/i);
  });
});

describe("the card system now covers the result page", () => {
  it("every top-level section uses the rounded-2xl card radius", () => {
    const src = read("src/features/exams/components/ExamResult.tsx");
    const sections = [...src.matchAll(/<section\b[^>]*?className="([^"]*)"/g)].map(
      (m) => m[1] ?? "",
    );
    expect(sections.length).toBeGreaterThan(0);
    for (const c of sections) {
      expect(c).toMatch(/\brounded-2xl\b/);
      expect(c).toMatch(/\bborder\b/);
    }
  });
});

describe("the question review is paginated, not dumped", () => {
  const src = read("src/features/exams/components/ExamResult.tsx");

  it("renders one page of the review rather than every question", () => {
    // A 75-question paper used to build 75 detail subtrees — each carrying its
    // options and worked solution — the moment the result screen opened.
    expect(src).toContain("paginate(insights");
    expect(src).toContain("review.items.map");
  });

  it("keeps the paginator out of the way for a short review", () => {
    // A 6-question drill gets no paginator at all; it would be pure chrome.
    expect(src).toContain("review.totalPages > 1");
  });

  it("labels the paginator and states where you are", () => {
    const nav = src.slice(src.indexOf('aria-label="Question review pages"'));
    expect(nav).toContain('aria-label="Question review pages"');
    expect(nav).toContain("Previous");
    expect(nav).toContain("Next");
    expect(nav).toContain("pageSummary(review");
    expect(nav).toMatch(/disabled=\{!review\.hasPrev\}/);
    expect(nav).toMatch(/disabled=\{!review\.hasNext\}/);
  });

  it("lets every page of a full paper be reached", () => {
    // The elision bug: `1 · 2 · 3 · … · 5` makes page 4 unreachable, because
    // there is no way to navigate to a page the paginator never shows and
    // nothing links to.
    //
    // A full JEE paper paginates to 4 pages, so that is the case asserted here
    // — with four pages, every page is either on screen or a single click from
    // one that is. (At ten pages that is no longer true of any windowed
    // paginator, including this one, so the scope is deliberately narrow.)
    const full = paginate(
      Array.from({ length: 75 }, (_, i) => i),
      { pageSize: 20 },
    );
    expect(full.totalPages).toBe(4);
    for (let page = 1; page <= full.totalPages; page++) {
      const reachable = pageWindow(page, full.totalPages).filter((p): p is number => p !== null);
      for (let target = 1; target <= full.totalPages; target++) {
        // Every page is either on screen or one click from a page on screen.
        const onScreen = reachable.includes(target);
        const oneClickAway = reachable.some((p) => pageWindow(p, full.totalPages).includes(target));
        expect(onScreen || oneClickAway, `page ${target} from page ${page}`).toBe(true);
      }
    }
  });

  it("clamps a page past the end instead of showing nothing", () => {
    const review = paginate([1, 2, 3], { page: 99, pageSize: 20 });
    expect(review.page).toBe(1);
    expect(review.items).toEqual([1, 2, 3]);
  });
});
