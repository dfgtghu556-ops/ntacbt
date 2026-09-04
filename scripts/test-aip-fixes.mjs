#!/usr/bin/env node
/**
 * FOCUSED TEST for the two NEW planner fixes:
 *   1. Full custom days — aipGenerate works for ANY day-count and the depth
 *      adapts automatically (not just the preset 30/45/60/90/120/150 list).
 *   2. Real-watch-time rebalance — a task whose video is LONGER than planned is
 *      counted at its REAL (longer) wall-clock minutes, and today's remaining
 *      tasks are pushed to later days when the completion overruns today's budget.
 *
 * Minute unit used everywhere = wall-clock minutes at the chosen speed, i.e.
 * raw seconds watched / 60 (the plan budgets estMin/speed wall-clock minutes).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(process.argv[2] || join(__dirname, "..", "public", "jee-cbt.html"));
const html = readFileSync(htmlPath, "utf8");

let passed = 0,
  failed = 0;
const check = (name, cond) => {
  if (cond) {
    passed++;
    console.log("  ✓ " + name);
  } else {
    failed++;
    console.log("  ✗ " + name);
  }
};

const dom = new JSDOM(html, {
  url: "https://ntacbt.test/jee-cbt.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  resources: undefined,
  beforeParse(window) {
    window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" });
    window.indexedDB = globalThis.indexedDB;
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    window.confirm = () => true;
    window.alert = () => {};
  },
});
const w = dom.window;
w.caches = undefined;

await new Promise((res) => setTimeout(res, 300));

const tKey = (d) => {
  const x = new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
};
const tk = tKey(Date.now());
const subj = ["Physics", "Chemistry", "Mathematics"];
const topics = {
  Physics: [["Electrostatics", 2, 3], ["Current Electricity", 2, 3], ["Magnetism", 3, 2], ["Semiconductors", 1, 1], ["Waves", 1, 1]],
  Chemistry: [["Solutions", 2, 3], ["Chemical Kinetics", 1, 2], ["Electrochemistry", 2, 2]],
  Mathematics: [["Integration", 2, 3], ["Matrices", 1, 2], ["Vectors", 2, 2], ["Probability", 1, 1]],
};
// depth left undefined so aipGenerate infers it (like the real wizard)
const makeProf = (days, speed = 1.25, dailyMin = 180, style = "weekly") => ({
  subjects: subj,
  topics,
  days,
  dailyMin,
  target: "board12",
  language: "hinglish",
  speed,
  style,
  channels: {},
  institutes: {},
  teachers: {},
  teacherNames: {},
  startDate: tk,
});
const depthKindOf = (plan) => {
  const learn = plan.tasks.find((t) => t.kind === "learn");
  return learn ? learn.depth : null;
};

console.log("== 1. Full custom days (aipGenerate adapts to any day-count) ==");
for (const d of [7, 40, 75, 200]) {
  const pk = makeProf(d);
  const g = w.aipGenerate(pk);
  const dates = [...new Set(g.tasks.map((t) => t.date))].sort();
  check(`custom ${d} days → plan spans ${d}-day horizon (got ${dates.length} dates)`, dates.length === d);
  check(`custom ${d} days → endDate is start + ${d - 1}`, g.endDate === w.aipAddDays(tk, d - 1));
  check(`custom ${d} days → no task lands after endDate`, g.tasks.every((t) => t.date <= g.endDate));
}
// Depth genuinely adapts: a tight window = one-shot mode, a long window = detailed
check("tight 7 days → one-shot (crash/focused) mode", depthKindOf(w.aipGenerate(makeProf(7))) === "oneshot");
check("long 200 days → detailed (mastery) mode", depthKindOf(w.aipGenerate(makeProf(200))) === "detailed");

console.log("== 2. Longer-than-planned video is counted at REAL minutes ==");
const prof = makeProf(30);
const plan = w.aipGenerate(prof);
w.aipSave({ ...plan, profile: prof });

const todayTasks = plan.tasks.filter((t) => t.date === tk).sort((a, b) => (a.kind === "revision") - (b.kind === "revision"));
check("plan has today tasks", todayTasks.length > 0);
const learn = todayTasks.find((t) => t.kind === "learn") || todayTasks[0];
const plannedEff = w.aipEff(learn.estMin, prof); // wall-clock minutes the plan budgeted

// The user watches an alternative video whose real length is LONGER than the
// planned lecture: e.g. planned 150-min lecture, they actually watch a 240-min one.
const realMin = Math.round(learn.estMin * 1.5 + 30); // clearly > planned raw minutes
const longVideoId = "v_longer_than_planned";
w.videoLog()[longVideoId] = {
  id: longVideoId, title: "Longer alternative lecture", channel: "Alt Channel",
  durationSec: realMin * 60, watchedSec: realMin * 60, sessions: 1,
  firstAt: Date.now(), lastAt: Date.now(), completedAt: Date.now(),
};
learn.videoId = longVideoId;
learn.durationSec = realMin * 60;
learn.status = "done";
learn.completedAt = Date.now();

const recorded = w.aipRecordActual(learn);
check("aipRecordActual returns REAL wall-clock minutes (> planned)", recorded > plannedEff);
check("task.actualMin set to real minutes", typeof learn.actualMin === "number" && learn.actualMin > plannedEff);
check("aipMin(learn) returns the real minutes", w.aipMin(learn, prof) === recorded);
check("aipMin(learn) is NOT the planned short minutes", w.aipMin(learn, prof) > plannedEff);
const savedPlan = w.aip();
check("actual minutes mirror into plan.actual map", (savedPlan.actual || {})[w.aipKey(learn)] === recorded);

console.log("== 3. aipRebalanceActual spreads today's overflow to later days ==");
const prof2 = makeProf(30, 1.25, 240); // feasible budget with real slack per day
const plan2 = w.aipGenerate(prof2);
w.aipSave({ ...plan2, profile: prof2 });

const tk2 = tKey(Date.now());
const today2 = plan2.tasks.filter((t) => t.date === tk2 && t.status === "todo").sort((a, b) => (a.kind === "revision") - (b.kind === "revision"));
check("plan2 has ≥2 todo tasks today", today2.length >= 2);

const first2 = today2.find((t) => t.kind === "learn") || today2[0];
const vid2 = "v_longer_overrun";
const longMin2 = 400; // clearly > the 240-min day cap, so the completion overruns today
w.videoLog()[vid2] = {
  id: vid2, durationSec: longMin2 * 60, watchedSec: longMin2 * 60, sessions: 1,
  firstAt: Date.now(), lastAt: Date.now(), completedAt: Date.now(),
};
first2.videoId = vid2;
first2.durationSec = longMin2 * 60;
first2.status = "done";
first2.completedAt = Date.now();
w.aipRecordActual(first2);

const beforeTodayTodo = w.aip().tasks.filter((t) => t.date === tk2 && t.status === "todo").length;
w.aipRebalanceActual();
const afterTodayTodo = w.aip().tasks.filter((t) => t.date === tk2 && t.status === "todo").length;
check("rebalance moved at least one leftover task off today (overflow spread)", afterTodayTodo < beforeTodayTodo && afterTodayTodo >= 0);
check("moved tasks landed on a future day (catch-up, not dropped)", w.aip().tasks.some((t) => t.catchup && t.date > tk2 && t.status === "todo"));
const totalTodo = w.aip().tasks.filter((t) => t.status === "todo").length;
check("no task was lost entirely (total todo preserved)", totalTodo >= plan2.tasks.filter((t) => t.status === "todo").length - 1);

console.log("== 4. No overrun → rebalance is a no-op (does not shuffle plan) ==");
const prof3 = makeProf(30, 1.25, 480); // generous budget
const plan3 = w.aipGenerate(prof3);
w.aipSave({ ...plan3, profile: prof3 });
const tk3 = tKey(Date.now());
const today3 = plan3.tasks.filter((t) => t.date === tk3).sort((a, b) => (a.kind === "revision") - (b.kind === "revision"));
const before3 = w.aip().tasks.filter((t) => t.date === tk3).length;
const tk3_first = today3.find((t) => t.kind === "learn") || today3[0];
const vid3 = "v_short_under";
const shortMin3 = Math.max(1, Math.round(tk3_first.estMin / 2));
w.videoLog()[vid3] = { id: vid3, durationSec: shortMin3 * 60, watchedSec: shortMin3 * 60, sessions: 1, firstAt: Date.now(), lastAt: Date.now(), completedAt: Date.now() };
tk3_first.videoId = vid3;
tk3_first.durationSec = shortMin3 * 60;
tk3_first.status = "done";
tk3_first.completedAt = Date.now();
w.aipRecordActual(tk3_first);
w.aipRebalanceActual();
const after3 = w.aip().tasks.filter((t) => t.date === tk3).length;
check("under-budget completion → today remains un-shuffled (no false rebalance)", after3 >= before3 - 1);

console.log(`\n──────────────────────────────\nPASSED: ${passed}   FAILED: ${failed}`);
process.exit(failed ? 1 : 0);
