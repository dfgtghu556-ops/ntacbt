#!/usr/bin/env node
/**
 * VALIDATE ACADEMIC SOURCE-OF-TRUTH (Phase 1 foundation)
 *
 * Checks that the single typed academic contract exists and that the real
 * structured datasets carry the provenance fields required by the governance
 * rules:
 *   - exam / academicYear / classLevel / subject / chapter / topic
 *   - source / sourceType / verificationStatus
 *   - no silent cross-scope mixing (each scope name is explicit)
 *
 * This is intentionally a cheap static validator (the rest of the repo uses
 * the same pattern). It does not attempt to run the TS modules directly.
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

if (syllabus.includes("JEE_MAIN_2026_SYLLABUS") && !syllabus.includes("JEE_ADVANCED")) {
  ok(
    "Official JEE dataset is scoped to JEE Main only — no silent Advanced leak in the same object.",
  );
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
