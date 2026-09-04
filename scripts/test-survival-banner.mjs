#!/usr/bin/env node
/** Verify the legacy dashboard "Am I on track?" survival banner renders. */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, ResourceLoader } from "jsdom";
import "fake-indexeddb/auto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "..", "public", "jee-cbt.html"), "utf8");

function makeFakeCtx() {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "measureText") return () => ({ width: 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 });
        if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(1024).fill(128) });
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop: () => {} });
        return () => 0;
      },
      set() { return true; },
    },
  );
}

const PUBLIC_DIR = join(__dirname, "..", "public");
class LocalResourceLoader extends ResourceLoader {
  fetch(url) {
    const path = url.startsWith("file:") ? url : url.replace(/^https?:\/\/ntacbt\.test/, "");
    if (path.startsWith("/js/") || path.startsWith("/css/")) {
      const file = join(PUBLIC_DIR, path.replace(/^\//, ""));
      try {
        return Promise.resolve(readFileSync(file));
      } catch {
        return Promise.reject(new Error("404 " + path));
      }
    }
    return Promise.resolve(Buffer.from(""));
  }
}

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
  },
});

const w = dom.window;
w.caches = undefined;
Object.defineProperty(w.HTMLElement.prototype, "scrollIntoView", { value: () => {}, configurable: true });
Object.defineProperty(w.Element.prototype, "requestFullscreen", { value: () => Promise.resolve(), configurable: true });
w.HTMLCanvasElement.prototype.getContext = function () { return makeFakeCtx(); };
w.HTMLCanvasElement.prototype.toDataURL = function () { return "data:image/jpeg;base64,/9j/4AAQSkZJRg=="; };
w.katex = { renderToString: (s) => "<span>" + String(s) + "</span>" };
w.marked = { parse: (s) => String(s) };

await new Promise((res) => setTimeout(res, 300));
const g = (name) => w.eval(name);

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log("  ✓ " + label); }
  else { failed++; console.error("  ✗ " + label); }
}

// Seed some evidence so the banner has real signals.
const S = g("S");
S.studyLog = S.studyLog || {};
S.dailyQuestions = S.dailyQuestions || {};
S.attempts = S.attempts || [];
S.tests = S.tests || [];
S.settings = S.settings || {};
S.settings.dailyGoal = 20;
S.settings.examDate = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
S.settings.targetPercentile = 90;

// A few completed tests (accuracy evidence).
for (let i = 0; i < 3; i++) {
  const tid = "surv-test-" + i;
  S.tests.push({
    id: tid,
    name: "Survival Test " + i,
    createdAt: Date.now(),
    duration: 60,
    questions: [
      { id: tid + "-q1", no: 1, subject: "Physics", chapter: "Electrostatics", topic: "Coulomb", type: "mcq", text: "What is k?", options: [{ label: "A", text: "" }, { label: "B", text: "" }], answer: "a" },
      { id: tid + "-q2", no: 2, subject: "Physics", chapter: "Electrostatics", topic: "Coulomb", type: "mcq", text: "Find value of field", options: [{ label: "A", text: "" }, { label: "B", text: "" }], answer: "b" },
      { id: tid + "-q3", no: 3, subject: "Chemistry", chapter: "Bonding", topic: "VSEPR", type: "mcq", text: "Which shape?", options: [{ label: "A", text: "" }, { label: "B", text: "" }], answer: "a" },
    ],
  });
  const res = { all: { correct: 2, wrong: 1, skipped: 0, marks: 7, neg: -1, time: 60, total: 3, max: 12, accuracy: 66.7 } };
  res.per = { Physics: { correct: 1, wrong: 1, skipped: 0, marks: 3, total: 2, time: 40, accuracy: 50, max: 8 }, Chemistry: { correct: 1, wrong: 0, skipped: 0, marks: 4, total: 1, time: 20, accuracy: 100, max: 4 }, Mathematics: { correct: 0, wrong: 0, skipped: 0, marks: 0, total: 0, time: 0, accuracy: 0, max: 0 } };
  S.attempts.push({ id: "sa-" + i, testId: tid, submittedAt: Date.now() - i * 86400000, startedAt: Date.now(), timeTaken: 60, tabSwitches: 0, result: res, responses: { [tid + "-q1"]: { ans: "b", status: "answered", time: 30, changes: 0 }, [tid + "-q2"]: { ans: "b", status: "answered", time: 30, changes: 0 }, [tid + "-q3"]: { ans: "a", status: "answered", time: 30, changes: 0 } } });
}

// Mark yesterday + today as studied for a streak.
const todayKey = g("todayKey");
S.studyLog[todayKey(new Date())] = 1;
S.studyLog[todayKey(new Date(Date.now() - 86400000))] = 1;

// Ensure app state save doesn't throw.
try { g("saveLS")(); } catch (e) {}

// Direct call to the banner function (no navigation).
const banner = g("survivalBanner")();
ok(banner !== null && banner !== undefined, "survivalBanner() returns an element");
ok(banner && banner.innerHTML.includes("Am I on track?"), "banner contains 'Am I on track?'");
ok(banner && /on track|track/.test(banner.innerHTML), "banner has an on-track label");
ok(banner && banner.querySelector("svg"), "banner renders a score ring");

console.log("\nPassed: " + passed + "  Failed: " + failed);
process.exit(failed ? 1 : 0);
