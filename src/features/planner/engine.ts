/**
 * AI Planner — deterministic recommendation engine.
 *
 * This is the pure, framework-free core of the StudyTube / AI-planner
 * discovery service. It:
 *  - builds topic/subject/objective-aware YouTube search queries,
 *  - parses the public YouTube search page JSON (`ytInitialData`),
 *  - ranks candidates by strict educational-fit + explainable reasons,
 *  - merges the authoritative curated lessons ahead of live candidates.
 *
 * It has NO dependency on the router/server so the exact production logic can
 * be unit-tested in isolation with a stub search function (and a huge corpus).
 *
 * The HTTP/caching/body-parsing concerns live in `routes/api/public/study-planner.ts`;
 * input hygiene lives in `./normalize`.
 */

import { INSTITUTES, findTeacher, findInstituteById, isBoardTarget } from "../../data/teachers";
import { resolveCuratedVideos } from "../../data/video-engine";
import type { PlannerRequest, PlannerDepth, PlannerKind, PlannerTarget } from "./normalize";

export interface Candidate {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  durationSec: number;
  published: string;
  score: number;
  why: string;
  teacher?: string | undefined;
  institute?: string | undefined;
  playlistUrl?: string | undefined;
  verified?: boolean | undefined;
  isCurated?: boolean | undefined;
  /**
   * True when `durationSec` is an ESTIMATE (search-pick / offline pick), not a
   * real video length. UIs must render it with a "~" prefix, and the planner
   * must never re-budget a task's minutes from an estimated duration.
   */
  durationEstimated?: boolean | undefined;
  /** When set, the item is a search-pick that opens YouTube search (no single real video id). */
  externalUrl?: string | undefined;
}

/** A real YouTube video id is exactly 11 URL-safe chars. */
export const REAL_YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Build a YouTube search URL for a synthetic/placeholder pick. */
function searchUrl(title: string, channel: string): string {
  const q = `${title} ${channel}`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/**
 * Deterministic synthetic id for an honest search-pick (never 11-char shaped,
 * so no client can mistake it for a playable video). Stable across identical
 * requests (cache/dedupe/React keys stay consistent); the index suffix keeps
 * identical lessons unique inside one response.
 */
function searchPickId(c: { title: string; channel: string; kind: string }, index: number): string {
  const s = `${c.title}|${c.channel}|${c.kind}`;
  let h = 0;
  for (let k = 0; k < s.length; k++) h = (Math.imul(31, h) + s.charCodeAt(k)) | 0;
  return `pick-${Math.abs(h).toString(36)}-${index}`;
}

export interface RawItem {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  durationSec: number;
  published: string;
  live: boolean;
}

/** A search function returning `RawItem[]`; injected so tests never hit the network. */
export type SearchFn = (query: string) => Promise<RawItem[]>;

/** Walk arbitrary JSON and collect every object under a given key. */
function collect(node: unknown, key: string, out: Record<string, unknown>[], depth = 0): void {
  if (!node || typeof node !== "object" || depth > 24) return;
  if (Array.isArray(node)) {
    for (const v of node) collect(v, key, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (k === key && obj[k] && typeof obj[k] === "object")
      out.push(obj[k] as Record<string, unknown>);
    collect(obj[k], key, out, depth + 1);
  }
}

function textOf(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const o = v as { simpleText?: string; runs?: { text?: string }[] };
  if (typeof o.simpleText === "string") return o.simpleText;
  if (Array.isArray(o.runs)) return o.runs.map((r) => r?.text || "").join("");
  return "";
}

/**
 * "1:02:33" | "12:34" | "0:58" → seconds (0 = unknown/live).
 * Rejects malformed components (minutes/seconds > 59) so a garbage or
 * adversarial string can never produce a bogus duration.
 */
export function parseDuration(s: unknown): number {
  // HARDENED: only a non-empty string is a valid duration. A number (already
  // seconds), object, or array passed from a malformed feed would previously
  // call s.trim() and THROW, taking down the whole recommendation engine.
  // Non-strings / empty / whitespace → 0 (no duration).
  if (typeof s !== "string") return 0;
  if (!s.trim()) return 0;
  const p = s
    .trim()
    .split(":")
    .map((x) => parseInt(x, 10));
  if (p.some((n) => isNaN(n))) return 0;
  let sec: number;
  if (p.length === 3) {
    if ((p[1] ?? 0) > 59 || (p[2] ?? 0) > 59) return 0;
    sec = (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
  } else if (p.length === 2) {
    if ((p[1] ?? 0) > 59) return 0;
    sec = (p[0] ?? 0) * 60 + (p[1] ?? 0);
  } else {
    sec = p[0] ?? 0;
  }
  // HARDENED: a duration can never be negative (e.g. "-5") — clamp invalid and
  // non-positive results to 0 instead of leaking a negative estimate.
  return Number.isFinite(sec) && sec > 0 ? sec : 0;
}

/** Exam-target keyword: the SAME chapter gets board-level or JEE-level videos. */
function targetWord(target: string): string {
  if (target === "board12") return " class 12 boards cbse";
  if (target === "cbse27") return " class 12 boards cbse";
  if (target === "board11") return " class 11 cbse";
  if (target === "jeeadv") return " jee advanced";
  return " jee main";
}

/**
 * Build topic-specific, language- and objective-aware search queries.
 * A preferred channel ("Dream Team" pick) gets its own dedicated query so its
 * lessons surface when they exist — without excluding better fits.
 */
export function buildQueries(
  topic: string,
  subject: string,
  language: string,
  kind: string,
  channel: string,
  depth: string,
  target: string,
  teacherId?: string,
  instituteId?: string,
): string[] {
  const lang = language === "hi" ? " hindi" : language === "hinglish" ? " hindi english" : "";
  const tw = targetWord(target);
  let kindWords: string[];
  if (kind === "practice")
    kindWords = [
      `important questions practice${tw}`,
      target.startsWith("board") || target === "cbse27"
        ? "board exam questions solved"
        : "pyq questions solved" + tw,
    ];
  else if (kind === "revision")
    kindWords = [`quick revision short notes${tw}`, "revision one shot mind map"];
  else if (kind === "advanced")
    kindWords = ["jee advanced level questions", "advanced problems tricky"];
  else if (depth === "oneshot")
    kindWords = [`one shot complete${tw}`, "one shot revision full chapter"];
  else if (depth === "detailed")
    kindWords = [`detailed lecture complete concepts${tw}`, `full chapter in depth lecture${tw}`];
  else kindWords = [`full chapter lecture${tw}`, "complete chapter class 11 12"];
  const base = `${topic} ${subject}`.trim();
  const qs: string[] = [];

  // Teacher or institute targeted query first
  const teacher = teacherId ? findTeacher(teacherId) : undefined;
  const institute = instituteId
    ? findInstituteById(instituteId) ||
      INSTITUTES.find(
        (i) =>
          i.name.toLowerCase().includes(instituteId.toLowerCase()) ||
          i.shortName.toLowerCase().includes(instituteId.toLowerCase()),
      )
    : undefined;

  if (teacher) {
    for (const alias of teacher.searchQueryAlias.slice(0, 2)) {
      qs.push(
        `${topic} ${alias}${
          kind === "practice" ? " questions" : depth === "oneshot" ? " one shot" : " lecture"
        }${tw}`,
      );
    }
    if (teacher.channelName) {
      qs.push(`${topic} ${teacher.name} ${teacher.channelName}${tw}`);
    }
  } else if (institute) {
    for (const ch of institute.officialChannels.slice(0, 2)) {
      qs.push(
        `${topic} ${subject} ${ch}${
          kind === "practice" ? " pyq questions" : depth === "oneshot" ? " one shot" : " lecture"
        }${tw}`,
      );
    }
  } else if (channel) {
    qs.push(
      `${base} ${channel}${
        kind === "practice"
          ? " questions"
          : kind === "revision"
            ? " revision"
            : kind === "advanced"
              ? " advanced"
              : depth === "oneshot"
                ? " one shot"
                : " lecture"
      }${tw}`,
    );
  }

  for (const k of kindWords) {
    qs.push(`${base} ${k}${lang}`);
  }
  if (qs.length === 0) qs.push(`${base}${lang}${tw}`);
  return qs.slice(0, 4); // bounded fan-out
}

const STOP = new Set([
  "the",
  "of",
  "and",
  "in",
  "for",
  "a",
  "an",
  "to",
  "&",
  "class",
  "jee",
  "chapter",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Parse the public YouTube search results page into raw candidates. */
export function parseSearchPage(html: string): RawItem[] {
  const marker = "var ytInitialData = ";
  const at = html.indexOf(marker);
  if (at < 0) return [];
  const start = at + marker.length;
  const end = html.indexOf(";</script>", start);
  if (end < 0) return [];
  let data: unknown;
  try {
    data = JSON.parse(html.slice(start, end));
  } catch {
    return [];
  }
  const renderers: Record<string, unknown>[] = [];
  collect(data, "videoRenderer", renderers);
  const items: RawItem[] = [];
  for (const r of renderers) {
    const id = typeof r["videoId"] === "string" ? (r["videoId"] as string) : "";
    if (!id) continue;
    let live = false;
    const overlays = r["thumbnailOverlays"];
    if (Array.isArray(overlays)) {
      for (const ov of overlays) {
        const st = (ov as { thumbnailOverlayTimeStatusRenderer?: { style?: string } })
          ?.thumbnailOverlayTimeStatusRenderer?.style;
        if (st === "LIVE") live = true;
      }
    }
    const title = textOf(r["title"]).slice(0, 180);
    const channel = (textOf(r["ownerText"]) || textOf(r["longBylineText"])).slice(0, 80);
    let channelId = "";
    try {
      const runs = (r["ownerText"] as { runs?: unknown[] })?.runs as
        { navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[] | undefined;
      channelId = runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";
    } catch {
      /* optional */
    }
    const durationSec = parseDuration(textOf(r["lengthText"]));
    const published = textOf(r["publishedTimeText"]).slice(0, 40);
    if (!title || !channel) continue;
    items.push({ id, title, channel, channelId, durationSec, published, live });
  }
  return items;
}

/** Trusted JEE educators — quality prior, not a monopoly (relevance still rules). */
const TRUSTED = [
  "physics wallah",
  "pw ",
  "jee wallah",
  "unacademy",
  "vedantu",
  "mohit tyagi",
  "physics galaxy",
  "esaral",
  "competishun",
  "etoos",
  "motion",
  "allen",
  "aakash",
  "sri chaitanya",
  "eduniti",
  "maths unplugged",
  "chem shiksha",
  "nv sir",
  "mc sir",
  "arvind kalia",
  "next toppers",
  "manocha",
];

/** Board-first educators (trusted for CBSE target) — never used to prefer JEE channels. */
const TRUSTED_BOARD = [
  "abhischek sahu",
  "abhishek sahu",
  "arvind academy",
  "science and fun",
  "ashu ghai",
  "ushank",
  "bharat panchal",
  "chemistry guruji",
  "mathematically inclined",
  "neha agrawal",
  "magnet brains",
  "zakie saudagar",
  "zaki saudagar",
  "sunil jangra",
  "cbseclassvideos",
  "ncert wallah",
  "vedantu",
  "sunil sir",
];

/**
 * Deterministic filter + explainable educational-fit ranking.
 * Keeps the original positional signature so behavior is byte-for-byte stable.
 */
export function rank(
  raw: RawItem[],
  topic: string,
  language: string,
  kind: string,
  maxMinutes: number,
  channel = "",
  depth = "lecture",
  minMinutes = 0,
  target = "jeemain",
  teacherId = "",
  instituteId = "",
): Candidate[] {
  const topicToks = tokens(topic);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const teacher = teacherId ? findTeacher(teacherId) : undefined;
  const institute = instituteId
    ? findInstituteById(instituteId) ||
      INSTITUTES.find(
        (i) =>
          i.name.toLowerCase().includes(instituteId.toLowerCase()) ||
          i.shortName.toLowerCase().includes(instituteId.toLowerCase()),
      )
    : undefined;

  const board = isBoardTarget(target);
  let idealLo: number, idealHi: number, minSec: number;
  if (board) {
    // CBSE/board pacing: tighter, board-accurate bands so the picked video
    // really matches the detail/duration the learner asked for.
    if (kind === "revision") {
      minSec = 600;
      idealLo = 900;
      idealHi = 3600; // 15–60 min: quick recall
    } else if (kind === "practice" || kind === "advanced") {
      minSec = 1200;
      idealLo = 2400;
      idealHi = 7200; // 40–120 min: board PYQ / case-based
    } else if (depth === "oneshot") {
      minSec = 1800;
      idealLo = 3600;
      idealHi = 9000; // 1–2.5h: chapter one-shot
    } else if (depth === "detailed") {
      minSec = 5400;
      idealLo = 7200;
      idealHi = 12600; // 2–3.5h: board-grade in-depth
    } else {
      minSec = 3600;
      idealLo = 5400;
      idealHi = 9900; // 1.5–2.75h: full board lecture
    }
  } else if (kind === "revision") {
    minSec = 240;
    idealLo = 480;
    idealHi = 2700;
  } else if (kind === "practice" || kind === "advanced") {
    minSec = 600;
    idealLo = 1200;
    idealHi = 5400;
  } else if (depth === "oneshot") {
    minSec = 900;
    idealLo = 1800;
    idealHi = 9000;
  } else if (depth === "detailed") {
    minSec = 1800;
    idealLo = 5400;
    idealHi = 18000;
  } else {
    minSec = 1200;
    idealLo = 3600;
    idealHi = 12600;
  }
  if (minMinutes) minSec = Math.max(minSec, Math.round(minMinutes * 60 * 0.7));
  // PLAN-SYNC (audit 2026-09): the planner sends maxMinutes derived from the
  // task's own estimate (estMin × 1.6). The old ceiling
  // (max(idealHi×1.6, maxMinutes×2)) let a 45-min slot pick a 4-HOUR video, and
  // the fixed ideal bands scored it as a great fit — the systematic "video
  // length ≠ dashboard minutes" mismatch on every task. The ceiling is now the
  // plan's own budget (×1.5 headroom so near-fits survive), and the ideal band
  // shrinks to that budget so scoring prefers videos that truly fit the slot.
  // Requests without an explicit budget (maxMinutes=180 default) behave as
  // before — the clamp only bites when the plan asks for a small slot.
  const planMaxSec = (maxMinutes || 180) * 60;
  idealHi = Math.min(idealHi, Math.max(idealLo, Math.round(planMaxSec * 1.25)));
  const hardMax = Math.max(Math.round(planMaxSec * 1.5), Math.round(idealLo * 1.1));

  for (const v of raw) {
    // HARDENED: a search may resolve with corrupt/partial items (null, undefined,
    // a bare string, or an object missing id/title/channel). Reading v.id or
    // v.title.toLowerCase() on those THREW, which also broke the documented
    // "planRecommendations is guaranteed not to throw" contract. Skip anything
    // that isn't a well-formed candidate instead of trusting the feed.
    if (!v || typeof v !== "object") continue;
    if (typeof v.id !== "string" || !v.id || seen.has(v.id)) continue;
    seen.add(v.id);
    if (v.live) continue;
    if (!v.durationSec || v.durationSec < 65) continue;
    if (v.durationSec < minSec) continue;
    if (v.durationSec > hardMax) continue;
    if (typeof v.title !== "string" || typeof v.channel !== "string") continue;
    const tl = v.title.toLowerCase();
    const cl = v.channel.toLowerCase();
    if (/#shorts|\bshorts\b|status|whatsapp|motivation|song|dance|vlog|reaction/.test(tl)) continue;

    // Hard filter: teacher or institute preference
    let teacherMatch = false;
    let instituteMatch = false;

    if (teacher) {
      const aliasHit = teacher.searchQueryAlias.some(
        (a) => tl.includes(a.toLowerCase()) || cl.includes(a.toLowerCase()),
      );
      const channelHit =
        teacher.channelName && cl.includes(teacher.channelName.toLowerCase().slice(0, 10));
      const nameHit = tl.includes(teacher.name.toLowerCase().replace(/ sir| ma'am/g, ""));
      teacherMatch = aliasHit || channelHit || nameHit;
    }

    if (institute) {
      const chHit = institute.officialChannels.some(
        (c) =>
          cl.includes(c.toLowerCase().slice(0, 10)) || tl.includes(c.toLowerCase().slice(0, 10)),
      );
      const nameHit =
        cl.includes(institute.shortName.toLowerCase()) ||
        tl.includes(institute.shortName.toLowerCase()) ||
        cl.includes(institute.name.toLowerCase());
      instituteMatch = chHit || nameHit;
    }

    // topic relevance — highest priority signal
    const tToks = tokens(v.title);
    const hit = topicToks.filter((t) =>
      tToks.some((x) => x === t || x.startsWith(t) || t.startsWith(x)),
    ).length;
    const rel = topicToks.length ? hit / topicToks.length : 0;
    if (rel < 0.35 && !teacherMatch) continue; // title must actually be about the topic

    let score = rel * 100;
    const why: string[] = [`topic relevance ${(rel * 100) | 0}%`];

    if (teacherMatch) {
      score += 45;
      why.push(`selected teacher (${teacher?.name})`);
    } else if (teacher) {
      score -= 15; // penalty if specific teacher was requested but didn't match
    }

    if (instituteMatch) {
      score += 35;
      why.push(`selected institute (${institute?.name})`);
    } else if (institute) {
      score -= 10;
    }

    // language fit
    if (language === "hi" || language === "hinglish") {
      if (/hindi|हिंदी/.test(tl)) {
        score += 12;
        why.push("language match");
      }
    } else if (!/hindi|हिंदी/.test(tl)) {
      score += 8;
      why.push("language match");
    }

    // objective fit
    if (kind === "practice" && /question|problem|pyq|practice|numerical|solved/.test(tl)) {
      score += 14;
      why.push("problem-solving lesson");
    }
    if (kind === "advanced" && /advanced|tough|tricky|hard|olympiad/.test(tl)) {
      score += 16;
      why.push("advanced-level");
    }
    if (kind === "revision" && /revision|one shot|oneshot|short|recap|summary|mind map/.test(tl)) {
      score += 14;
      why.push("revision lesson");
    }
    if (kind === "learn") {
      if (
        depth === "oneshot" &&
        /one shot|oneshot|in one video|complete.*(one|1)\s*(shot|video)/.test(tl)
      ) {
        score += 16;
        why.push("one-shot (crash fit)");
      }
      if (
        depth === "detailed" &&
        /detailed|in depth|depth|complete course|full course|marathon/.test(tl)
      ) {
        score += 16;
        why.push("detailed depth (mastery fit)");
      }
      if (depth === "lecture" && /full|complete|lecture|chapter/.test(tl)) {
        score += 12;
        why.push("full lecture");
      }
      if (depth === "detailed" && /one shot|oneshot/.test(tl) && v.durationSec < 5400) {
        score -= 18;
        why.push("too shallow for mastery");
      }
      if (depth === "oneshot" && v.durationSec > 12600) {
        score -= 15;
        why.push("too long for crash");
      }
    }

    // exam-level fit
    if (target === "board12" || target === "board11" || target === "cbse27") {
      if (/board|cbse|ncert|class 12|class 11/.test(tl)) {
        score += 12;
        why.push("board-level");
      }
      if (/jee advanced|olympiad/.test(tl)) {
        score -= 10;
        why.push("too advanced for boards");
      }
    } else if (target === "jeeadv") {
      if (/jee advanced|advanced/.test(tl)) {
        score += 12;
        why.push("advanced-level");
      } else if (/jee|iit/.test(tl)) {
        score += 6;
      }
      if (/boards? exam|cbse sample/.test(tl)) {
        score -= 8;
        why.push("board-only content");
      }
    } else {
      if (/jee main|jee|iit/.test(tl)) {
        score += 10;
        why.push("JEE-level");
      }
      if (/boards? exam preparation|cbse sample paper/.test(tl)) {
        score -= 6;
      }
    }

    // duration band
    if (v.durationSec >= idealLo && v.durationSec <= idealHi) {
      score += 14;
      why.push("ideal duration");
    } else if (v.durationSec < idealLo) {
      score -= Math.min(20, ((idealLo - v.durationSec) / idealLo) * 25);
    } else {
      score -= Math.min(20, ((v.durationSec - idealHi) / idealHi) * 20);
    }

    // trusted educator prior (board sets prefer board-first educators)
    const trusted = board ? TRUSTED_BOARD : TRUSTED;
    if (trusted.some((t) => cl.includes(t))) {
      score += 10;
      why.push("trusted educator");
    }

    if (channel && cl.includes(channel.toLowerCase().slice(0, 14))) {
      score += 18;
      why.push("your chosen educator");
    }

    out.push({
      id: v.id,
      title: v.title,
      channel: v.channel,
      channelId: v.channelId,
      durationSec: v.durationSec,
      published: v.published,
      score: Math.round(score),
      why: why.join(" · "),
      teacher: teacher?.name,
      institute: institute?.name,
    });
  }

  // If teacher or institute was strictly requested and matching items exist, prioritize matching
  let filtered = out;
  if (teacher && out.some((o) => o.why.includes("selected teacher"))) {
    filtered = out.filter((o) => o.why.includes("selected teacher") || o.score > 85);
  } else if (institute && out.some((o) => o.why.includes("selected institute"))) {
    filtered = out.filter((o) => o.why.includes("selected institute") || o.score > 85);
  }

  return filtered.sort((a, b) => b.score - a.score).slice(0, 6);
}

/**
 * Resolve the authoritative curated lessons for a request (0-latency).
 *
 * HONESTY CONTRACT (audit 2026-09): an 11-char id is NOT proof of a real
 * video — the JEE curated registry carried placeholder ids that do not exist
 * on YouTube, and serving them as `verified` produced dead embedded players
 * whose invented durations never matched the plan's minutes. A lesson is
 * therefore treated as a playable video ONLY when its registry entry carries
 * `verifiedReal: true` (oEmbed-verified). Everything else is returned as an
 * honest faculty-targeted SEARCH pick: synthetic non-video id, `externalUrl`,
 * `verified: false`, and `durationEstimated: true`.
 */
export function resolveCuratedFor(req: PlannerRequest): Candidate[] {
  const lessons = resolveCuratedVideos({
    topic: req.topic,
    subject: req.subject,
    kind: req.kind,
    depth: req.depth,
    target: req.target,
    teacherId: req.teacher,
    teacher: req.teacher,
    instituteId: req.institute,
    institute: req.institute,
  });
  return lessons.map((c, i) => {
    const isRealVideo = REAL_YT_ID.test(c.id) && c.verifiedReal === true;
    if (isRealVideo) {
      return {
        id: c.id,
        title: c.title,
        channel: c.channel,
        channelId: c.channelId || "",
        durationSec: c.durationSec,
        published: c.published || "Verified Lecture",
        score: c.score,
        why: c.why,
        teacher: c.teacher,
        institute: c.institute,
        playlistUrl: c.playlistUrl,
        verified: true,
        isCurated: true,
        externalUrl: undefined,
      };
    }
    return {
      id: searchPickId(c, i),
      title: c.title,
      channel: c.channel,
      channelId: c.channelId || "",
      durationSec: c.durationSec,
      durationEstimated: true,
      published: "Search pick",
      score: c.score,
      why: `${c.why} · opens a targeted YouTube search`,
      teacher: c.teacher,
      institute: c.institute,
      playlistUrl: c.playlistUrl,
      verified: false,
      isCurated: false,
      externalUrl: searchUrl(c.title, `${c.teacher || ""} ${c.channel}`.trim()),
    };
  });
}

/**
 * Real videos first (verified curated lessons, then unique high-scoring live
 * items), honest search-picks last as faculty-targeted alternates. Bounded and
 * de-duplicated by id.
 */
export function mergeRecommendations(
  curated: Candidate[],
  live: Candidate[],
  limit = 6,
): Candidate[] {
  const seenIds = new Set<string>();
  const merged: Candidate[] = [];
  const push = (c: Candidate): void => {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      merged.push(c);
    }
  };
  for (const c of curated) if (!c.externalUrl) push(c);
  for (const item of live) push(item);
  for (const c of curated) if (c.externalUrl) push(c);
  return merged.slice(0, limit);
}

export interface PlanResult {
  items: Candidate[];
  fallback: boolean;
}

/**
 * Orchestrate the full recommendation pipeline with an injectable search
 * function, so the exact production logic is testable without any network.
 * Guaranteed not to throw: failing searches are swallowed per-query.
 */
export async function planRecommendations(
  req: PlannerRequest,
  search: SearchFn,
): Promise<PlanResult> {
  const curated = resolveCuratedFor(req);

  const queries = buildQueries(
    req.topic,
    req.subject,
    req.language,
    req.kind,
    req.channel,
    req.depth,
    req.target,
    req.teacher,
    req.institute,
  );

  const settled = await Promise.allSettled(queries.map((q) => search(q)));
  const raw: RawItem[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    raw.push(...s.value);
  }

  const liveItems = rank(
    raw,
    req.topic,
    req.language,
    req.kind,
    req.maxMinutes,
    req.channel,
    req.depth,
    req.minMinutes,
    req.target,
    req.teacher,
    req.institute,
  );

  const items = mergeRecommendations(curated, liveItems, 6);
  return { items, fallback: items.length === 0 };
}

// Re-exported for callers/tests that need them without importing data modules.
export type { PlannerDepth, PlannerKind, PlannerTarget };
