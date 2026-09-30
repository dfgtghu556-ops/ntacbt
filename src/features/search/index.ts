/**
 * Global search — one index across the whole product.
 *
 * The plan calls for "global search across PYQs, chapters, topics, videos,
 * teachers, tests, notes". This module is the pure part of that: it builds a
 * flat, typed index from the verified datasets plus whatever the student has
 * locally, and ranks matches.
 *
 * Design rules:
 *   - **Pure and framework-free** so it is unit-testable and reusable from the
 *     route, the command palette and (later) the legacy shell.
 *   - **No academic data is invented.** Every indexed record carries the
 *     provenance of the dataset it came from, and `unverified` records are
 *     still searchable but are labelled as such by the caller.
 *   - **Deterministic ordering** — score, then type weight, then title — so the
 *     same query always returns the same list.
 */

import { JEE_MAIN_2026_SYLLABUS } from "@/data/syllabus";
import { INSTITUTES, TEACHERS, type InstituteRecord, type TeacherRecord } from "@/data/teachers";

export type SearchResultType =
  "paper" | "chapter" | "topic" | "video" | "teacher" | "institute" | "test" | "note";

export interface SearchRecord {
  id: string;
  type: SearchResultType;
  title: string;
  /** Secondary line: subject · year · channel · … */
  subtitle: string;
  /** Extra haystack terms that should match but not be displayed. */
  keywords: string[];
  /** Where the UI should send the student. */
  to: string;
  search?: Record<string, string>;
  /** Provenance of the underlying dataset, shown next to academic results. */
  source?: string | undefined;
  verified?: boolean | undefined;
}

export interface SearchOptions {
  /** Maximum results per type. */
  limitPerType?: number;
  /** Restrict to a subset of types. */
  types?: SearchResultType[];
}

const TYPE_WEIGHT: Record<SearchResultType, number> = {
  topic: 6,
  chapter: 5,
  teacher: 4,
  video: 3,
  paper: 2,
  test: 2,
  note: 1,
  institute: 1,
};

const TYPE_ORDER: SearchResultType[] = [
  "topic",
  "chapter",
  "teacher",
  "video",
  "paper",
  "test",
  "note",
  "institute",
];

/* ------------------------------------------------------------------ *
 * Index builders — one per dataset
 * ------------------------------------------------------------------ */

export function indexSyllabus(): SearchRecord[] {
  const records: SearchRecord[] = [];
  for (const subject of JEE_MAIN_2026_SYLLABUS.subjects) {
    for (const chapter of subject.chapters) {
      records.push({
        id: `chapter:${chapter.id}`,
        type: "chapter",
        title: chapter.name,
        subtitle: `${subject.name} · Class ${chapter.classLevel} · ${chapter.unitName}`,
        keywords: [subject.name, `class ${chapter.classLevel}`, chapter.unitName],
        to: "/app/studytube",
        search: { q: `${subject.name} ${chapter.name}` },
        source: JEE_MAIN_2026_SYLLABUS.source,
        verified: JEE_MAIN_2026_SYLLABUS.verificationStatus === "verified",
      });
      for (const topic of chapter.topics) {
        records.push({
          id: `topic:${topic.id}`,
          type: "topic",
          title: topic.name,
          subtitle: `${subject.name} · ${chapter.name}`,
          keywords: [
            subject.name,
            chapter.name,
            ...(topic.subtopics ?? []),
            `class ${chapter.classLevel}`,
          ],
          to: "/app/studytube",
          search: { q: `${subject.name} ${topic.name}` },
          source: JEE_MAIN_2026_SYLLABUS.source,
          verified: JEE_MAIN_2026_SYLLABUS.verificationStatus === "verified",
        });
      }
    }
  }
  return records;
}

export function indexTeachers(): SearchRecord[] {
  const records: SearchRecord[] = [];
  const push = (t: TeacherRecord) => {
    records.push({
      id: `teacher:${t.id}`,
      type: "teacher",
      title: t.name,
      subtitle: `${t.subject} · ${t.institute}${t.boardCore ? " · Board-first" : ""}`,
      keywords: [
        t.subject,
        t.institute,
        t.channelName,
        t.specialization ?? "",
        ...t.supportedTopics,
        ...t.searchQueryAlias,
        ...t.examTarget,
      ],
      to: "/app/studytube",
      search: { q: `${t.subject} ${t.name}` },
      source: t.source,
      verified: t.verified,
    });
  };
  TEACHERS.forEach(push);
  // BOARD_TEACHERS is a filtered view of TEACHERS; indexing it would duplicate.
  return records;
}

export function indexInstitutes(): SearchRecord[] {
  return INSTITUTES.map((i: InstituteRecord) => ({
    id: `institute:${i.id}`,
    type: "institute",
    title: i.name,
    subtitle: i.shortName,
    keywords: [i.shortName, i.description, ...i.officialChannels],
    to: "/app/studytube",
    search: { q: i.name },
    source: i.source,
    verified: i.verified,
  }));
}

/** Papers come from the PYQ index, which is fetched at runtime. */
export function indexPapers(
  papers: Array<{ id: string; year: number; label: string; total: number; month?: string }>,
): SearchRecord[] {
  return papers.map((p) => ({
    id: `paper:${p.id}`,
    type: "paper",
    title: `JEE Main ${p.year} — ${p.label}`,
    subtitle: `${p.total} questions${p.month ? ` · ${p.month}` : ""}`,
    keywords: [String(p.year), p.label, p.month ?? "", "pyq", "previous year"],
    to: "/app/pyq",
    verified: true,
  }));
}

/** Tests the student already has on this device. */
export function indexSavedTests(
  tests: Array<{ id: string; name: string; questions: unknown[] }>,
): SearchRecord[] {
  return tests.map((t) => ({
    id: `test:${t.id}`,
    type: "test",
    title: t.name,
    subtitle: `${Array.isArray(t.questions) ? t.questions.length : 0} questions · saved on this device`,
    keywords: ["test", "saved", "cbt"],
    to: "/cbt",
    search: { testId: t.id, name: t.name },
  }));
}

/** Notes the student wrote (legacy `notes` map, keyed by video id). */
export function indexNotes(notes: Record<string, string>): SearchRecord[] {
  return Object.entries(notes)
    .filter(([, text]) => typeof text === "string" && text.trim().length > 0)
    .map(([key, text]) => ({
      id: `note:${key}`,
      type: "note",
      title: text.split("\n")[0]?.slice(0, 80) || "Note",
      subtitle: "Your note",
      keywords: [text.slice(0, 400)],
      to: "/app/studytube",
      search: { q: key },
    }));
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

function normalise(value: string): string {
  return (
    value
      .toLowerCase()
      // Hyphens and apostrophes JOIN words ("electro-statics" -> "electrostatics",
      // "Gauss' law" -> "gauss law"), everything else non-alphanumeric separates.
      .replace(/['’-]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Score a record against a query. `0` means "no match".
 *
 * Deliberately simple and explainable: an exact title hit beats a prefix hit,
 * which beats a whole-word hit anywhere, which beats a substring hit.
 */
export function scoreRecord(record: SearchRecord, rawQuery: string): number {
  const query = normalise(rawQuery);
  if (!query) return 0;
  const terms = query.split(" ").filter(Boolean);
  if (terms.length === 0) return 0;

  const title = normalise(record.title);
  const subtitle = normalise(record.subtitle);
  const keywords = normalise(record.keywords.join(" "));

  let total = 0;
  for (const term of terms) {
    let best = 0;
    if (title === term) best = 100;
    else if (title.startsWith(term)) best = 70;
    else if (title.includes(` ${term}`) || title.includes(`${term} `)) best = 50;
    else if (title.includes(term)) best = 35;
    else if (keywords.includes(term)) best = 20;
    else if (subtitle.includes(term)) best = 12;
    if (best === 0) return 0; // every term must match somewhere
    total += best;
  }

  // Whole-phrase bonus so "electrostatics potential" ranks the real chapter.
  if (title.includes(query)) total += 25;
  if (keywords.includes(query)) total += 10;

  return total + TYPE_WEIGHT[record.type];
}

export interface SearchHit {
  record: SearchRecord;
  score: number;
}

export function searchRecords(
  records: SearchRecord[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const { limitPerType = 6, types } = options;
  const allowed = types && types.length ? new Set(types) : null;
  const perType = new Map<SearchResultType, number>();

  return records
    .map((record) => ({ record, score: scoreRecord(record, query) }))
    .filter((hit) => hit.score > 0)
    .filter((hit) => !allowed || allowed.has(hit.record.type))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ai = TYPE_ORDER.indexOf(a.record.type);
      const bi = TYPE_ORDER.indexOf(b.record.type);
      if (ai !== bi) return ai - bi;
      return a.record.title.localeCompare(b.record.title);
    })
    .filter((hit) => {
      const seen = perType.get(hit.record.type) ?? 0;
      if (seen >= limitPerType) return false;
      perType.set(hit.record.type, seen + 1);
      return true;
    });
}

/** Group hits for rendering, in a stable display order. */
export function groupHits(hits: SearchHit[]): Array<{ type: SearchResultType; hits: SearchHit[] }> {
  const groups = new Map<SearchResultType, SearchHit[]>();
  for (const hit of hits) {
    const list = groups.get(hit.record.type);
    if (list) list.push(hit);
    else groups.set(hit.record.type, [hit]);
  }
  return TYPE_ORDER.filter((t) => groups.has(t)).map((t) => ({
    type: t,
    hits: groups.get(t) as SearchHit[],
  }));
}

export const TYPE_LABEL: Record<SearchResultType, string> = {
  topic: "Topics",
  chapter: "Chapters",
  teacher: "Teachers",
  video: "Lessons",
  paper: "Previous-year papers",
  test: "Your tests",
  note: "Your notes",
  institute: "Institutes",
};

/** The static part of the index — safe to build once at module load. */
export const STATIC_INDEX: SearchRecord[] = [
  ...indexSyllabus(),
  ...indexTeachers(),
  ...indexInstitutes(),
];

export function buildIndex(extra: SearchRecord[] = []): SearchRecord[] {
  return [...STATIC_INDEX, ...extra];
}
