import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPyqCache,
  loadPaperIndex,
  loadPaperQuestions,
  loadPaperWithFallback,
  loadQuestionBank,
} from "@/features/pyq/store";

/**
 * The baked question store is the one thing four routes share, so the two
 * properties that matter are that it is fetched once and that it never throws.
 * A student on a bad connection must still get an app, and a student who
 * navigates Home → PYQs → Tests must not re-download the whole bank three
 * times.
 */

const INDEX = {
  index: [
    {
      id: "jee-main-2026-online-21-january-evening-shift",
      year: 2026,
      month: "January",
      label: "21 Jan 2026 · Evening",
      total: 3,
      counts: { Physics: 2, Chemistry: 1, Mathematics: 0 },
      mcq: 2,
      integer: 1,
    },
    {
      id: "jee-main-2026-online-22-january-morning-shift",
      year: 2026,
      month: "January",
      label: "22 Jan 2026 · Morning",
      total: 1,
      counts: { Physics: 0, Chemistry: 0, Mathematics: 1 },
      mcq: 0,
      integer: 1,
    },
  ],
};

const PAPER_A = {
  paper: {
    id: "jee-main-2026-online-21-january-evening-shift",
    questions: [
      {
        no: 1,
        text: "A block slides down a frictionless incline.",
        subject: "Physics",
        chapter: "Laws of Motion",
        topic: "Friction",
        type: "mcq",
        options: [
          { label: "1", text: "g sin θ" },
          { label: "2", text: "g cos θ" },
          { label: "3", text: "g tan θ" },
          { label: "4", text: "zero" },
        ],
        answer: "1",
        sol: "Resolve along the plane.",
      },
      {
        no: 2,
        text: "Which quantity is conserved?",
        subject: "Physics",
        chapter: "Work, Energy and Power",
        topic: "Conservation",
        type: "mcq",
        options: [
          { label: "1", text: "Momentum only" },
          { label: "2", text: "Energy only" },
          { label: "3", text: "Both" },
          { label: "4", text: "Neither" },
        ],
        answer: "3",
      },
      // An integer question: no options at all.
      {
        no: 3,
        text: "Find the work done in joules.",
        subject: "Chemistry",
        chapter: "Thermodynamics",
        topic: "First law",
        type: "integer",
        options: [],
        answer: "1800",
      },
    ],
  },
};

const PAPER_B = {
  paper: {
    id: "jee-main-2026-online-22-january-morning-shift",
    questions: [
      {
        no: 1,
        text: "The value of the determinant is",
        subject: "Mathematics",
        chapter: "Determinants",
        topic: "Properties",
        type: "integer",
        options: [],
        answer: "42",
      },
    ],
  },
};

/** Stand in for the baked files: only `/pyq/*.json` is served. */
function stubBakedStore(extra: Record<string, unknown> = {}) {
  const byUrl: Record<string, unknown> = {
    "/pyq/jee-main-2026-online-21-january-evening-shift.json": PAPER_A,
    "/pyq/jee-main-2026-online-22-january-morning-shift.json": PAPER_B,
    ...extra,
  };
  const seen: string[] = [];
  vi.stubGlobal("fetch", (input: unknown) => {
    const url = String(input);
    seen.push(url);
    if (url === "/pyq/index.json") return Promise.resolve(jsonResponse(INDEX));
    const paper = byUrl[url];
    if (paper) return Promise.resolve(jsonResponse(paper));
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
  return seen;
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  clearPyqCache();
  vi.unstubAllGlobals();
});

describe("pyq store", () => {
  it("flattens the bank and tags every question with its paper", async () => {
    stubBakedStore();
    const bank = await loadQuestionBank();
    expect(bank).toHaveLength(4);
    expect(bank.map((q) => q.id)).toEqual([
      "jee-main-2026-online-21-january-evening-shift::1",
      "jee-main-2026-online-21-january-evening-shift::2",
      "jee-main-2026-online-21-january-evening-shift::3",
      "jee-main-2026-online-22-january-morning-shift::1",
    ]);
    // The paper travels with the question, so a consumer never has to re-derive
    // which shift a row came from.
    expect(bank[0]?.paperLabel).toBe("21 Jan 2026 · Evening");
    expect(bank[3]?.paperLabel).toBe("22 Jan 2026 · Morning");
  });

  it("keeps MCQ options and empties them for an integer question", async () => {
    stubBakedStore();
    const bank = await loadQuestionBank();
    const mcq = bank.find((q) => q.type === "mcq");
    const integer = bank.find((q) => q.type === "integer");
    expect(mcq?.options).toHaveLength(4);
    expect(mcq?.options[0]).toEqual({ label: "1", text: "g sin θ" });
    expect(integer?.options).toEqual([]);
  });

  it("carries the worked solution only when the bank ships one", async () => {
    stubBakedStore();
    const bank = await loadQuestionBank();
    expect(bank[0]?.sol).toBe("Resolve along the plane.");
    expect(bank[1]?.sol).toBeUndefined();
  });

  it("fetches the index and each paper once across many callers", async () => {
    const seen = stubBakedStore();
    // Three routes asking, in the order a student navigates them.
    await Promise.all([
      loadQuestionBank(),
      loadPaperIndex(),
      loadPaperQuestions(INDEX.index[0]?.id ?? ""),
    ]);
    await loadPaperIndex();
    await loadPaperQuestions(INDEX.index[0]?.id ?? "");
    await loadQuestionBank();
    expect(seen.filter((u) => u === "/pyq/index.json")).toHaveLength(1);
    expect(
      seen.filter((u) => u === "/pyq/jee-main-2026-online-21-january-evening-shift.json"),
    ).toHaveLength(1);
  });

  it("reads questions from the top level too, not only from `paper`", async () => {
    // Older bakes put the array at the root.
    vi.stubGlobal("fetch", (input: unknown) => {
      const url = String(input);
      if (url === "/pyq/index.json") return Promise.resolve(jsonResponse(INDEX));
      if (url.endsWith("legacy.json")) {
        return Promise.resolve(
          jsonResponse({ questions: [{ ...PAPER_A.paper.questions[0], no: 1 }] }),
        );
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
    const questions = await loadPaperQuestions("legacy");
    expect(questions).toHaveLength(1);
    expect(questions[0]?.text).toBe("A block slides down a frictionless incline.");
  });

  it("degrades to an empty bank when the bake is absent", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }),
    );
    expect(await loadPaperIndex()).toEqual([]);
    expect(await loadQuestionBank()).toEqual([]);
    expect(await loadPaperQuestions("anything")).toEqual([]);
  });

  it("degrades to an empty bank when the network throws", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    expect(await loadQuestionBank()).toEqual([]);
    expect(await loadPaperIndex()).toEqual([]);
  });

  it("does not cache a failure, so a later retry can succeed", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", (input: unknown) => {
      if (String(input) !== "/pyq/index.json") {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
      attempts += 1;
      // First call fails at the network layer, second one succeeds.
      if (attempts === 1) return Promise.reject(new Error("offline"));
      return Promise.resolve(jsonResponse(INDEX));
    });
    expect(await loadPaperIndex()).toEqual([]);
    // The failed attempt must not be remembered as "the bank is empty".
    expect(await loadPaperIndex()).toHaveLength(2);
    expect(attempts).toBe(2);
  });

  it("keeps going when one paper fails but the rest load", async () => {
    vi.stubGlobal("fetch", (input: unknown) => {
      const url = String(input);
      if (url === "/pyq/index.json") return Promise.resolve(jsonResponse(INDEX));
      if (url.endsWith("evening-shift.json")) return Promise.resolve(jsonResponse(PAPER_A));
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    });
    const bank = await loadQuestionBank();
    expect(bank).toHaveLength(3);
    expect(bank.every((q) => q.paperId.endsWith("evening-shift"))).toBe(true);
  });

  it("prefers the live API over the baked file, and never caches it", async () => {
    const seen: string[] = [];
    let liveCalls = 0;
    vi.stubGlobal("fetch", (input: unknown) => {
      const url = String(input);
      seen.push(url);
      if (url.startsWith("/api/public/pyq-papers")) {
        liveCalls += 1;
        return Promise.resolve(jsonResponse({ paper: { questions: PAPER_A.paper.questions } }));
      }
      if (url === "/pyq/index.json") return Promise.resolve(jsonResponse(INDEX));
      if (url.endsWith("evening-shift.json")) return Promise.resolve(jsonResponse(PAPER_A));
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });

    const first = await loadPaperWithFallback("jee-main-2026-online-21-january-evening-shift");
    expect(first).toHaveLength(3);
    // The live route is deliberately never cached — its answers change between
    // deploys, unlike the baked artifacts.
    await loadPaperWithFallback("jee-main-2026-online-21-january-evening-shift");
    expect(liveCalls).toBe(2);
    expect(seen.filter((u) => u.startsWith("/api/public/pyq-papers"))).toHaveLength(2);
    // …and the baked copy is never touched when the API answers.
    expect(seen.filter((u) => u.endsWith("evening-shift.json"))).toHaveLength(0);
  });

  it("falls back to the baked file when the live API is empty or down", async () => {
    for (const live of [
      { ok: true, status: 200, json: () => Promise.resolve({ paper: { questions: [] } }) },
      { ok: false, status: 503, json: () => Promise.resolve({}) },
    ]) {
      clearPyqCache();
      let liveTried = false;
      vi.stubGlobal("fetch", (input: unknown) => {
        const url = String(input);
        if (url.startsWith("/api/public/pyq-papers")) {
          liveTried = true;
          return Promise.resolve(live);
        }
        if (url.endsWith("evening-shift.json")) return Promise.resolve(jsonResponse(PAPER_A));
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      });
      const questions = await loadPaperWithFallback(
        "jee-main-2026-online-21-january-evening-shift",
      );
      expect(questions).toHaveLength(3);
      expect(liveTried).toBe(true);
    }
  });

  it("escapes a paper id rather than trusting it in a URL", async () => {
    const seen = stubBakedStore();
    await loadPaperQuestions("../../etc/passwd");
    expect(seen).toContain("/pyq/..%2F..%2Fetc%2Fpasswd.json");
  });
});
