import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@/config/constants";
import {
  SOURCE_RECORDS,
  describeSource,
  isCompleteSource,
  isVerifiedStatus,
  missingSourceFields,
  sourceFor,
} from "@/features/academics/source";
import { predictRank, MIN_RELIABLE_ATTEMPTS } from "@/features/readiness/predict";

/**
 * Phase 1 — trust core. These tests pin the two properties the validator
 * cannot check at runtime: that a thin sample produces NO confident number,
 * and that every registered source record is actually complete.
 */
describe("Source records", () => {
  it("every registered dataset is complete", () => {
    for (const [key, record] of Object.entries(SOURCE_RECORDS)) {
      const missing = missingSourceFields(record);
      expect(missing, `${key} is missing ${missing.join(", ")}`).toEqual([]);
      expect(isCompleteSource(record), `${key} is not a complete Source`).toBe(true);
    }
  });

  it("requires a sourceUrl — a claim with nowhere to check it is not a claim", () => {
    const withoutUrl = { ...SOURCE_RECORDS.JEE_SYLLABUS, sourceUrl: "" };
    expect(isCompleteSource(withoutUrl)).toBe(false);
    expect(missingSourceFields(withoutUrl)).toContain("sourceUrl");
  });

  it("rejects a partially-filled record field by field", () => {
    for (const field of [
      "source",
      "sourceType",
      "sourceUrl",
      "fetchedAt",
      "version",
      "verificationStatus",
    ] as const) {
      const partial = { ...SOURCE_RECORDS.JEE_SYLLABUS, [field]: "" };
      expect(isCompleteSource(partial), field).toBe(false);
      expect(missingSourceFields(partial)).toContain(field);
    }
  });

  it("survives hostile input", () => {
    for (const junk of [null, undefined, 0, "", "x", [], true, {}]) {
      expect(isCompleteSource(junk)).toBe(false);
      expect(missingSourceFields(junk).length).toBe(6);
    }
  });

  it("describes a source in one line for a tooltip", () => {
    const text = describeSource(SOURCE_RECORDS.NTA_PERCENTILE);
    expect(text).toContain("NTA");
    expect(text).toContain("Verified");
    expect(text).toMatch(/fetched \d{4}-\d{2}-\d{2}/);
  });

  it("marks the candidate count provisional — the rank inherits that", () => {
    expect(isVerifiedStatus(SOURCE_RECORDS.NTA_PERCENTILE.verificationStatus)).toBe(true);
    expect(isVerifiedStatus(SOURCE_RECORDS.JEE_CANDIDATE_COUNT.verificationStatus)).toBe(false);
  });

  it("looks a record up by key, and refuses an unknown one", () => {
    expect(sourceFor("NTA_PERCENTILE")).toEqual(SOURCE_RECORDS.NTA_PERCENTILE);
    expect(sourceFor("no-such-key")).toBeNull();
  });
});

/**
 * Regression: `config/constants.ts` read `import.meta.env` unguarded, so the
 * module threw in plain Node. `scripts/validate-planner.mjs` bundles the pure
 * engines for `platform: "node"`, which meant any engine that transitively
 * imported a storage key took the whole planner validator down with it.
 * The constants module must be importable without a Vite env.
 */
describe("APP_CONFIG is environment-safe", () => {
  it("imports without a Vite env and reports a coherent config", async () => {
    const mod = await import("@/config/constants");
    expect(mod.APP_CONFIG.name).toBe("NTACBT");
    expect(typeof mod.APP_CONFIG.apiUrl).toBe("string");
    expect(typeof mod.APP_CONFIG.isProd).toBe("boolean");
    expect(mod.STORAGE_KEYS.STUDENT).toBe("ntacbt.student.v1");
    // Deliberately NOT asserting a value for hasCloudBackend(): vitest injects
    // the repo's own .env, so this machine may legitimately have a cloud
    // backend configured. Only the contract is asserted.
    expect(typeof mod.hasCloudBackend()).toBe("boolean");
    expect(mod.hasCloudBackend()).toBe(
      Boolean(mod.APP_CONFIG.supabaseUrl && mod.APP_CONFIG.supabaseKey),
    );
  });
});

describe("predictRank — the honest-data contract", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("withholds the rank from a thin sample", () => {
    const p = predictRank({ marks: 5, maxMarks: 300, attempts: 1 });
    expect(p.reliable).toBe(false);
    expect(p.confidence).toBe("insufficient");
    expect(p.rank).toBe(0);
    expect(p.tier).toBe("");
    expect(p.fallback).toMatch(/not enough data to estimate reliably/i);
    expect(p.fallback).toContain("1 attempt");
  });

  it("withholds the rank when too little of the paper was attempted", () => {
    const p = predictRank({ marks: 12, maxMarks: 300, attempts: 4 });
    expect(p.reliable).toBe(false);
    expect(p.fallback).toMatch(/attempted/i);
  });

  it("still reports the verified percentile even when the rank is withheld", () => {
    const p = predictRank({ marks: 5, maxMarks: 300, attempts: 1 });
    expect(p.percentile).toBeGreaterThan(0);
    expect(p.evidence.percentileVerified).toBe(true);
    expect(p.basis).toContain("verified NTA");
  });

  it("produces an estimate once there is enough data", () => {
    const p = predictRank({ marks: 180, maxMarks: 300, attempts: MIN_RELIABLE_ATTEMPTS });
    expect(p.reliable).toBe(true);
    expect(p.confidence).toBe("low");
    expect(p.rank).toBeGreaterThan(0);
    expect(p.tier.length).toBeGreaterThan(0);
    expect(p.fallback).toBe("");
  });

  it("scales confidence with the sample size", () => {
    const mk = (attempts: number) => predictRank({ marks: 200, maxMarks: 300, attempts });
    expect(mk(1).confidence).toBe("insufficient");
    expect(mk(MIN_RELIABLE_ATTEMPTS).confidence).toBe("low");
    expect(mk(3).confidence).toBe("medium");
    expect(mk(5).confidence).toBe("medium");
    expect(mk(9).confidence).toBe("high");
  });

  it("labels the rank as an estimate and cites its provisional source", () => {
    const p = predictRank({ marks: 240, maxMarks: 300, attempts: 5 });
    expect(p.evidence.rankIsProvisional).toBe(true);
    expect(p.evidence.rankSource).toBe(SOURCE_RECORDS.JEE_CANDIDATE_COUNT);
    expect(p.basis).toMatch(/rounded public figure/i);
    expect(p.basis).toContain("estimate");
  });

  it("never maps a Main percentile onto an Advanced outcome", () => {
    const p = predictRank({ marks: 260, maxMarks: 300, attempts: 5, target: "jeeadv" });
    expect(p.reliable).toBe(true);
    expect(p.tier).toMatch(/does not map to an Advanced outcome/i);
    expect(p.tier).not.toMatch(/clearing the Advanced|Advanced cut/i);
  });

  it("promises a direction, never a specific mark gain", () => {
    const p = predictRank({
      marks: 120,
      maxMarks: 300,
      attempts: 4,
      accuracy: 55,
      weakTopics: [{ subject: "Physics", chapter: "Rotational Motion" }],
    });
    expect(p.topFix).toContain("Rotational Motion");
    expect(p.topFix).toMatch(/highest-leverage next step/i);
    expect(p.topFix).not.toMatch(/add ~?\d+ marks/i);
  });

  it("makes no guaranteed-outcome promise in any band", () => {
    for (const marks of [20, 90, 150, 200, 250, 290]) {
      const p = predictRank({ marks, maxMarks: 300, attempts: 6 });
      expect(p.expectation).not.toMatch(/guarantee|will get|will clear/i);
    }
  });

  it("clamps marks into the paper's range", () => {
    expect(predictRank({ marks: -50, maxMarks: 300, attempts: 3 }).marks).toBe(0);
    expect(predictRank({ marks: 900, maxMarks: 300, attempts: 3 }).marks).toBe(300);
  });

  it("scales a non-300 paper onto the 300-mark table", () => {
    const half = predictRank({ marks: 90, maxMarks: 150, attempts: 3 });
    const full = predictRank({ marks: 180, maxMarks: 300, attempts: 3 });
    expect(half.percentile).toBe(full.percentile);
  });

  it("counts the attempts behind the figure in the evidence", () => {
    expect(predictRank({ marks: 200, maxMarks: 300, attempts: 7 }).evidence.attempts).toBe(7);
  });
});
