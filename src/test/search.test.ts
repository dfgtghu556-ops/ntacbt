/**
 * Unit tests for the global search engine.
 *
 * The index is built from the verified datasets, so these tests also guard the
 * invariants that matter for trust: nothing is invented, every academic record
 * carries its source, and ranking is explainable and deterministic.
 */
import { describe, expect, it } from "vitest";
import {
  buildIndex,
  groupHits,
  indexNotes,
  indexPapers,
  indexSavedTests,
  indexSyllabus,
  indexTeachers,
  scoreRecord,
  searchRecords,
  STATIC_INDEX,
  TYPE_LABEL,
  type SearchRecord,
} from "@/features/search";

describe("static index", () => {
  it("indexes syllabus chapters and topics", () => {
    const records = indexSyllabus();
    expect(records.length).toBeGreaterThan(50);
    expect(records.some((r) => r.type === "chapter")).toBe(true);
    expect(records.some((r) => r.type === "topic")).toBe(true);
  });

  it("indexes teachers with their provenance", () => {
    const records = indexTeachers();
    expect(records.length).toBeGreaterThan(10);
    for (const r of records) {
      expect(r.source).toBeTruthy();
      expect(typeof r.verified).toBe("boolean");
    }
  });

  it("gives every academic record a source", () => {
    for (const r of STATIC_INDEX) {
      if (r.type === "topic" || r.type === "chapter" || r.type === "teacher") {
        expect(r.source, `${r.id} has no source`).toBeTruthy();
      }
    }
  });

  it("has no duplicate ids", () => {
    const ids = STATIC_INDEX.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("indexes papers, tests and notes from runtime data", () => {
    expect(
      indexPapers([{ id: "p1", year: 2026, label: "22 Jan · Morning", total: 75 }]),
    ).toHaveLength(1);
    expect(indexSavedTests([{ id: "t1", name: "My test", questions: [1, 2, 3] }])).toHaveLength(1);
    expect(indexNotes({ v1: "Rotational motion notes" })).toHaveLength(1);
    // Empty / blank notes are dropped rather than indexed as noise.
    expect(indexNotes({ v1: "   ", v2: "" })).toHaveLength(0);
    expect(indexNotes({})).toHaveLength(0);
  });
});

describe("scoreRecord", () => {
  const record: SearchRecord = {
    id: "topic:x",
    type: "topic",
    title: "Electrostatics",
    subtitle: "Physics · Electric Charges and Fields",
    keywords: ["Physics", "Electric Charges and Fields", "coulomb"],
    to: "/app/studytube",
    search: { q: "Physics Electrostatics" },
  };

  it("returns 0 for no query", () => {
    expect(scoreRecord(record, "   ")).toBe(0);
  });

  it("ranks an exact title match above a keyword-only match", () => {
    const exact = scoreRecord(record, "electrostatics");
    const keyword = scoreRecord(record, "coulomb");
    expect(exact).toBeGreaterThan(keyword);
  });

  it("is case- and punctuation-insensitive", () => {
    expect(scoreRecord(record, "ELECTROSTATICS")).toBe(scoreRecord(record, "electrostatics"));
    // A hyphen joins, so "electro-statics" is the same word as "electrostatics".
    expect(scoreRecord(record, "electro-statics")).toBe(scoreRecord(record, "electrostatics"));
    expect(scoreRecord(record, "  Electrostatics  ")).toBe(scoreRecord(record, "electrostatics"));
  });

  it("requires every term to match (AND, not OR)", () => {
    expect(scoreRecord(record, "electrostatics zebra")).toBe(0);
  });

  it("rewards a whole-phrase hit on a multi-word title", () => {
    const multi: SearchRecord = {
      ...record,
      title: "Rotational Motion",
      keywords: ["Physics", "System of Particles"],
    };
    // Two terms that together spell the title outrank either term alone.
    expect(scoreRecord(multi, "rotational motion")).toBeGreaterThan(
      scoreRecord(multi, "rotational"),
    );
    // A phrase that only matches the keywords must not outrank the real title.
    expect(scoreRecord(record, "physics electrostatics")).toBeLessThan(
      scoreRecord(record, "electrostatics"),
    );
  });
});

describe("searchRecords", () => {
  const index = buildIndex();

  it("finds a real chapter by name", () => {
    const hits = searchRecords(index, "Electrostatics");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.record.title.toLowerCase()).toContain("electrostatic");
  });

  it("finds a teacher by name and by subject", () => {
    expect(searchRecords(index, "Alakh Pandey").length).toBeGreaterThan(0);
    expect(searchRecords(index, "Physics Wallah").length).toBeGreaterThan(0);
  });

  it("returns nothing for gibberish", () => {
    expect(searchRecords(index, "zzzqqqxxxwww")).toHaveLength(0);
  });

  it("caps results per type", () => {
    const hits = searchRecords(index, "physics", { limitPerType: 2 });
    const counts = new Map<string, number>();
    for (const h of hits) counts.set(h.record.type, (counts.get(h.record.type) ?? 0) + 1);
    for (const [, n] of counts) expect(n).toBeLessThanOrEqual(2);
  });

  it("can restrict to a subset of types", () => {
    const hits = searchRecords(index, "physics", { types: ["teacher"] });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.record.type).toBe("teacher");
  });

  it("is deterministic", () => {
    const a = searchRecords(index, "rotational motion").map((h) => h.record.id);
    const b = searchRecords(index, "rotational motion").map((h) => h.record.id);
    expect(a).toEqual(b);
  });

  it("orders by descending score", () => {
    const hits = searchRecords(index, "thermodynamics");
    const scores = hits.map((h) => h.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it("searches runtime records mixed into the index", () => {
    const mixed = buildIndex([
      ...indexPapers([{ id: "p1", year: 2024, label: "27 Jan · Evening", total: 75 }]),
      ...indexSavedTests([{ id: "t1", name: "My weakest-chapter mock", questions: [] }]),
      ...indexNotes({ v9: "Remember the sign convention in Gauss law" }),
    ]);
    expect(searchRecords(mixed, "27 Jan").length).toBeGreaterThan(0);
    expect(searchRecords(mixed, "weakest-chapter").length).toBeGreaterThan(0);
    expect(searchRecords(mixed, "Gauss law").length).toBeGreaterThan(0);
  });
});

describe("groupHits", () => {
  it("groups in a stable display order and drops empty groups", () => {
    const hits = searchRecords(buildIndex(), "physics");
    const groups = groupHits(hits);
    expect(groups.length).toBeGreaterThan(0);
    const labels = groups.map((g) => g.type);
    expect(labels).toContain("topic");
    for (const g of groups) expect(TYPE_LABEL[g.type]).toBeTruthy();
    // No group may appear twice.
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("returns nothing for no hits", () => {
    expect(groupHits([])).toEqual([]);
  });
});
