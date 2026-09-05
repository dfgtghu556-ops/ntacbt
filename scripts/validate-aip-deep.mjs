#!/usr/bin/env node
/**
 * DEEP AI-PLANNER AUDIT — drives the REAL legacy app (public/jee-cbt.html +
 * public/js/app.js) in JSDOM through corrupt states, poisoned numbers,
 * scheduling edge cases and full wizard runs. Catches the crash chains and
 * silent-failure paths unit harnesses can't reach (everything planner-side
 * lives in a closure — UI driving is the only honest probe).
 *
 * Suites:
 *   A. Corrupt-state robustness (bad storage, poisoned minutes, bad profiles)
 *   B. Scheduling logic (overdue storms, resync idempotence, plan end, perf)
 *   C. Wizard end-to-end (adaptive driver, generated-plan validity)
 *
 * Exits non-zero on any failed assertion (CI-friendly). No network.
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
const tKey = (d) => {
  const x = new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
};
const NOW = Date.now(), TK = tKey(NOW), DAY = 86400000;

class LocalLoader extends ResourceLoader {
  fetch(url) {
    const u = new URL(String(url));
    if (u.origin === "https://ntacbt.test") {
      try { return Promise.resolve(readFileSync(join(ROOT, "public", u.pathname))); }
      catch { return Promise.resolve(Buffer.from("")); }
    }
    return Promise.resolve(Buffer.from(""));
  }
}

const baseProfile = (over = {}) => ({
  subjects: ["Physics"], topics: { Physics: [["Kinematics", 2, 3]] },
  days: 30, dailyMin: 240, target: "jeemain", depth: "standard",
  language: "hinglish", speed: 1.25, style: "weekly",
  channels: {}, institutes: {}, teachers: {}, teacherNames: {}, startDate: TK,
  ...over,
});
const T = (over = {}) => ({
  id: "t" + Math.random().toString(36).slice(2, 8), subject: "Physics",
  topic: "Kinematics", kind: "learn", diff: 2, wt: 2, depth: "lecture",
  estMin: 60, status: "todo", date: TK, ...over,
});

async function boot({ raw = null, seed = null, hash = "#planner", confirm = true } = {}) {
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
      if (raw !== null) window.localStorage.setItem("jeecbt.v1", raw);
      else if (seed !== null) window.localStorage.setItem("jeecbt.v1", JSON.stringify(seed));
      window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" });
      window.indexedDB = globalThis.indexedDB;
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      window.confirm = () => confirm;
      window.alert = () => {};
      window.Notification = function () {};
      window.onerror = (m) => errors.push("window: " + String(m).slice(0, 200));
    },
  });
  const w = dom.window;
  await sleep(1500);
  // dismiss any welcome modal so selectors stay unambiguous
  try {
    const wb = [...w.document.querySelectorAll(".modal button")].find((b) => /got it|let'?s start/i.test(b.textContent || ""));
    if (wb) { wb.click(); await sleep(150); }
  } catch {}
  return {
    w, errors, viewErrors,
    close() { try { dom.window.close(); } catch {} },
    store() { try { return JSON.parse(w.localStorage.getItem("jeecbt.v1") || "{}"); } catch { return null; } },
    text() { return (w.document.body.textContent || "").replace(/\s+/g, " "); },
    errorCard() { return (w.document.body.textContent || "").includes("Ye page load nahi ho paya"); },
    wizardShown() { return !!w.document.querySelector("#app .aip-steps"); },
    async gotoAI() {
      const b = [...w.document.querySelectorAll(".ptabs button")].find((x) => (x.textContent || "").includes("AI Planner"));
      if (b) { b.click(); await sleep(450); return true; }
      return false;
    },
  };
}

/* ================= SUITE A — corrupt-state robustness ================= */
console.log("== A. Corrupt-state robustness ==");
{
  const t = await boot({ raw: "{oops, not json", hash: "#dash" });
  check("A1 corrupt JSON boots to dashboard", t.w.attr === undefined && (t.w.document.querySelector("#app")?.getAttribute("aria-label") || "").includes("Dashboard"));
  check("A1 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  t.close();
}
{
  const t = await boot({ raw: "{}" });
  await t.gotoAI();
  check("A2 empty state shows wizard", t.wizardShown());
  check("A2 no error card", !t.errorCard());
  t.close();
}
{
  const t = await boot({ seed: { aiPlanner: { profile: null, tasks: null } } });
  await t.gotoAI();
  check("A3 null plan shows wizard", t.wizardShown());
  check("A3 no error card", !t.errorCard());
  t.close();
}
{
  const t = await boot({ seed: { aiPlanner: { profile: baseProfile(), tasks: "junk-string" } } });
  await t.gotoAI();
  check("A4 non-array tasks routes to wizard", t.wizardShown());
  check("A4 no error card", !t.errorCard());
  t.close();
}
{
  const seed = {
    aiPlanner: {
      profile: baseProfile(),
      tasks: [
        T({ id: "e1", topic: "NoEstMin", estMin: undefined }),
        T({ id: "e2", topic: "ZeroEst", estMin: 0 }),
        T({ id: "e3", topic: "StrEst", estMin: "abc" }),
        T({ id: "e4", topic: "NegEst", estMin: -30 }),
      ],
    },
    videoLog: {},
  };
  // JSON drops undefined — e1 truly lacks the key after round-trip
  const t = await boot({ seed });
  await t.gotoAI();
  check("A5 poisoned estMin renders", !t.errorCard());
  check("A5 no NaN/Infinity text", !/NaN|Infinity/.test(t.text()));
  check("A5 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  t.close();
}
{
  // TRUE-Infinity watch-log (raw JSON 1e999 literal — parses to Infinity in
  // memory) + roadmap Mark Done on a TODAY task (time-block crash chain).
  // NOTE: JSON.stringify(Infinity) === "null", so this must use raw storage.
  const raw = `{"aiPlanner":{"profile":${JSON.stringify(baseProfile())},"tasks":[{"id":"p1","subject":"Physics","topic":"PoisonProbe","kind":"learn","diff":2,"wt":2,"depth":"lecture","estMin":60,"status":"todo","date":"${TK}","videoId":"INFWATCHLO1"}],"createdAt":${NOW}},"videoLog":{"INFWATCHLO1":{"watchedSec":1e999,"sessions":1}}}`;
  const t = await boot({ raw });
  await t.gotoAI();
  const db = [...t.w.document.querySelectorAll('button[title="Mark Done"]')][0];
  check("A6 roadmap Done button found", !!db);
  if (db) { db.click(); await sleep(600); }
  const done = ((t.store()?.aiPlanner?.tasks) || []).find((x) => x.id === "p1") || {};
  check("A6 click completed the task", done.status === "done");
  check("A6 no error card after poisoned done", !t.errorCard());
  {
    const txt = t.text(), ix = txt.indexOf("Infinity");
    check("A6 no Infinity text", ix === -1, ix === -1 ? "" : "CTX: " + JSON.stringify(txt.slice(Math.max(0, ix - 200), ix + 100)));
  }
  check("A6 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  t.close();
}
{
  // Seeded TRUE-Infinity actual on TODAY's done task (time-block crash chain)
  const raw = `{"aiPlanner":{"profile":${JSON.stringify(baseProfile())},"tasks":[{"id":"p2","subject":"Physics","topic":"Kinematics","kind":"learn","diff":2,"wt":2,"depth":"lecture","estMin":60,"status":"done","completedAt":${NOW},"actualMin":1e999,"date":"${TK}"}],"createdAt":${NOW}},"videoLog":{}}`;
  const t = await boot({ raw });
  await t.gotoAI();
  check("A7 Infinity actual renders today view", !t.errorCard());
  check("A7 no Infinity text", !/Infinity/.test(t.text()));
  t.close();
}
{
  // Corrupt profile + Re-sync must fail LOUD (toast), never silently / fatally
  const seed = {
    aiPlanner: {
      profile: baseProfile({ subjects: undefined, days: "xx", dailyMin: -5, speed: 0, startDate: "nope" }),
      tasks: [T({ id: "c1" })],
    },
    videoLog: {},
  };
  const t = await boot({ seed });
  await t.gotoAI();
  check("A8 corrupt profile renders", !t.errorCard());
  const rb = t.w.document.querySelector("#btn-aip-resync-top");
  check("A8 resync button present", !!rb);
  if (rb) { rb.click(); await sleep(600); }
  check("A8 resync never throws uncaught", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  check("A8 app still usable after failed resync", !t.errorCard());
  t.close();
}
{
  // String watchedSec (legacy storage shape) still banks real minutes
  const seed = {
    aiPlanner: {
      profile: baseProfile(),
      tasks: [T({ id: "p3", topic: "StringWatch", date: tKey(NOW + DAY), videoId: "STRWATCHLOG" })],
    },
    videoLog: { STRWATCHLOG: { watchedSec: "300", sessions: 1 } },
  };
  const t = await boot({ seed });
  await t.gotoAI();
  const db = [...t.w.document.querySelectorAll('button[title="Mark Done"]')][0];
  if (db) { db.click(); await sleep(600); }
  const done = ((t.store()?.aiPlanner?.tasks) || []).find((x) => x.id === "p3") || {};
  check("A9 string watchedSec banks finite minutes", Number.isFinite(done.actualMin) && done.actualMin > 0, "got " + done.actualMin);
  t.close();
}
{
  // Clock-jump simulation: 10M seconds, unknown duration → must be capped, not banked
  const seed = {
    aiPlanner: {
      profile: baseProfile(),
      tasks: [T({ id: "p4", topic: "ClockJump", date: tKey(NOW + DAY), videoId: "CLOCKJUMP01" })],
    },
    videoLog: { CLOCKJUMP01: { watchedSec: 10000000, sessions: 1 } },
  };
  const t = await boot({ seed });
  await t.gotoAI();
  const db = [...t.w.document.querySelectorAll('button[title="Mark Done"]')][0];
  if (db) { db.click(); await sleep(600); }
  const done = ((t.store()?.aiPlanner?.tasks) || []).find((x) => x.id === "p4") || {};
  check("A10 clock-jump watch capped (≤1440)", typeof done.actualMin !== "number" || done.actualMin <= 1440, "got " + done.actualMin);
  check("A10 no error card", !t.errorCard());
  t.close();
}

/* ================= SUITE B — scheduling logic ================= */
console.log("== B. Scheduling logic ==");
{
  // B1 overdue storm, answer YES
  const tasks = [];
  const kinds = ["learn", "practice", "test", "learn", "practice"];
  for (let i = 0; i < 25; i++)
    tasks.push(T({ id: "o" + i, topic: "Overdue" + i, kind: kinds[i % 5], date: tKey(NOW - (1 + (i % 5)) * DAY), estMin: 30 + (i % 4) * 20 }));
  const t = await boot({ seed: { aiPlanner: { profile: baseProfile(), tasks }, videoLog: {} } });
  await t.gotoAI();
  await sleep(800); // rebalance prompt appears after 400ms
  const yes = [...t.w.document.querySelectorAll(".modal [data-yes]")].find((b) => /baant do/i.test(b.textContent || ""));
  check("B1 rebalance prompt appears", !!yes);
  if (yes) { yes.click(); await sleep(800); }
  const after = ((t.store()?.aiPlanner?.tasks) || []).filter((x) => x.status === "todo" && x.kind !== "revision");
  check("B1 all overdue re-dated ≥ today", after.every((x) => x.date >= TK), "stale: " + after.filter((x) => x.date < TK).length);
  check("B1 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  t.close();
}
{
  // B2 overdue storm, answer NO (Cancel)
  const tasks = [];
  for (let i = 0; i < 8; i++) tasks.push(T({ id: "n" + i, topic: "NoReb" + i, date: tKey(NOW - 2 * DAY) }));
  const t = await boot({ seed: { aiPlanner: { profile: baseProfile(), tasks }, videoLog: {} } });
  await t.gotoAI();
  await sleep(800);
  const no = [...t.w.document.querySelectorAll(".modal [data-no]")][0];
  check("B2 cancel button found", !!no);
  if (no) { no.click(); await sleep(500); }
  const after = ((t.store()?.aiPlanner?.tasks) || []).filter((x) => x.status === "todo");
  check("B2 dates untouched after Cancel", after.every((x) => x.date < TK));
  check("B2 no error card", !t.errorCard());
  t.close();
}
{
  // B3 plan already ended
  const seed = {
    aiPlanner: {
      profile: baseProfile({ startDate: tKey(NOW - 60 * DAY), days: 30 }),
      tasks: [T({ id: "e1", date: tKey(NOW - 40 * DAY) }), T({ id: "e2", date: tKey(NOW - 35 * DAY), status: "done", completedAt: NOW - 35 * DAY, actualMin: 40 })],
    },
    videoLog: {},
  };
  const t = await boot({ seed });
  await t.gotoAI();
  check("B3 ended plan renders", !t.errorCard());
  check("B3 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  t.close();
}
{
  // B4 resync idempotence
  const seed = {
    aiPlanner: {
      profile: baseProfile(),
      tasks: [
        T({ id: "r1", status: "done", completedAt: NOW - DAY, actualMin: 50 }),
        T({ id: "r2", topic: "Waves", date: tKey(NOW + DAY) }),
        T({ id: "r3", kind: "revision", date: tKey(NOW - 2 * DAY) }),
      ],
    },
    videoLog: {},
  };
  const t = await boot({ seed });
  await t.gotoAI();
  const snap = () => ((t.store()?.aiPlanner?.tasks) || []).map((x) => [x.subject, x.topic, x.kind, x.date, x.status].join("|")).sort().join(";");
  const clickResync = async () => { const b = t.w.document.querySelector("#btn-aip-resync-top"); if (b) { b.click(); await sleep(700); return true; } return false; };
  check("B4 first resync runs", await clickResync());
  const s1 = snap();
  check("B4 second resync runs", await clickResync());
  const s2 = snap();
  check("B4 resync is idempotent", s1 === s2 && s1.length > 0);
  t.close();
}
{
  // B5 empty task list
  const t = await boot({ seed: { aiPlanner: { profile: baseProfile(), tasks: [] }, videoLog: {} } });
  await t.gotoAI();
  check("B5 empty plan renders", !t.errorCard() && !t.wizardShown());
  check("B5 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  t.close();
}
{
  // B6 perf: 1200 tasks
  const tasks = [];
  for (let i = 0; i < 1200; i++)
    tasks.push(T({ id: "m" + i, topic: "Bulk" + (i % 60), kind: ["learn", "practice", "revision", "test"][i % 4], date: tKey(NOW + ((i % 45) - 5) * DAY), status: i % 7 === 0 ? "done" : "todo", completedAt: i % 7 === 0 ? NOW - DAY : undefined, actualMin: i % 7 === 0 ? 45 : undefined }));
  const t = await boot({ seed: { aiPlanner: { profile: baseProfile(), tasks }, videoLog: {} } });
  const t0 = Date.now();
  await t.gotoAI();
  const dt = Date.now() - t0;
  check("B6 1200-task plan renders <12s", !t.errorCard() && dt < 12000, dt + "ms");
  check("B6 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  t.close();
}
{
  // B7 revision-only stale overdue → pruned, no rebalance prompt
  const tasks = [];
  for (let i = 0; i < 6; i++) tasks.push(T({ id: "v" + i, kind: "revision", date: tKey(NOW - (8 + i) * DAY) }));
  tasks.push(T({ id: "vok", date: TK }));
  const t = await boot({ seed: { aiPlanner: { profile: baseProfile(), tasks }, videoLog: {} } });
  await t.gotoAI();
  await sleep(900);
  const left = ((t.store()?.aiPlanner?.tasks) || []).filter((x) => x.kind === "revision" && x.status === "todo");
  check("B7 stale revisions pruned", left.length === 0, "left: " + left.length);
  const prompt = [...t.w.document.querySelectorAll(".modal [data-yes]")].find((b) => /baant do/i.test(b.textContent || ""));
  check("B7 no rebalance prompt for revisions-only", !prompt);
  t.close();
}
{
  // B8 ahead-of-schedule (future done) renders + counts
  const seed = {
    aiPlanner: {
      profile: baseProfile(),
      tasks: [
        T({ id: "a1", status: "done", completedAt: NOW - 3600000, actualMin: 45 }),
        T({ id: "a2", topic: "Waves", date: tKey(NOW + 2 * DAY), status: "done", completedAt: NOW - 7200000, actualMin: 60 }),
      ],
    },
    videoLog: {},
  };
  const t = await boot({ seed });
  await t.gotoAI();
  check("B8 ahead-state renders", !t.errorCard());
  check("B8 done count honest (2/2)", /2\s*\/\s*2/.test(t.text()), t.text().slice(0, 120));
  t.close();
}

/* ================= SUITE C — wizard end-to-end ================= */
console.log("== C. Wizard end-to-end ==");
async function driveWizard(t, { customDays = null } = {}) {
  // Adaptive driver: clicks Continue; when a step blocks (same step twice),
  // picks one unclicked option, then retries Continue (alternating).
  // NOTE: every render() replaces all button nodes, so clicked-options are
  // tracked by TEXT, never by element identity.
  const clickedText = new Set();
  let lastStep = null, stuck = 0;
  for (let i = 0; i < 60; i++) {
    const app = t.w.document.querySelector("#app");
    if (!app || !t.wizardShown()) return t.store()?.aiPlanner?.tasks?.length ? "started" : "left-wizard";
    const stepEl = t.w.document.querySelector(".aip-steps .st.on .lb");
    const step = stepEl ? stepEl.textContent.trim() : "?";
    // scope to wizard cards only — never the planner sub-tabs or modals
    const btns = [...app.querySelectorAll(".card button")].filter((b) => !b.disabled && (b.textContent || "").trim());
    const start = btns.find((b) => /Start My Planner/.test(b.textContent));
    if (start) { start.click(); await sleep(600); return (t.store()?.aiPlanner?.tasks?.length || 0) > 0 ? "started" : "start-no-plan"; }
    if (customDays && /Days/.test(step)) {
      const num = app.querySelector('input[type="number"], input[inputmode="numeric"]');
      if (num && num.value !== String(customDays)) {
        num.focus();
        num.value = String(customDays);
        num.dispatchEvent(new t.w.Event("input", { bubbles: true }));
        num.dispatchEvent(new t.w.Event("change", { bubbles: true }));
        await sleep(250);
        const apply = btns.find((b) => /^Apply$/.test((b.textContent || "").trim()));
        if (apply) { apply.click(); await sleep(300); }
      }
    }
    const cont = btns.find((b) => /Continue|Set daily budget|→/.test(b.textContent || ""));
    stuck = step === lastStep ? stuck + 1 : 0;
    lastStep = step;
    if (cont && stuck === 0) { cont.click(); await sleep(400); continue; }
    if (!cont && stuck === 0) { await sleep(300); continue; }
    // blocked: click one unclicked, non-nav option, then retry Continue next round
    const label = (b) => (b.textContent || "").trim().replace(/\s+/g, " ");
    const opt = btns.find((b) => !clickedText.has(label(b)) && !/Continue|Back|Skip|Start My Planner|^✓$/.test(label(b)));
    if (!opt) return "stuck@" + step;
    clickedText.add(label(opt));
    opt.click();
    await sleep(300);
    lastStep = null; // force Continue retry
  }
  return "timeout";
}
const planValid = (tasks) => {
  if (!Array.isArray(tasks) || !tasks.length) return "no tasks";
  const kinds = new Set(["learn", "practice", "revision", "advanced", "test"]);
  for (const x of tasks) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || "") || isNaN(new Date(x.date + "T00:00:00").getTime())) return "bad date: " + x.date;
    if (!Number.isFinite(x.estMin) || x.estMin <= 0) return "bad estMin: " + x.estMin;
    if (!kinds.has(x.kind)) return "bad kind: " + x.kind;
    if (!x.subject || !x.topic) return "missing subject/topic";
  }
  return null;
};
{
  const t = await boot({ seed: { videoLog: {} } });
  await t.gotoAI();
  const res = await driveWizard(t);
  const tasks = t.store()?.aiPlanner?.tasks;
  check("C1 wizard completes with defaults", res === "started", res);
  check("C1 generated plan valid (" + (tasks?.length || 0) + " tasks)", planValid(tasks) === null, planValid(tasks) || "");
  check("C1 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  check("C1 no NaN text after generate", !/NaN|Infinity/.test(t.text()));
  t.close();
}
{
  const t = await boot({ seed: { videoLog: {} } });
  await t.gotoAI();
  const res = await driveWizard(t, { customDays: 10 });
  const prof = t.store()?.aiPlanner?.profile;
  const tasks = t.store()?.aiPlanner?.tasks;
  check("C2 custom-days wizard completes", res === "started", res);
  check("C2 days sane after custom entry", prof && Number.isFinite(prof.days) && prof.days > 0, "days=" + prof?.days);
  check("C2 custom plan valid", planValid(tasks) === null, planValid(tasks) || "");
  t.close();
}
{
  // C3: hammer advance buttons with zero selections — must never crash or half-generate
  const t = await boot({ seed: { videoLog: {} } });
  await t.gotoAI();
  for (let i = 0; i < 10; i++) {
    const cont = [...t.w.document.querySelectorAll("#app .card button")].find((b) => /Continue|Set daily budget|→/.test(b.textContent || ""));
    if (!cont) break;
    cont.click();
    await sleep(300);
  }
  check("C3 blind Continue never crashes", !t.errorCard());
  check("C3 zero fatal errors", t.errors.length === 0, t.errors.slice(0, 2).join(" | "));
  t.close();
}

console.log(`\nDEEP-AIP: passed ${passed}, failed ${failed}`);
process.exit(failed ? 1 : 0);
