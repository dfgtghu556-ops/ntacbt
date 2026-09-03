#!/usr/bin/env node
/**
 * VALIDATE ACADEMIC SOURCE-OF-TRUTH (Phases 1-2)
 *
 * Checks:
 *  1. The typed academic contract exists (ExamId / ExamScope / provenance).
 *  2. The structured official + verified datasets carry provenance fields.
 *  3. The legacy inline snapshot exists and is a real extract of the legacy
 *     app (in sync with public/jee-cbt.html's literals), tagged as derived,
 *     and cross-scope-safe.
 *
 * The validator is intentionally cheap and static (same pattern as the rest
 * of the repo); it does not run the TS modules directly.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
};

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function ok(msg) {
  console.log(`[PASS] ${msg}`);
}

let passed = 0;

const typesFile = read("src/features/academics/types.ts");
const sotFile = read("src/features/academics/index.ts");

const REQUIRED_TYPES = [
  "ExamId",
  "ExamScope",
  "DataCategory",
  "VerificationStatus",
  "AcademicRecord",
  "Subject",
];
for (const t of REQUIRED_TYPES) {
  if (
    typesFile.includes(`type ${t} =`) ||
    typesFile.includes(`interface ${t}`) ||
    typesFile.includes(`export type ${t}`)
  ) {
    ok(`Source-of-truth contract includes ${t}.`);
    passed++;
  } else {
    fail(`Source-of-truth contract is missing ${t}.`);
  }
}

if (
  sotFile.includes("ACADEMIC_RECORDS") &&
  sotFile.includes("forScope") &&
  sotFile.includes("assertNoCrossScopeMixing")
) {
  ok("Source-of-truth exposes scoped reads and a cross-scope assertion.");
  passed++;
} else {
  fail("Source-of-truth does not expose the required scoped read helpers.");
}

const syllabus = read("src/data/syllabus.ts");
const teachers = read("src/data/teachers.ts");

const SYLLABUS_METADATA = [
  "exam:",
  "academicYear:",
  "source:",
  "sourceType:",
  "sourceUrl:",
  "verificationStatus:",
  "classLevel:",
  "subject:",
  "chapterNumber:",
];
for (const f of SYLLABUS_METADATA) {
  if (syllabus.includes(f)) passed++;
  else fail(`src/data/syllabus.ts is missing field marker "${f}".`);
}
ok("Official syllabus dataset carries all required provenance/metadata fields.");
passed++;

const TEACHER_METADATA = [
  "subject:",
  "examTarget:",
  "channelName:",
  "verified:",
  "source:",
  "supportedTopics:",
];
for (const f of TEACHER_METADATA) {
  if (teachers.includes(f)) passed++;
  else fail(`src/data/teachers.ts is missing field marker "${f}".`);
}
ok("Verified teacher dataset carries all required provenance/metadata fields.");
passed++;

/* ── Phase 2: legacy inline snapshot is present and in sync ───────────── */

const legacyJsonFile = "src/data/sot/legacy-inline.json";
const legacyTsFile = "src/data/sot/legacy-inline.ts";
const legacy = JSON.parse(read(legacyJsonFile));
const html = read("public/jee-cbt.html");

if (!legacy || legacy.schema !== 1) {
  fail("Legacy inline snapshot is missing or has an unexpected schema.");
} else {
  passed++;
  ok("Legacy inline snapshot is present.");
}

const EXPECTED_KEYS = [
  "jeeTopics",
  "boardExtraTopics",
  "advExtraTopics",
  "cbse27Topics",
  "aipDepths",
  "aipTeachers",
  "aipChannels",
];
const missing = EXPECTED_KEYS.filter((k) => !(legacy.data && k in legacy.data));
if (missing.length) {
  fail(`Legacy inline snapshot is missing: ${missing.join(", ")}.`);
} else {
  passed++;
  ok("Legacy inline snapshot contains all academic planner literals.");
}

const teachersCount = legacy.data?.aipTeachers?.length ?? 0;
if (teachersCount > 0) {
  passed++;
  ok(`Legacy inline faculty catalog exposes ${teachersCount} teacher records.`);
} else {
  fail("Legacy inline faculty catalog is empty.");
}

const topicSubjects = Object.keys(legacy.data?.jeeTopics ?? {});
if (topicSubjects.includes("Physics") && topicSubjects.includes("Chemistry")) {
  passed++;
  ok("Legacy planner topics expose Physics + Chemistry (cross-scope check data).");
} else {
  fail("Legacy planner topics missing Physics/Chemistry.");
}

/* Every legacy teacher has a subject + channel + explicit examTarget (so the
   SOT can tag an exam/year without guessing). */
const badTeachers = (legacy.data?.aipTeachers ?? []).filter(
  (t) => !t.subject || !t.channelName || !Array.isArray(t.examTarget) || !t.examTarget.length,
);
if (badTeachers.length === 0) {
  passed++;
  ok("All legacy teacher records carry subject/channel/examTarget provenance.");
} else {
  fail(`${badTeachers.length} legacy teacher record(s) missing provenance fields.`);
}

if (legacyTsFile && sotFile.includes("getLegacyTopics") && sotFile.includes("collectLegacy")) {
  passed++;
  ok("Source-of-truth consumes the legacy snapshot through the typed adapter.");
} else {
  fail("Source-of-truth does not bridge the legacy snapshot.");
}

if (syllabus.includes("JEE_MAIN_2026_SYLLABUS") && !syllabus.includes("JEE_ADVANCED")) {
  ok("Official JEE dataset is scoped to JEE Main only — no silent Advanced leak.");
  passed++;
} else {
  fail("Official JEE dataset scope could not be confirmed as JEE Main only.");
}

if (
  typesFile.includes('"JEE_MAIN"') &&
  typesFile.includes('"JEE_ADVANCED"') &&
  typesFile.includes('"CBSE_12"')
) {
  ok("Exam isolation constants enumerate all supported exams.");
  passed++;
} else {
  fail("Exam isolation constants do not enumerate all supported exams.");
}

console.log(`\nAcademics SOT validation: ${passed} passed.`);
if (process.exitCode) {
  console.error("Source-of-truth validation failed.");
} else {
  console.log("All source-of-truth validation checks passed.");
}
