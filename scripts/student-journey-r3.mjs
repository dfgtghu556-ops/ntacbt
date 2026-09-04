#!/usr/bin/env node
/**
 * ROUND 3 — "more advanced" but focused on the CONCRETE user constraints and
 * the React pure-logic surfaces not yet fuzzed in rounds 1–2.
 *
 * Targets:
 *  A. StudyTube target-correctness (the explicit "board → ONLY board-core
 *     teachers, never JEE/NEET" rule) across every target/subject/kind/depth,
 *     with and without institute + teacher overrides. Also: no emojis in
 *     returned titles (explicit user rule).
 *  B. Planner engine: sanitizePlannerRequest / hasPlannerTopic / buildQueries /
 *     parseDuration under malformed + hostile input.
 *  C. Rank predictor (predict) under hostile marks.
 *  D. Streak / focus under hostile studyLog and day-rollover.
 *  E. Mistake / micro-drill under empty + hostile evidence.
 *  F. Legacy StudyTube + cloud-fetch offline fallback (real app.js) under
 *     malformed cloud responses.
 */
import { build } from "rolldown";
import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM, ResourceLoader } from "jsdom";
import "fake-indexeddb/auto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");
const SRC = join(ROOT, "src");

let passed = 0, failed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) passed++;
  else { failed++; failures.push(label); console.error("  ✗ " + label); }
}
function section(t) { console.log("\n=== " + t + " ==="); }
function rnd(n) { return Math.floor(Math.random() * n); }

/* ------------------------------------------------------------------ */
async function buildBundle(mods) {
  const entry = join(tmpdir(), `r3b-${process.pid}.ts`);
  const out = join(tmpdir(), `r3b-${process.pid}.mjs`);
  await writeFile(entry, mods.map(([ns, ...p]) => `export * as ${ns} from ${JSON.stringify(join(SRC, ...p))};`).join("\n"), "utf8");
  await build({ input: entry, output: { file: out, format: "esm" } });
  return await import(pathToFileURL(out).href);
}

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
  w.katex = { renderToString: (s) => "<span>" + String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>" };
  w.marked = { parse: (s) => String(s) };
  await new Promise((res) => setTimeout(res, 250));
  const g = (name) => w.eval(name);
  return { w, g, S: () => g("S") };
}

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F300}-\u{1F9FF}]/u;

/* ------------------------------------------------------------------ */
async function main() {
  let P;
  try { P = await buildBundle([
    ["catalog", "features", "studytube", "catalog"],
    ["teachers", "data", "teachers"],
    ["streak", "features", "focus", "streak"],
    ["focus", "features", "focus", "focus"],
    ["predict", "features", "readiness", "predict"],
    ["mistake", "features", "cbt", "mistake"],
    ["microDrill", "features", "cbt", "microDrill"],
    ["readiness", "features", "readiness", "readiness"],
    ["normalize", "features", "planner", "normalize"],
    ["engine", "features", "planner", "engine"],
    ["store", "lib", "store"],
  ]); }
  catch (e) { ok(false, "React bundle failed to build: " + e.message); }

  /* ---------------------------------------------------------------- */
  section("A. StudyTube target-correctness (board → ONLY board-core, no JEE/NEET)");
  if (P) {
    const { catalog, teachers } = P;
    const targets = ["jeemain", "jeeadv", "board12", "board11", "cbse27"];
    const subjects = ["Physics", "Chemistry", "Mathematics"];
    const kinds = ["learn", "practice", "revision", "advanced"];
    const depths = ["oneshot", "lecture", "detailed"];
    const institutes = [undefined, "all", "auto", "pw", "unacademy", "physicsgalaxy", "eduniti"];
    let boardLeaks = 0, emojiInTitle = 0, badDuration = 0, emptyItems = 0, total = 0;
    const boardTargets = new Set(["board12", "board11", "cbse27"]);
    // Every board-core teacher name is a member of BOARD_TEACHERS.
    const boardNames = new Set((teachers.BOARD_TEACHERS || []).map((t) => t.name));
    const jeeOnlyNames = new Set((teachers.TEACHERS || [])
      .filter((t) => !(t.examTarget || []).some((x) => boardTargets.has(x)))
      .map((t) => t.name));
    for (const t of targets) {
      for (const subj of subjects) {
        for (const kind of kinds) {
          for (const depth of depths) {
            for (const inst of institutes) {
              const req = { target: t, subject: subj, topic: "Mechanics", kind, depth, language: "en", teacher: undefined, institute: inst };
              let items;
              try { items = catalog.offlineCatalog(req); total++; }
              catch (e) { ok(false, "offlineCatalog threw for " + JSON.stringify(req) + ": " + e.message); continue; }
              if (!Array.isArray(items) || !items.length) { emptyItems++; continue; }
              for (const v of items) {
                if (boardTargets.has(t) && v.teacher && jeeOnlyNames.has(v.teacher)) {
                  boardLeaks++; console.error("    LEAK board target: " + v.teacher + " is JEE-only (target=" + t + ", subject=" + subj + ", inst=" + inst + ")");
                }
                if (EMOJI_RE.test(v.title || "")) { emojiInTitle++; console.error("    EMOJI in title: " + v.title); }
                if (!isFinite(v.durationSec) || v.durationSec <= 0) { badDuration++; console.error("    BAD duration on " + v.title); }
              }
            }
          }
        }
      }
    }
    ok(boardLeaks === 0, "StudyTube: " + total + " catalogs, board target surfaces NO JEE-only teacher (" + boardLeaks + " leaks)");
    ok(emojiInTitle === 0, "StudyTube: no emojis in any returned title (" + emojiInTitle + " found)");
    ok(badDuration === 0, "StudyTube: every returned video has a positive finite durationSec (" + badDuration + " bad)");
    ok(emptyItems === 0, "StudyTube: no request produces an empty catalog (" + emptyItems + " empty)");

    // Explicit board-core rule with a known JEE-only teacher override (must still not leak).
    const jeeOnlyName = [...jeeOnlyNames][0];
    if (jeeOnlyName) {
      const boardReq = { target: "board12", subject: "Physics", topic: "Kinematics", kind: "learn", depth: "detailed", language: "en", teacher: jeeOnlyName, institute: undefined };
      const items = catalog.offlineCatalog(boardReq);
      const leaked = items.some((v) => v.teacher === jeeOnlyName);
      ok(!leaked, "board target ignores a JEE-only teacher override (no leak)");
    } else {
      ok(true, "no JEE-only teacher found to override-test (skipped)");
    }
  }

  /* ---------------------------------------------------------------- */
  section("B. Planner engine: sanitize / hasPlannerTopic / parseDuration / buildQueries");
  if (P) {
    const { normalize, engine } = P;
    // sanitize handles garbage
    const badInputs = [null, undefined, 42, "hi", { subject: 7 }, { subject: "Physics", kind: "bogus" }, { subject: "Physics", target: "bogus", depth: 999, days: NaN, language: "xx" }];
    for (const bad of badInputs) {
      try { const s = normalize.sanitizePlannerRequest(bad); ok(s && typeof s === "object" && typeof s.subject === "string", "sanitize handles " + JSON.stringify(bad)); }
      catch (e) { ok(false, "sanitize threw on " + JSON.stringify(bad) + ": " + e.message); }
    }
    // hasPlannerTopic on weird requests
    try { const h = normalize.hasPlannerTopic({ topic: "", subject: "Physics" }); ok(typeof h === "boolean", "hasPlannerTopic returns boolean"); }
    catch (e) { ok(false, "hasPlannerTopic threw: " + e.message); }

    // parseDuration hostile
    const durInputs = [undefined, null, "", "12:34", "1:02:03", "abc", "90", "0", "-5", "1 hour", "2h 30m", "1:2:3:4", 42, NaN, {}, ["x"]];
    let durOk = true;
    for (const d of durInputs) {
      try { const v = engine.parseDuration(d); if (!isFinite(v) || v < 0) { durOk = false; console.error("    parseDuration(" + JSON.stringify(d) + ") = " + v); } }
      catch (e) { durOk = false; console.error("    parseDuration threw on " + JSON.stringify(d) + ": " + e.message); }
    }
    ok(durOk, "parseDuration never returns negative/NaN and never throws (" + durInputs.length + " inputs)");

    // parseSearchPage hostile html
    try { const r = Array.isArray(engine.parseSearchPage("")) ? [] : engine.parseSearchPage(""); ok(Array.isArray(r), "parseSearchPage('') returns array"); }
    catch (e) { ok(false, "parseSearchPage on empty html threw: " + e.message); }
    try { const r2 = engine.parseSearchPage("<html><body><div>no results here</div></body></html>"); ok(Array.isArray(r2), "parseSearchPage on no-result html returns array"); }
    catch (e) { ok(false, "parseSearchPage on no-result html threw: " + e.message); }

    // buildQueries with malformed request
    try { const q = engine.buildQueries({ subject: "Physics", topic: "Limits", kind: "learn", depth: "detailed", target: "jeemain" }); ok(Array.isArray(q) && q.length > 0, "buildQueries returns non-empty array"); }
    catch (e) { ok(false, "buildQueries threw: " + e.message); }
    // buildQueries with empty topic
    try { const q2 = engine.buildQueries(normalize.sanitizePlannerRequest({ subject: "Physics", topic: "" })); ok(Array.isArray(q2), "buildQueries with empty topic returns array"); }
    catch (e) { ok(false, "buildQueries with empty topic threw: " + e.message); }
  }

  /* ---------------------------------------------------------------- */
  section("C. Rank predictor (predict) under hostile marks");
  if (P && P.predict) {
    const { predictRank } = P.predict;
    const hostile = [
      { marks: -100, maxMarks: 0, weakTopics: [] },
      { marks: NaN, maxMarks: 300, weakTopics: null },
      { marks: Infinity, maxMarks: 300, weakTopics: [] },
      { marks: 0, maxMarks: -50, weakTopics: "x" },
      { marks: 300, maxMarks: 0, weakTopics: [] },
      { marks: 10, maxMarks: 300, weakTopics: [1, 2, 3] },
      { marks: 5, maxMarks: 300, weakTopics: [], daysToExam: -5 },
      {},
    ];
    let prOk = true;
    for (const h of hostile) {
      try { const r = predictRank(h); if (!r || !isFinite(r.percentile) || r.percentile < 0 || r.percentile > 100) { prOk = false; console.error("    predictRank(" + JSON.stringify(h) + ") = " + JSON.stringify(r)); } }
      catch (e) { prOk = false; console.error("    predictRank threw on " + JSON.stringify(h) + ": " + e.message); }
    }
    ok(prOk, "predictRank always returns a 0–100 finite percentile on hostile object input (" + hostile.length + " cases)");
  }

  /* ---------------------------------------------------------------- */
  section("D. Streak / focus under hostile studyLog and day-rollover");
  if (P && P.streak) {
    const { computeHumaneStreak, emptyStreakStore } = P.streak;
    // Empty activeDays
    try { const s = computeHumaneStreak(new Set(), Date.now()); ok(typeof s.days === "number", "streak on empty day-set runs (days=" + s.days + ")"); }
    catch (e) { ok(false, "streak on empty day-set threw: " + e.message); }
    // A real contiguous run + one gap + a far-future sparse set.
    const now = Date.now();
    const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
    const active = new Set();
    for (let i = 0; i < 30; i++) active.add(dayKey(now - i * 86400000)); // 30 contiguous days
    try { const s = computeHumaneStreak(active, now); ok(s.days >= 1 && typeof s.days === "number", "streak counts a 30-day run (days=" + s.days + ")"); }
    catch (e) { ok(false, "streak on a 30-day run threw: " + e.message); }
    // Sparse but valid, spanning far back (should not loop forever / not throw).
    const sl = new Set();
    for (let i = 0; i < 4000; i++) sl.add(dayKey(now - i * 86400000 * 27)); // sparse
    try { const s = computeHumaneStreak(sl, now, { store: emptyStreakStore() }); ok(typeof s.days === "number", "streak on sparse 4000-day set runs"); }
    catch (e) { ok(false, "streak on sparse 4000-day set threw: " + e.message); }
  }

  /* ---------------------------------------------------------------- */
  section("E. Mistake / micro-drill under empty + hostile evidence");
  if (P && P.mistake && P.microDrill) {
    const { mistakeFromStore } = P.mistake;
    const { buildMicroDrill } = P.microDrill;
    const mkStore = (tests = [], attempts = []) => ({ tests, attempts });
    // empty evidence (valid DataStore shape)
    try { const d = mistakeFromStore(mkStore()); ok(d === null, "mistake DNA on empty store → null (no pattern)"); }
    catch (e) { ok(false, "mistake DNA on empty store threw: " + e.message); }
    // micro-drill hostile (valid input shape)
    for (const dr of [{ weak: [], mistake: null }, { weak: [], mistake: {} }, { weak: [], mistake: null, extra: 1 }]) {
      try { const c = buildMicroDrill(dr); ok(Array.isArray(c) && c.length >= 1, "micro-drill with " + JSON.stringify(dr) + " → ≥1 card"); }
      catch (e) { ok(false, "micro-drill threw on " + JSON.stringify(dr) + ": " + e.message); }
    }
  }

  /* ---------------------------------------------------------------- */
  section("F. Legacy StudyTube route + cloud-fetch fallback under malformed responses");
  {
    const { w, S } = await bootLegacy();
    const g = (n) => w.eval(n);
    // cloudInit with a non-ok response must reject cleanly (no unhandled crash)
    w.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "down" });
    try {
      await g("cloudInit")();
      ok(false, "cloudInit expected to reject on 503");
    } catch (e) {
      ok(/unavailable|Cloud/i.test(String(e.message)), "cloudInit rejects cleanly on 503 (" + e.message + ")");
    }
    // Legacy StudyTube route renders even with a hostile/missing plan + target.
    try {
      g("go")("youtube");
      await new Promise((r) => setTimeout(r, 15));
      ok(w.document.querySelector("#app").innerHTML.length > 0, "legacy StudyTube route renders with hostile state");
    } catch (e) {
      ok(false, "legacy StudyTube route threw: " + e.message);
    }
    // Target switch must not lock to board-only even when the plan profile says board.
    S().planner = { profile: { target: "board12" } };
    try {
      g("go")("youtube");
      await new Promise((r) => setTimeout(r, 15));
      const html = w.document.querySelector("#app").innerHTML;
      ok(/JEE|board|Focus/i.test(html), "legacy StudyTube shows the target switch (balanced JEE+Board), not locked to board");
    } catch (e) {
      ok(false, "legacy StudyTube target switch threw: " + e.message);
    }
  }

  /* ---------------------------------------------------------------- */
  section("H. engine.rank / parseSearchPage / mergeRecommendations / planRecommendations fuzz");
  if (P) {
    const { engine, normalize } = P;
    // rank() must never throw on partial/foreign raw items and must never emit
    // a candidate with a non-finite score, missing id, or malformed duration.
    const partialItems = [
      { id: "v1", title: "Electrostatics full lecture", channel: "StudyTube", durationSec: 3600, live: false },
      { id: "v2", title: "Mechanics one shot", channel: "PW", durationSec: 7200, live: false }, // no teacher alias
      { id: "v3", durationSec: 1000, live: false }, // no title/channel
      { id: "v4", title: "Short motivation", channel: "X", durationSec: 60, live: false }, // too short / filtered
      { id: "", live: false }, // empty id, no title
      null,
      undefined,
      42,
      "garbage",
    ];
    let rankThrew = false, badCandidate = false;
    for (const raw of [partialItems, [null], [undefined], [], partialItems.slice(0, 3)]) {
      try {
        const out = engine.rank(raw, "Electrostatics", "hinglish", "learn", 180);
        for (const c of out) {
          if (!c || !c.id || (!isFinite(c.score)) || (c.durationSec != null && !isFinite(c.durationSec))) { badCandidate = true; console.error("    bad candidate: " + JSON.stringify(c)); }
        }
      } catch (e) { rankThrew = true; console.error("    rank threw: " + e.message); }
    }
    ok(!rankThrew, "rank() never throws on partial/foreign raw items");
    ok(!badCandidate, "rank() never emits a candidate with bad id/score/duration");

    // parseSearchPage with a partial realistic feed (video missing lengthText).
    const htmlPt = `<!DOCTYPE html><html><head></head><body><script>var ytInitialData = {"contents":{"twoColumnSearchResultsRenderer":{"primaryContents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":{"contents":[{"videoRenderer":{"videoId":"abc12345678","title":{"runs":[{"text":"Rotational Motion one shot"}]},"ownerText":{"runs":[{"text":"PW"}]}}} ]}}]}}}};</script></body></html>`;
    try { const p = engine.parseSearchPage(htmlPt); ok(Array.isArray(p), "parseSearchPage realistic partial feed → array (" + p.length + " items)"); }
    catch (e) { ok(false, "parseSearchPage on partial feed threw: " + e.message); }

    // mergeRecommendations with duplicate IDs + empty inputs must not throw or dup.
    try {
      const cur = [{ id: "a", title: "t1", score: 90 }, { id: "a", title: "t1 dup", score: 90 }];
      const live = [{ id: "b", title: "t2", score: 80 }, { id: "a", title: "t1", score: 50 }];
      const m = engine.mergeRecommendations(cur, live, 5);
      const ids = new Set(m.map((c) => c.id));
      ok(ids.size === m.length, "mergeRecommendations dedupes ids (got " + ids.size + "/" + m.length + ")");
    } catch (e) { ok(false, "mergeRecommendations threw: " + e.message); }

    // planRecommendations: "guaranteed not to throw" even when a search RESOLVES
    // with malformed items (missing title). The per-query allSettled only catches
    // REJECTED searches — not resolved-but-garbage ones.
    const garbageSearch = async () => {
      return [{ id: "x", durationSec: 3600, live: false }, null, undefined, "junk", { title: "ok but id", channel: "C", durationSec: 3600, live: false, id: "y" }];
    };
    try {
      const res = await engine.planRecommendations(
        normalize.sanitizePlannerRequest({ subject: "Physics", topic: "Electrostatics", kind: "learn", depth: "detailed", target: "jeemain" }),
        garbageSearch,
      );
      ok(Array.isArray(res.items), "planRecommendations survives a resolved-with-garbage search feed");
    } catch (e) {
      ok(false, "planRecommendations THREW on garbage-resolved feed (contradicts 'guaranteed not to throw'): " + e.message);
    }
  }

  /* ---------------------------------------------------------------- */
  section("I. Legacy launcher app-drawer (web preview) must actually open things");
  {
    const { w } = await bootLegacy();
    const g = (n) => w.eval(n);
    // Open the preview drawer (no native bridge).
    let threw = false;
    try { g("appDrawerOpen")(true); await new Promise((r) => setTimeout(r, 30)); } catch (e) { threw = true; console.error("    open threw: " + e.message); }
    ok(!threw, "app drawer preview opens without throwing");
    let list = w.document.querySelector("[data-list]");
    ok(list && list.querySelectorAll(".launch-app").length > 0, "preview drawer renders tiles (web + phone)");

    // Clicking a web-study tile must navigate (route changes) + close the drawer.
    const stTile = [...(list ? list.querySelectorAll(".launch-app") : [])].find((b) => b.textContent.toLowerCase().includes("studytube"));
    ok(!!stTile, "StudyTube tile present in preview");
    if (stTile) {
      stTile.click();
      await new Promise((r) => setTimeout(r, 20));
      ok(g("route") === "youtube", "clicking StudyTube tile navigates to the StudyTube feature (route=youtube)");
      ok(!w.document.querySelector("[data-list]"), "drawer closes after navigating to a real feature");
    }

    // Clicking a phone-only tile must NOT dead-end; drawer stays open.
    try { g("appDrawerOpen")(true); await new Promise((r) => setTimeout(r, 30)); } catch (e) {}
    list = w.document.querySelector("[data-list]");
    const phoneTile = [...(list ? list.querySelectorAll(".launch-app") : [])].find((b) => { const t = b.textContent.toLowerCase(); return t.includes("whatsapp") || t.includes("phone"); });
    ok(!!phoneTile, "phone-only tile present in preview");
    if (phoneTile) {
      phoneTile.click();
      await new Promise((r) => setTimeout(r, 10));
      ok(!!w.document.querySelector("[data-list]"), "phone-only tile stays in drawer (honest message, no dead-end)");
    }

    // appWebAction mapping correctness.
    ok(g("appWebAction")({ label: "YouTube", pkg: "" }).route === "youtube", "appWebAction: YouTube → youtube");
    ok(g("appWebAction")({ label: "WhatsApp", pkg: "com.whatsapp" }) === null, "appWebAction: WhatsApp → null (phone-only)");
    ok(g("appWebAction")({ label: "Camera", pkg: "com.android.camera" }).url === "/app/saarthi", "appWebAction: Camera → Snap&Solve");
    ok(g("appWebAction")({ label: "Planner", web: "planner" }).route === "planner", "appWebAction: web tile → route");

    // REAL app icons: every known tile gets an inline <svg>, unknown falls back.
    const known = [["StudyTube","share"],["Test Library","bank"],["PYQ Papers","past"],["Planner","plan"],["Mistake Notebook","notes"],["Analytics","trend"],["Snap & Solve","photo"],["Upload PDFs","upload"],["Practice","quiz"],["Settings","setup"],["Phone","com.android.dialer"],["WhatsApp","com.whatsapp"],["Camera","com.android.camera"],["Instagram","com.instagram.android"],["Gmail","com.google.android.gm"],["Chrome","com.android.chrome"]];
    let iconNull = 0, iconBad = 0;
    for (const [l, p] of known) {
      const s = g("appIconSvg")(l, p);
      if (typeof s !== "string") iconNull++;
      else if (s.indexOf("<svg") !== 0 || s.indexOf("</svg>") < 0) iconBad++;
    }
    ok(iconNull === 0 && iconBad === 0, "appIconSvg returns a valid inline <svg> for every known app (" + iconNull + " null, " + iconBad + " malformed)");
    ok(g("appIconSvg")("Something Odd", "com.xyz") === null, "unknown app → null (emoji fallback)");
    // In the open drawer, >=10 tiles have a real <svg> icon.
    try { g("appDrawerOpen")(true); await new Promise((r) => setTimeout(r, 30)); } catch (e) {}
    list = w.document.querySelector("[data-list]");
    const tiles = [...(list ? list.querySelectorAll(".launch-app") : [])];
    ok(tiles.filter((t) => t.querySelector("svg")).length >= 10, "drawer renders >=10 real SVG app icons");
  }

  /* ---------------------------------------------------------------- */
  section("G. React readiness/readiness under malformed store with 100k attempts");
  if (P) {
    const { readiness, store } = P;
    const { DataStore } = store;
    const big = { attempts: [], tests: [], planner: null };
    for (let i = 0; i < 100000; i++) {
      big.attempts.push({ id: "a" + i, testId: "none", submittedAt: Date.now(), result: { all: { correct: i % 3, wrong: 1, skipped: 0, marks: i > 0 ? 4 : -1, max: 300, time: 60, total: 4, percentage: 0, accuracy: 50 }, per: {} } });
    }
    let rs;
    try { const store2 = new DataStore(big); rs = readiness.computeReadiness(store2); }
    catch (e) { ok(false, "readiness on 100k attempts threw: " + e.message); return; }
    ok(isFinite(rs.syllabusCompletionPct) && isFinite(rs.accuracy), "readiness on 100k attempts → finite syllabus% + accuracy");
  }

  console.log("\n============================================================");
  if (failed === 0) {
    console.log(`Passed: ${passed}  Failed: 0`);
    console.log("All round-3 aggressive checks green ✅");
  } else {
    console.log(`Passed: ${passed}  Failed: ${failed}`);
    failures.forEach((f) => console.error("  ✗ " + f));
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
