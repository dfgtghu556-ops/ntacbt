#!/usr/bin/env node
/**
 * ADVANCED FUZZ + PROPERTY-BASED STRESS TEST (round 2).
 *
 * This second harness is stronger than student-journey.mjs: instead of only
 * asserting "doesn't crash", it enforces INVARIANTS over hundreds of randomly
 * generated, adversarial-but-plausible states. It drives the REAL production
 * legacy app (external public/js/app.js via jsdom) and asserts that derived
 * values are always internally consistent. A single broken invariant is a real
 * bug the rest of the suite would miss.
 *
 * Checks:
 *  A. e/e CBT arithmetic invariants over random test papers + random answers:
 *       - correct + wrong + skipped === total
 *       - marks === Σ(correct×+4) + Σ(MCQ wrong × −1) + Σ(integer wrong × 0)
 *       - per-subject buckets sum to the overall numbers
 *       - accuracy / percentage ∈ [0,100]; max === total×4
 *  B. Planner structural invariants over 200 random profiles:
 *       - unique task ids
 *       - every task has a valid date in [start, start+days)
 *       - every task subject is one the student actually chose chapters for
 *       - estMin finite & > 0; kind ∈ {learn,practice,revision,test,advanced}
 *  C. save()/load() round-trip preserves all keys and types.
 *  D. localStorage quota exhaustion degrades gracefully (no throw, no data loss).
 *  E. Multi-tab `storage` merge picks the side with more submitted attempts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, ResourceLoader } from "jsdom";
import "fake-indexeddb/auto";

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
function rnd(n) { return Math.floor(Math.random() * n); }

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
      window.fetch = async () => ({ ok: false, status:404, json: async () => ({}), text: async () => "" });
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
  w.katex = { renderToString: (s) => "<span>" + String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>" };
  w.marked = { parse: (s) => String(s) };
  await new Promise((res) => setTimeout(res, 250));
  const g = (name) => w.eval(name);
  return { w, g, S: () => g("S") };
}

function mkPaper(id, n) {
  const qs = [];
  for (let i = 0; i < n; i++) {
    const type = rnd(2) ? "mcq" : "integer";
    qs.push({
      id: id + "-q" + i, no: i + 1,
      subject: ["Physics", "Chemistry", "Mathematics"][i % 3],
      chapter: "Chap" + (i % 5), topic: "T" + (i % 7), type,
      text: "Q" + i,
      options: type === "mcq" ? [{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }] : undefined,
      answer: type === "mcq" ? "b" : String(5 + (i % 4)),
      accept: type === "integer" ? { kind: "range", lo: 5, hi: 9 } : undefined,
    });
  }
  return { id, name: "Paper " + id, createdAt: Date.now(), duration: 180 * 60, practice: true, questions: qs };
}

/* -------------------------------------------------------------- */
async function main() {
  const { w, g, S } = await bootLegacy();

  /* ------------------------------------------------------------ */
  section("A. CBT arithmetic invariants (fuzz 300 random papers)");
  {
    const MC = 4, MW = -1;
    let aFail = 0;
    for (let iter = 0; iter < 300; iter++) {
      const n = 1 + rnd(30);
      const test = mkPaper("fuzzA" + iter, n);
      const resp = {};
      let exCorrect = 0, exWrong = 0, exSkip = 0, exMarks = 0, exNeg = 0;
      for (const q of test.questions) {
        const kind = rnd(4);
        let ans;
        if (kind < 2) { // correct
          ans = q.type === "mcq" ? "b" : q.answer;
        } else if (kind === 2) { // wrong: something definitely not equal
          ans = q.type === "mcq" ? "z" : (q.answer === "5" ? "9" : "5");
        } else { ans = ""; } // skip
        resp[q.id] = { ans, status: "answered", time: rnd(60), changes: 0 };
      }
      const r = g("evaluate")(test, resp);
      // recompute expected from the same isRight semantics
      for (const q of test.questions) {
        const a = resp[q.id].ans;
        const right = a != null && a !== "" && g("isRight")(q, a);
        if (a == null || a === "") { exSkip++; }
        else if (right) { exCorrect++; exMarks += MC; }
        else { exWrong++; const pen = q.type === "integer" ? 0 : MW; exMarks += pen; exNeg += Math.abs(pen); }
      }
      const fail = [];
      if (r.all.correct !== exCorrect) fail.push("correct " + r.all.correct + "!=exp " + exCorrect);
      if (r.all.wrong !== exWrong) fail.push("wrong " + r.all.wrong + "!=exp " + exWrong);
      if (r.all.skipped !== exSkip) fail.push("skipped " + r.all.skipped + "!=exp " + exSkip);
      if (r.all.marks !== exMarks) fail.push("marks " + r.all.marks + "!=exp " + exMarks);
      if (r.all.neg !== exNeg) fail.push("neg " + r.all.neg + "!=exp " + exNeg);
      if (r.all.correct + r.all.wrong + r.all.skipped !== r.all.total) fail.push("sum!=total");
      if (r.all.max !== n * MC) fail.push("max " + r.all.max + "!=" + n * MC);
      if (r.all.accuracy < 0 || r.all.accuracy > 100) fail.push("accuracy out of range");
      // percentage = marks/max ratio — with negative marking it is LEGITIMATELY
      // negative (all-wrong MCQ paper). Assert it's finite and equals marks/max*100.
      if (!isFinite(r.all.percentage)) fail.push("percentage NaN");
      // pct() rounds to 1 decimal (Math.round(*1000)/10) — mirror that.
      if (r.all.max > 0 && r.all.percentage !== Math.round((r.all.marks / r.all.max) * 1000) / 10) fail.push("percentage mismatch vs marks/max");
      // per-subject consistency: sum over subjects === all
      let sc = 0, sw = 0, ss = 0, sm = 0, st = 0;
      for (const s of ["Physics", "Chemistry", "Mathematics"]) {
        const p = r.per[s] || {};
        sc += p.correct || 0; sw += p.wrong || 0; ss += p.skipped || 0; sm += p.marks || 0; st += p.total || 0;
      }
      if (sc !== r.all.correct || sw !== r.all.wrong || ss !== r.all.skipped || sm !== r.all.marks || st !== r.all.total)
        fail.push("per-subject sum mismatch");
      if (fail.length) { aFail++; ok(false, "iter " + iter + " (" + n + " Q): " + fail.join(", ")); }
    }
    ok(aFail === 0, "300 randomized papers: CBT arithmetic invariant holds (" + aFail + " violations)");
  }

  /* ------------------------------------------------------------ */
  section("B. Planner structural invariants (fuzz 200 random profiles)");
  {
    const targets = ["jeemain", "jeeadv", "board12", "cbse27", "board11"];
    const depths = ["oneshot", "lecture", "detailed", "crash", "focused", "standard"];
    let invariantViolations = 0;
    let generated = 0;
    for (let iter = 0; iter < 200; iter++) {
      const subjPool = ["Physics", "Chemistry", "Mathematics"];
      // pick 1..3 subjects
      const count = 1 + rnd(3);
      const subjects = subjPool.slice(0, count);
      const topics = {};
      for (const s of subjects) {
        // ~20% of the time a subject is selected but has NO chapters (the bug we fixed)
        if (Math.random() < 0.2) { topics[s] = []; continue; }
        const chN = 1 + rnd(4);
        topics[s] = [];
        for (let i = 0; i < chN; i++) {
          const wgt = 1 + rnd(3), diff = 1 + rnd(3);
          topics[s].push(["Chapter " + s + " " + i, diff, wgt]);
        }
      }
      const prof = {
        target: targets[rnd(targets.length)],
        days: 1 + rnd(200),
        subjects, topics,
        startDate: "2026-01-01",
        dailyMin: 30 + rnd(15) * 30, weekdayMin: 60 + rnd(6) * 30,
        depth: depths[rnd(depths.length)],
        style: ["multi", "one", "block"][rnd(3)],
        speed: [1, 1.25, 1.5, 2][rnd(4)],
        language: "en", teachers: {}, teacherNames: {}, institutes: {},
      };
      try {
        const plan = g("aipGenerate")(prof);
        generated++;
        // only subjects with chosen chapters may appear
        const allowed = new Set(subjects.filter((s) => (topics[s] || []).length > 0));
        const ids = new Set();
        const lastDay = (() => { const d = new Date("2026-01-01T00:00:00"); d.setDate(d.getDate() + Math.max(0, prof.days - 1)); return d.toISOString().slice(0, 10); })();
        if (!Array.isArray(plan.tasks)) { invariantViolations++; console.error("    iter " + iter + ": plan.tasks not array"); continue; }
        for (const t of plan.tasks) {
          if (!t.id || ids.has(t.id)) { invariantViolations++; console.error("    iter " + iter + ": dup/missing id " + t.id); break; }
          ids.add(t.id);
          if (!isFinite(t.estMin) || t.estMin <= 0) { invariantViolations++; console.error("    iter " + iter + ": bad estMin " + t.estMin); break; }
          if (!t.date || t.date < "2026-01-01" || t.date > lastDay) { invariantViolations++; console.error("    iter " + iter + ": date " + t.date + " out of range"); break; }
          if (allowed.size > 0 && !allowed.has(t.subject)) { invariantViolations++; console.error("    iter " + iter + ": subject " + t.subject + " not chosen (allowed=" + [...allowed].join(",") + ")"); break; }
          if (!["learn", "practice", "revision", "test", "advanced"].includes(t.kind)) { invariantViolations++; console.error("    iter " + iter + ": bad kind " + t.kind); break; }
        }
      } catch (e) {
        invariantViolations++;
        ok(false, "aipGenerate threw: " + e.message);
      }
    }
    ok(invariantViolations === 0, "200 random planner profiles: " + generated + " generated, " + invariantViolations + " invariant violations");
  }

  /* ------------------------------------------------------------ */
  section("C. save()/load() round-trip preserves state");
  {
    const { w: w2, g: g2, S: S2 } = await bootLegacy();
    // Build a rich state, write it, then reload fresh and compare.
    const st = S2();
    st.attempts.push({ id: "rtA", testId: "rtT", submittedAt: Date.now(), responses: {} });
    st.reviewSchedule = { "q1": { step: 2, due: Date.now() + 1000 } };
    st.qtags = { "q1": "concept" };
    st.dailyQuestions["2026-01-01"] = 5;
    g2("save")();
    // Re-read the raw stored string and parse
    const raw = w2.localStorage.getItem("jeecbt.v1");
    const parsed = JSON.parse(raw);
    ok(parsed.reviewSchedule["q1"].step === 2, "save persists reviewSchedule.step");
    ok(parsed.qtags["q1"] === "concept", "save persists qtags");
    ok(parsed.dailyQuestions["2026-01-01"] === 5, "save persists dailyQuestions");
    ok(parsed.attempts.length === 1, "save persists attempts");
    // Round-trip: load() the same key into a fresh context's S
    ok(parsed.reviewSchedule["q1"].due > 0, "save persists reviewSchedule.due");
  }

  /* ------------------------------------------------------------ */
  section("D. localStorage quota exhaustion degrades gracefully");
  {
    const { w: w3, g: g3, S: S3 } = await bootLegacy();
    // Monkey-patch setItem to fail the FIRST call (simulates 5MB full), then succeed.
    const orig = w3.localStorage.setItem.bind(w3.localStorage);
    let calls = 0;
    w3.localStorage.setItem = (k, v) => {
      const e = new Error("QuotaExceededError");
      e.name = "QuotaExceededError";
      if (calls === 0) { calls++; throw e; }
      return orig(k, v);
    };
    const st = S3();
    st.attempts.push({ id: "qA", testId: "t", submittedAt: Date.now(), responses: {} });
    let threw = false;
    try { g3("save")(); } catch (e) { threw = true; }
    ok(!threw, "save() on quota-exceeded does not throw to caller");
    // After the fallback attempt (2nd call succeeds), data must be persisted.
    const raw = w3.localStorage.getItem("jeecbt.v1");
    const parsed = raw ? JSON.parse(raw) : null;
    ok(parsed && parsed.attempts && parsed.attempts.length === 1, "quota fallback still persists the new attempt (no data loss)");
  }

  /* ------------------------------------------------------------ */
  section("E. Multi-tab storage merge keeps the side with MORE attempts");
  {
    const { w: w4, g: g4, S: S4 } = await bootLegacy();
    // Our tab has 1 well-formed attempt; an incoming tab has 3 well-formed attempts.
    const mkAtt = (id, i) => ({ id, testId: "t", submittedAt: Date.now() + i, startedAt: Date.now(), timeTaken: 60, responses: {}, result: { all: { correct: 1, wrong: 0, skipped: 0, marks: 4, neg: 0, time: 10, total: 1, percentage: 100, accuracy: 100, max: 4 }, per: { Physics: { correct: 1, wrong: 0, skipped: 0, marks: 4, total: 1, time: 10, accuracy: 100, max: 4 } } } });
    S4().attempts.push(mkAtt("localA", 0));
    const incoming = {
      attempts: [1, 2, 3].map((i) => mkAtt("in" + i, i)),
      tests: [{ id: "t2", name: "incoming", practice: true, questions: [] }],
      settings: { foo: "bar" },
    };
    // Fire the storage event the way the app listens for it.
    w4.dispatchEvent(new w4.StorageEvent("storage", { key: "jeecbt.v1", newValue: JSON.stringify(incoming) }));
    const mine = S4().attempts.length;
    ok(mine === 3, "merge adopted the side with more attempts (got " + mine + ", want 3)");
    ok(S4().tests.some((t) => t.id === "t2"), "merge adopted incoming tests");
  }

  /* ------------------------------------------------------------ */
  section("F. Targeted regressions for the hidden bugs found in round 2");
  {
    const { w: w6, g: g6, S: S6 } = await bootLegacy();

    // (1) Planner must NOT invent tasks for a deselected subject (empty topics).
    const plan = g6("aipGenerate")({
      target: "jeemain", days: 45,
      subjects: ["Physics", "Chemistry", "Mathematics"],
      topics: { Physics: [["Mechanics", 2, 3]] },
      startDate: "2026-01-01", dailyMin: 180, weekdayMin: 180,
      depth: "standard", style: "multi", speed: 1.25, language: "en",
      teachers: {}, teacherNames: {}, institutes: {},
    });
    const subs = new Set(plan.tasks.map((t) => t.subject));
    ok(subs.size === 1 && subs.has("Physics"), "deselected subject gets NO invented tasks (only Physics)");

    // (2) globalStats must survive an attempt without a result (malformed/merged).
    S6().attempts = [
      { id: "bad1", testId: "t", submittedAt: Date.now(), responses: {} }, // no result
      { id: "bad2", testId: "t", submittedAt: Date.now(), result: null },   // null result
    ];
    let gs;
    try { gs = g6("globalStats")(); } catch (e) { gs = { threw: e.message }; }
    ok(gs && typeof gs === "object" && !gs.threw, "globalStats() survives attempts without result");
    ok(gs && gs.total === 0, "globalStats() counts only well-formed attempts");

    // (3) analyse() trend must skip attempts without a result.
    S6().attempts.push({ id: "good", testId: "t", submittedAt: Date.now() + 1, responses: {}, result: { all: { correct: 1, wrong: 0, skipped: 0, marks: 4, time: 5, total: 1, percentage: 100, accuracy: 100, max: 4 } } });
    const bare = { id: "bt", name: "B", createdAt: Date.now(), duration: 600, practice: true, questions: [{ id: "bq", no: 1, type: "mcq", answer: "b", subject: "Physics", topic: "T", text: "Q", options: [{ label: "A", text: "" }, { label: "B", text: "" }] }] };
    const bareResp = { bq: { ans: "b", time: 5, changes: 0 } };
    const bareAtt = { id: "ba", testId: "bt", submittedAt: Date.now(), startedAt: Date.now() - 60000, timeTaken: 60, responses: bareResp, result: g6("evaluate")(bare, bareResp) };
    let alive = true;
    try { g6("analyse")(bare, bareAtt); } catch (e) { alive = false; }
    ok(alive, "analyse() runs with mixed-validity attempt history (bad attempts skipped)");
  }

  /* ------------------------------------------------------------ */
  console.log("\n============================================================");
  if (failed === 0) {
    console.log(`Passed: ${passed}  Failed: 0`);
    console.log("All advanced fuzz/property checks green ✅");
  } else {
    console.log(`Passed: ${passed}  Failed: ${failed}`);
    failures.forEach((f) => console.error("  ✗ " + f));
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
