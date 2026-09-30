#!/usr/bin/env node
/**
 * VALIDATE PROVENANCE (Phase 1 — trust core)
 *
 * A prose comment is not provenance. This validator enforces that every
 * dataset making a factual claim carries a COMPLETE `Source` record — all six
 * fields — and that nothing in the shipped source fabricates a number.
 *
 * Checks:
 *  1. The canonical `Source` contract exists with all six required fields.
 *  2. `SOURCE_RECORDS` is non-empty and every entry is complete.
 *  3. `SyllabusDataset` and `TeacherRecord` both carry the provenance fields.
 *  4. The rank/percentile predictor labels its output as an estimate and has a
 *     "not enough data" fallback — a thin sample must not produce a confident
 *     number.
 *  5. No dataset claims a frequency/probability/expected-question figure that
 *     is not computed from the verified question bank.
 *
 * Cheap and static, same pattern as the rest of the repo: it does not run the
 * TS modules, it reads them. Anything that only exists at runtime is covered by
 * `src/test/*` instead.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => {
  console.error(`[FAIL] ${msg}`);
  process.exitCode = 1;
};
const read = (rel) => readFileSync(join(root, rel), "utf8");

let passed = 0;
const ok = (msg) => {
  console.log(`[PASS] ${msg}`);
  passed++;
};

/* ── 1. The canonical contract ─────────────────────────────────────── */

const sourceFile = read("src/features/academics/source.ts");

const REQUIRED_FIELDS = [
  "source",
  "sourceType",
  "sourceUrl",
  "fetchedAt",
  "version",
  "verificationStatus",
];
for (const field of REQUIRED_FIELDS) {
  if (sourceFile.includes(`${field}:`)) ok(`Source contract declares \`${field}\`.`);
  else fail(`Source contract is missing the required field \`${field}\`.`);
}

for (const helper of ["isCompleteSource", "missingSourceFields", "describeSource"]) {
  if (sourceFile.includes(`export function ${helper}`)) ok(`Source contract exposes ${helper}().`);
  else fail(`Source contract is missing the ${helper}() helper.`);
}

// The whole point of the field: a claim with nowhere to check it is not a claim.
if (
  /sourceUrl[\s\S]{0,80}required/i.test(sourceFile) ||
  /sourceUrl` is deliberately required/.test(sourceFile)
) {
  ok("sourceUrl is documented as required, not optional.");
} else {
  fail("sourceUrl must be required — an unverifiable claim is the bug this phase fixes.");
}

/* ── 2. The registry ───────────────────────────────────────────────── */

const registryMatch = sourceFile.match(/export const SOURCE_RECORDS = \{([\s\S]*?)\n\} as const/);
if (!registryMatch) {
  fail("SOURCE_RECORDS registry is missing.");
} else {
  const body = registryMatch[1];
  // Each entry is `  NAME: { ... },` at one level of nesting.
  const entryRe = /^  (\w+):\s*\{([\s\S]*?)^  \},?$/gm;
  const entries = [...body.matchAll(entryRe)].map((m) => ({ name: m[1], text: m[2] }));
  if (entries.length === 0) fail("SOURCE_RECORDS has no parseable entries.");
  else ok(`SOURCE_RECORDS registers ${entries.length} datasets.`);

  for (const { name, text } of entries) {
    const missing = REQUIRED_FIELDS.filter((f) => !new RegExp(`\\b${f}:`).test(text));
    if (missing.length) fail(`SOURCE_RECORDS.${name} is missing: ${missing.join(", ")}.`);
    else ok(`SOURCE_RECORDS.${name} is complete.`);
  }
}

/* ── 3. The datasets that must carry provenance ────────────────────── */

const syllabus = read("src/data/syllabus.ts");
for (const field of [
  "source:",
  "sourceType:",
  "sourceUrl:",
  "fetchedAt:",
  "version:",
  "verificationStatus:",
]) {
  if (syllabus.includes(field)) passed++;
  else fail(`src/data/syllabus.ts is missing the provenance field "${field}".`);
}
ok("SyllabusDataset carries a complete provenance record.");

const teachers = read("src/data/teachers.ts");
for (const field of ["source:", "channelName:", "verified:"]) {
  if (teachers.includes(field)) passed++;
  else fail(`src/data/teachers.ts is missing the metadata field "${field}".`);
}
// channelUrl is the honest addition: 103 records have a display name only.
if (teachers.includes("channelUrl")) {
  ok("TeacherRecord has an optional channelUrl (empty rather than invented).");
} else {
  fail("TeacherRecord must carry an optional channelUrl so unverifiable records can be marked.");
}

const academics = read("src/features/academics/index.ts");
if (academics.includes("teacherSource")) {
  ok("Teacher provenance is derived through one helper, not hand-written per record.");
} else {
  fail("Teacher provenance must be built by a single helper so it cannot drift.");
}

/* ── 4. Estimates must be labelled and must have a fallback ────────── */

const predict = read("src/features/readiness/predict.ts");

if (/estimate/i.test(predict)) ok("The rank predictor labels its output as an estimate.");
else fail("The rank predictor must label its output as an estimate.");

if (/reliable/.test(predict) && /not enough data/i.test(predict)) {
  ok('The rank predictor has a "not enough data" fallback.');
} else {
  fail(
    'The rank predictor must expose a reliable flag and a "not enough data" fallback — a thin sample must not yield a confident rank.',
  );
}

/**
 * Strip comments before matching. A validator that fails on the comment
 * explaining the fix is worse than no validator: the next person would have to
 * delete the explanation to get a green build.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
const predictCode = stripComments(predict);

// A JEE Main percentile cannot clear an Advanced cut: that is cross-exam inference.
// Allowed only when the code explicitly declines to map between the two exams.
const declinesAdvanced =
  /does not map to an Advanced outcome|Advanced needs its own qualifying data/i.test(predictCode);
const claimsAdvanced = /Advanced cut|clearing the Advanced/i.test(predictCode);
if (claimsAdvanced && !declinesAdvanced) {
  fail(
    "A JEE Main percentile must not be used to claim an Advanced cut — that is cross-exam inference.",
  );
} else if (declinesAdvanced) {
  ok("The predictor explicitly declines to map a Main percentile onto an Advanced outcome.");
} else {
  ok("No cross-exam inference from a Main percentile to an Advanced outcome.");
}

// Guaranteed-seat phrasing and promised mark gains are hard predictions.
const GUARANTEE =
  /\b(guaranteed|guarantee[sd]? (?:a )?(?:seat|IIT|NIT)|will get|you will clear)\b/i;
if (GUARANTEE.test(predictCode))
  fail("The rank predictor still contains guaranteed-outcome phrasing.");
else ok("The rank predictor makes no guaranteed-outcome promise.");

const MARK_PROMISE = /add ~?\$?\{?[^}]*\}?\s*marks/i;
if (MARK_PROMISE.test(predictCode)) {
  fail(
    "The rank predictor promises a specific mark gain — replace with a direction, not a number.",
  );
} else {
  ok("The rank predictor promises no specific mark gain.");
}

// The fallback must actually reach the student: the field has to be on the
// returned object, not just mentioned in a comment.
if (/\bfallback:/.test(predictCode) && /\breliable:/.test(predictCode)) {
  ok("The returned prediction carries `reliable` and `fallback` fields.");
} else {
  fail(
    "The returned prediction must carry `reliable` and `fallback` fields so the UI can gate on them.",
  );
}

/* ── 5. No uncomputed frequency/probability claims ─────────────────── */

const banned = [
  [/frequency\s*[:=]\s*\d/, "a hard-coded frequency percentage"],
  [/probability\s*[:=]\s*0?\.\d/, "a hard-coded probability"],
  [/expectedQuestions\s*[:=]\s*\d/, "a hard-coded expected-question count"],
  [/likelyQuestions\s*[:=]\s*\d/, "a hard-coded likely-question count"],
  [/\b\d+%\s*(?:chance|probability)/i, "a percentage presented as a chance"],
];
const scanned = [
  ["src/data/syllabus.ts", syllabus],
  ["src/data/teachers.ts", teachers],
  ["src/features/readiness/predict.ts", predict],
  ["src/features/readiness/readiness.ts", read("src/features/readiness/readiness.ts")],
  ["src/features/mentor/report.ts", read("src/features/mentor/report.ts")],
  ["src/features/cbt/engine.ts", read("src/features/cbt/engine.ts")],
];
let fabrications = 0;
for (const [name, text] of scanned) {
  for (const [re, label] of banned) {
    if (re.test(text)) {
      fail(`${name} contains ${label} that is not computed from the verified question bank.`);
      fabrications++;
    }
  }
}
if (fabrications === 0)
  ok("No hard-coded frequency/probability/expected-question claims in the shipped data.");

/* ── summary ───────────────────────────────────────────────────────── */

console.log(`\n${passed} checks passed, ${process.exitCode ? "FAILURES PRESENT" : "0 failures"}.`);
if (!process.exitCode) console.log("All provenance validation checks passed ✅");
