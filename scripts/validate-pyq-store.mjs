#!/usr/bin/env node
/**
 * VALIDATE PYQ STORE INTEGRITY
 *
 * Phase 2 of the rebuild plan asks for dataset checks on the PYQ store:
 * "duplicates, missing answers, bad option counts, question-number gaps,
 * subject/shift mismatch, broken source links."
 *
 * `validate-jee2026.mjs` covers the first three of those against
 * `data/jee2026/transcribed/` — the source directory, which is gitignored and
 * usually absent. This validator covers **the store that actually ships**:
 * `public/pyq/`, baked at build time by `scripts/build-pyq.mjs` and served to
 * every student. A check that only ever runs against a directory that is not in
 * the repository is a check that never runs.
 *
 * What it enforces, and why each one matters to a student:
 *
 *  - **Question-number gaps.** A paper whose numbering jumps 24 → 26 means a
 *    question was dropped in transcription. The student sits a 75-question paper
 *    believing it is the real shift, and the marks are computed against a
 *    different paper than the one they answered.
 *  - **Duplicates.** The same question twice in one paper, or the same question
 *    across two papers of the same shift, inflates the "verified questions"
 *    count the UI quotes. A number a student can check by reading the paper is
 *    worse than no number.
 *  - **Subject/shift mismatch.** A paper labelled 21 Jan Evening Shift whose
 *    `meta` says 22 Jan Morning is a mislabelled shift, and a student revising
 *    "the evening shift" gets the wrong paper.
 *  - **Index drift.** The index's `total`, `counts`, `mcq` and `integer` must
 *    match the paper file it points at. These are the numbers the PYQ browser
 *    shows, so a stale index is a lie on the surface the student reads.
 *  - **Missing answers and bad option counts.** An MCQ with three options, or
 *    no answer at all, cannot be graded. The CBT would mark a correct response
 *    wrong.
 *
 * Fails on critical integrity errors, per the plan.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYQ_DIR = join(root, "public", "pyq");
const SUBJECTS = ["Physics", "Chemistry", "Mathematics"];

/** Normalised question text, for duplicate detection across papers. */
function fingerprint(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Checks that are critical — a failure here means the store cannot be trusted. */
const critical = [];
/** Checks that are advisory — reported, but they do not fail the build. */
const advisory = [];

function fail(msg) {
  critical.push(msg);
  console.error(`  [ERROR] ${msg}`);
}

function warn(msg) {
  advisory.push(msg);
  console.warn(`  [WARN]  ${msg}`);
}

async function loadJson(rel) {
  const raw = await readFile(join(PYQ_DIR, rel), "utf8");
  return JSON.parse(raw);
}

function questionsOf(paper) {
  if (Array.isArray(paper?.questions)) return paper.questions;
  if (Array.isArray(paper?.paper?.questions)) return paper.paper.questions;
  return null;
}

async function run() {
  console.log("=== Validating the shipped PYQ store (public/pyq) ===");

  let files;
  try {
    files = (await readdir(PYQ_DIR)).filter((f) => f.endsWith(".json") && f !== "index.json");
  } catch (err) {
    console.error(`Cannot read ${PYQ_DIR}: ${err.message}`);
    console.error("Run `node scripts/build-pyq.mjs` first — the store is baked at build time.");
    process.exit(1);
  }

  if (files.length === 0) {
    // An empty store is a legitimate offline state (the bake falls back to a
    // pinned baseline), but it is not a state to ship silently.
    warn("No paper files in public/pyq — the store is empty.");
    console.log(`\n${critical.length} critical, ${advisory.length} advisory`);
    process.exit(0);
  }

  let index;
  try {
    index = await loadJson("index.json");
  } catch (err) {
    fail(`index.json is unreadable: ${err.message}`);
    console.log(`\n${critical.length} critical, ${advisory.length} advisory`);
    process.exit(1);
  }
  const indexed = new Map((index?.papers ?? []).map((p) => [p?.id, p]));

  /** question text -> [paperId, ...], for cross-paper duplicate detection. */
  const seen = new Map();
  let totalQuestions = 0;

  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    console.log(`\n${id}`);

    let paper;
    try {
      paper = await loadJson(file);
    } catch (err) {
      fail(`${id}: not valid JSON — ${err.message}`);
      continue;
    }

    const qs = questionsOf(paper);
    if (!qs) {
      fail(`${id}: no questions array (expected paper.questions)`);
      continue;
    }
    if (qs.length === 0) {
      fail(`${id}: zero questions`);
      continue;
    }
    totalQuestions += qs.length;
    console.log(`  ${qs.length} questions`);

    /* ---- question-number gaps ---- */
    const nos = qs.map((q) => Number(q?.no)).filter((n) => Number.isFinite(n));
    if (nos.length !== qs.length) {
      fail(`${id}: ${qs.length - nos.length} question(s) have no numeric \`no\``);
    }
    if (nos.length > 1) {
      const min = Math.min(...nos);
      const max = Math.max(...nos);
      const expected = max - min + 1;
      if (nos.length !== expected) {
        fail(
          `${id}: question numbering has a gap — ${nos.length} questions numbered ${min}..${max} (expected ${expected})`,
        );
      }
      if (new Set(nos).size !== nos.length) {
        fail(`${id}: duplicate question numbers`);
      }
      if (min !== 1) {
        fail(`${id}: numbering starts at ${min}, expected 1`);
      }
    }

    /* ---- per-question shape ---- */
    const perSubject = {};
    for (const q of qs) {
      const n = q?.no ?? "?";
      const text = q?.text ?? q?.question_text;
      if (!text || typeof text !== "string" || !text.trim()) {
        fail(`${id} #Q${n}: missing question text`);
        continue;
      }

      const type = String(q?.type ?? "").toLowerCase();
      if (type !== "mcq" && type !== "integer") {
        fail(`${id} #Q${n}: type "${q?.type}" is neither mcq nor integer`);
      }

      const opts = Array.isArray(q?.options) ? q.options : [];
      if (type === "mcq") {
        // Integer-type questions legitimately carry no options.
        if (opts.length < 2) {
          fail(`${id} #Q${n}: MCQ has ${opts.length} options (needs at least 2)`);
        }
        const labels = opts.map((o) => o?.label);
        if (new Set(labels).size !== labels.length) {
          fail(`${id} #Q${n}: duplicate option labels`);
        }
        const answer = q?.answer ?? q?.correct_answer;
        if (answer === undefined || answer === null || answer === "") {
          fail(`${id} #Q${n}: MCQ has no answer`);
        } else if (!labels.includes(String(answer))) {
          fail(`${id} #Q${n}: answer "${answer}" is not one of the option labels`);
        }
      } else if (type === "integer") {
        const answer = q?.answer ?? q?.correct_answer;
        if (answer === undefined || answer === null || answer === "") {
          fail(`${id} #Q${n}: integer question has no answer`);
        }
      }

      const subject = q?.subject;
      if (!SUBJECTS.includes(subject)) {
        fail(`${id} #Q${n}: subject "${subject}" is not one of ${SUBJECTS.join(", ")}`);
      } else {
        perSubject[subject] = (perSubject[subject] ?? 0) + 1;
      }

      // Duplicate detection within and across papers.
      const fp = fingerprint(text);
      const prior = seen.get(fp);
      if (prior) {
        // The same question appearing in two different shifts is a genuine data
        // error; the same question twice in ONE paper always is.
        const sameFile = prior.paperId === id;
        const msg = `${id} #Q${n}: duplicate of ${prior.paperId} #Q${prior.no}${sameFile ? " (same paper)" : ""}`;
        if (sameFile) fail(msg);
        else warn(msg);
      } else {
        seen.set(fp, { paperId: id, no: n });
      }
    }

    /* ---- index drift ---- */
    const entry = indexed.get(id);
    if (!entry) {
      warn(`${id}: not listed in index.json`);
    } else {
      if (Number(entry.total) !== qs.length) {
        fail(`${id}: index says ${entry.total} questions, file has ${qs.length}`);
      }
      for (const s of SUBJECTS) {
        const claimed = entry?.counts?.[s];
        if (claimed !== undefined && Number(claimed) !== (perSubject[s] ?? 0)) {
          fail(`${id}: index says ${claimed} ${s} questions, file has ${perSubject[s] ?? 0}`);
        }
      }
      const mcq = qs.filter((q) => String(q?.type).toLowerCase() === "mcq").length;
      const integer = qs.length - mcq;
      if (entry.mcq !== undefined && Number(entry.mcq) !== mcq) {
        fail(`${id}: index says ${entry.mcq} MCQ, file has ${mcq}`);
      }
      if (entry.integer !== undefined && Number(entry.integer) !== integer) {
        fail(`${id}: index says ${entry.integer} integer, file has ${integer}`);
      }
    }

    /* ---- subject/shift mismatch ---- */
    const meta = paper?.paper?.meta ?? paper?.meta ?? {};
    if (meta?.id && meta.id !== id) {
      fail(`${id}: file is named ${id} but its meta says ${meta.id}`);
    }
    // The label and the id must describe the same date and shift.
    if (typeof meta?.label === "string" && meta.label) {
      const label = meta.label.toLowerCase();
      const idShift = /(morning|evening)/.exec(id)?.[1];
      const labelShift = /(morning|evening)/.exec(label)?.[1];
      if (idShift && labelShift && idShift !== labelShift) {
        fail(`${id}: id says ${idShift} shift but the label says "${meta.label}"`);
      }
      const idDay = /(\d{1,2})-january/.exec(id)?.[1];
      const labelDay = /(\d{1,2})\s*jan/.exec(label)?.[1];
      if (idDay && labelDay && idDay !== labelDay) {
        fail(`${id}: id says day ${idDay} but the label says "${meta.label}"`);
      }
    }
    if (meta?.year !== undefined && Number(meta.year) !== Number(index?.year ?? 2026)) {
      warn(`${id}: meta year ${meta.year} differs from index year ${index?.year}`);
    }

    /* ---- solutions ---- */
    const withSol = qs.filter((q) => typeof q?.sol === "string" && q.sol.trim()).length;
    if (withSol < qs.length) {
      // A paper without full solutions cannot teach from its mistakes, but it
      // can still be sat. Advisory, not critical.
      warn(`${id}: ${qs.length - withSol} of ${qs.length} questions have no solution`);
    }
  }

  /* ---- index entries that point at nothing ---- */
  for (const [id] of indexed) {
    if (!files.includes(`${id}.json`)) {
      fail(`index.json lists ${id} but public/pyq/${id}.json does not exist`);
    }
  }

  console.log(`\n=== ${files.length} papers, ${totalQuestions} questions ===`);
  console.log(`${critical.length} critical, ${advisory.length} advisory`);

  if (critical.length > 0) {
    console.error("\nFAILED — the shipped question store has integrity errors.");
    process.exit(1);
  }
  console.log("PASSED — the shipped question store is internally consistent.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
