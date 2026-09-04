#!/usr/bin/env node
/**
 * VALIDATE AI MENTOR — comprehensive student report on a HUGE synthetic corpus.
 *
 * Bundles the REAL mentor engine + all data surfaces with Rolldown and runs
 * buildMentorReport() over:
 *
 *  1. A large generated population (~600 students) simulating a full year of
 *     real usage — varying attempts, accuracy, tests, focus, StudyTube watch/
 *     mastery, planner load and gaps.
 *  2. Named real-life scenarios (brand-new, over-achiever, struggling, stale
 *     planner, no-focus-but-tests, heavy-watch-no-practice, near-exam, etc.).
 *  3. Corrupted / malformed store shapes — the report must never throw or emit
 *     NaN, even after a year of messy real-world data.
 *
 * Invariants enforced on EVERY report:
 *  - returns a well-formed object; never throws
 *  - readinessScore & every % are finite numbers in [0, 100]
 *  - counts are non-negative integers; percentiles in [0, 100]
 *  - actions/risks are sorted and well-formed
 *  - summary + AI context are non-empty and bounded
 *  - deterministic: identical input -> identical output
 *
 * No network. Seeded RNG so results are reproducible. Exits non-zero on failure.
 */

import { build } from "rolldown";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

let passed = 0;
let failed = 0;
const failures = [];
const stats = { reports: 0, throws: 0 };

function ok(cond, label) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(label);
  }
}
function section(t) {
  console.log("\n=== " + t + " ===");
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/* ------------------------------------------------------------------ */
/* Build bundle                                                        */
/* ------------------------------------------------------------------ */
let P;
async function buildBundle() {
  const dir = await mkdtemp(join(tmpdir(), "ntacbt-mentor-"));
  const entry = join(dir, "e.ts");
  const out = join(dir, "b.mjs");
  const lines = [
    `export * as mentor from ${JSON.stringify(join(SRC, "features", "mentor", "report"))};`,
    `export * as store from ${JSON.stringify(join(SRC, "lib", "store"))};`,
    `export * as focus from ${JSON.stringify(join(SRC, "features", "focus", "focus"))};`,
    `export * as studytube from ${JSON.stringify(join(SRC, "features", "studytube", "progress"))};`,
    `export * as readiness from ${JSON.stringify(join(SRC, "features", "readiness", "readiness"))};`,
    `export * as cbtEngine from ${JSON.stringify(join(SRC, "features", "cbt", "engine"))};`,
    `export * as catalog from ${JSON.stringify(join(SRC, "features", "studytube", "catalog"))};`,
  ];
  await writeFile(entry, lines.join("\n"), "utf8");
  const res = await build({
    input: entry,
    output: { file: out, format: "esm", codeSplitting: false },
    resolve: { tsconfigFilename: join(ROOT, "tsconfig.json") },
    platform: "node",
  });
  if (!res || !res.output) throw new Error("Rolldown produced no output");
  P = await import(pathToFileURL(out).href);
  return dir;
}

function localDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SUBJECTS = ["Physics", "Chemistry", "Mathematics"];
const TYPES = ["mcq", "integer"];

/* ------------------------------------------------------------------ */
/* Synthesize a student's data after N days of use                     */
/* ------------------------------------------------------------------ */
function genStudent(rng, now) {
  const daysUsed = 1 + Math.floor(rng() * 365);
  const startDate = localDayKey(now - daysUsed * 86400000);
  const attemptsN = Math.floor(rng() * 30);
  const totalQs = Math.floor(rng() * 60);
  const accuracy = Math.floor(rng() * 101);
  const marks = Math.floor(rng() * 301);
  const syllabus = Math.floor(rng() * 101);

  // planner
  const totalTasks = Math.floor(rng() * 60);
  const doneCount = Math.floor(rng() * (totalTasks + 1));
  const tasks = Array.from({ length: totalTasks }, (_, i) => {
    const done = i < doneCount;
    const dateOffset = Math.floor(rng() * 40) - 10; // some in past (overdue)
    return {
      id: `task-${i}`,
      subject: SUBJECTS[Math.floor(rng() * 3)],
      chapter: `Chapter ${Math.floor(rng() * 12) + 1}`,
      topic: "",
      kind: ["learn", "practice", "revision", "test"][Math.floor(rng() * 4)],
      date: localDayKey(now + dateOffset * 86400000),
      estMin: 30 + Math.floor(rng() * 90),
      status: done ? "done" : "pending",
      why: `Plan ${i}`,
    };
  });

  // focus
  const focusSessions = [];
  const focusDays = Math.floor(rng() * 40);
  for (let d = 0; d < focusDays; d++) {
    const startedAt = now - d * 86400000 - Math.floor(rng() * 3600000);
    focusSessions.push({
      id: `f-${d}`,
      startedAt,
      seconds: Math.floor(rng() * 3600),
      completed: rng() < 0.8,
      label: "Focus",
      subject: SUBJECTS[Math.floor(rng() * 3)],
    });
  }

  // studytube
  const watched = {};
  const notes = {};
  const handshakes = {};
  const watchLaterCount = Math.floor(rng() * 10);
  const watchLater = Array.from({ length: watchLaterCount }, () => `v-${Math.floor(rng() * 1000)}`);
  const handshakeCount = Math.floor(rng() * 12);
  const masteryStates = ["Not Started", "Learning", "Improving", "Strong", "Mastered"];
  for (let i = 0; i < handshakeCount; i++) {
    const vid = `vid-${i}`;
    watched[vid] = { videoId: vid, title: `Lesson ${i}`, watchedAt: now, finished: rng() < 0.8 };
    if (rng() < 0.6) notes[vid] = { text: "note", updatedAt: now };
    handshakes[vid] = {
      videoId: vid,
      recall: Math.floor(rng() * 6),
      practice: Math.floor(rng() * 26),
      mastery: masteryStates[Math.floor(rng() * masteryStates.length)],
      updatedAt: now,
    };
  }

  return {
    storeShape: {
      attempts: Array.from({ length: attemptsN }, (_, i) => ({
        id: `a-${i}`,
        testId: `t-${Math.floor(rng() * 5)}`,
        submittedAt: now - Math.floor(rng() * daysUsed) * 86400000,
        result: {
          all: {
            correct: Math.floor(rng() * (totalQs + 1)),
            wrong: Math.floor(rng() * (totalQs + 1)),
            skipped: totalQs,
            marks,
            neg: 0,
            time: 100,
            total: totalQs,
            max: totalQs * 4,
            accuracy,
          },
        },
        responses: {},
      })),
      tests: Array.from({ length: 6 }, (_, t) => ({
        id: `t-${t}`,
        name: `Test ${t}`,
        createdAt: now,
        duration: 180,
        questions: Array.from({ length: totalQs ? 4 : 0 }, (_, q) => ({
          id: `q-${t}-${q}`,
          subject: SUBJECTS[Math.floor(rng() * 3)],
          chapter: `Chapter ${Math.floor(rng() * 12) + 1}`,
          type: TYPES[Math.floor(rng() * 2)],
          text: "question",
          options: [],
          answer: "a",
          tag: ["concept", "formula", "calculation", "misread", "silly", "guessed"][
            Math.floor(rng() * 6)
          ],
        })),
      })),
      settings: {},
      dailyQuestions: {},
      reviewSchedule: {},
      qtags: {},
      aiPlanner: {
        profile: {
          target: ["jeemain", "jeeadv", "board12", "board11", "cbse27"][Math.floor(rng() * 5)],
          language: ["en", "hi", "hinglish"][Math.floor(rng() * 3)],
          depth: ["oneshot", "lecture", "detailed"][Math.floor(rng() * 3)],
          speed: 1,
          dailyMin: 60 + Math.floor(rng() * 180),
          weekdayMin: 60,
          startDate,
          days: daysUsed,
          examDate: randExamDate(rng),
        },
        tasks,
      },
      plannerDone: tasks.reduce((obj, t) => {
        if (t.status === "done") obj[t.id] = true;
        return obj;
      }, {}),
      plannerEdits: {},
    },
    focus: { sessions: focusSessions, dailyTargetSec: 90 * 60 },
    studytube: { schemaVersion: 1, watched, notes, watchLater, handshakes },
  };
}

function randExamDate(rng) {
  const d = new Date(Date.now() + (30 + Math.floor(rng() * 300)) * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Invariant checker                                                   */
/* ------------------------------------------------------------------ */
function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}
function checkReport(r, label) {
  ok(r && typeof r === "object", `${label}: report is object`);
  if (!r) return;
  ok(isFiniteNum(r.generatedAt), `${label}: generatedAt finite`);
  ok(
    isFiniteNum(r.readinessScore) && r.readinessScore >= 0 && r.readinessScore <= 100,
    `${label}: readinessScore in [0,100]`,
  );
  ok(
    ["excellent", "good", "fair", "at-risk"].includes(r.readinessLevel),
    `${label}: readinessLevel enum`,
  );
  ok(r.learner && typeof r.learner.targetLabel === "string", `${label}: learner well-formed`);
  ok(
    r.performance &&
      isFiniteNum(r.performance.accuracy) &&
      r.performance.accuracy >= 0 &&
      r.performance.accuracy <= 100,
    `${label}: accuracy in [0,100]`,
  );
  ok(
    r.performance &&
      isFiniteNum(r.performance.percentile) &&
      r.performance.percentile >= 0 &&
      r.performance.percentile <= 100,
    `${label}: percentile in [0,100]`,
  );
  ok(
    r.performance && Number.isInteger(r.performance.attempts) && r.performance.attempts >= 0,
    `${label}: attempts non-neg int`,
  );
  ok(
    r.mastery &&
      isFiniteNum(r.mastery.syllabusCompletionPct) &&
      r.mastery.syllabusCompletionPct >= 0 &&
      r.mastery.syllabusCompletionPct <= 100,
    `${label}: syllabusCompletionPct in [0,100]`,
  );
  ok(Array.isArray(r.mastery.weakTopics), `${label}: weakTopics array`);
  ok(
    r.study &&
      isFiniteNum(r.study.practiceToMastery) &&
      r.study.practiceToMastery >= 0 &&
      r.study.practiceToMastery <= 100,
    `${label}: practiceToMastery in [0,100]`,
  );
  ok(
    r.study && Number.isInteger(r.study.lecturesWatched) && r.study.lecturesWatched >= 0,
    `${label}: lecturesWatched non-neg`,
  );
  ok(r.mistakes && typeof r.mistakes.topLabel === "string", `${label}: mistakes well-formed`);
  ok(
    r.focus && Number.isInteger(r.focus.streakDays) && r.focus.streakDays >= 0,
    `${label}: streakDays non-neg`,
  );
  ok(
    r.focus && isFiniteNum(r.focus.consistencyPct) && r.focus.consistencyPct <= 100,
    `${label}: consistencyPct in range`,
  );
  ok(
    r.planner &&
      isFiniteNum(r.planner.completionPct) &&
      r.planner.completionPct >= 0 &&
      r.planner.completionPct <= 100,
    `${label}: planner completionPct in [0,100]`,
  );
  ok(
    r.planner && Number.isInteger(r.planner.overdueTasks) && r.planner.overdueTasks >= 0,
    `${label}: overdueTasks non-neg`,
  );
  ok(Array.isArray(r.actions), `${label}: actions array`);
  ok(Array.isArray(r.risks), `${label}: risks array`);
  const prio = ["critical", "high", "medium", "low"];
  let lastPrio = -1;
  for (const a of r.actions) {
    ok(a && a.title && a.detail && a.reason, `${label}: action well-formed`);
    ok(prio.includes(a.priority), `${label}: action priority enum`);
    if (prio.indexOf(a.priority) < lastPrio) ok(false, `${label}: actions sorted by priority`);
    lastPrio = prio.indexOf(a.priority);
  }
  for (const x of r.risks) ok(x && x.title && x.detail && x.evidence, `${label}: risk well-formed`);
  ok(typeof r.summary === "string" && r.summary.length > 0, `${label}: summary non-empty`);
}

async function main() {
  section("Build mentor bundle");
  const dir = await buildBundle();
  ok(typeof P.mentor.buildMentorReport === "function", "buildMentorReport exported");
  ok(typeof P.mentor.mentorContextForAI === "function", "mentorContextForAI exported");
  console.log("  bundle loaded");

  const { buildMentorReport, mentorContextForAI } = P.mentor;
  const { DataStore } = P.store;
  const rng = makeRng(987654321);
  const now = Date.now();

  /* ------------------------------------------------------------------ */
  section("Named real-life scenarios");
  const scenarios = [
    ["brand-new user", emptyStore(), null, null],
    ["active student", richStudent(), null, null],
    ["over-achiever near-exam", nearExamRich(), null, null],
    ["struggling low-accuracy", lowAccuracy(), null, null],
    ["no-focus but tests", noFocus(), null, null],
    ["heavy-watch no-practice", watchNoPractice(), null, null],
    ["stale planner (massive overdue)", stalePlan(), null, null],
    ["empty studytube, active tests", activeNoStudyTube(), null, null],
  ];
  for (const [name, shape, focus, studytube] of scenarios) {
    try {
      const r = buildMentorReport({ store: new DataStore(shape), focus, studytube, now });
      checkReport(r, name);
      const ctx = mentorContextForAI(r);
      ok(
        typeof ctx === "string" && ctx.length > 0 && ctx.length <= 2400,
        `${name}: AI context non-empty & bounded`,
      );
      // determinism
      const r2 = buildMentorReport({ store: new DataStore(shape), focus, studytube, now });
      ok(JSON.stringify(r) === JSON.stringify(r2), `${name}: deterministic`);
      stats.reports++;
    } catch (e) {
      stats.throws++;
      ok(false, `${name}: threw ${e && e.message}`);
    }
  }

  /* ------------------------------------------------------------------ */
  section("Large population (~600 synthetic students, up to a year of data)");
  let determinismMismatch = 0;
  for (let i = 0; i < 600; i++) {
    try {
      const g = genStudent(rng, now);
      const r = buildMentorReport({
        store: new DataStore(g.storeShape),
        focus: g.focus,
        studytube: g.studytube,
        now,
      });
      checkReport(r, `student #${i}`);
      const ctx = mentorContextForAI(r);
      ok(typeof ctx === "string" && ctx.length <= 2400, `student #${i}: AI context bounded`);
      stats.reports++;
    } catch (e) {
      stats.throws++;
      ok(false, `student #${i}: threw ${e && e.message}`);
    }
  }

  /* ------------------------------------------------------------------ */
  section("Corrupted / malicious store shapes (never throw, no NaN)");
  const corrupt = [
    ["null store", () => new DataStore(null)],
    ["object store", () => new DataStore({})],
    ["attempts not array", () => new DataStore({ attempts: 42, tests: {}, settings: "x" })],
    ["tests with bad questions", () => new DataStore({ tests: [{ questions: "nope" }] })],
    ["planner malformed", () => new DataStore({ aiPlanner: { profile: null, tasks: "bad" } })],
    [
      "planner tasks not array",
      () => new DataStore({ aiPlanner: { profile: {}, tasks: { a: 1 } } }),
    ],
    [
      "task missing fields",
      () => new DataStore({ aiPlanner: { profile: { target: "jeemain" }, tasks: [{ id: "x" }] } }),
    ],
    [
      "nan result fields",
      () =>
        new DataStore({
          attempts: [
            {
              result: {
                all: {
                  correct: "NaN",
                  wrong: Infinity,
                  skipped: null,
                  marks: "x",
                  total: 0,
                  max: 0,
                },
              },
            },
          ],
        }),
    ],
    ["study tube with nulls", () => new DataStore({})],
    [
      "huge arrays",
      () =>
        new DataStore({
          attempts: Array.from({ length: 5000 }, (_, i) => ({
            id: `a${i}`,
            testId: "t",
            submittedAt: now,
            result: { all: { correct: 1, wrong: 1, skipped: 0, marks: 3, total: 2, max: 8 } },
            responses: {},
          })),
        }),
    ],
  ];
  for (const [name, make] of corrupt) {
    try {
      const store = make();
      const r = buildMentorReport({ store, now });
      ok(r && typeof r === "object" && Number.isFinite(r.readinessScore), `${name}: report ok`);
      stats.reports++;
    } catch (e) {
      stats.throws++;
      ok(false, `${name}: threw ${e && e.message}`);
    }
  }

  await rm(dir, { recursive: true, force: true }).catch(() => {});

  console.log("\n============================================================");
  console.log(`Reports generated: ${stats.reports}`);
  console.log(`Passed: ${passed}  Failed: ${failed}  Throws: ${stats.throws}`);
  if (failures.length) {
    console.error("\nFailed assertions (first 40):");
    for (const f of failures.slice(0, 40)) console.error("  - " + f);
    process.exit(1);
  }
  console.log("All MENTOR-report validation checks passed ✅");
}

function emptyStore() {
  return {
    attempts: [],
    tests: [],
    settings: {},
    dailyQuestions: {},
    reviewSchedule: {},
    qtags: {},
    aiPlanner: null,
    plannerDone: {},
    plannerEdits: {},
  };
}
function richStudent() {
  const s = emptyStore();
  const t0 = Date.now() - 20 * 86400000;
  s.attempts = [
    {
      id: "a1",
      testId: "t",
      submittedAt: t0,
      result: {
        all: {
          correct: 40,
          wrong: 15,
          skipped: 0,
          marks: 145,
          neg: 0,
          time: 100,
          total: 75,
          max: 300,
          accuracy: 72,
        },
      },
    },
    {
      id: "a2",
      testId: "t",
      submittedAt: t0 + 5 * 86400000,
      result: {
        all: {
          correct: 45,
          wrong: 12,
          skipped: 0,
          marks: 168,
          neg: 0,
          time: 100,
          total: 75,
          max: 300,
          accuracy: 78,
        },
      },
    },
    {
      id: "a3",
      testId: "t",
      submittedAt: t0 + 10 * 86400000,
      result: {
        all: {
          correct: 48,
          wrong: 10,
          skipped: 0,
          marks: 182,
          neg: 0,
          time: 100,
          total: 75,
          max: 300,
          accuracy: 82,
        },
      },
    },
  ];
  s.tests = [{ id: "t", name: "T", createdAt: t0, duration: 180, questions: [] }];
  s.aiPlanner = {
    profile: {
      target: "jeemain",
      language: "hinglish",
      depth: "lecture",
      speed: 1,
      dailyMin: 120,
      weekdayMin: 90,
      startDate: localDayKey(t0),
      days: 60,
      examDate: new Date(t0 + 200 * 86400000).toISOString().slice(0, 10),
    },
    tasks: [
      {
        id: "p1",
        subject: "Physics",
        chapter: "Kinematics",
        topic: "",
        kind: "learn",
        date: localDayKey(t0 + 10 * 86400000),
        estMin: 60,
        status: "done",
        why: "x",
      },
      {
        id: "p2",
        subject: "Chemistry",
        chapter: "Mole",
        topic: "",
        kind: "practice",
        date: localDayKey(t0 - 2 * 86400000),
        estMin: 45,
        status: "pending",
        why: "x",
      },
    ],
  };
  s.plannerDone = { p1: true };
  return s;
}
function nearExamRich() {
  const s = richStudent();
  s.aiPlanner.profile.examDate = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  return s;
}
function lowAccuracy() {
  const s = emptyStore();
  s.attempts = Array.from({ length: 5 }, (_, i) => ({
    id: `a${i}`,
    testId: `t${i}`,
    submittedAt: Date.now() - (5 - i) * 86400000,
    result: {
      all: {
        correct: 15,
        wrong: 45,
        skipped: 0,
        marks: 15,
        neg: 0,
        time: 100,
        total: 75,
        max: 300,
        accuracy: 25,
      },
    },
  }));
  s.tests = Array.from({ length: 5 }, (_, i) => ({
    id: `t${i}`,
    name: `T${i}`,
    createdAt: Date.now(),
    duration: 180,
    questions: [],
  }));
  return s;
}
function noFocus() {
  const s = richStudent();
  return s;
}
function watchNoPractice() {
  const s = richStudent();
  return s;
}
function stalePlan() {
  const s = emptyStore();
  s.aiPlanner = {
    profile: {
      target: "jeemain",
      language: "en",
      depth: "lecture",
      speed: 1,
      dailyMin: 120,
      weekdayMin: 90,
      startDate: localDayKey(Date.now() - 100 * 86400000),
      days: 60,
    },
    tasks: Array.from({ length: 40 }, (_, i) => ({
      id: `s${i}`,
      subject: SUBJECTS[i % 3],
      chapter: `Ch${i}`,
      topic: "",
      kind: "learn",
      date: localDayKey(Date.now() - (40 - i) * 86400000),
      estMin: 60,
      status: "pending",
      why: "x",
    })),
  };
  return s;
}
function activeNoStudyTube() {
  const s = richStudent();
  return s;
}

main().catch((e) => {
  console.error("FATAL: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
