#!/usr/bin/env node
/**
 * 24-PACK VALIDATION — drives the REAL legacy app (public/jee-cbt.html +
 * public/js/app.js) in JSDOM through every shipped feature: recovery, backlog
 * protocol, SRS, recall-first, flashcards, formula drill, mixed bag, own-test,
 * habits, targets, sprint, batch sync, commitments, countdown, briefing,
 * badges, autopsy, ritual+gate, parent report, exports, backup, reminders,
 * insights, multi-plan slots + the pure engines underneath.
 *
 * Method: UI clicks prove the wiring; window.eval(S / engines) proves state
 * truth (app.js is a classic script, so top-level bindings are reachable).
 * Same-origin fetch is disk-backed (PYQ papers are REAL); everything else
 * 404s. Exits non-zero on any failed assertion.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"));
const { JSDOM, ResourceLoader, VirtualConsole } = require("jsdom");
require("fake-indexeddb/auto");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "public", "jee-cbt.html"), "utf8");

let passed = 0, failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? "  [" + extra + "]" : "")); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const DAY = 86400000;
const tKey = (d) => {
  const x = new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
};
const NOW = Date.now(), TK = tKey(NOW);
const DS = (off) => tKey(NOW + off * DAY);

class LocalLoader extends ResourceLoader {
  fetch(url) {
    const u = new URL(String(url));
    if (u.origin === "https://ntacbt.test") {
      try { return Promise.resolve(readFileSync(join(ROOT, "public", decodeURIComponent(u.pathname)))); }
      catch { return Promise.resolve(Buffer.from("")); }
    }
    return Promise.resolve(Buffer.from(""));
  }
}

async function boot({ seed = null, hash = "#planner" } = {}) {
  const errors = [], viewErrors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push("jsdom: " + String(e.message || e).slice(0, 200)));
  vc.on("error", (...a) => {
    const s = a.map(String).join(" ").slice(0, 300);
    if (s.includes("[view:")) viewErrors.push(s);
    else errors.push("console: " + s);
  });
  const dom = new JSDOM(HTML, {
    url: "https://ntacbt.test/jee-cbt.html" + hash,
    runScripts: "dangerously", pretendToBeVisual: true,
    resources: new LocalLoader(), virtualConsole: vc,
    beforeParse(window) {
      if (seed !== null) window.localStorage.setItem("jeecbt.v1", JSON.stringify(seed));
      window.fetch = async (input, init) => {
        const u = new URL(String(input), "https://ntacbt.test/jee-cbt.html");
        if (u.origin === "https://ntacbt.test" && (!init || !init.method || init.method === "GET")) {
          try {
            const s = readFileSync(join(ROOT, "public", decodeURIComponent(u.pathname))).toString("utf8");
            return { ok: true, status: 200, json: async () => JSON.parse(s), text: async () => s };
          } catch { /* fall through to 404 */ }
        }
        return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
      };
      window.indexedDB = globalThis.indexedDB;
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      window.confirm = () => true;
      window.alert = () => {};
      window.Notification = function () {};
      window.onerror = (m) => errors.push("window: " + String(m).slice(0, 200));
      // canvas: absorb all drawing (charts, wallpaper export)
      window.HTMLCanvasElement.prototype.getContext = function () {
        window.__ctxCalls = (window.__ctxCalls || 0) + 1;
        return new Proxy({}, { get: (t, k) => (typeof k === "string" ? (...a) => {} : undefined), set: () => true });
      };
      window.HTMLCanvasElement.prototype.toDataURL = function () { return "data:image/png;base64,STUB"; };
      window.URL.createObjectURL = (b) => { (window.__blobs = window.__blobs || []).push(b); return "blob:stub" + window.__blobs.length; };
      window.URL.revokeObjectURL = () => {};
      const origClick = window.HTMLAnchorElement.prototype.click;
      window.HTMLAnchorElement.prototype.click = function () {
        const h = this.getAttribute("href") || "";
        if (h.startsWith("blob:") || h.startsWith("data:")) {
          (window.__dl = window.__dl || []).push({ href: h.slice(0, 40), name: this.getAttribute("download") || "" });
          return;
        }
        return origClick.call(this);
      };
      Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { value: () => {}, configurable: true });
      window.scrollTo = () => {}; window.scrollBy = () => {}; window.scroll = () => {};
      window.katex = { renderToString: (s) => "<span>" + String(s).slice(0, 80) + "</span>" };
      window.marked = { parse: (s) => String(s) };
    },
  });
  const w = dom.window;
  await sleep(1500);
  try {
    const wb = [...w.document.querySelectorAll(".modal button")].find((b) => /got it|let'?s start/i.test(b.textContent || ""));
    if (wb) { wb.click(); await sleep(150); }
  } catch {}
  const g = (expr) => w.eval(expr);
  return {
    w, g, errors, viewErrors,
    async close() { try { await sleep(120); dom.window.close(); } catch {} },
    S(path) { try { return g(`S.${path}`); } catch { return undefined; } },
    text() { return (w.document.body.textContent || "").replace(/\s+/g, " "); },
    toasts() { return [...w.document.querySelectorAll(".toast")].map((t) => t.textContent || ""); },
    errorCard() { return (w.document.body.textContent || "").includes("Ye page load nahi ho paya"); },
    btn(txt) { return [...w.document.querySelectorAll("button")].find((b) => (b.textContent || "").includes(txt)); },
    async gotoAI() {
      const b = [...w.document.querySelectorAll(".ptabs button")].find((x) => (x.textContent || "").includes("AI Planner"));
      if (b) { b.click(); await sleep(500); return true; }
      return false;
    },
    async backToPlanner() { g(`go("planner")`); await sleep(400); await this.gotoAI(); },
  };
}

/* ---------------- factories ---------------- */
const OPTS = [{ label: "A", text: "opt a" }, { label: "B", text: "opt b" }, { label: "C", text: "opt c" }, { label: "D", text: "opt d" }];
const Q = (id, subject, chapter, no) => ({
  id, no, subject, chapter, topic: chapter, type: "mcq",
  text: `Question ${id} about ${chapter}?`, options: OPTS, answer: "b",
});
function bankTests() {
  const qs = [];
  ["Kinematics", "Kinematics", "Kinematics", "Kinematics"].forEach((c, i) => qs.push(Q("k" + i, "Physics", c, i + 1)));
  ["Laws of Motion", "Laws of Motion", "Laws of Motion", "Laws of Motion"].forEach((c, i) => qs.push(Q("l" + i, "Physics", c, i + 5)));
  ["Mole Concept", "Mole Concept", "Mole Concept"].forEach((c, i) => qs.push(Q("m" + i, "Chemistry", c, i + 9)));
  ["Quadratic Equations", "Quadratic Equations", "Quadratic Equations"].forEach((c, i) => qs.push(Q("q" + i, "Mathematics", c, i + 12)));
  return [
    { id: "jt-bank", name: "24pack bank", createdAt: NOW - 10 * DAY, duration: 3600, practice: true, questions: qs },
  ];
}
// library-style mock (non-practice shows the NTA instructions screen);
// pushed in-memory post-boot like a cloud-fetched test
function mockTest() {
  const mockQs = [Q("mk0", "Physics", "Kinematics", 1), Q("mk1", "Physics", "Laws of Motion", 2), Q("mk2", "Chemistry", "Mole Concept", 3), Q("mk3", "Mathematics", "Quadratic Equations", 4), Q("mk4", "Physics", "Kinematics", 5), Q("mk5", "Chemistry", "Mole Concept", 6)];
  return { id: "jt-mock", name: "JEE Mock 1", createdAt: NOW - 2 * DAY, duration: 10800, questions: mockQs };
}
function planSeed() {
  return {
    profile: {
      subjects: ["Physics", "Chemistry", "Mathematics"],
      topics: { Physics: [["Kinematics", 2, 3], ["Laws of Motion", 2, 3]], Chemistry: [["Mole Concept", 2, 3]], Mathematics: [["Quadratic Equations", 2, 3]] },
      days: 30, dailyMin: 240, target: "jeemain", depth: "standard",
      language: "hinglish", speed: 1.25, style: "weekly",
      channels: {}, institutes: {}, teachers: {}, teacherNames: {}, startDate: DS(-5),
    },
    tasks: [
      { id: "t-od1", subject: "Physics", topic: "Kinematics", kind: "learn", diff: 2, wt: 2, depth: "lecture", estMin: 60, status: "todo", date: DS(-3) },
      { id: "t-od2", subject: "Chemistry", topic: "Mole Concept", kind: "revision", diff: 2, wt: 2, depth: "lecture", estMin: 30, status: "todo", date: DS(-2) },
      { id: "t-prev", subject: "Chemistry", topic: "Mole Concept", kind: "learn", diff: 2, wt: 2, depth: "lecture", estMin: 45, status: "done", date: DS(-1), completedAt: NOW - DAY, actualMin: 25 },
      { id: "t-cur1", subject: "Physics", topic: "Laws of Motion", kind: "learn", diff: 2, wt: 2, depth: "lecture", estMin: 60, status: "todo", date: TK },
      { id: "t-cur2", subject: "Mathematics", topic: "Quadratic Equations", kind: "revision", diff: 2, wt: 2, depth: "lecture", estMin: 30, status: "todo", date: TK },
      { id: "t-cur3", subject: "Chemistry", topic: "Mole Concept", kind: "practice", diff: 2, wt: 2, depth: "lecture", estMin: 20, status: "done", date: TK, completedAt: NOW - 3600000, actualMin: 18 },
      { id: "t-cur4", subject: "Physics", topic: "Kinematics", kind: "practice", diff: 2, wt: 2, depth: "lecture", estMin: 20, status: "todo", date: TK },
      { id: "t-tom", subject: "Mathematics", topic: "Quadratic Equations", kind: "learn", diff: 2, wt: 2, depth: "lecture", estMin: 60, status: "todo", date: DS(1) },
      { id: "t-tom2", subject: "Physics", topic: "Full Mock", kind: "test", diff: 2, wt: 2, depth: "lecture", estMin: 180, status: "todo", date: DS(2) },
    ],
    createdAt: NOW - 5 * DAY, actual: {},
  };
}
const srsSeed = () => ({
  "Physics||Kinematics": { s: 1.2, d: 0.4, due: NOW - 5000, reps: 2, lapses: 1 },
  "Mathematics||Quadratic Equations": { s: 3, d: 0.3, due: NOW + 5 * DAY, reps: 4, lapses: 0 },
});
const richSeed = () => ({ tests: bankTests(), attempts: [], aiPlanner: planSeed(), srs: srsSeed() });

// in-realm attempt with REAL scoring; nWrong first questions wrong
function seedAttempt(t, testId, nWrong = 0) {
  const aid = "att-" + Math.random().toString(36).slice(2, 8);
  const correct = t.g(`(function(){ const tt = testById(${J(testId)}); const resp = {}; tt.questions.forEach((q,i)=>{ resp[q.id] = { ans: i < ${nWrong} ? "__wrong__" : q.answer, time: 20+i }; }); const r = evaluate(tt, resp); S.attempts.push({ id: ${J(aid)}, testId: tt.id, startedAt: Date.now()-120000, submittedAt: Date.now()-1000, responses: resp, result: r, timeTaken: 120 }); save(); return r.all.correct; })()`);
  return { aid, correct };
}
// answer the LIVE drill exam, then submit through the real handler
async function submitLive(t, ok = true) {
  t.g(`EX.attempt.responses = Object.fromEntries(EX.test.questions.map(q => [q.id, { ans: ${ok ? "q.answer" : '"__wrong__"'}, time: 25 }]))`);
  t.g(`submitExam(false)`);
  await sleep(800);
}

/* ============ T1 · planner renders every card ============ */
console.log("== T1 · planner cards render ==");
{
  const t = await boot({ seed: richSeed() });
  await t.gotoAI();
  const tx = t.text();
  for (const [name, needle] of [
    ["today list", "Today's tasks"], ["targets", "Aaj ke targets"], ["plan tools", "Plan tools"],
    ["coverage", "Syllabus coverage"], ["insights", "Plan intelligence"], ["backlog", "Backlog protocol"],
    ["srs", "Memory due"], ["flash", "Flash deck"], ["formula", "Formula drill"],
    ["habits", "Daily habits"], ["badges", "Effort badges"], ["recovery btn", "Recovery"],
  ]) check("T1 " + name, tx.includes(needle), needle);
  check("T1 coverage 25% (1/4 learn done)", tx.includes("25%"));
  check("T1 srs due badge shows 1", /Memory due\s*1\b/.test(tx), tx.match(/Memory due.{0,8}/)?.[0]);
  check("T1 no error card", !t.errorCard());
  check("T1 zero errors", t.errors.length === 0 && t.viewErrors.length === 0, (t.errors[0] || t.viewErrors[0] || ""));
  await t.close();
}

/* ============ T2 · engine truth (eval) ============ */
console.log("== T2 · engines ==");
{
  const t = await boot({ seed: richSeed() });
  check("T2 coverage pct=25", t.g(`aipCoverage().pct`) === 25, t.g(`aipCoverage().pct`));
  check("T2 coverage total=4 learn", t.g(`aipCoverage().totalCh`) === 4);
  const s0 = t.g(`srsState("Physics","Kinematics").reps`);
  t.g(`srsReview("Physics","Kinematics",3)`);
  check("T2 srs good: reps+1", t.g(`srsState("Physics","Kinematics").reps`) === s0 + 1);
  check("T2 srs good: due pushed future", t.g(`srsState("Physics","Kinematics").due`) > NOW);
  const l0 = t.g(`srsState("Physics","Kinematics").lapses`);
  t.g(`srsReview("Physics","Kinematics",1)`);
  check("T2 srs forgot: lapse+1", t.g(`srsState("Physics","Kinematics").lapses`) === l0 + 1);
  check("T2 forecast shape", t.g(`typeof aipForecast().adherence7`) === "number" && typeof t.g(`aipForecast().eta`) === "string");
  check("T2 burnout level", ["ok", "tired", "risk"].includes(t.g(`burnoutStatus().level`)));
  check("T2 split note", typeof t.g(`subjectSplit().note`) === "string" && t.g(`subjectSplit().note`).length > 5);
  seedAttempt(t, "jt-bank", 2);
  check("T2 predictor counts test", t.g(`scorePredict().n`) >= 1, t.g(`scorePredict().n`));
  check("T2 predictor band sane", t.g(`scorePredict().lo`) <= t.g(`scorePredict().hi`));
  check("T2 behavior flags object", t.g(`typeof attemptBehavior(S.attempts[0]).flags`) === "object");
  check("T2 weak chapters found", t.g(`chapterPriorities().length`) >= 1);
  t.g(`S.pyqWt = { at: Date.now(), map: { Physics: { Kinematics: 9, A: 5, B: 5, C: 5, "Laws of Motion": 1 } } }`);
  check("T2 pyq weight high=3", t.g(`pyqWeightOf("Physics","Kinematics")`) === 3);
  check("T2 pyq weight low=1", t.g(`pyqWeightOf("Physics","Laws of Motion")`) === 1);
  t.g(`delete S.pyqWt`);
  check("T2 pyq build from disk", await t.g(`pyqWeightageBuild().then(m => Object.keys(m || {}).length >= 3)`), "index.json papers parsed");
  check("T2 pyq chapters real", await t.g(`pyqWeightageBuild().then(m => Object.keys((m || {}).Physics || {}).length >= 5)`), "Physics chapters");
  check("T2 backlog finds Kinematics", (t.g(`backlogChapters().map(x => x.topic).join(",")`) || "").includes("Kinematics"));
  check("T2 targets suggest overdue-first", (t.g(`targetsSuggest(${J(TK)},5).join(",")`) || "").startsWith("t-od1"));
  check("T2 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

/* ============ T3 · recovery ============ */
console.log("== T3 · recovery ==");
{
  const t = await boot({ seed: richSeed() });
  await t.gotoAI();
  const rb = t.w.document.querySelector("#btn-aip-recovery-top");
  check("T3 recovery button in head", !!rb);
  rb.click(); await sleep(350);
  const m = t.w.document.querySelector("[data-rec-box]");
  check("T3 modal opens", !!m);
  check("T3 two strategies", t.w.document.querySelectorAll("[data-rec-strategy]").length === 2);
  check("T3 extend selected by default", t.g(`document.querySelector('[data-rec-strategy="extend"]') !== null`));
  t.w.document.querySelector("[data-rec-apply]").click(); await sleep(600);
  check("T3 extend toast", t.toasts().join(" ").includes("extend"));
  check("T3 no overdue left", t.g(`S.aiPlanner.tasks.filter(x => x.status !== "done" && (x.date||"") < ${J(TK)}).length`) === 0);
  check("T3 plan days extended", t.g(`S.aiPlanner.profile.days`) >= 30);
  check("T3 modal closed", !t.w.document.querySelector("[data-rec-box]"));
  // drop strategy on a fresh boot
  await t.close();
  const t2 = await boot({ seed: richSeed() });
  await t2.gotoAI();
  t2.w.document.querySelector("#btn-aip-recovery-top").click(); await sleep(350);
  t2.w.document.querySelector('[data-rec-strategy="drop"]').click(); await sleep(300);
  const n0 = t2.g(`S.aiPlanner.tasks.length`);
  t2.w.document.querySelector("[data-rec-apply]").click(); await sleep(600);
  check("T3 drop removes drills", t2.g(`S.aiPlanner.tasks.length`) < n0, `${n0} → ${t2.g(`S.aiPlanner.tasks.length`)}`);
  check("T3 drop toast", t2.toasts().join(" ").includes("dropped"));
  check("T3 zero errors", t.errors.length === 0 && t2.errors.length === 0, (t.errors[0] || t2.errors[0] || ""));
  await t2.close();
}

/* ============ T4 · backlog protocol + consume ============ */
console.log("== T4 · backlog protocol ==");
{
  const t = await boot({ seed: richSeed() });
  seedAttempt(t, "jt-bank", 1); // attempt keeps the bank past drill-pruning
  await t.gotoAI();
  const opener = t.w.document.querySelector("[data-bl-open]");
  check("T4 backlog chapter row", !!opener);
  opener.click(); await sleep(400);
  const tx = t.text();
  check("T4 protocol modal: 3 steps", tx.includes("One-shot") && tx.includes("practice set") && tx.includes("PYQ set"));
  // practice set → real drill → submit → pracDone (task NOT done until PYQ too)
  t.w.document.querySelector("[data-bp-prac]").click(); await sleep(700);
  check("T4 practice drill launched", t.g(`!!(typeof EX !== "undefined" && EX && EX.test)`) === true);
  check("T4 drill has bank questions", t.g(`EX.test.questions.length`) >= 2, t.g(`EX.test.questions.length`));
  await submitLive(t, true);
  check("T4 pracDone recorded", t.g(`(S.backlogSteps["Physics||Kinematics"] || {}).pracDone`) === true);
  check("T4 learn task still todo (PYQ pending)", t.g(`S.aiPlanner.tasks.find(x => x.id === "t-od1").status`) === "todo");
  // PYQ-kind consume via seeded pending + real drill+submit (same handler)
  t.g(`S._backlogPending = { key: "Physics||Kinematics", kind: "pyq" }; startDrill("PYQ set — Kinematics", fpChapterPool("Physics","Kinematics",3), 90);`);
  await sleep(700);
  await submitLive(t, true);
  check("T4 pyqDone recorded", t.g(`(S.backlogSteps["Physics||Kinematics"] || {}).pyqDone`) === true);
  check("T4 chapter cleared → learn task auto-done", t.g(`S.aiPlanner.tasks.find(x => x.id === "t-od1").status`) === "done");
  check("T4 zero errors", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  await t.close();
}

/* ============ T5 · recall-first revision ============ */
console.log("== T5 · recall-first ==");
{
  const t = await boot({ seed: richSeed() });
  seedAttempt(t, "jt-bank", 1); // attempt keeps the bank past drill-pruning
  await t.gotoAI();
  const recallBtn = [...t.w.document.querySelectorAll("button")].find((b) => (b.textContent || "") === "🧠 Recall");
  check("T5 revision row has Recall button", !!recallBtn);
  recallBtn.click(); await sleep(700);
  check("T5 recall drill launched", (t.g(`(EX && EX.test && EX.test.name) || ""`) || "").startsWith("Recall check"));
  check("T5 pending set", t.g(`!!S._recallPending`) === true);
  await submitLive(t, true);
  check("T5 100% → revision task done", t.g(`S.aiPlanner.tasks.find(x => x.id === "t-cur2").status`) === "done");
  check("T5 srs reps bumped", t.g(`(S.srs["Mathematics||Quadratic Equations"] || {}).reps`) >= 5);
  check("T5 pending cleared", t.g(`S._recallPending == null`) === true);
  // failing recall keeps the task + lapses SRS
  const l0 = t.g(`(S.srs["Physics||Laws of Motion"] || { lapses: 0 }).lapses`);
  t.g(`recallCheckStart("Physics","Laws of Motion",null)`);
  await sleep(700);
  await submitLive(t, false);
  check("T5 failed recall → lapse recorded", t.g(`(S.srs["Physics||Laws of Motion"] || {}).lapses`) === l0 + 1);
  check("T5 zero errors", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  await t.close();
}

/* ============ T6 · SRS card + flashcards + formula + mixed + own-test ============ */
console.log("== T6 · memory drills ==");
{
  const t = await boot({ seed: richSeed() });
  seedAttempt(t, "jt-bank", 2);
  await t.gotoAI();
  // SRS grade
  const due0 = t.g(`srsDueList().length`);
  check("T6 two topics due (seed + done-learn)", due0 === 2, due0);
  const gradeGood = async () => {
    const gb = [...t.w.document.querySelectorAll("[data-srs-grades] button")].find((b) => (b.textContent || "").includes("Aasaan"));
    gb.click(); await sleep(500);
  };
  await gradeGood();
  check("T6 grade Good clears one", t.g(`srsDueList().length`) === 1);
  await gradeGood();
  check("T6 second grade clears all", t.g(`srsDueList().length`) === 0);
  // flashcards: wrong answers became cards
  const due = t.g(`flashDue(10).length`);
  check("T6 wrong Qs → due cards", due >= 2, due);
  t.w.document.querySelector("[data-fl-start]").click(); await sleep(400);
  check("T6 flash modal asks question", !!t.w.document.querySelector("[data-fl-flip]"));
  t.w.document.querySelector("[data-fl-flip]").click(); await sleep(250);
  const box0 = t.g(`S.flash["k0"] ? S.flash["k0"].box : S.flash["k1"].box`);
  t.w.document.querySelector("[data-fl-yes]").click(); await sleep(400);
  check("T6 Good advances box", t.g(`Math.max(S.flash["k0"].box, S.flash["k1"].box)`) > box0, `box ${box0} → up`);
  // formula drill: full 15-card loop
  await t.backToPlanner();
  t.w.document.querySelector("[data-fd-start]").click(); await sleep(400);
  let guard = 0;
  while (t.w.document.querySelector("[data-fd-flip]") && guard++ < 20) {
    t.w.document.querySelector("[data-fd-flip]").click(); await sleep(120);
    const yes = t.w.document.querySelector("[data-fd-yes]");
    if (!yes) break;
    yes.click(); await sleep(120);
  }
  check("T6 formula loop completes 15", t.g(`(S.formulaDrill[${J(TK)}] || {}).done`) === 15, t.g(`(S.formulaDrill[${J(TK)}] || {}).done`));
  // mixed bag via tools hub
  await t.backToPlanner();
  t.w.document.querySelector('[data-tool="mixed"]').click(); await sleep(700);
  check("T6 mixed bag launches 12Q", t.g(`EX.test.questions.length`) === 12, t.g(`EX.test.questions.length`));
  await submitLive(t, true);
  check("T6 mixed submit records attempt", t.g(`S.attempts.length`) >= 2);
  // own test via tools hub
  await t.backToPlanner();
  t.g(`S.pyqWt = { at: Date.now(), map: { Physics: { Kinematics: 9, "Laws of Motion": 1, Misc: 2 } } }`);
  t.w.document.querySelector('[data-tool="owntest"]').click(); await sleep(400);
  const otx = t.text();
  check("T6 own-test lists weak chapters", otx.includes("Kinematics"));
  check("T6 PYQ fire on high-weight", otx.includes("🔥"));
  t.w.document.querySelector("[data-ot-go]").click(); await sleep(700);
  check("T6 own-test launches drill", t.g(`EX.test.questions.length`) >= 5, t.g(`EX.test.questions.length`));
  check("T6 zero errors", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  await t.close();
}

/* ============ T7 · habits + targets + sprint + batch + commitments + slots ============ */
console.log("== T7 · habits/targets/sprint/batch/hours/slots ==");
{
  const t = await boot({ seed: richSeed() });
  await t.gotoAI();
  // habits
  t.w.document.querySelector("[data-hb-name]").value = "Reading";
  t.w.document.querySelector("[data-hb-add]").click(); await sleep(400);
  check("T7 habit added", t.g(`S.habits.length`) === 1 && (t.g(`S.habits[0].name`) || "") === "Reading");
  const hid = t.g(`S.habits[0].id`);
  t.w.document.querySelector(`[data-hb-plus="${hid}"]`).click(); await sleep(300);
  t.w.document.querySelector(`[data-hb-plus="${hid}"]`).click(); await sleep(300);
  check("T7 habit +1 twice → 2", t.g(`S.habits[0].log[${J(TK)}]`) === 2);
  // targets: auto list + tomorrow lock + done button
  check("T7 targets list shows today work", t.text().includes("Laws of Motion"));
  const doneBtn = t.w.document.querySelector('[data-tc-done="t-cur4"]');
  check("T7 practice target has Done", !!doneBtn);
  doneBtn.click(); await sleep(500);
  check("T7 target Done completes task", t.g(`S.aiPlanner.tasks.find(x => x.id === "t-cur4").status`) === "done");
  t.w.document.querySelector("[data-tc-tomorrow]").click(); await sleep(400);
  const boxes = [...t.w.document.querySelectorAll("[data-tm]")];
  check("T7 tomorrow modal lists tasks", boxes.length >= 1);
  boxes.forEach((b) => { b.checked = false; });
  boxes.slice(0, 2).forEach((b) => { b.checked = true; });
  t.w.document.querySelector("[data-tm-save]").click(); await sleep(500);
  check("T7 tomorrow targets locked", t.g(`(S.targets[${J(DS(1))}] || []).length`) === Math.min(2, boxes.length), t.g(`(S.targets[${J(DS(1))}] || []).length`));
  // sprint
  t.w.document.querySelector('[data-tool="sprint"]').click(); await sleep(400);
  check("T7 sprint modal previews", t.text().includes("Sprint"));
  t.w.document.querySelector("[data-sp-make]").click(); await sleep(600);
  check("T7 sprint tasks created", t.g(`S.aiPlanner.tasks.filter(x => x.sprint).length`) >= 1, t.g(`S.aiPlanner.tasks.filter(x => x.sprint).length`));
  // batch
  t.w.document.querySelector('[data-tool="batch"]').click(); await sleep(400);
  t.w.document.querySelector("[data-b-coach]").value = "Allen Phase 3";
  const sel = t.w.document.querySelector('[data-b-at="Physics"]');
  if (sel && sel.options.length > 1) sel.value = sel.options[sel.options.length - 1].value;
  t.w.document.querySelector("[data-b-save]").click(); await sleep(500);
  check("T7 batch saved", (t.g(`(S.batch || {}).coaching`) || "").includes("Allen"));
  // commitments
  t.w.document.querySelector('[data-tool="hours"]').click(); await sleep(400);
  t.w.document.querySelector("[data-cm-from]").value = "10:00";
  t.w.document.querySelector("[data-cm-to]").value = "16:00";
  t.w.document.querySelector("[data-cm-label]").value = "School";
  t.w.document.querySelector("[data-cm-add]").click(); await sleep(400);
  check("T7 commitment stored", t.g(`S.commitments.length`) === 1);
  const mon = tKey(NOW + ((8 - new Date(NOW).getDay()) % 7) * DAY); // next Monday
  check("T7 Monday free-min = 480", t.g(`freeMinFor(${J(mon)})`) === 480, t.g(`freeMinFor(${J(mon)})`));
  // slots
  t.w.document.querySelector('[data-tool="slots"]').click(); await sleep(400);
  check("T7 slots modal adopts Main plan", t.text().includes("Main plan"));
  t.w.document.querySelector("[data-ps-name]").value = "Boards";
  t.w.document.querySelector("[data-ps-add]").click(); await sleep(600);
  check("T7 new slot → wizard", !!t.w.document.querySelector("#app .aip-steps"));
  check("T7 wizard has Plans switcher", !!t.w.document.querySelector("[data-wiz-plans]"));
  t.w.document.querySelector("[data-wiz-plans]").click(); await sleep(400);
  const ids = t.g(`Object.keys(S.planSlots.plans).join(",")`).split(",");
  const mainId = ids.find((id) => (t.g(`S.planSlots.plans[${J(id)}].name`) || "").includes("Main"));
  t.w.document.querySelector(`[data-ps-on="${mainId}"]`).click(); await sleep(600);
  check("T7 switch back restores plan", t.text().includes("Today's tasks"));
  check("T7 zero errors", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  await t.close();
}

/* ============ T8 · dashboard: countdown + briefing + badges ============ */
console.log("== T8 · dashboard ==");
{
  const t = await boot({ seed: { ...richSeed(), _fpSprint: 1 }, hash: "#dash" });
  await sleep(400);
  const tx0 = t.text();
  check("T8 countdown setter shows", !!t.w.document.querySelector("[data-cd-set]"));
  t.w.document.querySelector("[data-cd-in]").value = DS(30);
  t.w.document.querySelector("[data-cd-set]").click(); await sleep(500);
  t.g(`go("dash")`); await sleep(600);
  const tx8 = t.text();
  check("T8 single countdown after set", tx8.includes("JEE Main Countdown") && tx8.includes("30d") && !tx8.includes("roz ~") && !t.w.document.querySelector("[data-cd-set]"));
  const hr = new Date().getHours();
  const tx = t.text();
  if (hr < 17) check("T8 morning briefing", tx.includes("Aaj ka briefing") || tx.includes("briefing"), "hr=" + hr);
  else if (hr >= 20) check("T8 evening review", tx.includes("Aaj ka hisaab") || tx.includes("review"), "hr=" + hr);
  else check("T8 evening overlap card", tx.includes("briefing") || tx.includes("hisaab") || tx.includes("review"), "hr=" + hr);
  check("T8 badges card", tx.includes("Effort badges"));
  check("T8 Sprinter unlocked", (t.g(`fpBadgesEarned().map(b => b.name).join(",")`) || "").includes("Sprinter"), t.g(`fpBadgesEarned().map(b => b.name).join(",")`));
  check("T8 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

/* ============ T9 · ritual + gate + autopsy + parent + exports + backup ============ */
console.log("== T9 · mock protocol + sharing ==");
{
  const t = await boot({ seed: richSeed() });
  t.g("S.tests.push(" + JSON.stringify(mockTest()) + ")");
  seedAttempt(t, "jt-bank", 6); // low accuracy → gate fires
  const { aid } = seedAttempt(t, "jt-mock", 2);
  check("T9 gate armed", t.g(`accuracyGate().gated`) === true, t.g(`accuracyGate().acc`));
  // ritual
  t.g(`startExam("jt-mock")`); await sleep(500);
  check("T9 instructions modal", !!t.w.document.querySelector(".nta-inst"));
  check("T9 ritual box", !!t.w.document.querySelector("[data-ritual-box]"));
  check("T9 gate warning + fix", !!t.w.document.querySelector("[data-gate-fix]"));
  t.w.document.querySelector('[data-ritual="skim"]').click();
  t.w.document.querySelector('[data-ritual="warm"]').click();
  await sleep(200);
  check("T9 ritual persisted", t.g(`Object.keys(S.ritual || {}).length`) === 2);
  t.w.document.querySelector("[data-gate-fix]").click(); await sleep(500);
  check("T9 gate fix → practice", t.text().includes("Practice") || (t.g(`location.hash`) || "").includes("practice"), t.g(`location.hash`));
  // autopsy
  t.g(`go("result", ${J(aid)})`); await sleep(600);
  check("T9 autopsy card", t.text().includes("Mock autopsy"));
  const tagSel = t.w.document.querySelector("[data-au-tag]");
  check("T9 tag selects for wrong Qs", !!tagSel);
  tagSel.value = "silly";
  tagSel.dispatchEvent(new t.w.Event("change", { bubbles: true })); await sleep(300);
  check("T9 tag stored", (t.g(`Object.values(S.qtags || {}).join(",")`) || "").includes("silly"));
  const reBtn = t.w.document.querySelector("[data-au-re]");
  reBtn.click(); await sleep(300);
  check("T9 re-attempt queued", reBtn.textContent.includes("Queued") && t.g(`Object.keys(S.reviewSchedule || {}).length`) >= 1);
  // parent report
  await t.backToPlanner();
  t.w.document.querySelector('[data-tool="parent"]').click(); await sleep(400);
  const pre = t.w.document.querySelector("[data-pr-text]");
  check("T9 parent report text", !!pre && (pre.textContent || "").length > 40);
  check("T9 WhatsApp link", (t.w.document.querySelector("[data-pr-wa]") || {}).href.startsWith("https://wa.me/"));
  t.w.document.querySelector("[data-pr-copy]").click(); await sleep(300);
  check("T9 copy fallback toast", t.toasts().join(" ").length > 0);
  t.w.document.querySelector("[data-pr-copy]").closest(".modal").querySelector("[data-no]").click(); await sleep(200);
  // exports + backup (downloads intercepted, never navigate)
  t.w.document.querySelector('[data-tool="export"]').click(); await sleep(400);
  check("T9 ICS downloaded", (t.g(`(window.__dl || []).map(x => x.name).join(",")`) || "").includes("ntacbt-plan.ics"));
  t.w.document.querySelector('[data-tool="wallpaper"]').click(); await sleep(400);
  check("T9 wallpaper drawn", t.g(`window.__ctxCalls > 0`) === true);
  check("T9 wallpaper downloaded", (t.g(`(window.__dl || []).map(x => x.name).join(",")`) || "").includes(".png"));
  t.w.document.querySelector('[data-tool="backup"]').click(); await sleep(400);
  check("T9 backup modal", !!t.w.document.querySelector("[data-bk-down]"));
  t.w.document.querySelector("[data-bk-down]").click(); await sleep(400);
  check("T9 backup downloaded", (t.g(`(window.__dl || []).map(x => x.name).join(",")`) || "").includes("ntacbt-backup"));
  check("T9 zero errors", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  await t.close();
}

/* ============ T10 · reminders ============ */
console.log("== T10 · reminders ==");
{
  const t = await boot({ seed: richSeed(), hash: "#dash" });
  const hr = new Date().getHours() + new Date().getMinutes() / 60;
  // seed: 3 today tasks, 1 done → every slot's condition holds when its hour comes
  const expectSlot = (hr >= 6 && hr < 11) || (hr >= 13 && hr < 16) || (hr >= 19 && hr < 21) || hr >= 21;
  await sleep(3200); // boot(1500) + tick@4000 → toasts live 4000ms
  const bells = t.toasts().join(" ");
  if (expectSlot) check("T10 scheduled nudge fired", bells.includes("🔔"), `hr=${hr.toFixed(1)} toasts=${bells.slice(0, 60)}`);
  else check("T10 quiet hours stay quiet", !bells.includes("🔔"), `hr=${hr.toFixed(1)}`);
  check("T10 slot recorded once", t.g(`Object.keys(S.reminders || {}).filter(k => k.includes("@")).length`) <= 1);
  t.g(`document.querySelectorAll(".toast").forEach(n => n.remove()); S.reminders = { enabled: false }; reminderTick();`);
  await sleep(300);
  check("T10 disabled → silent", !t.toasts().join(" ").includes("🔔"));
  check("T10 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

/* ============ T11 · rich-state boot stays clean ============ */
console.log("== T11 · rich boot ==");
{
  const seed = {
    ...richSeed(),
    habits: [{ id: "h1", name: "Reading", icon: "📖", targetPerDay: 1, log: { [TK]: 1 }, createdAt: NOW - DAY }],
    targets: { [TK]: ["t-cur1", "t-cur2"] },
    batch: { coaching: "Allen", at: {}, pace: 1 },
    commitments: [{ label: "School", from: "10:00", to: "16:00", days: [1, 2, 3, 4, 5, 6] }],
    settings: { examDate: DS(40) },
    _fpSprint: 2, _fpRecall80: 1,
    flash: { k0: { box: 2, due: NOW - 1000, lapses: 0 } },
  };
  const t = await boot({ seed, hash: "#dash" });
  await sleep(300);
  await t.backToPlanner();
  check("T11 dash renders", t.text().length > 500);
  check("T11 planner renders", t.text().includes("Today's tasks"));
  check("T11 countdown from settings", t.g(`countdownGet()`) === DS(40));
  check("T11 slots adopted", t.g(`Object.keys(S.planSlots.plans).length`) === 1);
  check("T11 no error card", !t.errorCard());
  check("T11 zero errors", t.errors.length === 0 && t.viewErrors.length === 0, (t.errors[0] || t.viewErrors[0] || ""));
  await t.close();
}

/* ============ T12 · graceful edges ============ */
console.log("== T12 · graceful edges ==");
{
  const t = await boot({ seed: richSeed() });
  seedAttempt(t, "jt-bank", 1);
  await t.gotoAI();
  // backlog find with dead backend: fast graceful toast, button freed
  t.w.document.querySelector("[data-bl-open]").click(); await sleep(400);
  const t0 = Date.now();
  t.w.document.querySelector("[data-bp-find]").click(); await sleep(1200);
  check("T12 find fails graceful", t.toasts().join(" ").includes("One-shot nahi mila"), t.toasts().join(" ").slice(0, 80));
  check("T12 find finishes fast", Date.now() - t0 < 8000, Date.now() - t0 + "ms");
  check("T12 find button freed", t.w.document.querySelector("[data-bp-find]").disabled === false);
  t.w.document.querySelector("[data-bp-find]").closest(".modal").querySelector("[data-no]").click(); await sleep(200);
  // lesson Watch with dead backend: modal or toast, never a crash
  t.w.document.querySelector("[data-tc-watch]").click(); await sleep(900);
  check("T12 lesson opens offline-safe", !!t.w.document.querySelector(".modal [data-player]") || t.toasts().length > 0 || !!t.w.document.querySelector(".modal"));
  [...t.w.document.querySelectorAll(".modal")].forEach((m) => { try { m.remove(); } catch {} });
  // pomo link
  const fb = [...t.w.document.querySelectorAll("#app button")].find((b) => (b.textContent || "") === "⏱️");
  check("T12 focus-link button on rows", !!fb);
  const linkedId = t.g(`S.aiPlanner.tasks.find(x => x.date === ${J(TK)} && x.status !== "done").id`);
  fb.click(); await sleep(300);
  check("T12 timer linked to task", t.g(`(S.pomoTask || {}).taskId`) === linkedId);
  // empty pools
  check("T12 recall unknown chapter → false", t.g(`recallCheckStart("Physics","NoSuchChapterXYZ",null)`) === false);
  check("T12 recall toast", t.toasts().join(" ").includes("bank mein nahi"));
  check("T12 recall pending untouched", t.g(`S._recallPending == null`) === true);
  check("T12 mixed empty bank → false", t.g(`(function(){ const st = S.tests; S.tests = []; const r = mixedBagStart(12); S.tests = st; return r; })()`) === false);
  // flash "Bhool gaya" path
  t.w.document.querySelector("[data-fl-start]").click(); await sleep(400);
  t.w.document.querySelector("[data-fl-flip]").click(); await sleep(250);
  t.w.document.querySelector("[data-fl-no]").click(); await sleep(400);
  check("T12 flash forgot → lapse", t.g(`S.flash["k0"].lapses`) === 1);
  check("T12 flash forgot → box reset", t.g(`S.flash["k0"].box`) === 1);
  // own-test with zero attempts
  t.g(`S.__st = S.attempts; S.attempts = []; save();`);
  await t.backToPlanner();
  t.w.document.querySelector('[data-tool="owntest"]').click(); await sleep(400);
  check("T12 own-test empty state", t.text().includes("Pehla test do"));
  t.w.document.querySelector("[data-ot-go]").click(); await sleep(400);
  check("T12 own-test empty start graceful", t.g(`typeof EX === "undefined" || !EX`) === true && t.toasts().length > 0);
  [...t.w.document.querySelectorAll(".modal")].forEach((m) => { try { m.remove(); } catch {} });
  t.g(`S.attempts = S.__st; delete S.__st; save();`);
  // recovery on a clean plan
  t.w.document.querySelector("#btn-aip-recovery-top").click(); await sleep(350);
  t.w.document.querySelector("[data-rec-apply]").click(); await sleep(600);
  check("T12 extend clears overdue", t.g(`S.aiPlanner.tasks.filter(x => x.status !== "done" && (x.date||"") < ${J(TK)}).length`) === 0);
  t.w.document.querySelector("#btn-aip-recovery-top").click(); await sleep(350);
  t.w.document.querySelector('[data-rec-strategy="extend"]').click(); await sleep(300);
  t.w.document.querySelector("[data-rec-apply]").click(); await sleep(500);
  check("T12 clean plan → clear toast", t.toasts().join(" ").includes("Backlog clear"));
  // sprint with zero backlog
  t.w.document.querySelector('[data-tool="sprint"]').click(); await sleep(400);
  check("T12 sprint zero-backlog toast", t.toasts().join(" ").includes("Backlog zero"));
  // slots delete path
  t.w.document.querySelector('[data-tool="slots"]').click(); await sleep(400);
  t.w.document.querySelector("[data-ps-name]").value = "Temp";
  t.w.document.querySelector("[data-ps-add]").click(); await sleep(600);
  await t.backToPlanner();
  t.w.document.querySelector("[data-wiz-plans]").click(); await sleep(400);
  const tempId = t.g(`Object.keys(S.planSlots.plans).find(id => S.planSlots.plans[id].name === "Temp")`);
  t.w.document.querySelector(`[data-ps-del="${tempId}"]`).click(); await sleep(300);
  [...t.w.document.querySelectorAll(".modal")].pop().querySelector("[data-yes]").click(); await sleep(500);
  check("T12 slot deleted", !(t.g(`Object.keys(S.planSlots.plans).join(",")`) || "").split(",").includes(tempId));
  // commitments add + delete
  await t.backToPlanner();
  t.w.document.querySelector('[data-tool="hours"]').click(); await sleep(400);
  t.w.document.querySelector("[data-cm-from]").value = "10:00";
  t.w.document.querySelector("[data-cm-to]").value = "12:00";
  t.w.document.querySelector("[data-cm-label]").value = "Tmp";
  t.w.document.querySelector("[data-cm-add]").click(); await sleep(400);
  t.w.document.querySelector("[data-cm-del]").click(); await sleep(300);
  check("T12 commitment deleted", t.g(`S.commitments.length`) === 0);
  [...t.w.document.querySelectorAll(".modal")].forEach((m) => { try { m.remove(); } catch {} });
  // short non-mock: instructions WITHOUT ritual
  t.g("S.tests.push(" + JSON.stringify({ id: "jt-short", name: "Quick Revision Test", createdAt: NOW - DAY, duration: 600, questions: [{ ...({}), id: "sq0", no: 1, subject: "Physics", chapter: "Kinematics", topic: "Kinematics", type: "mcq", text: "Short Q?", options: OPTS, answer: "b" }] }) + ")");
  t.g(`startExam("jt-short")`); await sleep(500);
  check("T12 short test instructions", !!t.w.document.querySelector(".nta-inst"));
  check("T12 no ritual for short test", !t.w.document.querySelector("[data-ritual-box]"));
  t.w.document.querySelector("#ntaAgree").click();
  t.w.document.querySelector("[data-go]").click(); await sleep(600);
  check("T12 short test proceeds", t.g(`EX && EX.test.id`) === "jt-short");
  // high accuracy → no gate, but ritual shows + PROCEED works
  seedAttempt(t, "jt-bank", 0);
  check("T12 gate disarmed at 100%", t.g(`accuracyGate().gated`) === false);
  t.g("S.tests.push(" + JSON.stringify(mockTest()) + ")");
  t.g(`startExam("jt-mock")`); await sleep(500);
  check("T12 mock ritual shows", !!t.w.document.querySelector("[data-ritual-box]"));
  check("T12 no gate at high acc", !t.w.document.querySelector("[data-gate-fix]"));
  t.w.document.querySelector('[data-ritual="skim"]').click();
  t.w.document.querySelector("#ntaAgree").click(); await sleep(150);
  check("T12 PROCEED enabled by agree", t.w.document.querySelector("[data-go]").disabled === false);
  t.w.document.querySelector("[data-go]").click(); await sleep(600);
  check("T12 mock proceeds to exam", t.g(`EX && EX.test.id`) === "jt-mock");
  // perfect autopsy
  const aid100 = t.g(`S.attempts[S.attempts.length-1].id`);
  t.g(`go("result", ${J("AID")})`.replace("AID", aid100)); await sleep(600);
  check("T12 perfect autopsy clean", t.text().includes("0 questions need you"));
  // exports with nothing to export
  await t.backToPlanner();
  t.g(`S.aiPlanner.tasks.forEach(x => x.status = "done"); save(); render(0);`); await sleep(500);
  t.w.document.querySelector('[data-tool="export"]').click(); await sleep(400);
  check("T12 ICS empty toast", t.toasts().join(" ").includes("Export ke layak kuch nahi"));
  const dl0 = t.g(`(window.__dl || []).length`);
  t.w.document.querySelector('[data-tool="wallpaper"]').click(); await sleep(400);
  check("T12 wallpaper empty-day safe", t.g(`(window.__dl || []).length`) >= dl0);
  // restore paths (last: rewrites storage)
  t.g(`backupRestore(new File(["oops-not-json"], "x.json", { type: "application/json" }))`); await sleep(500);
  check("T12 restore invalid toast", t.toasts().join(" ").includes("valid NTACBT backup nahi"));
  t.g(`backupRestore(new File(["{}"], "b.json", { type: "application/json" }))`); await sleep(500);
  check("T12 restore valid toast", t.toasts().join(" ").includes("restore ho gaya"));
  check("T12 restore wrote storage", t.w.localStorage.getItem("jeecbt.v1") === "{}");
  check("T12 zero errors", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  await t.close();
}
{
  // dash edges: past countdown + empty-today briefing + locked badges
  const ps = planSeed();
  ps.tasks.forEach((x) => { x.date = DS(3); if (x.status === "done") x.status = "todo"; });
  const t = await boot({ seed: { tests: bankTests(), attempts: [], aiPlanner: ps, settings: { examDate: DS(-1) } }, hash: "#dash" });
  await sleep(400);
  check("T12 past countdown text", t.text().includes("Passed"));
  const hr = new Date().getHours();
  if (hr < 20) check("T12 briefing zero-today", t.text().includes("0 kaam"), "hr=" + hr);
  check("T12 badges render locked", t.text().includes("Effort badges"));
  check("T12 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}
{
  // fresh boot edges
  const t = await boot({ seed: {}, hash: "#dash" });
  await sleep(400);
  check("T12 fresh countdown setter", !!t.w.document.querySelector("[data-cd-set]"));
  check("T12 fresh badges", t.text().includes("Effort badges"));
  t.g(`reminderTick()`);
  await sleep(300);
  check("T12 reminder silent sans plan", !t.toasts().join(" ").includes("🔔"));
  check("T12 fresh no error card", !t.errorCard());
  check("T12 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

/* ============ T13 · focus-link chip ============ */
console.log("== T13 · focus-link chip ==");
{
  // pomodoroCard lives on the Schedule tab (default #planner landing)
  const t = await boot({ seed: richSeed() });
  await sleep(400);
  check("T13 no chip unlinked", !t.text().includes("Linked:"));
  t.g(`pomoLinkTask("t-cur1")`); t.g(`render(0)`); await sleep(500);
  check("T13 chip shows task", t.text().includes("Linked:") && t.text().includes("Laws of Motion"));
  t.w.document.querySelector("[data-pomo-unlink]").click(); await sleep(500);
  check("T13 unlink clears", !t.text().includes("Linked:") && t.g(`S.pomoTask == null`) === true);
  check("T13 done task never links", t.g(`pomoLinkTask("t-cur3"); (pomoLinkedTask() || {}).id || null`) === null);
  check("T13 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

/* ============ T14 · tabs + demo + checkup ============ */
console.log("== T14 · tabs + demo + checkup ==");
{
  const t = await boot({ seed: richSeed() });
  seedAttempt(t, "jt-bank", 1);
  await t.gotoAI();
  const tabs = [...t.w.document.querySelectorAll("[data-atab]")].map((b) => b.getAttribute("data-atab"));
  check("T14 four tabs", tabs.join(",") === "aaj,plan,memory,tools", tabs.join(","));
  check("T14 aaj count badge", (t.w.document.querySelector('[data-atab="aaj"]').textContent || "").includes("3"));
  const vis = (k) => t.w.document.querySelector(`[data-apanel="${k}"]`).style.display !== "none";
  check("T14 aaj visible first", vis("aaj") && !vis("plan") && !vis("memory") && !vis("tools"));
  t.w.document.querySelector('[data-atab="memory"]').click(); await sleep(250);
  check("T14 tab switches", vis("memory") && !vis("aaj"));
  check("T14 tab persists", t.g(`(S.ui || {}).aipTab`) === "memory");
  check("T14 quick drills", !!t.w.document.querySelector('[data-ql="recall"]'));
  t.w.document.querySelector('[data-ql="recall"]').click(); await sleep(700);
  check("T14 quick recall launches", (t.g(`(EX && EX.test && EX.test.name) || ""`) || "").startsWith("Recall check"));
  await t.backToPlanner();
  // checkup: 26 live rows, zero broken
  t.w.document.querySelector('[data-tool="checkup"]').click(); await sleep(500);
  check("T14 checkup opens", t.text().includes("Feature checkup"));
  check("T14 26 checks", t.w.document.querySelectorAll("[data-cu]").length === 26, t.w.document.querySelectorAll("[data-cu]").length);
  const cuModal = [...t.w.document.querySelectorAll(".modal")].find((mm) => (mm.textContent || "").includes("Feature checkup"));
  const nBad = [...cuModal.querySelectorAll("[data-cu]")].filter((b) => (b.closest(".optrow").textContent || "").trim().startsWith("❌")).length;
  check("T14 zero broken", nBad === 0, nBad + " broken");
  check("T14 summary counts", /\d+ live/.test(t.text()));
  t.w.document.querySelector('[data-cu="0"]').click(); await sleep(400);
  check("T14 Khol opens recovery", !!t.w.document.querySelector("[data-rec-box]"));
  [...t.w.document.querySelectorAll(".modal")].forEach((m) => { try { m.remove(); } catch {} });
  // demo round-trip preserves the real plan byte-identical
  const before = t.g(`JSON.stringify(S.aiPlanner.tasks.map(x => x.id + x.status).join(","))`);
  t.w.document.querySelector('[data-tool="demo"]').click(); await sleep(400);
  check("T14 demo modal", t.text().includes("Demo plan try karo"));
  t.w.document.querySelector("[data-demo-go]").click(); await sleep(700);
  check("T14 demo loaded", t.g(`!!(S._demo && S._demo.on)`) === true);
  check("T14 demo plan live", t.g(`S.aiPlanner.tasks.some(x => x.id === "demo-od1")`) === true);
  check("T14 demo history live", t.g(`S.attempts.some(a => a.id === "demo-att-1")`) === true);
  t.w.document.querySelector('[data-tool="demo"]').click(); await sleep(400);
  check("T14 demo button flips", (t.w.document.querySelector('[data-tool="demo"]').textContent || "").includes("hatao"));
  t.w.document.querySelector("[data-demo-go]").click(); await sleep(700);
  check("T14 demo cleared", t.g(`S._demo == null`) === true);
  check("T14 real plan restored", t.g(`JSON.stringify(S.aiPlanner.tasks.map(x => x.id + x.status).join(","))`) === before);
  check("T14 demo test removed", t.g(`S.tests.some(x => x.id === "demo-test-1")`) === false);
  check("T14 zero errors", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  await t.close();
}
{
  // demo from the wizard (no plan at all)
  const t = await boot({ seed: { tests: bankTests(), attempts: [] } });
  await t.gotoAI();
  check("T14 wizard shows", !!t.w.document.querySelector("#app .aip-steps"));
  check("T14 wizard demo entry", !!t.w.document.querySelector("[data-wiz-demo]"));
  t.w.document.querySelector("[data-wiz-demo]").click(); await sleep(400);
  t.w.document.querySelector("[data-demo-go]").click(); await sleep(700);
  check("T14 demo from wizard", t.g(`S.aiPlanner.tasks.some(x => x.id === "demo-od1")`) === true);
  check("T14 today view renders", t.text().includes("Today's tasks"));
  check("T14 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

/* ============ T15 · dashboard tabs + last-plan delete + single countdown ============ */
console.log("== T15 · dashboard tabs + delete ==");
{
  const t = await boot({ seed: { ...richSeed(), _fpSprint: 1 }, hash: "#dash" });
  await sleep(500);
  const q = (s) => t.w.document.querySelector(s);
  check("T15 dash tabs render", !!q("[data-dtabs]") && q("[data-dtabs]").querySelectorAll("[data-dtab]").length === 3);
  check("T15 dash default aaj", t.g(`S.ui.dashTab`) === "aaj" && q('[data-dpanel="aaj"]').style.display !== "none" && q('[data-dpanel="prog"]').style.display === "none" && q('[data-dpanel="prac"]').style.display === "none");
  q('[data-dtab="prog"]').click(); await sleep(300);
  check("T15 dash switch prog", t.g(`S.ui.dashTab`) === "prog" && q('[data-dpanel="prog"]').style.display !== "none" && q('[data-dpanel="aaj"]').style.display === "none");
  q('[data-dtab="prac"]').click(); await sleep(300);
  check("T15 dash switch prac", t.g(`S.ui.dashTab`) === "prac" && q('[data-dpanel="prac"]').style.display !== "none" && q('[data-dpanel="prog"]').style.display === "none");
  t.g(`go("dash")`); await sleep(600);
  check("T15 dash tab persists", t.g(`S.ui.dashTab`) === "prac" && t.w.document.querySelector('[data-dpanel="prac"]').style.display !== "none");
  const pan = (k) => t.w.document.querySelector(`[data-dpanel="${k}"]`);
  check("T15 panels populated", ["aaj", "prog", "prac"].every((k) => pan(k) && pan(k).children.length > 0));
  check("T15 hero above tabs", (() => { const ch = [...t.w.document.querySelector("#app").children].map((x) => x.getAttribute && (x.getAttribute("data-dtabs") ? "bar" : (x.getAttribute("data-dpanel") || "?"))); const bi = ch.indexOf("bar"); return bi > 0 && ch[bi - 1] === "?"; })());
  // countdown dedupe: date set → sirf legacy countdown, apna card gayab
  t.g(`S.settings.examDate="${DS(20)}"; save(); go("dash")`); await sleep(600);
  const tx1 = t.text();
  check("T15 single countdown", tx1.includes("JEE Main Countdown") && tx1.includes("20d") && !tx1.includes("roz ~") && !t.w.document.querySelector("[data-cd-set]"));
  t.g(`S.settings.examDate=""; save(); go("dash")`); await sleep(600);
  check("T15 setter back when cleared", !!t.w.document.querySelector("[data-cd-set]") && t.text().includes("Exam countdown"));
  check("T15 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}
{
  // UI se SAARE plans delete → aakhri ke baad wizard
  const t = await boot({ seed: { tests: bankTests(), attempts: [], aiPlanner: planSeed() } });
  await t.backToPlanner();
  t.w.document.querySelector('[data-atab="tools"]').click(); await sleep(300);
  t.w.document.querySelector('[data-tool="slots"]').click(); await sleep(400);
  for (let i = 0; i < 6; i++) {
    const n = t.g(`(S.planSlots && S.planSlots.plans) ? Object.keys(S.planSlots.plans).length : 0`);
    if (!n) break;
    if (!t.w.document.querySelector("[data-ps-list]")) {
      await t.backToPlanner();
      t.w.document.querySelector('[data-atab="tools"]').click(); await sleep(300);
      t.w.document.querySelector('[data-tool="slots"]').click(); await sleep(400);
    }
    t.w.document.querySelector("[data-ps-del]").click(); await sleep(300);
    [...t.w.document.querySelectorAll(".modal")].pop().querySelector("[data-yes]").click(); await sleep(500);
  }
  check("T15 all plans deleted", t.g(`(S.planSlots && S.planSlots.plans) ? Object.keys(S.planSlots.plans).length : -1`) === 0 && t.g(`S.aiPlanner === null`) === true);
  await t.backToPlanner();
  check("T15 last delete shows wizard", !!t.w.document.querySelector("#app .aip-steps"));
  check("T15 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

/* ============ T16 · planner sections (accordion) + show-more ============ */
console.log("== T16 · planner sections ==");
{
  const t = await boot({ seed: { ...richSeed(), _fpSprint: 1 } });
  await t.backToPlanner();
  const q = (s) => t.w.document.querySelector(s);
  const secs = [...t.w.document.querySelectorAll("[data-asec]")];
  check("T16 sections render", secs.length >= 9, "n=" + secs.length);
  check("T16 heads+bodies", secs.every((s) => s.querySelector("[data-asec-head]") && s.querySelector("[data-asec-body]")));
  check("T16 summaries live", secs.every((s) => (s.querySelector("[data-asec-head]").textContent || "").trim().length > 8));
  check("T16 no double header", secs.every((s) => { const h = s.querySelector(".section-title"); return !h || h.style.display === "none"; }));
  const disp = (k) => t.w.document.querySelector(`[data-asec-body="${k}"]`).style.display;
  check("T16 default coverage open", disp("coverage") !== "none");
  check("T16 default subjects closed", disp("subjects") === "none");
  check("T16 default insights closed", disp("insights") === "none");
  check("T16 default srs open (due)", disp("srs") !== "none");
  check("T16 default flash closed (none due)", disp("flash") === "none");
  check("T16 default ptools open", disp("ptools") !== "none");
  check("T16 default badges closed", disp("badges") === "none");
  const srsDue = t.g(`srsDueList().length`);
  check("T16 srs summary count", q('[data-asec-head="srs"]').textContent.includes(`${srsDue} due`), "due=" + srsDue);
  check("T16 coverage summary", q('[data-asec-head="coverage"]').textContent.includes("chapters"));
  q('[data-asec-head="subjects"]').click(); await sleep(250);
  check("T16 toggle opens", disp("subjects") !== "none" && t.g(`S.ui.planSec.subjects`) === 1 && q('[data-asec-head="subjects"]').getAttribute("aria-expanded") === "true");
  q('[data-asec-head="coverage"]').click(); await sleep(250);
  check("T16 toggle closes", disp("coverage") === "none" && t.g(`S.ui.planSec.coverage`) === 0);
  await t.backToPlanner();
  check("T16 persist across render", t.w.document.querySelector('[data-asec-body="subjects"]').style.display !== "none" && t.w.document.querySelector('[data-asec-body="coverage"]').style.display === "none");
  // show-more: seed mein 4 today-tasks → 5 aur jodo
  check("T16 no more-btn when short", !q("[data-aaj-more]"));
  t.g(`S.aiPlanner.tasks.push(...["x1","x2","x3","x4","x5"].map((id,i)=>({id,subject:"Physics",topic:"Extra "+i,kind:"learn",diff:2,wt:2,depth:"lecture",estMin:20,status:"todo",date:${J(TK)}}))); save();`);
  await t.backToPlanner();
  const h3 = [...t.w.document.querySelectorAll("#app h3")].find((h) => h.textContent.trim() === "Today's tasks");
  const card = h3.parentElement;
  const rows = [...card.children].filter((x) => x.classList.contains("optrow"));
  const mb = t.w.document.querySelector("[data-aaj-more]");
  check("T16 more-btn appears", !!mb && mb.textContent.includes("Aur 3"), mb ? mb.textContent : "none");
  check("T16 first six visible", rows.length === 9 && rows.filter((r) => r.style.display !== "none").length === 6, "rows=" + rows.length);
  mb.click(); await sleep(250);
  check("T16 more expands all", rows.filter((r) => r.style.display !== "none").length === 9 && t.g(`S.ui.planSec.aajmore`) === 1);
  await t.backToPlanner();
  check("T16 more persists", t.w.document.querySelector("[data-aaj-more]").textContent.includes("Kam dikhao"));
  check("T16 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

/* ============ T17 · update banner + build tag ============ */
console.log("== T17 · update plumbing ==");
{
  const t = await boot({ seed: { ...richSeed() } });
  check("T17 build const", typeof t.g(`NTACBT_BUILD`) === "string" && t.g(`NTACBT_BUILD`).length >= 8, t.g(`NTACBT_BUILD`));
  t.g(`showUpdateBanner()`);
  check("T17 banner shows", !!t.w.document.querySelector("[data-sw-update]"));
  t.g(`showUpdateBanner()`);
  check("T17 banner single", t.w.document.querySelectorAll("[data-sw-update]").length === 1);
  t.w.document.querySelector("[data-sw-later]").click();
  check("T17 banner dismisses", !t.w.document.querySelector("[data-sw-update]"));
  t.g(`go("settings")`); await sleep(500);
  check("T17 settings shows build", t.text().includes(t.g(`NTACBT_BUILD`)));
  check("T17 zero errors", t.errors.length === 0, t.errors[0] || "");
  await t.close();
}

console.log("──────────────────────────────────────────────");
console.log(`24PACK: passed ${passed}, failed ${failed}`);
process.exit(failed ? 1 : 0);
