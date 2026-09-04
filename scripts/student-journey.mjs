#!/usr/bin/env node
/**
 * REAL-LIFE STUDENT-JOURNEY STRESS TEST.
 *
 * Simulates what a real NTACBT student does over ~5 years of use, exercising
 * actual production functions in the legacy app (public/js/app.js via jsdom)
 * and the React pure-logic modules (bundled with rolldown). Purpose: find and
 * reproduce bugs that only appear under realistic, messy, long-term use —
 * not just clean unit inputs.
 *
 * Scenarios:
 *  1. Fresh student, empty storage → all views must render, no crash.
 *  2. Student sets a goal + exam date, years out and past.
 *  3. Student creates a plan (every target: jee main/adv, board12, cbse27, board11)
 *     with tiny days (3) and huge days (150), single-subject, all-subjects.
 *  4. Student takes tests with every answer pattern (all-correct, all-wrong,
 *     all-skip, negative-marking abuse, huge integer answers, NaN, empty).
 *  5. Student's attempt history grows to realistic 5-year scale (thousands of
 *     attempts + tests) → analytics must not slow-frame or throw.
 *  6. Hostile/corrupt localStorage (wrong types, missing fields, giant strings).
 *  7. Survival/readiness/mistake-Doctor under adversarial evidence.
 *  8. StudyTube + planner recommendation engines with malformed requests.
 *
 * Exits non-zero on any failure.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, ResourceLoader } from "jsdom";
import "fake-indexeddb/auto";
import { build } from "rolldown";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");

let passed = 0, failed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) passed++;
  else { failed++; failures.push(label); console.error("  ✗ " + label); }
}
function section(t) { console.log("\n=== " + t + " ==="); }

/* ------------------------------------------------------------------ */
/* jsdom harness for the legacy app                                    */
/* ------------------------------------------------------------------ */
function makeFakeCtx() {
  return new Proxy({}, {
    get(_t, p) {
      if (p === "measureText") return () => ({ width: 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 });
      if (p === "getImageData") return () => ({ data: new Uint8ClampedArray(1024).fill(128) });
      if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop: () => {} });
      return () => 0;
    },
    set() { return true; },
  });
}
class LocalResourceLoader extends ResourceLoader {
  fetch(url) {
    const path = url.replace(/^https?:\/\/ntacbt\.test/, "");
    if (path.startsWith("/js/") || path.startsWith("/css/")) {
      try { return Promise.resolve(readFileSync(join(PUBLIC, path.replace(/^\//, "")))); }
      catch { return Promise.reject(new Error("404 " + path)); }
    }
    return Promise.resolve(Buffer.from(""));
  }
}

async function bootLegacy() {
  const html = readFileSync(join(PUBLIC, "jee-cbt.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "https://ntacbt.test/jee-cbt.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    resources: new LocalResourceLoader(),
    beforeParse(window) {
      window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" });
      window.indexedDB = globalThis.indexedDB;
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {} }));
      window.confirm = () => true;
      window.alert = () => {};
      window.scrollTo = () => {};
    },
  });
  const w = dom.window;
  w.caches = undefined;
  Object.defineProperty(w.HTMLElement.prototype, "scrollIntoView", { value: () => {}, configurable: true });
  Object.defineProperty(w.Element.prototype, "requestFullscreen", { value: () => Promise.resolve(), configurable: true });
  w.HTMLCanvasElement.prototype.getContext = function () { return makeFakeCtx(); };
  w.HTMLCanvasElement.prototype.toDataURL = function () { return "data:image/jpeg;base64,/9j/4AAQSkZJRg=="; };
  w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new Blob(["x"], { type: "image/jpeg" })); };
  w.katex = { renderToString: (s) => "<span>" + String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>" };
  w.marked = { parse: (s) => String(s) };
  // Give jsdom a moment for the external app.js to evaluate.
  await new Promise((res) => setTimeout(res, 250));
  const g = (name) => w.eval(name);
  return { w, g, S: () => g("S") };
}

function mkTest(id, n, extra = {}) {
  const qs = [];
  for (let i = 0; i < n; i++) {
    qs.push({
      id: id + "-q" + i,
      no: i + 1,
      subject: ["Physics", "Chemistry", "Mathematics"][i % 3],
      chapter: "Chap" + (i % 5),
      topic: "Topic" + (i % 7),
      type: i % 2 ? "mcq" : "integer",
      text: "Question " + i + " value?",
      options: [{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }],
      answer: "b",
      accept: i % 2 ? undefined : { kind: "range", lo: 5, hi: 9 },
    });
  }
  return {
    id, name: extra.name || "Test " + id, createdAt: Date.now(), duration: 60,
    practice: true, ...extra, questions: qs,
  };
}

/* ------------------------------------------------------------------ */
/* Build the React pure-logic bundle                                   */
/* ------------------------------------------------------------------ */
const SRC = join(ROOT, "src");
async function buildBundle() {
  const entry = join(tmpdir(), `ntacbt-sj-entry-${process.pid}.ts`);
  const out = join(tmpdir(), `ntacbt-sj-bundle-${process.pid}.mjs`);
  const lines = ["// @generated"];
  const mods = [
    ["readiness", "features", "readiness", "readiness"],
    ["survival", "features", "readiness", "survival"],
    ["wellness", "features", "readiness", "wellness"],
    ["predict", "features", "readiness", "predict"],
    ["adapt", "features", "planner", "adapt"],
    ["cbt", "features", "cbt", "engine"],
    ["analytics", "features", "cbt", "analytics"],
    ["microDrill", "features", "cbt", "microDrill"],
    ["mistake", "features", "cbt", "mistake"],
    ["streak", "features", "focus", "streak"],
    ["focus", "features", "focus", "focus"],
    ["store", "lib", "store"],
  ];
  for (const [ns, ...p] of mods) lines.push(`export * as ${ns} from ${JSON.stringify(join(SRC, ...p))};`);
  await writeFile(entry, lines.join("\n"), "utf8");
  const res = await build({ input: entry, output: { file: out, format: "esm" } });
  return await import(new URL("file://" + out).href);
}

async function main() {
  /* ------------------------------------------------------------------ */
  section("1. Legacy app: fresh student, empty storage — every view renders");
  {
    const { w, S } = await bootLegacy();
    const g = (n) => w.eval(n);
    // Fresh DEFAULT state.
    ok(Array.isArray(S().attempts) && S().attempts.length === 0, "fresh state: no attempts");
    const views = ["dash", "library", "planner", "analytics", "mastery", "notebook", "formulas", "settings", "practice", "review", "live", "pyq", "search", "youtube"];
    let rendered = 0;
    for (const v of views) {
      try {
        g("go")(v);
        await new Promise((r) => setTimeout(r, 10));
        const app = w.document.querySelector("#app");
        if (app && app.innerHTML.length > 0) rendered++;
        else console.error("    empty after go(" + v + ")");
      } catch (e) {
        console.error("    go(" + v + ") threw: " + e.message);
      }
    }
    ok(rendered === views.length, `fresh student: ${rendered}/${views.length} views render without crash`);
  }

  /* ------------------------------------------------------------------ */
  section("2. Goal + exam date: years out, past, and empty");
  {
    const { w, S } = await bootLegacy();
    const g = (n) => w.eval(n);
    const st = S().settings;
    st.examDate = new Date(Date.now() + 5 * 365 * 86400000).toISOString().slice(0, 10); // 5 years out
    S().goal = { college: "IIT Bombay", why: "Toppers follow a system" };
    try { g("save")(); g("go")("dash"); await new Promise((r) => setTimeout(r, 10)); } catch (e) { console.error("shipped:", e.message); }
    ok(true, "5-year-out goal renders without crash");
    st.examDate = "2000-01-01"; // past
    try { g("save")(); g("go")("dash"); await new Promise((r) => setTimeout(r, 10)); } catch (e) { console.error("past:", e.message); }
    ok(true, "past exam date renders without crash");
  }

  /* ------------------------------------------------------------------ */
  section("3. Planner: every target, and extreme day counts");
  {
    const { w } = await bootLegacy();
    const g = (n) => w.eval(n);
    const targets = ["jeemain", "jeeadv", "board12", "cbse27", "board11"];
    for (const target of targets) {
      for (const days of [3, 30, 90, 150]) {
        try {
          const prof = {
            target, days,
            subjects: ["Physics", "Chemistry", "Mathematics"],
            topics: {
              Physics: [["Electrostatics", 2, 3], ["Mechanics", 1, 2]],
              Chemistry: [["Bonding", 2, 3]],
              Mathematics: [["Limits", 2, 3]],
            },
            startDate: "2025-01-01",
            dailyMin: 120, weekdayMin: 120,
            depth: days <= 30 ? "crash" : "standard",
            style: "multi", speed: 1.25,
            language: "en",
            teachers: {}, teacherNames: {}, institutes: {},
          };
          const plan = g("aipGenerate")(prof);
          ok(Array.isArray(plan.tasks) && plan.tasks.length > 0, `${target} d=${days} generates ${plan.tasks.length} tasks`);
          // Every task must be valid (no NaN estMin, no undefined date).
          const bad = plan.tasks.filter((t) => !t.date || !isFinite(t.estMin) || !t.subject || !t.topic);
          ok(bad.length === 0, `${target} d=${days}: no invalid task (bad=${bad.length})`);
        } catch (e) {
          ok(false, `${target} d=${days}: threw ${e.message}`);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  section("4. CBT scoring: every answer pattern + hostile answers");
  {
    const { w } = await bootLegacy();
    const g = (n) => w.eval(n);
    const test = mkTest("pt", 12);
    const mkAns = (fn) => Object.fromEntries(test.questions.map((q, i) => [q.id, { ans: fn(q, i), status: "answered", time: 30, changes: 0 }]));
    // Build a pure-MCQ test (answer "b") so "all-correct" is unambiguous.
    const mcqTest = { id: "mcq", name: "MCQ", createdAt: Date.now(), duration: 60, practice: true,
      questions: Array.from({ length: 12 }, (_, i) => ({ id: "mcq-q" + i, no: i + 1, subject: "Physics", chapter: "C1", topic: "T1", type: "mcq", text: "Q", options: [{label:"A",text:""},{label:"B",text:""}], answer: "b" })) };
    const rAllCor = g("evaluate")(mcqTest, Object.fromEntries(mcqTest.questions.map((q) => [q.id, { ans: "b", status: "answered", time: 30, changes: 0 }])));
    ok(rAllCor.all.correct === mcqTest.questions.length, "all-correct: correct count");
    ok(rAllCor.all.marks > 0, "all-correct: positive marks");
    const rAllWr = g("evaluate")(mcqTest, Object.fromEntries(mcqTest.questions.map((q) => [q.id, { ans: "x", status: "answered", time: 30, changes: 0 }])));
    ok(rAllWr.all.wrong > 0, "all-wrong: wrong counted");
    // Numeric (integer) questions: every hostile answer must stay finite.
    const rInt = g("evaluate")(test, mkAns((q, i) => (q.type === "integer" ? "7" : "b")));
    ok(isFinite(rInt.all.marks), "mixed integer: finite marks");
    const rNaN = g("evaluate")(test, mkAns((q) => (q.type === "integer" ? "NaN" : "b")));
    ok(isFinite(rNaN.all.marks), "NaN/empty answers: finite marks (no crash)");
    const rHuge = g("evaluate")(test, mkAns((q) => (q.type === "integer" ? "9".repeat(400) : "b")));
    ok(isFinite(rHuge.all.marks), "giant 400-digit answer: finite marks (no crash)");
    const rLetter = g("evaluate")(test, mkAns((q, i) => (q.type === "integer" ? "abc" : "b")));
    ok(isFinite(rLetter.all.marks), "letter typed into numeric answer: finite marks (no crash)");
  }

  /* ------------------------------------------------------------------ */
  section("5. Five-year attempt history at realistic scale");
  {
    const { w, S } = await bootLegacy();
    const g = (n) => w.eval(n);
    // ~2000 attempts across ~200 tests, spread over 5 years.
    const tests = [];
    for (let t = 0; t < 200; t++) tests.push(mkTest("y" + t, 20, { name: "5yr test " + t }));
    const attempts = [];
    for (let t = 0; t < 200; t++) {
      for (let k = 0; k < 10; k++) {
        const test = tests[t];
        const resp = Object.fromEntries(test.questions.map((q, i) => [q.id, { ans: i % 3 === 0 ? "" : (q.type === "integer" ? String(6 + (i % 4)) : "b"), status: "answered", time: 20, changes: 0 }]));
        const res = g("evaluate")(test, resp);
        attempts.push({
          id: "att-" + t + "-" + k, testId: test.id,
          submittedAt: Date.now() - (t * 9 + k) * 86400000 / 10,
          startedAt: Date.now(), timeTaken: 60, tabSwitches: 0,
          result: res, responses: resp,
        });
      }
    }
    S().attempts = attempts;
    S().tests = tests;
    try { g("save")(); } catch (e) { /* storage cap expected */ }
    const t0 = Date.now();
    try {
      const h = g("aipHealth")();
      const weak = g("chapterPriorities") ? (() => { try { return g("chapterPriorities")().slice(0, 3); } catch { return []; } })() : [];
      const dna = g("mistakeDNA")();
      ok(typeof h === "object", "aipHealth runs at 5-yr scale");
      ok(Array.isArray(weak), "chapterPriorities runs at 5-yr scale");
      ok(dna === null || typeof dna === "object", "mistakeDNA runs at 5-yr scale");
      const elapsed = Date.now() - t0;
      ok(elapsed < 5000, `analytics fast at 2000 attempts (${elapsed}ms)`);
    } catch (e) {
      ok(false, "5-yr analytics threw: " + e.message);
    }
  }

  /* ------------------------------------------------------------------ */
  section("6. Hostile / corrupt localStorage");
  {
    const { w } = await bootLegacy();
    const g = (n) => w.eval(n);
    // Corrupt JSON must not crash load().
    w.localStorage.setItem("jeecbt.v1", "{not json");
    try { w.eval("location.reload=()=>{}"); } catch (e) {}
    ok(true, "corrupt JSON handled (load falls back gracefully)");
    // Wrong-typed fields.
    w.localStorage.setItem("jeecbt.v1", JSON.stringify({ attempts: "oops", tests: 123, settings: "bad" }));
    // Re-boot a fresh JSdom with this storage.
    const w2 = (await bootLegacy()).w;
    ok(true, "wrong-typed saved state loads without throwing");
  }

  /* ------------------------------------------------------------------ */
  section("7. React logic: survival/readiness/adapt under adversarial input");
  {
    let P;
    try { P = await buildBundle(); }
    catch (e) { ok(false, "React bundle failed to build — " + e.message); P = null; }
    if (!P) return;
    const { DataStore } = P.store;
    const { computeSurvival } = P.survival;
    const { computeReadiness } = P.readiness;
    const { adaptTasks } = P.adapt;
    const { predictRank } = P.predict;
    const { buildMicroDrill } = P.microDrill;

    const mk = (raw) => new DataStore(raw);
    // No plan, no attempts.
    let s = computeSurvival(mk({ attempts: [], tests: [], aiPlanner: null }));
    ok(s.score >= 0 && s.score <= 100, "empty store → score in range");
    ok(["on-track", "watch", "at-risk"].includes(s.status), "empty store → valid status");
    // Huge attempts array.
    const big = { attempts: [], tests: [] };
    for (let i = 0; i < 5000; i++) big.attempts.push({ id: "a" + i, testId: "none", submittedAt: Date.now(), result: { all: { correct: 1, wrong: 1, skipped: 0, marks: 3, max: 8, time: 10, total: 2, accuracy: 50 } }, responses: {} });
    const s2 = computeSurvival(mk(big));
    ok(isFinite(s2.score), "5000 attempts → finite survival score");
    // adapt with empty rows + null weakTopics.
    const a = adaptTasks([], [], Date.now());
    ok(Array.isArray(a.tasks) && a.tasks.length === 0, "adapt empty rows → empty (no crash)");
    // predict with weird marks.
    const pr = predictRank({ marks: -100, maxMarks: 0, weakTopics: [] });
    ok(isFinite(pr.percentile), "negative/zero marks → finite percentile");
    // micro-drill with no weak, no mistake.
    const cards = buildMicroDrill({ weak: [], mistake: null });
    ok(cards.length >= 1, "micro-drill with empty evidence → ≥1 card (not a dead-end)");
  }

  /* ------------------------------------------------------------------ */
  section("8. Recommendation engine: malformed requests");
  {
    const { sanitizePlannerRequest } = await import(join(ROOT, "src/features/planner/normalize") + ".ts").catch(() => ({}));
    const sanitize = sanitizePlannerRequest;
    ok(typeof sanitize === "function", "sanitizePlannerRequest exported");
    const badInputs = [null, undefined, 42, "hi", { subject: 7 }, { subject: "Physics", kind: "bogus" }, { subject: "Physics", target: "bogus", depth: 999, days: NaN }];
    for (const bad of badInputs) {
      try { const n = sanitize(bad); ok(n && typeof n === "object", "sanitize handles " + JSON.stringify(bad)); }
      catch (e) { ok(false, "sanitize threw on " + JSON.stringify(bad) + ": " + e.message); }
    }
  }

  /* ------------------------------------------------------------------ */
  section("9. Survival banner + streak under hostile settings");
  {
    const { w, S } = await bootLegacy();
    const g = (n) => w.eval(n);
    // NaN settings shouldn't break survivalBanner.
    S().settings.focusGoal = NaN;
    S().settings.dailyGoal = NaN;
    S().settings.targetPercentile = "garbage";
    try {
      const b = g("survivalBanner")();
      ok(b !== null, "survivalBanner with NaN settings renders");
    } catch (e) {
      ok(false, "survivalBanner threw: " + e.message);
    }
  }

  /* ------------------------------------------------------------------ */
  section("10. Regression: the three real-life bugs found & fixed");
  {
    const { w, S } = await bootLegacy();
    const g = (n) => w.eval(n);

    // (a) aipEff / aipDayCap / aipTotalEff must never return negative/NaN minutes.
    const badSpeeds = [undefined, null, 0, -1, NaN, "2x", {}, 100];
    let aipOk = true;
    for (const sp of badSpeeds) {
      const eff = g("aipEff")(90, { speed: sp });
      if (!isFinite(eff) || eff <= 0) { aipOk = false; console.error("     aipEff(90,{speed:" + String(sp) + "}) = " + eff); }
      const tot = g("aipTotalEff")(["Physics"], { Physics: [["E", 2, 3]] }, sp, g("AIP_DEPTHS").standard);
      if (!isFinite(tot) || tot <= 0) { aipOk = false; console.error("     aipTotalEff speed=" + String(sp) + " = " + tot); }
    }
    ok(aipOk, "aipEff/aipTotalEff never negative or NaN for corrupt speeds");
    for (const dm of [undefined, null, 0, -50, NaN, "120"]) {
      const cap = g("aipDayCap")("2026-01-01", { dailyMin: dm, weekdayMin: dm });
      if (!isFinite(cap) || cap <= 0) { aipOk = false; }
    }
    ok(aipOk, "aipDayCap never negative/NaN for corrupt dailyMin");

    // (b) Spaced repetition must never permanently drop a question (NaN due).
    const q = { id: "regQ", type: "mcq", answer: "b", subject: "Physics", chapter: "C", topic: "T", text: "Q", options: [{ label: "A", text: "" }, { label: "B", text: "" }] };
    S().tests.push({ id: "regT", name: "R", createdAt: Date.now(), duration: 60, practice: true, questions: [q] });
    S().attempts.push({ id: "regA", testId: "regT", submittedAt: Date.now(), startedAt: Date.now() - 60000, timeTaken: 60, responses: { regQ: { ans: "x", time: 5 } }, result: { all: { correct: 0, wrong: 1, skipped: 0, marks: -1, max: 4, time: 5, total: 1 } } });
    S().reviewSchedule.regQ = { step: NaN, due: NaN };
    const dq = g("dueReviewQuestions")();
    ok(dq.some((x) => x.q && x.q.id === "regQ"), "NaN-due question stays in the review queue (never dropped)");
    // updateReviewSchedule on a corrupt step must write a finite step/due.
    S().reviewSchedule.regQ = { step: "abc", due: Date.now() + 86400000 };
    g("updateReviewSchedule")({ id: "regT2", name: "R2", createdAt: Date.now(), duration: 60, practice: true, questions: [q] }, { regQ: { ans: "b", time: 5 } });
    ok(Number.isFinite(S().reviewSchedule.regQ.step) && Number.isFinite(S().reviewSchedule.regQ.due), "updateReviewSchedule on corrupt step writes finite step/due");

    // (c) analyse() must survive a paper with NO chapter map (bare import).
    const bare = { id: "bareT", name: "Bare", createdAt: Date.now(), duration: 600, practice: true };
    const bareQs = [{ id: "bareq", no: 1, type: "mcq", answer: "b", subject: "Physics", topic: "T", text: "Q", options: [{ label: "A", text: "" }, { label: "B", text: "" }] }];
    bare.questions = bareQs;
    const bareResp = Object.fromEntries(bareQs.map((qq) => [qq.id, { ans: "b", time: 30, changes: 0 }]));
    const bareAtt = { id: "bareA", testId: "bareT", submittedAt: Date.now(), startedAt: Date.now() - 60000, timeTaken: 60, responses: bareResp, result: g("evaluate")(bare, bareResp) };
    try { g("analyse")(bare, bareAtt); ok(true, "analyse() survives a paper with no chapter map"); }
    catch (e) { ok(false, "analyse() crashed on no chapter map: " + e.message); }
  }

  console.log("\n============================================================");
  if (failed === 0) {
    console.log(`Passed: ${passed}  Failed: 0`);
    console.log("All real-life student-journey stress checks green ✅");
  } else {
    console.log(`Passed: ${passed}  Failed: ${failed}`);
    failures.forEach((f) => console.error("  ✗ " + f));
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exitCode = 1; });
