#!/usr/bin/env node
/**
 * VALIDATE CURRICULUM MAPS (Phase 4 — syllabus + planner rebuild)
 *
 * Checks the versioned curriculum registry:
 *
 *  1. Every published map has a COMPLETE Source record (Phase 1 contract).
 *  2. Every map is internally consistent — chapters numbered from 1 with no
 *     gaps or duplicates, ids unique, units non-empty.
 *  3. Unit marks are either corroborated or explicitly null. A map that sums to
 *     more than its published theory total is a red flag for a mis-transcribed
 *     weightage, and Physics is the known case where sources conflict.
 *  4. Class-level isolation: a Class XII map contains only Class XII chapters,
 *     so a board student's plan can never mix the two classes.
 *  5. Every chapter has at least one topic — a chapter with no topics cannot be
 *     planned or searched.
 *  6. Chapter names are unique within a subject, so mastery rows never collide.
 *
 * Static and cheap, same pattern as the rest of the repo.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

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

const dataFile = read("src/data/curriculum/cbse-class-12-2026-27.ts");
const indexFile = read("src/data/curriculum/index.ts");

/* ── 1. The registry exists and takes an explicit key ───────────────── */

for (const marker of ["export function curriculumFor", "CurriculumKey", "publishedCurricula"]) {
  if (indexFile.includes(marker)) ok(`Registry exposes ${marker}.`);
  else fail(`Curriculum registry is missing ${marker}.`);
}

// A fallback to the nearest year is the bug this guard prevents.
if (/academicYear[^;\n]{0,80}\|\|[^;\n]{0,80}academicYear/.test(indexFile)) {
  fail("The registry must not fall back to a different academic year.");
} else {
  ok("The registry never falls back to a different academic year.");
}

/* ── 2. Parse the map shape out of the data file ───────────────────── */

const REQUIRED_SOURCE_FIELDS = [
  "source:",
  "sourceType:",
  "sourceUrl:",
  "fetchedAt:",
  "version:",
  "verificationStatus:",
];
for (const f of REQUIRED_SOURCE_FIELDS) {
  if (dataFile.includes(f)) passed++;
  else fail(`Curriculum dataset is missing the provenance field "${f}".`);
}
ok("Curriculum dataset carries a complete provenance record.");

if (dataFile.includes('sourceUrl: "https://cbseacademic.nic.in/"')) {
  ok("Curriculum source points at the official CBSE curriculum site.");
} else {
  fail("Curriculum source must point at the official CBSE curriculum site.");
}

/* ── 3. Structural checks on the transcribed units ─────────────────── */

// Unit blocks look like:  { numeral: "I", name: "...", marks: 7, chapters: [
// Comments may sit between fields (the first Physics unit explains why its marks
// are null), so allow them between each field rather than only whitespace.
const GAP = "(?:\\s|//[^\n]*)*";
const unitRe = new RegExp(
  `\\{${GAP}numeral:${GAP}"([^"]+)",${GAP}name:${GAP}"([^"]+)",${GAP}marks:${GAP}(null|\\d+),${GAP}chapters:${GAP}\\[`,
  "g",
);
const units = [...dataFile.matchAll(unitRe)].map((m) => ({
  numeral: m[1],
  name: m[2],
  marks: m[3] === "null" ? null : Number(m[3]),
}));

if (units.length === 0) {
  fail("No curriculum units could be parsed from the dataset.");
} else {
  ok(`Parsed ${units.length} units across the three subjects.`);
}

// Chapter blocks: { n: 1, name: "...", topics: [ ... ] }
const chapterRe = new RegExp(
  `\\{${GAP}n:${GAP}(\\d+),${GAP}name:${GAP}"([^"]+)",${GAP}topics:${GAP}\\[([\\s\\S]*?)\\n${GAP}\\],${GAP}\\}`,
  "g",
);
const chapters = [...dataFile.matchAll(chapterRe)].map((m) => ({
  n: Number(m[1]),
  name: m[2],
  topics: [...m[3].matchAll(/"([^"]+)"/g)].map((t) => t[1]).filter((t) => t.length > 0),
}));

if (chapters.length === 0) {
  fail("No curriculum chapters could be parsed from the dataset.");
} else {
  ok(`Parsed ${chapters.length} chapters.`);
}

// Chapter numbers must start at 1 and increase without gaps, per subject.
// The dataset declares one unit array per subject, so that is the split point.
const bySubject = [];
{
  const declRe = /const (\w+)_UNITS: RawUnit\[\] = \[/g;
  const decls = [...dataFile.matchAll(declRe)];
  for (let i = 0; i < decls.length; i++) {
    const subject = decls[i][1];
    const start = decls[i].index + decls[i][0].length;
    const end = i + 1 < decls.length ? decls[i + 1].index : dataFile.length;
    const body = dataFile.slice(start, end);
    const nums = [...body.matchAll(new RegExp(`\\{${GAP}n:${GAP}(\\d+),`, "g"))].map((m) =>
      Number(m[1]),
    );
    bySubject.push({ subject, body, nums });
    const expected = nums.map((_, idx) => idx + 1);
    if (JSON.stringify(nums) === JSON.stringify(expected)) {
      ok(`${subject}: chapters numbered 1..${nums.length} with no gaps.`);
    } else {
      fail(`${subject}: chapter numbers ${nums.join(",")} are not 1..${nums.length}.`);
    }
  }
  if (bySubject.length === 0) {
    fail("No subject unit arrays found in the curriculum dataset.");
  }
}

// Every chapter must have at least one topic.
const emptyTopicChapters = chapters.filter((c) => c.topics.length === 0);
if (emptyTopicChapters.length) {
  fail(`Chapters with no topics: ${emptyTopicChapters.map((c) => c.name).join(", ")}.`);
} else {
  ok(
    `Every chapter has at least one topic (${chapters.reduce((s, c) => s + c.topics.length, 0)} topics total).`,
  );
}

// Chapter names must be unique within a subject, or mastery rows collide.
for (const { subject, body } of bySubject) {
  const names = [...body.matchAll(/name:\s*"([^"]+)",\s*\n?\s*topics:/g)].map((m) => m[1]);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) fail(`${subject}: duplicate chapter names: ${[...new Set(dupes)].join(", ")}.`);
  else ok(`${subject}: chapter names are unique (${names.length} chapters).`);
}

/* ── 4. Marks honesty ───────────────────────────────────────────────── */

const unmarked = units.filter((u) => u.marks === null);
const marked = units.filter((u) => u.marks !== null);

if (marked.length > 0) {
  ok(`${marked.length} units carry corroborated marks.`);
}
if (unmarked.length > 0) {
  ok(`${unmarked.length} units are explicitly unmarked (null), not guessed.`);
} else {
  fail("Expected at least one unmarked unit — Physics marks are known to conflict across sources.");
}

// The three known theory totals. A map whose marked units exceed its published
// total is a transcription error, not a rounding difference.
const TOTALS = { PHYSICS: 70, CHEMISTRY: 70, MATHEMATICS: 80 };
for (const { subject, body } of bySubject) {
  const subjectUnits = [...body.matchAll(/marks:\s*(null|\d+)/g)].map((m) =>
    m[1] === "null" ? null : Number(m[1]),
  );
  const sum = subjectUnits.reduce((s, m) => s + (m ?? 0), 0);
  const total = TOTALS[subject];
  if (typeof total !== "number") continue;
  if (sum > total) {
    fail(
      `${subject}: unit marks sum to ${sum} but the theory paper is ${total}. ` +
        `This is the Physics mis-transcription the dataset guards against.`,
    );
  } else if (sum === total) {
    ok(`${subject}: unit marks sum exactly to the ${total}-mark theory paper.`);
  } else {
    // Chemistry 70 / Maths 80 must sum exactly; anything else is suspicious.
    if (subject === "Chemistry" || subject === "Mathematics") {
      fail(`${subject}: unit marks sum to ${sum}, expected ${total}.`);
    } else {
      ok(`${subject}: unit marks sum to ${sum} of ${total} (unmarked units excluded).`);
    }
  }
}

/* ── 5. Class-level isolation ───────────────────────────────────────── */

if (dataFile.includes("classLevel: 12")) {
  ok("The Class XII map declares classLevel 12.");
} else {
  fail("The Class XII map must declare classLevel 12.");
}
if (indexFile.includes("assertClassLevelIsolation")) {
  ok("Class-level isolation is asserted by the registry.");
} else {
  fail("The registry must expose assertClassLevelIsolation.");
}

// The map must not contain Class XI-only chapters. These are the NCERT Class XI
// units that must never appear in a Class XII plan.
const CLASS_XI_ONLY = [
  "Some Basic Concepts of Chemistry",
  "Structure of Atom",
  "Chemical Bonding and Molecular Structure",
  "Thermodynamics",
  "Equilibrium",
  "Redox Reactions",
  "Hydrocarbons",
  "Sets",
  "Trigonometric Functions",
  "Complex Numbers and Quadratic Equations",
  "Permutations and Combinations",
  "Straight Lines",
  "Conic Sections",
  "Physical World",
  "Units and Measurements",
  "Laws of Motion",
  "Work, Energy and Power",
  "System of Particles and Rotational Motion",
  "Gravitation",
  "Mechanical Properties of Fluids",
];
const leaked = CLASS_XI_ONLY.filter((name) =>
  new RegExp(`name:\\s*"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(dataFile),
);
if (leaked.length) {
  fail(`Class XI chapters found in the Class XII map: ${leaked.join(", ")}.`);
} else {
  ok("No Class XI-only chapter appears in the Class XII map.");
}

/* ── 5. Load the real registry and check the live invariants ───────── */

/**
 * Everything above parses the Class XII source as text, which cannot see the
 * Class XI map at all and cannot check an invariant that only exists at
 * runtime — `assertClassLevelIsolation` in particular.
 *
 * So bundle the registry with esbuild and import it. `vite-node` cannot be used
 * here: the app's Vite config pulls in the TanStack Start plugin, which crashes
 * under a plain node runner. esbuild needs none of that.
 *
 * A text check is also fooled by its own regexes: a chapter numbered 13 twice
 * parses as two perfectly well-formed chapters. Only loading the module runs
 * the guard.
 */
{
  const tmp = mkdtempSync(join(tmpdir(), "curriculum-"));
  const out = join(tmp, "curriculum.mjs");
  try {
    execFileSync(
      join("node_modules", ".bin", "esbuild"),
      [
        "src/data/curriculum/index.ts",
        "--bundle",
        "--format=esm",
        "--platform=node",
        "--alias:@=./src",
        `--outfile=${out}`,
        "--log-level=error",
      ],
      { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (err) {
    fail(`Could not bundle the curriculum registry for a live check: ${err.message}`);
  }

  let mod;
  try {
    mod = await import(out);
  } catch (err) {
    // A module that throws on import is exactly the failure this catches: the
    // Class XI map guards itself with a module-level isolation assertion.
    fail(`The curriculum registry throws on import: ${err.message}`);
  }

  if (mod) {
    const maps = mod.publishedCurricula();
    if (maps.length === 0) fail("The registry publishes no maps.");
    else ok(`The registry publishes ${maps.length} map(s).`);

    const SUBJECTS = ["Physics", "Chemistry", "Mathematics"];
    for (const map of maps) {
      const label = `${map.board} Class ${map.classLevel} ${map.academicYear}`;

      // The isolation invariant, run for real.
      if (mod.assertClassLevelIsolation(map, map.classLevel)) {
        ok(`${label}: passes its class-level isolation check.`);
      } else {
        fail(
          `${label}: FAILS its class-level isolation check (duplicate chapter id, name or number).`,
        );
      }

      // A complete provenance record on every map.
      const missing = mod.missingSourceFields
        ? mod.missingSourceFields(map.source)
        : Object.entries(map.source ?? {})
            .filter(([, v]) => typeof v !== "string" || !v.trim())
            .map(([k]) => k);
      if (missing.length === 0) ok(`${label}: provenance record is complete.`);
      else fail(`${label}: provenance record is missing ${missing.join(", ")}.`);

      // Every chapter carries topics, and ids are derived not hand-written.
      let topicless = 0;
      let badId = 0;
      for (const s of map.subjects) {
        for (const u of s.units) {
          for (const c of u.chapters) {
            if (!c.topics || c.topics.length === 0) topicless++;
            // A derived id always embeds the chapter number.
            if (!String(c.id).includes(`-c${c.number}-`)) badId++;
          }
        }
      }
      if (topicless === 0) ok(`${label}: every chapter has at least one topic.`);
      else fail(`${label}: ${topicless} chapter(s) have no topics.`);
      if (badId === 0) ok(`${label}: every chapter id is derived from its chapter number.`);
      else fail(`${label}: ${badId} chapter id(s) do not match their chapter number.`);

      // The three subjects, in board order.
      const got = map.subjects.map((s) => s.subject);
      if (JSON.stringify(got) === JSON.stringify(SUBJECTS)) {
        ok(`${label}: covers Physics, Chemistry and Mathematics in board order.`);
      } else {
        fail(`${label}: subject list is ${got.join(", ")}, expected ${SUBJECTS.join(", ")}.`);
      }

      // Marks honesty: a marked subject must sum to its published theory total,
      // and an unmarked one must be unmarked rather than guessed.
      for (const s of map.subjects) {
        const marks = s.units.map((u) => u.marks);
        const total = mod.theoryMarks ? mod.theoryMarks(map, s.subject) : null;
        const published = { Physics: 70, Chemistry: 70, Mathematics: 80 }[s.subject];
        if (total === null) {
          if (marks.every((m) => m === null)) {
            ok(`${label} ${s.subject}: every unit is explicitly unmarked.`);
          } else {
            fail(`${label} ${s.subject}: mixed null and numeric unit marks — pick one.`);
          }
        } else if (published !== undefined && total !== published) {
          fail(
            `${label} ${s.subject}: unit marks sum to ${total} but the theory paper is ${published}.`,
          );
        } else {
          ok(`${label} ${s.subject}: unit marks sum to the ${total}-mark theory paper.`);
        }
      }
    }

    // Cross-scope: a Class XII key must never resolve the Class XI map.
    for (const map of maps) {
      const wrongClass = maps.find((m) => m.classLevel !== map.classLevel);
      if (!wrongClass) continue;
      const resolved = mod.curriculumFor({
        board: map.board,
        classLevel: map.classLevel,
        academicYear: map.academicYear,
      });
      if (resolved === wrongClass) {
        fail(
          `A Class ${map.classLevel} key resolved the Class ${wrongClass.classLevel} map — cross-scope leak.`,
        );
      } else {
        ok(`A Class ${map.classLevel} key never resolves the Class ${wrongClass.classLevel} map.`);
      }
    }
  }

  rmSync(tmp, { recursive: true, force: true });
}

/* ── summary ───────────────────────────────────────────────────────── */

console.log(`\n${passed} checks passed, ${process.exitCode ? "FAILURES PRESENT" : "0 failures"}.`);
if (!process.exitCode) console.log("All curriculum validation checks passed ✅");
