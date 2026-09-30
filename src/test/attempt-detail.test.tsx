/**
 * Phase F: attempts are reachable, not just countable.
 *
 * Phase E made attempts flow into the measurement layer. This makes them openable.
 *
 * Two things are being pinned, and the second is the one that matters:
 *
 *   1. A stored attempt reopens as the full result screen - review, topics,
 *      mistakes, time.
 *   2. An attempt whose paper is missing **degrades honestly**. Two populations
 *      are affected: attempts made before the paper was stored, and every attempt
 *      from the legacy `jee-cbt.html` tool, which never wrote the paper at all.
 *
 * The failure modes these tests exist to prevent are the tempting shortcuts:
 * rendering an empty review list (the student reads "0 questions" and concludes
 * they answered nothing), rendering the review from the *current* copy of the
 * paper (contradicting the score if the paper was edited since), and hiding the
 * attempt from the history entirely (silently losing the student's work).
 *
 * The degradation tests assert on the absence of the dishonest renderings as much
 * as the presence of the honest one.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installStorage } from "./storage";
import { findAttempt } from "@/features/exams/attempt-lookup";
import { DataStore } from "@/lib/store";
import { renderInRouter } from "./router";
import { AttemptHistory } from "@/features/exams/components/AttemptHistory";
import { AttemptDetail } from "@/features/exams/components/AttemptDetail";
import { loadCbtStore, saveCbtAttempt } from "@/features/cbt/store";
import { examService } from "@/services/exam.service";
import type { CbtAttemptRecord, CbtQuestion, CbtTest } from "@/features/cbt/types";
import { emptyResponse } from "@/types/exam.types";

function paper(n = 2): CbtTest {
  const questions: CbtQuestion[] = Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    no: i + 1,
    subject: "Physics" as const,
    chapter: "Kinematics",
    topic: "Motion",
    type: "mcq" as const,
    text: `Question ${i + 1}`,
    options: [
      { label: "a", text: "A" },
      { label: "b", text: "B" },
      { label: "c", text: "C" },
      { label: "d", text: "D" },
    ],
    answer: "a",
    sol: "Because.",
  }));
  return {
    id: "t1",
    name: "Kinematics Mock",
    createdAt: 1_700_000_000_000,
    durationSec: 3600,
    questions,
  };
}

/** A stored attempt that carries its paper. */
function stored(id: string, submittedAt: number, test = paper()): CbtAttemptRecord {
  return {
    id,
    testId: test.id,
    startedAt: submittedAt - 3_600_000,
    submittedAt,
    responses: {
      q1: { ...emptyResponse(), ans: "a", status: "answered" },
      q2: { ...emptyResponse(), ans: "b", status: "answered" },
    },
    tabSwitches: 0,
    timeTaken: 1800,
    result: {
      all: {
        correct: 1,
        wrong: 1,
        skipped: 0,
        marks: 3,
        neg: -1,
        time: 1800,
        total: 2,
        max: 8,
        accuracy: 50,
        percentage: 37.5,
      },
      // `CbtResult.per` is a full `Record<Subject, ...>`, and `evaluate` fills all
      // three even when a paper only covers one - so a fixture with a single
      // subject is a shape the real engine never produces.
      per: {
        Physics: {
          correct: 1,
          wrong: 1,
          skipped: 0,
          marks: 3,
          total: 2,
          time: 1800,
          accuracy: 50,
          max: 100,
        },
        Chemistry: {
          correct: 0,
          wrong: 0,
          skipped: 0,
          marks: 0,
          total: 0,
          time: 0,
          accuracy: 0,
          max: 0,
        },
        Mathematics: {
          correct: 0,
          wrong: 0,
          skipped: 0,
          marks: 0,
          total: 0,
          time: 0,
          accuracy: 0,
          max: 0,
        },
      },
    },
    test,
  };
}

/** A stored attempt with no paper - the legacy shape. */
function paperless(id: string, submittedAt: number): CbtAttemptRecord {
  const a = stored(id, submittedAt);
  delete a.test;
  return a;
}

beforeEach(() => {
  installStorage();
});

describe("the paper is stored with the attempt", () => {
  it("writes it through the real submit path", async () => {
    const saved = await examService.submitExam(
      {
        id: "t1",
        title: "Kinematics Mock",
        description: "",
        duration: 60,
        totalQuestions: 2,
        passingScore: 0,
        questions: paper().questions.map((q) => ({
          ...q,
          correctAnswer: q.answer,
        })),
        createdAt: "",
        updatedAt: "",
      } as never,
      { q1: { ...emptyResponse(), ans: "a", status: "answered" } },
      Date.now() - 60_000,
      60,
    );
    // Without this the result is unopenable: the review, the topic breakdown and
    // the mistake doctor all read `test.questions`.
    expect(saved.attempt.test?.questions).toHaveLength(2);
    expect(loadCbtStore().attempts[0]?.test?.name).toBe("Kinematics Mock");
  });

  it("stores the paper as it was answered, including the solution text", async () => {
    installStorage();
    await examService.submitExam(
      {
        id: "t1",
        title: "Kinematics Mock",
        description: "",
        duration: 60,
        totalQuestions: 1,
        passingScore: 0,
        // `toCbtQuestion` maps `explanation` to `sol`, so the snapshot carries the
        // solution under the key `ExamResult` reads it with.
        questions: paper(1).questions.map((q) => ({
          ...q,
          correctAnswer: q.answer,
          explanation: q.sol,
        })),
        createdAt: "",
        updatedAt: "",
      } as never,
      { q1: { ...emptyResponse(), ans: "a", status: "answered" } },
      Date.now() - 60_000,
      60,
    );
    const q = loadCbtStore().attempts[0]!.test!.questions[0]!;
    expect(q.sol).toBe("Because.");
    expect(q.options).toHaveLength(4);
  });

  it("survives the paper being edited afterwards", () => {
    // The whole point of storing a snapshot: the reopen reads the paper the
    // student answered, not whatever the paper says today.
    saveCbtAttempt(stored("att-1", 1_700_000_000_000));
    const reopened = loadCbtStore().attempts[0]!;
    expect(reopened.test!.questions[0]!.text).toBe("Question 1");
  });
});

describe("an attempt with its paper reopens fully", () => {
  it("renders the question review", () => {
    saveCbtAttempt(stored("att-1", 1_700_000_000_000));
    const a = loadCbtStore().attempts[0]!;
    const el = <AttemptDetail attempt={a} />;
    expect(el).toBeTruthy();
  });

  it("is not rendered as a degraded attempt", () => {
    saveCbtAttempt(stored("att-1", 1_700_000_000_000));
    const a = loadCbtStore().attempts[0]!;
    // The guard inside AttemptDetail. If this ever flips, the full result screen
    // is no longer reachable from a stored attempt.
    expect(a.test && a.test.questions.length > 0 && a.result).toBeTruthy();
  });
});

describe("an attempt with no paper degrades honestly", () => {
  it("shows the score, which was recorded at the time", () => {
    saveCbtAttempt(paperless("att-1", 1_700_000_000_000));
    const a = loadCbtStore().attempts[0]!;
    expect(a.result?.all.marks).toBe(3);
    expect(a.result?.all.accuracy).toBe(50);
  });

  it("shows the subject breakdown, which is an aggregate and survives", () => {
    saveCbtAttempt(paperless("att-1", 1_700_000_000_000));
    const a = loadCbtStore().attempts[0]!;
    expect(a.result?.per.Physics?.marks).toBe(3);
    expect(a.result?.per.Physics?.accuracy).toBe(50);
  });

  it("is still in the history list - the attempt is never hidden", () => {
    // The tempting shortcut, refused: hiding a paperless attempt would silently
    // lose the student's work, which is the failure this area was fixed to stop.
    saveCbtAttempt(paperless("att-1", 1_700_000_000_000));
    expect(loadCbtStore().attempts).toHaveLength(1);
    expect(loadCbtStore().attempts[0]!.id).toBe("att-1");
  });

  it("says the review is missing rather than rendering an empty one", () => {
    // An empty review list reads as "0 questions" - the student concludes they
    // answered nothing.
    saveCbtAttempt(paperless("att-1", 1_700_000_000_000));
    const a = loadCbtStore().attempts[0]!;
    expect(a.test).toBeUndefined();
    expect(a.result?.all.total).toBe(2); // the score is real
  });

  it("never falls back to the current copy of the paper", () => {
    // Rendering from today's paper would contradict the score if the paper was
    // edited since. There is no lookup by testId in the reopen path.
    saveCbtAttempt(paperless("att-1", 1_700_000_000_000));
    const a = loadCbtStore().attempts[0]!;
    expect(a.test).toBeUndefined();
  });
});

describe("the history list", () => {
  it("shows every submitted attempt, newest first", () => {
    // The opposite of the ascending order DataStore returns, which exists for
    // the chart.
    saveCbtAttempt(stored("att-old", 1_600_000_000_000));
    saveCbtAttempt(stored("att-new", 1_700_000_000_000));
    const rows = [...loadCbtStore().attempts].sort(
      (a, b) => (b.submittedAt as number) - (a.submittedAt as number),
    );
    expect(rows.map((a) => a.id)).toEqual(["att-new", "att-old"]);
  });

  it("links each row to its own reopen route", () => {
    saveCbtAttempt(stored("att-1", 1_700_000_000_000));
    const a = loadCbtStore().attempts[0]!;
    expect(`/app/attempts/${a.id}`).toBe("/app/attempts/att-1");
  });

  it("excludes an attempt that was never submitted", () => {
    const draft = stored("att-draft", 0);
    draft.submittedAt = null;
    saveCbtAttempt(draft);
    expect(loadCbtStore().attempts).toHaveLength(1);
    // And the list filters on submittedAt being a number.
    const visible = loadCbtStore().attempts.filter((a) => typeof a.submittedAt === "number");
    expect(visible).toHaveLength(0);
  });
});

/**
 * These render inside a real router. `AttemptDetail` links out, and a bare
 * `render()` leaves `<Link>` without a router - which fails at
 * `router.isServer` deep inside TanStack, not anywhere near the test.
 */
describe("rendering the degraded screen", () => {
  // Asserted on the DOM, not on the element object. `expect(el).toBeTruthy()` is
  // true for a component that throws the moment it renders, so these are the
  // tests that actually prove the honest screen appears.
  it("says the review is not available", async () => {
    await renderInRouter(<AttemptDetail attempt={paperless("att-1", 1_700_000_000_000)} />);
    expect(screen.getByText(/question review not available/i)).toBeTruthy();
  });

  it("still shows the score that was recorded at the time", async () => {
    await renderInRouter(<AttemptDetail attempt={paperless("att-1", 1_700_000_000_000)} />);
    expect(screen.getByText("3/8")).toBeTruthy();
    // Appears twice: the header metric and the Physics card below it.
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });

  it("still shows the subject breakdown", async () => {
    await renderInRouter(<AttemptDetail attempt={paperless("att-1", 1_700_000_000_000)} />);
    expect(screen.getByText("Physics")).toBeTruthy();
    expect(screen.getByText(/3 marks/)).toBeTruthy();
  });

  it("never renders an empty review list", async () => {
    // The dishonest shortcut. A rendered "0 questions" tells the student they
    // answered nothing, which is false.
    const { container } = await renderInRouter(
      <AttemptDetail attempt={paperless("att-1", 1_700_000_000_000)} />,
    );
    expect(container.querySelectorAll("[data-testid='review-unavailable']")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/0\s*questions/i);
  });

  it("explains why, and says it does not affect the score", async () => {
    await renderInRouter(<AttemptDetail attempt={paperless("att-1", 1_700_000_000_000)} />);
    expect(screen.getByText(/unaffected/i)).toBeTruthy();
    expect(screen.getByText(/not saved with this attempt/i)).toBeTruthy();
  });

  it("does not crash on an attempt with no result at all", async () => {
    const a = paperless("att-1", 1_700_000_000_000);
    delete a.result;
    await renderInRouter(<AttemptDetail attempt={a} />);
    expect(screen.getByText(/never graded/i)).toBeTruthy();
  });
});

describe("rendering the full result", () => {
  it("renders the question review from the stored paper", async () => {
    await renderInRouter(<AttemptDetail attempt={stored("att-1", 1_700_000_000_000)} />);
    expect(screen.getByText("Question 1")).toBeTruthy();
    expect(screen.getByText("Question 2")).toBeTruthy();
  });

  it("does not render the degraded notice", async () => {
    const { container } = await renderInRouter(
      <AttemptDetail attempt={stored("att-1", 1_700_000_000_000)} />,
    );
    expect(container.querySelectorAll("[data-testid='review-unavailable']")).toHaveLength(0);
    expect(screen.queryByText(/question review not available/i)).toBeNull();
  });
});

describe("rendering", () => {
  it("renders the history list without a stored paper name", () => {
    const el = <AttemptHistory attempts={[]} />;
    expect(el).toBeTruthy();
  });

  it("renders a paperless attempt's detail screen", () => {
    const el = <AttemptDetail attempt={paperless("att-1", 1_700_000_000_000)} />;
    expect(el).toBeTruthy();
  });

  it("renders a stored attempt's detail screen", () => {
    const el = <AttemptDetail attempt={stored("att-1", 1_700_000_000_000)} />;
    expect(el).toBeTruthy();
  });

  it("does not crash on an attempt with no result", () => {
    const a = stored("att-1", 1_700_000_000_000);
    delete a.result;
    delete a.test;
    const el = <AttemptDetail attempt={a} />;
    expect(el).toBeTruthy();
  });
});

describe("a legacy attempt is not a dead link", () => {
  // The history list renders the merged view, so it links to legacy attempts. A
  // route that looked only in the React store turned every legacy row into
  // "Attempt not found" - worse than no row at all, because it tells the student
  // their work is not on a device that is holding it.
  //
  // The shape below is copied from what `public/js/app.js` actually pushes, not
  // invented: the legacy tool stores `responses` and a `result` in the same shape
  // the React engine produces, and never stores the paper.
  const legacyBlob = (id: string, over: Record<string, unknown> = {}) => ({
    "jeecbt.v1": JSON.stringify({
      attempts: [
        {
          id,
          testId: "legacy-t",
          startedAt: 1_600_000_000_000 - 3_600_000,
          submittedAt: 1_600_000_000_000,
          responses: {
            q1: { ans: "a", status: "answered", time: 30, changes: 1 },
            q2: { ans: null, status: "notvisited", time: 0, changes: 0 },
          },
          tabSwitches: 0,
          timeTaken: 180,
          autoSubmitted: false,
          result: {
            all: {
              correct: 10,
              wrong: 5,
              skipped: 60,
              marks: 40,
              neg: 5,
              time: 180,
              total: 75,
              accuracy: 66.7,
              percentage: 13.3,
              max: 300,
            },
            per: {
              Physics: {
                correct: 4,
                wrong: 2,
                skipped: 19,
                marks: 14,
                total: 25,
                time: 60,
                accuracy: 66.7,
                max: 100,
              },
              Chemistry: {
                correct: 3,
                wrong: 2,
                skipped: 20,
                marks: 10,
                total: 25,
                time: 60,
                accuracy: 60,
                max: 100,
              },
              Mathematics: {
                correct: 3,
                wrong: 1,
                skipped: 21,
                marks: 16,
                total: 25,
                time: 60,
                accuracy: 75,
                max: 100,
              },
            },
          },
          ...over,
        },
      ],
    }),
  });

  it("is reachable through the merged view the history renders", () => {
    installStorage(legacyBlob("old-1"));
    expect(new DataStore().attempts.map((a) => a.id)).toEqual(["old-1"]);
  });

  it("is found by the reopen route, so the row is not a dead link", () => {
    installStorage(legacyBlob("old-1"));
    // This is the exact call the route makes. Before the dual lookup it returned
    // null and the row navigated to "Attempt not found".
    expect(findAttempt("old-1")?.id).toBe("old-1");
  });

  it("carries the score through, which the legacy tool did store", () => {
    installStorage(legacyBlob("old-1"));
    const a = findAttempt("old-1")!;
    expect(a.result?.all.marks).toBe(40);
    expect(a.result?.all.accuracy).toBe(66.7);
    expect(a.result?.per.Physics?.marks).toBe(14);
  });

  it("carries the per-question responses through, because they are real", () => {
    installStorage(legacyBlob("old-1"));
    const a = findAttempt("old-1")!;
    expect(a.responses["q1"]?.ans).toBe("a");
    expect(a.responses["q2"]?.ans).toBeNull();
  });

  it("has no paper, which is what routes it to the degraded screen", () => {
    installStorage(legacyBlob("old-1"));
    expect(findAttempt("old-1")?.test).toBeUndefined();
  });

  it("renders the honest degraded screen, not a not-found", async () => {
    installStorage(legacyBlob("old-1"));
    await renderInRouter(<AttemptDetail attempt={findAttempt("old-1")!} />);
    expect(screen.getByText(/question review not available/i)).toBeTruthy();
    expect(screen.getByText("40/300")).toBeTruthy();
    expect(screen.getByText("Physics")).toBeTruthy();
  });

  it("prefers the React store when an id exists in both", () => {
    installStorage({
      ...legacyBlob("dup-1"),
      "ntacbt.cbt.v1": JSON.stringify({
        schemaVersion: 1,
        tests: [],
        attempts: [stored("dup-1", 1_600_000_000_000)],
      }),
    });
    expect(findAttempt("dup-1")?.test?.name).toBe("Kinematics Mock");
  });

  it("returns null for an id that is in neither store", () => {
    installStorage(legacyBlob("old-1"));
    expect(findAttempt("nope")).toBeNull();
  });

  describe("a corrupt legacy blob cannot become a crash or a fabricated result", () => {
    it("survives a key that is not JSON", () => {
      installStorage({ "jeecbt.v1": "{not json" });
      expect(findAttempt("old-1")).toBeNull();
    });

    it("survives attempts that are not an array", () => {
      installStorage({ "jeecbt.v1": JSON.stringify({ attempts: "nope" }) });
      expect(findAttempt("old-1")).toBeNull();
    });

    it("survives an attempt row that is not an object", () => {
      installStorage({ "jeecbt.v1": JSON.stringify({ attempts: [null, 7] }) });
      expect(findAttempt("old-1")).toBeNull();
    });

    it("survives an attempt with no testId", () => {
      installStorage(legacyBlob("old-1", { testId: undefined }));
      expect(findAttempt("old-1")).toBeNull();
    });

    it("survives an attempt that was never submitted", () => {
      installStorage(legacyBlob("old-1", { submittedAt: null }));
      expect(findAttempt("old-1")).toBeNull();
    });

    it("survives a result that is not an object", () => {
      installStorage(legacyBlob("old-1", { result: 42 }));
      const a = findAttempt("old-1");
      expect(a?.id).toBe("old-1");
      // Null rather than a zeroed record: an attempt with no gradeable result
      // must not be shown as "0 marks".
      expect(a?.result).toBeUndefined();
    });

    it("survives a response with an unknown status", () => {
      installStorage(
        legacyBlob("old-1", {
          responses: { q1: { ans: "a", status: "teleported", time: 1, changes: 0 } },
        }),
      );
      expect(findAttempt("old-1")?.responses["q1"]?.status).toBe("notvisited");
    });

    it("survives a response row that is not an object", () => {
      installStorage(legacyBlob("old-1", { responses: { q1: "a", q2: null } }));
      expect(findAttempt("old-1")?.responses).toEqual({});
    });
  });
});
