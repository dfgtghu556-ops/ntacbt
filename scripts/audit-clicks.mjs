#!/usr/bin/env node
/* FINAL-DEPLOYMENT CLICK AUDIT — drives the REAL app in jsdom like a monkey
 * with a checklist: every route renders, every button/link/tile gets clicked,
 * every throw is recorded with (route + element). Exit 1 on any real throw.
 * Skips: exam-entry + destructive buttons (covered by robot/journey/24pack),
 * file inputs, external navigations (recorded, verified via curl instead).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { JSDOM, ResourceLoader, VirtualConsole } from "jsdom";
import "fake-indexeddb/auto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(join(__dirname, "..", "public", "jee-cbt.html")), "utf8");
const PUBLIC_DIR = join(__dirname, "..", "public");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const failures = [], noopCandidates = [], skipped = [], externalNavs = [];
const VERBOSE = !!process.env.VERBOSE; // VERBOSE=1 → per-no-op diagnostics
const ok = (c, label) => {
  if (c) { passed++; console.log("  ✓ " + label); }
  else { failed++; failures.push(label); console.error("  ✗ FAIL: " + label); }
};

class LocalResourceLoader extends ResourceLoader {
  fetch(url, options) {
    const path = url.startsWith("file:") ? url : url.replace(/^https?:\/\/ntacbt\.test/, "");
    if (path.startsWith("/js/") || path.startsWith("/css/")) {
      try { return Promise.resolve(readFileSync(join(PUBLIC_DIR, path.replace(/^\//, "")))); }
      catch { return Promise.reject(new Error("404 " + path)); }
    }
    return Promise.resolve(Buffer.from(""));
  }
}
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  const msg = String((e && e.message) || e);
  if (/not implemented: navigation/i.test(msg)) {
    const m = msg.match(/https?:\/\/\S+/);
    if (m && m[0].length < 300) externalNavs.push(m[0].replace(/["')\]]+$/, ""));
    return; // external link — verified via curl, not a bug
  }
  errors.push("jsdom: " + msg.slice(0, 200));
});
const dom = new JSDOM(html, {
  url: "https://ntacbt.test/jee-cbt.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  resources: new LocalResourceLoader(),
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" });
    window.indexedDB = globalThis.indexedDB;
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {} }));
    window.confirm = () => true;
    window.alert = () => {};
    window.scrollTo = window.scrollBy = window.scroll = () => {};
    window.prompt = () => null;
  },
});
const w = dom.window;
w.addEventListener("error", (e) => errors.push("window: " + String(e.message || (e.error && e.error.message) || e).slice(0, 200)));
w.addEventListener("unhandledrejection", (e) => errors.push("promise: " + String((e.reason && e.reason.message) || e.reason || e).slice(0, 200)));
w.console.error = (...a) => errors.push("console: " + a.map((x) => String(x && x.message ? x.message : x)).join(" ").slice(0, 250));
Object.defineProperty(w.HTMLElement.prototype, "scrollIntoView", { value: () => {}, configurable: true });
const fakeCtx = new Proxy({}, { get: (_t, p) => (p === "measureText" ? () => ({ width: 10 }) : p === "getImageData" ? () => ({ data: new Uint8ClampedArray(1024) }) : (..._a) => ({ addColorStop: () => {} })), set: () => true });
w.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx; };
w.HTMLCanvasElement.prototype.toDataURL = function () { return "data:image/jpeg;base64,/9j/4AAQSkZJRg=="; };
w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob(["x"], { type: "image/jpeg" })); };
w.openedUrls = [];
w.open = (u) => { try { w.openedUrls.push(String(u).slice(0, 140)); } catch (e) {} return null; };
await new Promise((res) => setTimeout(res, 400));

const g = (expr) => { try { return w.eval(expr); } catch (e) { return "__EVALERR__:" + e.message; } };
const label = (elm) => ((elm.textContent || elm.value || elm.getAttribute("aria-label") || elm.tagName) + "").replace(/\s+/g, " ").trim().slice(0, 60);
const errDrain = () => { const e = errors.splice(0); return e; };
const cleanup = () => {
  try { w.eval(`aiChatClose()`); } catch {}
  try { const i = w.document.querySelector("#aiChatInput"); if (i) i.value = ""; } catch {}
  [...w.document.querySelectorAll(".modal")].forEach((m) => { try { m.remove(); } catch {} });
  [...w.document.querySelectorAll(".toast")].forEach((t) => { try { t.remove(); } catch {} });
  if (g(`typeof EX !== "undefined" && !!EX`)) { try { g(`endExamUI()`); } catch {} }
  w.document.querySelector("#examView")?.classList.add("hide");
};

// ---------- rich seed so every button renders ----------
g(`S.tests = []; S.attempts = []; S.bookmarks = [];`);
const bankId = g(`(function(){
  const qs = [];
  const subs = ["Physics","Chemistry","Mathematics"];
  const chs = { Physics: ["Kinematics","Laws of Motion"], Chemistry: ["Mole Concept","Atomic Structure"], Mathematics: ["Quadratic Equations","Matrices"] };
  let n = 0;
  subs.forEach(s => chs[s].forEach(c => { for (let i = 0; i < 4; i++) { n++;
    qs.push({ id: "bq" + n, subject: s, chapter: c, no: n, type: "mcq", text: s + " " + c + " Q" + i,
      options: [{label:"a",text:"A"},{label:"b",text:"B"},{label:"c",text:"C"},{label:"d",text:"D"}], answer: "a" }); } }));
  const t = { id: "click-bank", name: "Click Bank", duration: 3600, practice: true, questions: qs };
  S.tests.push(t);
  const resp = {}; qs.forEach((q, i) => { resp[q.id] = { ans: i % 5 === 4 ? "__wrong__" : "a", time: 20 }; });
  const r = evaluate(t, resp);
  S.attempts.push({ id: "click-att", testId: t.id, startedAt: Date.now()-600000, submittedAt: Date.now()-300000, responses: resp, result: r, timeTaken: 300 });
  const tk = todayKey(Date.now());
  const dk = (o) => { const d = new Date(); d.setDate(d.getDate()+o); return todayKey(d); };
  S.aiPlanner = { profile: { subjects: subs, topics: { Physics: [["Kinematics",2,3]], Chemistry: [["Mole Concept",2,3]], Mathematics: [["Quadratic Equations",2,3]] }, days: 30, dailyMin: 240, target: "jeemain", depth: "standard", language: "hinglish", speed: 1.25, style: "weekly", channels: {}, institutes: {}, teachers: {}, teacherNames: {}, startDate: dk(-5) },
    tasks: [
      { id: "c-od", subject: "Physics", topic: "Kinematics", kind: "learn", diff: 2, wt: 2, depth: "lecture", estMin: 60, status: "todo", date: dk(-2) },
      { id: "c-t1", subject: "Physics", topic: "Laws of Motion", kind: "learn", diff: 2, wt: 2, depth: "lecture", estMin: 60, status: "todo", date: tk },
      { id: "c-t2", subject: "Chemistry", topic: "Mole Concept", kind: "revision", diff: 2, wt: 2, depth: "lecture", estMin: 30, status: "todo", date: tk },
      { id: "c-tm", subject: "Mathematics", topic: "Matrices", kind: "learn", diff: 2, wt: 2, depth: "lecture", estMin: 60, status: "todo", date: dk(1) },
    ], createdAt: Date.now()-5*86400000, actual: {} };
  S.srs = { "Physics||Kinematics": { s: 1.2, d: 0.4, due: Date.now()-5000, reps: 2, lapses: 1 } };
  S.settings.examDate = dk(30);
  save();
  return t.id;
})()`);
ok(bankId === "click-bank", "seed bank+attempt+plan ready");
errDrain();

// ---------- click rules ----------
const SKIP = /start exam|resume|start now|start test|start mock|start drill|review now|re-attempt|reset|delete|discard|clear progress|restore|remove|uninstall|sign out|log out/i;
const EXAMY = /^(start|resume|review now|open test)/i;

const SEL = "button, a[href], input[type=checkbox], input[type=radio], summary, select";
async function clickAll(scope, tag) {
  const clicked = new Set(); // tag|label signatures already exercised (re-query each time: clicks re-render)
  let wired = 0, noop = 0, skip = 0, guard = 0;
  for (;;) {
    guard++;
    if (guard > 400) break;
    const sc = tag === "drawer" ? w.document.querySelector(".modal") || scope : scope;
    const els = sc.isConnected === false ? [] : [...sc.querySelectorAll(SEL)].filter((e) => !e.disabled);
    const e = els.find((x) => !clicked.has(x.tagName + "|" + label(x)));
    if (!e) break;
    const lb = label(e);
    clicked.add(e.tagName + "|" + lb);
    if (e.type === "file" || SKIP.test(lb) || (e.tagName === "A" && /^https?:/.test(e.getAttribute("href") || ""))) { skip++; skipped.push(`${tag} :: ${e.tagName} :: ${lb}`); continue; }
    if (e.tagName === "SELECT") {
      try {
        const before = errors.length;
        e.selectedIndex = (e.selectedIndex + 1) % e.options.length;
        e.dispatchEvent(new w.Event("change", { bubbles: true }));
        await sleep(40);
        if (errors.length > before) { const el2 = errDrain(); ok(false, `${tag} :: select ${lb} threw: ${el2[0]}`); }
        else { wired++; }
      } catch (err) { ok(false, `${tag} :: select ${lb} threw sync: ${err.message}`); }
      continue;
    }
    const snap = () => ({
      route: g(`route`),
      html: w.document.querySelector("#app").innerHTML,
      kids: w.document.body.children.length,
      ex: !!g(`typeof EX !== "undefined" && !!EX`),
      chat: !w.document.querySelector("#aiChatPanel")?.classList.contains("hide"),
      ds: w.document.documentElement.getAttribute("data-theme") + "|" + w.document.body.getAttribute("data-theme") + "|" + w.document.documentElement.getAttribute("data-density") + "|" + (w.localStorage.getItem("jeecbt.v1") || "").length,
      mod: w.document.querySelectorAll(".modal").length,
      // Modals (app drawer, StudyTube theatre, backup dialogs) live on
      // document.body, NOT inside #app — so an #app-only snapshot is blind to
      // everything they re-render. Content-length + button-count per modal
      // catches filters, tabs and re-draws inside them.
      mhtml: [...w.document.querySelectorAll(".modal")].map((m) => m.textContent.replace(/\s+/g, " ").trim().length + "/" + m.querySelectorAll("button").length).join("|"),
      toast: w.document.querySelectorAll(".toast").length,
      opened: w.openedUrls.length,
    });
    const before = snap();
    const modBefore = w.document.querySelectorAll(".modal").length, toastBefore = w.document.querySelectorAll(".toast").length;
    errDrain();
    try {
      if (e.type === "checkbox" || e.type === "radio") { e.click(); await sleep(30); if (e.type === "checkbox") e.click(); }
      else e.click();
      await sleep(60);
    } catch (err) { ok(false, `${tag} :: click "${lb}" threw sync: ${String(err.message).slice(0, 160)}`); cleanup(); continue; }
    const errs = errDrain().filter((x) => !/navigation|window\.print/i.test(x));
    if (errs.length) { ok(false, `${tag} :: click "${lb}" threw: ${errs[0].slice(0, 200)}`); }
    else if (false) { wired++; }
    else {
      const after = snap();
      const changed = JSON.stringify(after) !== JSON.stringify(before);
      if (changed) wired++;
      else { noop++; if (noopCandidates.length < 60) noopCandidates.push(`${tag} :: ${e.tagName} :: ${lb}`);
        if (VERBOSE) console.log(`  … DEBUG noop ${tag} :: ${lb} | route=${after.route} mod=${after.mod} toast=${after.toast} kids=${after.kids} mhtml=${String(after.mhtml).slice(0, 40)}`); }
    }
    cleanup();
    if (tag !== "drawer" && g(`route`) !== tag) { g(`go("${tag}")`); await sleep(120); }
    if (tag === "drawer") {
      if (!w.document.querySelector(".modal")) { errDrain(); g(`appDrawerOpen(true)`); await sleep(250); errDrain(); }
      if (!w.document.querySelector(".modal")) break;
    }
  }
  console.log(`  … ${tag}: ${clicked.size} exercised, ${wired} wired, ${noop} no-op?, ${skip} skipped`);
  return { wired, noop, skip };
}

// ---------- every route ----------
const ROUTES = ["dash", "library", "pyq", "planner", "youtube", "live", "practice", "review", "notebook", "mastery", "formulas", "analytics", "upload", "search", "settings"];
for (const r of ROUTES) {
  errDrain();
  g(`go("${r}")`);
  await sleep(350);
  if (VERBOSE && r === "mastery") console.log(`  … DEBUG mastery: route=${g(`route`)} kids=${w.document.querySelector("#app").children.length} btns=${w.document.querySelectorAll("#app button").length}`);
  const errs = errDrain();
  ok(errs.length === 0, `render ${r} (${errs[0] || "clean"})`);
  if (r === "planner") { g(`go("planner")`); await sleep(200); try { w.eval(`document.querySelector('[data-atab="tools"]')?.click()`); await sleep(150); } catch {} }
  await clickAll(w.document.querySelector("#app"), r);
  cleanup();
}
// result route with real attempt
{
  errDrain();
  g(`go("result", "click-att")`);
  await sleep(350);
  const errs = errDrain();
  ok(errs.length === 0, `render result (${errs[0] || "clean"})`);
  await clickAll(w.document.querySelector("#app"), "result");
  cleanup();
}
// drawer (web preview path)
{
  errDrain();
  g(`appDrawerOpen(true)`);
  await sleep(300);
  const errs = errDrain();
  ok(errs.length === 0 && !!w.document.querySelector(".launch-app"), `drawer preview opens with tiles (${errs[0] || "clean"})`);
  const m = w.document.querySelector(".modal");
  if (m) await clickAll(m, "drawer");
  cleanup();
}
// AI chat widget: open + close + failed-send path (fetch stubbed 404)
{
  errDrain();
  w.document.querySelector("#aiChatBtn")?.click();
  await sleep(250);
  const opened = !w.document.querySelector("#aiChatPanel")?.classList.contains("hide");
  ok(opened, "AI chat opens");
  const inp = w.document.querySelector("#aiChatInput");
  if (inp && opened) {
    inp.value = "2+2=?";
    w.document.querySelector("#aiChatSend")?.click();
    await sleep(600);
  }
  const errs = errDrain();
  ok(errs.length === 0, `AI chat failed-send degrades gracefully (${errs[0] || "clean"})`);
  w.document.querySelector("#aiChatClose")?.click();
  await sleep(150);
  cleanup();
}

console.log(`\nNO-OP CANDIDATES (${noopCandidates.length}) — human verdict needed:`);
noopCandidates.slice(0, 60).forEach((s) => console.log("  ? " + s));
console.log(`\nSKIPPED (${skipped.length}) — covered by robot/journey/24pack or external:`);
[...new Set(skipped)].slice(0, 40).forEach((s) => console.log("  - " + s));
console.log(`\nEXTERNAL NAVS (${[...new Set(externalNavs)].length}):`);
[...new Set(externalNavs)].forEach((s) => console.log("  → " + s));
console.log(`\nCLICKS: passed ${passed}, failed ${failed}`);
process.exit(failed ? 1 : 0);
