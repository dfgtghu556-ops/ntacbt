#!/usr/bin/env node
/**
 * ROBOT-SIMULATED TEST HARNESS — Someshwar JEE Main CBT Platform
 * ------------------------------------------------------------------
 * Loads the real, single-file app (public/jee-cbt.html) into a headless
 * JSDOM environment and drives it through the core user journeys exactly
 * the way a user (and the app's own code) would:
 *
 *   1. BUILD & SCORING    — build a 75-question test, evaluate a mixed
 *                           answer sheet, verify the JEE Main marking math
 *                           (+4 correct / -1 wrong / 0 skipped) and the
 *                           2026 rule that NUMERICAL questions have NO
 *                           negative marking.
 *   2. EXAM FLOW (UI)     — start a test, click through questions in the
 *                           real exam DOM, submit, verify the attempt is
 *                           recorded, scored and persisted.
 *   3. PDF → TEST (upload)— feed a SYNTHETIC paper (2 of the supported
 *                           formats: MCQ + integer, answer key, solutions)
 *                           through parsePaper() and verify it becomes a
 *                           clean question list, then a working test.
 *   4. ANALYTICS          — verify analyse() / mistakeDNA() / percentile /
 *                           rank produce sane, consistent numbers.
 *
 * Usage:  node scripts/robot-test.mjs [path/to/jee-cbt.html]
 * Exits non-zero on any failed assertion (CI-friendly).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(process.argv[2] || join(__dirname, "..", "public", "jee-cbt.html"));
const html = readFileSync(htmlPath, "utf8");

/* ------------------------------------------------------------------ */
/* Small test framework                                                */
/* ------------------------------------------------------------------ */
let passed = 0, failed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { passed++; console.log("  ✓ " + label); }
  else { failed++; failures.push(label); console.error("  ✗ FAIL: " + label); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(a === e, `${label} (got ${a}, want ${e})`);
}

/* ------------------------------------------------------------------ */
/* A no-op 2D canvas context so chart / crop code never crashes in jsdom */
/* ------------------------------------------------------------------ */
function makeFakeCtx() {
  const target = new Proxy({}, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 });
      if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(1024).fill(128) });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop: () => {} });
      return (..._a) => 0;
    },
    set() { return true; },
  });
  return target;
}

/* ------------------------------------------------------------------ */
/* Build the JSDOM instance with the app's browser APIs stubbed        */
/* ------------------------------------------------------------------ */
const dom = new JSDOM(html, {
  url: "https://ntacbt.test/jee-cbt.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  resources: undefined, // do NOT fetch the deferred CDN libs or Google fonts
  // CRITICAL: stub browser globals BEFORE the app's inline script runs.
  // The app calls matchMedia() at the top level of its script; if the stub
  // is applied only after JSDOM construction, the script halts there and
  // every top-level `const`/`let` declared after that line (ONB_LS,
  // AICHAT_LS, the onboarding helpers…) stays in the temporal dead zone.
  beforeParse(window) {
    window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" });
    window.indexedDB = globalThis.indexedDB;
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {} }));
    window.confirm = () => true;
    window.alert = () => {};
  },
});
const w = dom.window;

w.caches = undefined;
Object.defineProperty(w.HTMLElement.prototype, "scrollIntoView", { value: () => {}, configurable: true });
Object.defineProperty(w.Element.prototype, "requestFullscreen", { value: () => Promise.resolve(), configurable: true });
Object.defineProperty(w.Document.prototype, "exitFullscreen", { value: () => Promise.resolve(), configurable: true });
w.HTMLCanvasElement.prototype.getContext = function () { return makeFakeCtx(); };
w.HTMLCanvasElement.prototype.toDataURL = function () { return "data:image/jpeg;base64,/9j/4AAQSkZJRg=="; };
w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new Blob(["x"], { type: "image/jpeg" })); };

// Math + markdown shims (only used at render time; keep them inert).
w.katex = { renderToString: (s) => "<span>" + String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>" };
w.marked = { parse: (s) => String(s) };
// pdf.js shim installed lazily by the PDF→test scenario (window.pdfjsLib).

// Wait for the app's inline script to finish executing.
await new Promise((res) => setTimeout(res, 300));

// Grab the app's globals. Function declarations are window props, but
// `let`/`const` globals (S, EX, DEFAULT, LS, uid, cq, res…) are NOT — they
// live in the script's global lexical scope, readable only via w.eval().
// `g(name)` works uniformly for both, so all access goes through it.
const g = (name) => w.eval(name);
const A = {
  buildTest: (n, p) => g("buildTest")(n, p),
  evaluate: (t, r) => g("evaluate")(t, r),
  parsePaper: (f, s, p) => g("parsePaper")(f, s, p),
  analyse: (t, a) => g("analyse")(t, a),
  analyseCached: (t, a) => g("analyseCached")(t, a),
  mistakeDNA: () => g("mistakeDNA")(),
  ntaPercentile: (m) => g("ntaPercentile")(m),
  ntaRank: (p) => g("ntaRank")(p),
  startExam: (id, r) => g("startExam")(id, r),
  submitExam: (a) => g("submitExam")(a),
  endExamUI: () => g("endExamUI")(),
  isRight: (q, a) => g("isRight")(q, a),
  drawQuestion: () => g("drawQuestion")(),
  uid: () => g("uid")(),
};
const S = () => g("S"); // live reference to app state
const DEFAULT = () => g("DEFAULT");
const LS = () => g("LS");
const EX = () => g("EX");

const SUBJECTS = ["Physics", "Chemistry", "Mathematics"];

/* ------------------------------------------------------------------ */
/* Helpers to build realistic subject packs (25 questions each)        */
/* ------------------------------------------------------------------ */
function makeQuestions(subject, n = 25, opts = {}) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const isInteger = opts.integerSet ? opts.integerSet.includes(i) : (i % 5 === 0);
    const answer = isInteger ? String(10 + i) : "abcd"[(i - 1) % 4];
    const q = {
      id: subj2id(subject) + "-q" + i,
      subject,
      no: i,
      printedNo: i,
      text: `${subject} question number ${i} about topic T${i} (chapter C${i % 7 + 1})`,
      chapter: "C" + (i % 7 + 1),
      solText: "Step-by-step solution for Q" + i,
      type: isInteger ? "integer" : "mcq",
      answer,
      options: isInteger ? [] : ["a", "b", "c", "d"].map((l) => ({ label: l, text: `${l}) Option text for Q${i}` })),
    };
    out.push(q);
  }
  return out;
}
let _idc = 0;
function subj2id(s) { return String(++_idc); }

function makeTest(name = "Robot Mock #1") {
  const packs = {};
  SUBJECTS.forEach((s) => (packs[s] = makeQuestions(s)));
  const t = w.buildTest(name, packs);
  t.practice = true; // skip the NTA instructions modal in tests
  return t;
}

/* ------------------------------------------------------------------ */
/* 1. BUILD & SCORING                                                  */
/* ------------------------------------------------------------------ */
console.log("\n== 1. Build & scoring ==");
{
  const t = makeTest();
  eq(t.questions.length, 75, "buildTest merges 25×3 = 75 questions");
  const order = SUBJECTS.map((s) => t.questions.filter((q) => q.subject === s).length);
  eq(order, [25, 25, 25], "25 questions per subject, in Physics→Chemistry→Maths order");

  // Answer sheet: 15 Physics MCQ correct, 5 Physics MCQ wrong,
  // all 15 integer questions correct, everything else skipped.
  const resp = {};
  t.questions.forEach((q) => {
    resp[q.id] = { ans: null, status: "notvisited", time: 0 };
  });
  const phyMcq = t.questions.filter((q) => q.subject === "Physics" && q.type === "mcq");
  const phyInt = t.questions.filter((q) => q.subject === "Physics" && q.type === "integer");
  phyMcq.slice(0, 15).forEach((q) => { resp[q.id].ans = q.answer; resp[q.id].status = "answered"; });
  phyMcq.slice(15, 20).forEach((q) => {
    const wrong = "abcd".split("").find((l) => l !== q.answer) || "a";
    resp[q.id].ans = wrong; resp[q.id].status = "answered";
  });
  phyInt.forEach((q) => { resp[q.id].ans = q.answer; resp[q.id].status = "answered"; });
  t.questions.filter((q) => q.type === "integer" && q.subject !== "Physics").forEach((q) => { resp[q.id].ans = q.answer; resp[q.id].status = "answered"; });

  const r = A.evaluate(t, resp);
  // 15 correct MCQ + 15 integer correct = 30 correct → 120 marks; 5 wrong MCQ → -5
  eq(r.all.correct, 30, "30 correct answers");
  eq(r.all.wrong, 5, "5 wrong answers");
  eq(r.all.marks, 115, "marks = 30×4 − 5×1 = 115");
  eq(r.all.accuracy, Math.round(30 / 35 * 1000) / 10, "accuracy = 30/35");
  eq(r.per.Physics.total, 25, "physics bucket totals 25");
  eq(r.per.Mathematics.correct, 5, "maths: 5 integer correct");
}

/* ------------------------------------------------------------------ */
/* 1b. JEE Main 2026: numerical questions have NO negative marking     */
/* ------------------------------------------------------------------ */
console.log("\n== 1b. Numerical questions: no negative marking (2026 rule) ==");
{
  const t = makeTest("Neg Marking Rule");
  // One MCQ wrong (−1) + one integer wrong (0): net −1 on 2 wrong answers.
  const mcq = t.questions.find((q) => q.type === "mcq");
  const integer = t.questions.find((q) => q.type === "integer");
  const resp = {};
  t.questions.forEach((q) => (resp[q.id] = { ans: null, status: "notvisited", time: 0 }));
  resp[mcq.id].ans = mcq.answer === "a" ? "b" : "a";        // wrong MCQ
  resp[integer.id].ans = String(Number(integer.answer) + 1); // wrong integer
  resp[integer.id].status = "answered";
  resp[mcq.id].status = "answered";

  const r = A.evaluate(t, resp);
  eq(r.all.wrong, 2, "2 wrong answers recorded");
  eq(r.all.marks, -1, "wrong MCQ −1, wrong integer −0 → net −1");
  eq(r.all.neg, 1, "total negative marking = 1 (MCQ only)");
}

/* ------------------------------------------------------------------ */
/* 2. FULL EXAM FLOW (drives the real exam DOM + submit)               */
/* ------------------------------------------------------------------ */
console.log("\n== 2. Exam flow (UI) ==");
{
  const t = makeTest("Robot Exam");
  S().tests.push(t);
  S().settings = Object.assign({}, DEFAULT().settings, S().settings || {});
  S().settings.strictMode = false;

  A.startExam(t.id);
  ok(EX() && EX().test.id === t.id, "startExam opens the live exam with the right test");
  ok(!w.document.getElementById("examView").classList.contains("hide"), "exam view is visible");

  // Answer every question through the DOM: click the correct option for MCQs,
  // type into the numeric input for integers, then Save & Next.
  for (let i = 0; i < t.questions.length; i++) {
    EX().cur = i;
    A.drawQuestion();
    const q = EX().test.questions[i];
    if (q.type === "mcq") {
      const rows = [...w.document.querySelectorAll("#exQ .optrow")];
      const target = rows.find((row) => row.querySelector(".optlab").textContent === String(q.answer).toUpperCase());
      ok(!!target, `Q${i + 1} correct option row present`);
      target.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    } else {
      const inp = w.document.querySelector("#exQ input[type=text]");
      inp.value = String(q.answer);
      inp.dispatchEvent(new w.Event("input", { bubbles: true }));
    }
  }
  // Verify the attempt recorded answers for all 75 before submitting
  const answered = Object.values(EX().attempt.responses).filter((r) => r.ans != null && r.ans !== "").length;
  eq(answered, 75, "all 75 questions answered via UI");

  A.submitExam(false);
  const all = S().attempts;
  const last = all[all.length - 1];
  ok(!!last && !!last.submittedAt, "submitExam records a submitted attempt");
  eq(last.result.all.marks, 300, "perfect paper scores 75×4 = 300");
  eq(last.result.all.correct, 75, "75 correct, 0 wrong");
  ok(last.result.per.Physics && last.result.per.Mathematics, "subject-wise result present");
  // Persistence round-trip
  const saved = JSON.parse(w.localStorage.getItem(LS()) || "{}");
  ok((saved.attempts || []).some((a) => a.id === last.id), "attempt persisted to localStorage");
}

/* ------------------------------------------------------------------ */
/* 2b. On-screen calculator (NTA 2026 feature)                         */
/* ------------------------------------------------------------------ */
console.log("\n== 2b. On-screen calculator ==");
{
  const t = makeTest("Calculator Test");
  S().tests.push(t);
  S().settings.strictMode = false;
  A.startExam(t.id);

  // Move to the first numerical question.
  const intIdx = t.questions.findIndex((q) => q.type === "integer");
  EX().cur = intIdx;
  A.drawQuestion();

  // Open the calculator from the header button.
  const btn = w.document.getElementById("exCalcBtn");
  btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const panel = w.document.getElementById("exCalc");
  ok(!panel.classList.contains("hide"), "calculator opens from the header");
  ok(panel.querySelectorAll("#exCalcKeys button").length >= 20, "calculator keypad built");

  // 12 + 3 = 15
  const press = (label) => {
    const b = [...w.document.querySelectorAll("#exCalcKeys button")].find((x) => x.textContent === label);
    b.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  };
  press("1"); press("2"); press("+"); press("3"); press("=");
  eq(w.document.getElementById("exCalcDisp").textContent, "15", "12 + 3 = 15 on the calc display");

  // Insert into the numerical answer input.
  const insBtn = w.document.getElementById("exCalcInsert");
  ok(insBtn.disabled === false, "Insert enabled on a numerical question");
  insBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const inp = w.document.querySelector("#exQ input[type=text]");
  eq(inp.value, "15", "calculator result inserted into the numerical answer box");
  eq(EX().attempt.responses[t.questions[intIdx].id].ans, "15", "inserted answer recorded in the attempt");

  // Keyboard support + Escape closes.
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(panel.classList.contains("hide"), "Escape closes the calculator");
  A.endExamUI();
}

/* ------------------------------------------------------------------ */
/* 2c. First-run onboarding (beginner → advanced orientation)          */
/* ------------------------------------------------------------------ */
console.log("\n== 2c. First-run onboarding ==");
{
  // simulate a brand-new user: no onboarding flag; snapshot shared state
  // so later scenarios (analytics) still see their own history.
  const prevTests = g("S").tests, prevAttempts = g("S").attempts;
  w.localStorage.removeItem("jeecbt.onboarded.v1");
  g("S").tests = [];
  g("S").attempts = [];
  // Remove any guide the boot timer may have shown during earlier scenarios,
  // then call the app's own first-run hook — exactly the real flow a new
  // user hits on load (the boot timer runs the same showOnboarding()).
  w.document.querySelectorAll(".onb-modal").forEach((x) => x.remove());
  w.eval("showOnboarding()");
  const modal = w.document.querySelector(".onb-modal");
  ok(!!modal, "Getting-Started guide opens for a new user");
  if (modal) {
    const steps = modal.querySelectorAll(".onb-step");
    ok(steps.length === 5, "guide has 5 actionable steps");
    const doneBtn = modal.querySelector("[data-done]");
    doneBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    ok(!w.document.querySelector(".onb-modal"), "guide dismisses cleanly");
    ok(w.localStorage.getItem("jeecbt.onboarded.v1") === "1", "dismissal is remembered (won't nag again)");
  }
  g("S").tests = prevTests;
  g("S").attempts = prevAttempts;
}

/* ------------------------------------------------------------------ */
/* 2d. First-run auto-show + no re-open after dismiss (boot timer)     */
/* ------------------------------------------------------------------ */
console.log("\n== 2d. Onboarding guard (auto-show + no re-open after dismissal) ==");
{
  // A genuinely new user (flag cleared) gets the guide auto-shown by the
  // boot hook's 900ms timer shortly after load. (The app already scheduled
  // one such timer at boot; any that fired during earlier scenarios have
  // had their modals removed, so a fresh call schedules exactly one.)
  w.localStorage.removeItem("jeecbt.onboarded.v1");
  w.document.querySelectorAll(".onb-modal").forEach((x) => x.remove());
  w.eval("maybeOnboard()");          // schedules the 900ms auto-show timer
  await new Promise((r2) => setTimeout(r2, 1000));
  const autoShown = w.document.querySelectorAll(".onb-modal").length > 0;
  ok(autoShown, "new user auto-sees the guide after load");
  // Dismiss every auto-shown modal and confirm the flag is persisted.
  w.document.querySelectorAll(".onb-modal").forEach((x) => x.querySelector("[data-done]") && x.querySelector("[data-done]").dispatchEvent(new w.MouseEvent("click", { bubbles: true })));
  ok(w.localStorage.getItem("jeecbt.onboarded.v1") === "1", "auto guide dismissal is persisted");
  // A returning visitor (flag now set) is never auto-nagged again: re-run
  // the boot hook and wait out its timer — the guide must NOT come back.
  w.eval("maybeOnboard()");
  await new Promise((r2) => setTimeout(r2, 1000));
  ok(!w.document.querySelector(".onb-modal"), "dismissed user never auto-sees the guide again");
  w.localStorage.removeItem("jeecbt.onboarded.v1"); // keep state clean for later scenarios
}

/* ------------------------------------------------------------------ */
/* 3. PDF → TEST (synthetic paper through the real parser)             */
/* ------------------------------------------------------------------ */
console.log("\n== 3. PDF → test (parser) ==");
{
  // Build a synthetic "PDF": 25 single-column questions (20 MCQ + 5 integer),
  // an answer-key table and a solutions section.
  const W = 595, H = 842;
  const items = [];
  const blocksPerPage = 8;
  const qCount = 25;
  const answers = [];
  for (let i = 1; i <= qCount; i++) {
    const isInteger = i % 5 === 0;
    const page = Math.ceil(i / blocksPerPage);
    const pos = i - (page - 1) * blocksPerPage;
    const startY = 70 + (pos - 1) * 62;
    items.push({ page, item: { str: `${i}.`, transform: [1, 0, 0, 12, 20, -(H - startY)], x: 20, y: startY } });
    items.push({ page, item: { str: `Physics synthetic question number ${i} about Newton's laws.`, transform: [1, 0, 0, 12, 70, 0], x: 70, y: startY + 12 } });
    if (!isInteger) {
      ["a", "b", "c", "d"].forEach((l, oi) => {
        const oy = startY + 30 + oi * 7;
        items.push({ page, item: { str: `(${l})`, transform: [1, 0, 0, 12, 60, 0], x: 60, y: oy } });
        items.push({ page, item: { str: `Option ${l.toUpperCase()} text`, transform: [1, 0, 0, 12, 80, 0], x: 80, y: oy } });
      });
      answers.push("abcd"[(i - 1) % 4]);
    } else {
      answers.push(String(10 + i));
    }
  }
  // Answer key page
  const akPage = 4;
  items.push({ page: akPage, item: { str: "ANSWER KEY", transform: [1, 0, 0, 12, 60, 0], x: 60, y: 100 } });
  for (let i = 0; i < qCount; i++) {
    items.push({ page: akPage, item: { str: String(i + 1), transform: [1, 0, 0, 12, 40 + i * 20, 0], x: 40 + i * 20, y: 140 } });
  }
  for (let i = 0; i < qCount; i++) {
    items.push({ page: akPage, item: { str: answers[i], transform: [1, 0, 0, 12, 40 + i * 20, 0], x: 40 + i * 20, y: 162 } });
  }
  // Solutions page
  const solPage = 5;
  items.push({ page: solPage, item: { str: "SOLUTIONS", transform: [1, 0, 0, 12, 60, 0], x: 60, y: 100 } });
  for (let i = 1; i <= qCount; i++) {
    items.push({ page: solPage, item: { str: `${i}.`, transform: [1, 0, 0, 12, 12, 0], x: 12, y: 120 + i * 16 } });
    items.push({ page: solPage, item: { str: `Full solution text for question ${i}.`, transform: [1, 0, 0, 12, 40, 0], x: 40, y: 120 + i * 16 } });
  }

  const pageCount = Math.max(akPage, solPage, Math.ceil(qCount / blocksPerPage));
  const numPages = pageCount;
  const pages = {};
  for (let n = 1; n <= numPages; n++) {
    pages[n] = {
      getViewport: ({ scale }) => ({ width: W * (scale || 1), height: H * (scale || 1) }),
      getTextContent: async () => ({
        items: items.filter((it) => it.page === n).map((it) => ({
          str: it.item.str,
          // PDF.js text transform: [a,b,c,d,e,f] where e=x, f=bottom-origin y.
          // pageItems() computes top-origin y = viewport.height - f, so f = H - item.y.
          transform: [1, 0, 0, it.item.h || 12, it.item.x, H - it.item.y],
        })),
      }),
      render: () => ({ promise: Promise.resolve() }),
    };
  }
  w.pdfjsLib = {
    getDocument: () => ({ numPages, promise: Promise.resolve({ numPages, getPage: async (n) => pages[n] }) }),
  };

  const fakeFile = {
    name: "physics.pdf",
    type: "application/pdf",
    arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer, // "%PDF" — ignored by the fake backend
  };

  const questions = await A.parsePaper(fakeFile, "Physics", (msg) => { /* progress */ });
  eq(questions.length, 25, "parser found all 25 questions");
  const mcqCount = questions.filter((q) => q.type === "mcq").length;
  const intCount = questions.filter((q) => q.type === "integer").length;
  eq(mcqCount, 20, "20 MCQ questions");
  eq(intCount, 5, "5 integer questions");
  const hasAnswer = questions.filter((q) => q.answer != null && q.answer !== "").length;
  eq(hasAnswer, 25, "all 25 questions got an answer from the key");
  // Verify a couple of specific answers mapped to the right question numbers
  ok(questions.some((q) => q.no === 1 && q.answer === "a"), "Q1 answer mapped correctly");
  ok(questions.some((q) => q.no === 5 && q.type === "integer" && q.answer === "15"), "Q5 integer answer mapped correctly");
  const hasSol = questions.filter((q) => q.solText).length;
  eq(hasSol, 25, "solutions attached to all questions");
  const t = w.buildTest("Parsed Paper", { Physics: questions, Chemistry: [], Mathematics: [] });
  eq(t.questions.length, 25, "parsed questions build into a working test");
}

/* ------------------------------------------------------------------ */
/* 4. ANALYTICS (percentile, rank, mistake DNA)                        */
/* ------------------------------------------------------------------ */
console.log("\n== 4. Analytics ==");
{
  ok(A.ntaPercentile(0) === 0.84, "0 marks → 0.84 percentile (real anchor)");
  ok(A.ntaPercentile(300) >= 99, "perfect → ~100 percentile");
  ok(A.ntaPercentile(160) > 98 && A.ntaPercentile(160) < 99.1, "160 marks → ~99 percentile (real anchor)");
  ok(A.ntaRank(99.5) > 1000 && A.ntaRank(99.5) < 50000, "rank formula sane for 99.5 pct");

  // Build a real attempted+submitted history to test analyse() + mistakeDNA().
  const t = makeTest("Analytics Test");
  S().tests.push(t);
  const resp = {};
  t.questions.forEach((q) => (resp[q.id] = { ans: null, status: "notvisited", time: 0 }));
  // 20 correct, 10 wrong (all in Physics, tagged 'calculation'), rest skipped
  const phyMcq = t.questions.filter((q) => q.subject === "Physics" && q.type === "mcq");
  phyMcq.slice(0, 10).forEach((q) => { resp[q.id].ans = q.answer; resp[q.id].status = "answered"; });
  t.questions.filter((q) => q.subject === "Chemistry" && q.type === "mcq").slice(0, 10).forEach((q) => { resp[q.id].ans = q.answer; resp[q.id].status = "answered"; });
  phyMcq.slice(10, 20).forEach((q) => { resp[q.id].ans = q.answer === "a" ? "b" : "a"; resp[q.id].status = "answered"; });
  const attempt = {
    id: A.uid(), testId: t.id, startedAt: Date.now(), submittedAt: Date.now(),
    responses: resp, result: A.evaluate(t, resp), tabSwitches: 0,
  };
  S().attempts.push(attempt);
  S().qtags = S().qtags || {};
  phyMcq.slice(10, 20).forEach((q) => (S().qtags[q.id] = "calculation"));

  const ai = A.analyse(t, attempt);
  ok(ai && typeof ai.percentile === "number", "analyse() returns a percentile");
  ok(ai && Array.isArray(ai.weakCh), "analyse() lists weak chapters");
  ok(ai && ai.weakCh.length >= 1, "analyse() finds at least one weak chapter");
  eq(attempt.result.all.correct, 20, "20 correct in history");
  eq(attempt.result.all.wrong, 10, "10 wrong in history");

  const dna = A.mistakeDNA();
  ok(!!dna, "mistakeDNA() detects a real pattern");
  ok(dna.tag === "calculation" && dna.sub === "Physics", "detects Physics × calculation cluster");
}

/* ------------------------------------------------------------------ */
console.log("\n──────────────────────────────────────────────");
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
if (failed) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
} else {
  console.log("All robot-simulated checks green. ✅");
  process.exit(0);
}
