/**
 * The data bug: attempts made in the React exam runner were invisible to
 * everything that measures progress.
 *
 * `exam.service.submitExam` writes a full attempt record to `ntacbt.cbt.v1`.
 * `DataStore.attempts` read only the legacy `jeecbt.v1` blob, which the React app
 * never writes. So `/app/analytics`, the dashboard, readiness, rank prediction,
 * mastery and the mentor report were all blind to the app's own exam runner — the
 * student sat five mocks and saw "No attempts yet".
 *
 * These tests pin the merge, and they are weighted toward the ways a merge can go
 * wrong: an attempt appearing twice, a legacy attempt going missing, a malformed
 * React store breaking the page, or the sort order changing under the trend chart.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataStore } from "@/lib/store";
import { loadCbtStore, saveCbtAttempt } from "@/features/cbt/store";
import { examService } from "@/services/exam.service";
import type { CbtResponseState } from "@/features/cbt/types";
import { emptyResponse } from "@/types/exam.types";

function installStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("localStorage", storage);
  return map;
}

/** A legacy attempt, as the old `jee-cbt.html` tool would have written it. */
function legacyAttempt(id: string, submittedAt: number, marks = 40) {
  return {
    id,
    testId: `legacy-${id}`,
    submittedAt,
    startedAt: submittedAt - 3_600_000,
    timeTaken: 180,
    result: {
      all: {
        correct: 10,
        wrong: 5,
        skipped: 60,
        marks,
        neg: -5,
        time: 180,
        total: 75,
        max: 300,
        accuracy: 66.7,
      },
      per: {
        Physics: { correct: 4, wrong: 2, skipped: 19, marks: 14, total: 25, time: 60 },
      },
    },
  };
}

/** A React-store attempt, as `exam.service.submitExam` writes it. */
function cbtAttempt(id: string, submittedAt: number, marks = 60) {
  return {
    id,
    testId: `react-${id}`,
    startedAt: submittedAt - 3_600_000,
    submittedAt,
    responses: {} as Record<string, CbtResponseState>,
    tabSwitches: 0,
    timeTaken: 200,
    result: {
      all: {
        correct: 15,
        wrong: 4,
        skipped: 56,
        marks,
        neg: -4,
        time: 200,
        total: 75,
        max: 300,
        accuracy: 78.9,
        percentage: 20,
      },
      per: {
        Physics: {
          correct: 5,
          wrong: 1,
          skipped: 19,
          marks: 19,
          total: 25,
          time: 70,
          accuracy: 83.3,
          max: 100,
        },
      },
    },
  };
}

const seedReact = (attempts: unknown[]) => ({
  "ntacbt.cbt.v1": JSON.stringify({ schemaVersion: 1, tests: [], attempts }),
});
const seedLegacy = (attempts: unknown[]) => ({
  "jeecbt.v1": JSON.stringify({ attempts }),
});

beforeEach(() => {
  installStorage();
});

describe("attempts from the React exam runner become visible", () => {
  it("sees an attempt the current app submitted", () => {
    installStorage(seedReact([cbtAttempt("att-1", 1_700_000_000_000)]));
    const seen = new DataStore().attempts;
    expect(seen).toHaveLength(1);
    expect(seen[0]!.id).toBe("att-1");
    expect(seen[0]!.result?.all.marks).toBe(60);
  });

  it("carries the graded result through, not just the id", () => {
    installStorage(seedReact([cbtAttempt("att-1", 1_700_000_000_000)]));
    const a = new DataStore().attempts[0]!;
    expect(a.result?.all.correct).toBe(15);
    expect(a.result?.all.accuracy).toBe(78.9);
    // And the per-subject breakdown the analytics page renders.
    expect(a.result?.per?.["Physics"]?.marks).toBe(19);
  });

  it("carries the timing facts the trend and readiness use", () => {
    installStorage(seedReact([cbtAttempt("att-1", 1_700_000_000_000)]));
    const a = new DataStore().attempts[0]!;
    expect(a.submittedAt).toBe(1_700_000_000_000);
    expect(a.startedAt).toBe(1_700_000_000_000 - 3_600_000);
    expect(a.timeTaken).toBe(200);
    expect(a.tabSwitches).toBe(0);
  });

  it("works through the real submit path, not just a seeded record", async () => {
    // The end-to-end version: submit through the service, then read what the
    // measurement layer sees. This is the exact scenario that returned zero.
    installStorage();
    const responses: Record<string, CbtResponseState> = {
      q1: { ...emptyResponse(), ans: "a", status: "answered" },
      q2: { ...emptyResponse(), ans: "a", status: "answered" },
    };
    await examService.submitExam(
      {
        id: "t1",
        title: "Mock",
        description: "",
        duration: 60,
        totalQuestions: 2,
        passingScore: 0,
        questions: [
          {
            id: "q1",
            subject: "Physics",
            chapter: "Kinematics",
            type: "mcq",
            text: "Q1",
            options: [
              { label: "a", text: "A" },
              { label: "b", text: "B" },
            ],
            correctAnswer: "a",
          },
          {
            id: "q2",
            subject: "Physics",
            chapter: "Kinematics",
            type: "mcq",
            text: "Q2",
            options: [
              { label: "a", text: "A" },
              { label: "b", text: "B" },
            ],
            correctAnswer: "b",
          },
        ],
        createdAt: "",
        updatedAt: "",
      } as never,
      responses,
      Date.now() - 60_000,
      60,
    );

    expect(loadCbtStore().attempts).toHaveLength(1);
    const seen = new DataStore().attempts;
    expect(seen).toHaveLength(1);
    expect(seen[0]!.result?.all.correct).toBe(1);
    expect(seen[0]!.result?.all.wrong).toBe(1);
  });
});

describe("legacy attempts still count", () => {
  it("still sees an attempt from the old tool", () => {
    installStorage(seedLegacy([legacyAttempt("old-1", 1_600_000_000_000)]));
    const seen = new DataStore().attempts;
    expect(seen).toHaveLength(1);
    expect(seen[0]!.id).toBe("old-1");
    expect(seen[0]!.result?.all.marks).toBe(40);
  });

  it("does not mutate the legacy blob", () => {
    const map = installStorage(seedLegacy([legacyAttempt("old-1", 1_600_000_000_000)]));
    const before = map.get("jeecbt.v1");
    new DataStore().attempts;
    expect(map.get("jeecbt.v1")).toBe(before);
  });
});

describe("the merge itself", () => {
  it("shows attempts from both stores together", () => {
    installStorage({
      ...seedLegacy([legacyAttempt("old-1", 1_600_000_000_000)]),
      ...seedReact([cbtAttempt("att-1", 1_700_000_000_000)]),
    });
    const seen = new DataStore().attempts;
    expect(seen.map((a) => a.id).sort()).toEqual(["att-1", "old-1"]);
  });

  it("sorts oldest first, exactly as before", () => {
    // The trend chart plots in array order, so a sort change would silently
    // reverse the line.
    installStorage({
      ...seedLegacy([legacyAttempt("old-1", 1_600_000_000_000)]),
      ...seedReact([cbtAttempt("att-1", 1_700_000_000_000)]),
    });
    const seen = new DataStore().attempts;
    expect(seen.map((a) => a.id)).toEqual(["old-1", "att-1"]);
  });

  it("never shows the same attempt twice", () => {
    // The two stores use different id schemes, so a collision is unlikely — but a
    // merge that doubled a student's attempt count would be worse than the bug.
    installStorage({
      ...seedLegacy([legacyAttempt("dup-1", 1_600_000_000_000)]),
      ...seedReact([cbtAttempt("dup-1", 1_600_000_000_000)]),
    });
    const seen = new DataStore().attempts;
    expect(seen).toHaveLength(1);
  });

  it("lets the legacy entry win a tie, since that is what the student saw", () => {
    installStorage({
      ...seedLegacy([legacyAttempt("dup-1", 1_600_000_000_000, 40)]),
      ...seedReact([cbtAttempt("dup-1", 1_600_000_000_000, 60)]),
    });
    expect(new DataStore().attempts[0]!.result?.all.marks).toBe(40);
  });

  it("returns copies, so a caller cannot mutate the store through them", () => {
    installStorage(seedReact([cbtAttempt("att-1", 1_700_000_000_000)]));
    const seen = new DataStore().attempts;
    seen[0]!.result!.all.marks = 999;
    expect(new DataStore().attempts[0]!.result?.all.marks).toBe(60);
  });
});

describe("the contract is unchanged", () => {
  it("still excludes an attempt that was never submitted", () => {
    // A draft in progress is not a result.
    installStorage(seedReact([{ ...cbtAttempt("draft-1", 0), submittedAt: null }]));
    expect(new DataStore().attempts).toHaveLength(0);
  });

  it("still returns an empty list when there is nothing", () => {
    installStorage();
    expect(new DataStore().attempts).toEqual([]);
  });

  it("returns an empty list during SSR", () => {
    // `typeof window === "undefined"`. The dashboard server-renders, so a throw
    // here would break the page rather than just the analytics card.
    installStorage(seedReact([cbtAttempt("att-1", 1_700_000_000_000)]));
    const w = globalThis.window;
    // @ts-expect-error deliberately removing window for the SSR branch
    delete globalThis.window;
    try {
      const ssr = new DataStore().attempts;
      expect(ssr).toEqual([]);
    } finally {
      globalThis.window = w;
    }
  });
});

describe("a malformed React store cannot break the page", () => {
  it("survives a key that is not JSON", () => {
    installStorage({
      "ntacbt.cbt.v1": "{not json at all",
      ...seedLegacy([legacyAttempt("old-1", 1_600_000_000_000)]),
    });
    // The legacy blob still works, so the page degrades instead of breaking.
    const seen = new DataStore().attempts;
    expect(seen.map((a) => a.id)).toEqual(["old-1"]);
  });

  it("survives attempts that are not an array", () => {
    installStorage({
      "ntacbt.cbt.v1": JSON.stringify({ schemaVersion: 1, tests: [], attempts: "nope" }),
      ...seedLegacy([legacyAttempt("old-1", 1_600_000_000_000)]),
    });
    expect(new DataStore().attempts.map((a) => a.id)).toEqual(["old-1"]);
  });

  it("survives an attempt with no result at all", () => {
    installStorage(
      seedReact([{ id: "att-1", testId: "t", startedAt: 1, submittedAt: 2, responses: {} }]),
    );
    const seen = new DataStore().attempts;
    expect(seen).toHaveLength(1);
    expect(seen[0]!.result).toBeUndefined();
  });

  it("survives an attempt with a null entry in the list", () => {
    installStorage(seedReact([null, cbtAttempt("att-1", 1_700_000_000_000)]));
    expect(new DataStore().attempts.map((a) => a.id)).toEqual(["att-1"]);
  });
});

describe("the measurement layer sees the fixed data", () => {
  it("gives readiness a non-zero attempt count", async () => {
    installStorage(seedReact([cbtAttempt("att-1", 1_700_000_000_000)]));
    const { computeReadiness } = await import("@/features/readiness/readiness");
    const snap = computeReadiness(new DataStore());
    expect(snap.attempts).toBe(1);
  });

  it("gives the trend chart a point", () => {
    installStorage(seedReact([cbtAttempt("att-1", 1_700_000_000_000)]));
    const seen = new DataStore().attempts;
    const trend = seen
      .filter((a) => typeof a.submittedAt === "number")
      .map((a) => ({ marks: a.result?.all.marks ?? 0, accuracy: a.result?.all.accuracy ?? 0 }));
    expect(trend).toEqual([{ marks: 60, accuracy: 78.9 }]);
  });
});
