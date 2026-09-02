import { createFileRoute } from "@tanstack/react-router";
import { TEACHERS, INSTITUTES, findTeacherById, findInstituteById } from "../../../data/teachers";

/**
 * AI STUDY PLANNER — YouTube resource discovery service.
 * Backs the "AI Planner" tab inside the Planner section.
 *
 * Enforces hard filtering rules before ranking:
 * 1. Correct subject
 * 2. Correct exam/class target
 * 3. Correct syllabus topic
 * 4. Selected institute if explicitly chosen
 * 5. Selected teacher if explicitly chosen
 * Only then rank by educational fit, duration suitability, and quality signals.
 */

interface Candidate {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  durationSec: number;
  published: string;
  score: number;
  why: string;
  teacher?: string;
  institute?: string;
}

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

/** "1:02:33" | "12:34" | "0:58" → seconds (0 = unknown/live). */
function parseDuration(s: string): number {
  if (!s) return 0;
  const p = s
    .trim()
    .split(":")
    .map((x) => parseInt(x, 10));
  if (p.some((n) => isNaN(n))) return 0;
  if (p.length === 3) return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
  if (p.length === 2) return (p[0] ?? 0) * 60 + (p[1] ?? 0);
  return p[0] ?? 0;
}

/** Build topic-specific, language- and objective-aware search queries.
 *  A preferred channel ("Dream Team" pick) gets its own dedicated query so
 *  its lessons surface when they exist — without excluding better fits. */
/** DEPTH-AWARE queries: a crash plan and a mastery plan search for genuinely
 *  different videos. depth: oneshot | lecture | detailed. kind adds the
 *  objective (learn/practice/revision/advanced). */
/** Exam-target keyword: the SAME chapter gets board-level or JEE-level
 *  videos depending on what the student is actually preparing for. */
function targetWord(target: string): string {
  if (target === "board12") return " class 12 boards cbse";
  if (target === "cbse27") return " class 12 boards cbse";
  if (target === "board11") return " class 11 cbse";
  if (target === "jeeadv") return " jee advanced";
  return " jee main";
}
function buildQueries(
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
  const teacher = teacherId
    ? findTeacherById(teacherId) ||
      TEACHERS.find((t) => t.name.toLowerCase().includes(teacherId.toLowerCase()))
    : undefined;
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
        `${topic} ${alias}${kind === "practice" ? " questions" : depth === "oneshot" ? " one shot" : " lecture"}${tw}`,
      );
    }
    if (teacher.channelName) {
      qs.push(`${topic} ${teacher.name} ${teacher.channelName}${tw}`);
    }
  } else if (institute) {
    for (const ch of institute.officialChannels.slice(0, 2)) {
      qs.push(
        `${topic} ${subject} ${ch}${kind === "practice" ? " pyq questions" : depth === "oneshot" ? " one shot" : " lecture"}${tw}`,
      );
    }
  } else if (channel) {
    qs.push(
      `${base} ${channel}${kind === "practice" ? " questions" : kind === "revision" ? " revision" : kind === "advanced" ? " advanced" : depth === "oneshot" ? " one shot" : " lecture"}${tw}`,
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

interface RawItem {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  durationSec: number;
  published: string;
  live: boolean;
}

function parseSearchPage(html: string): RawItem[] {
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

async function fetchSearch(query: string): Promise<RawItem[]> {
  const url =
    "https://www.youtube.com/results?search_query=" + encodeURIComponent(query) + "&hl=en&gl=IN";
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-IN,en;q=0.9",
      Cookie: "CONSENT=YES+cb.20240101-00-p0.en+FX+000; SOCS=CAI",
    },
    signal: AbortSignal.timeout(9_000),
  });
  if (!r.ok) return [];
  return parseSearchPage(await r.text());
}

/** Deterministic filter + explainable educational-fit ranking. */
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
function rank(
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
  const teacher = teacherId
    ? findTeacherById(teacherId) ||
      TEACHERS.find((t) => t.name.toLowerCase().includes(teacherId.toLowerCase()))
    : undefined;
  const institute = instituteId
    ? findInstituteById(instituteId) ||
      INSTITUTES.find(
        (i) =>
          i.name.toLowerCase().includes(instituteId.toLowerCase()) ||
          i.shortName.toLowerCase().includes(instituteId.toLowerCase()),
      )
    : undefined;

  let idealLo: number, idealHi: number, minSec: number;
  if (kind === "revision") {
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
  if (minMinutes) minSec = Math.max(minSec, Math.round(minMinutes * 60 * 0.5));
  const hardMax = Math.max(idealHi * 1.6, (maxMinutes || 180) * 60 * 2);

  for (const v of raw) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    if (v.live) continue;
    if (!v.durationSec || v.durationSec < 65) continue;
    if (v.durationSec < minSec) continue;
    if (v.durationSec > hardMax) continue;
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

    // trusted educator prior
    if (TRUSTED.some((t) => cl.includes(t))) {
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

/* 6-hour in-memory cache per (topic|lang|kind) — lesson lists are stable. */
const cache = new Map<string, { at: number; items: Candidate[]; fallback: boolean }>();
const TTL = 6 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/public/study-planner")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          topic?: string;
          subject?: string;
          language?: string;
          kind?: string;
          maxMinutes?: number;
          minMinutes?: number;
          channel?: string;
          depth?: string;
          target?: string;
          teacher?: string;
          teacherId?: string;
          institute?: string;
          instituteId?: string;
        } = {};
        try {
          body = await request.json();
        } catch {
          /* defaults */
        }
        const topic = String(body.topic || "")
          .slice(0, 120)
          .trim();
        if (!topic) return Response.json({ error: "topic required" }, { status: 400 });
        const subject = String(body.subject || "").slice(0, 40);
        const language = ["en", "hi", "hinglish"].includes(body.language || "")
          ? (body.language as string)
          : "en";
        const kind = ["learn", "practice", "revision", "advanced"].includes(body.kind || "")
          ? (body.kind as string)
          : "learn";
        const depth = ["oneshot", "lecture", "detailed"].includes(body.depth || "")
          ? (body.depth as string)
          : "lecture";
        const target = ["jeemain", "jeeadv", "board12", "board11", "cbse27"].includes(
          body.target || "",
        )
          ? (body.target as string)
          : "jeemain";
        const maxMinutes = Math.min(600, Math.max(10, Number(body.maxMinutes) || 180));
        const minMinutes = Math.min(300, Math.max(0, Number(body.minMinutes) || 0));
        const channel = String(body.channel || "")
          .slice(0, 60)
          .trim();
        const teacher = String(body.teacherId || body.teacher || "")
          .slice(0, 60)
          .trim();
        const institute = String(body.instituteId || body.institute || "")
          .slice(0, 60)
          .trim();

        const key = [
          topic.toLowerCase(),
          subject,
          language,
          kind,
          depth,
          target,
          channel.toLowerCase(),
          teacher.toLowerCase(),
          institute.toLowerCase(),
        ].join("|");
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < TTL) {
          return Response.json({
            items: hit.items,
            fetchedAt: hit.at,
            fallback: hit.fallback,
            cached: true,
          });
        }

        const queries = buildQueries(
          topic,
          subject,
          language,
          kind,
          channel,
          depth,
          target,
          teacher,
          institute,
        );
        const settled = await Promise.allSettled(queries.map((q) => fetchSearch(q)));
        const raw: RawItem[] = [];
        let anyOk = false;
        for (const s of settled) {
          if (s.status !== "fulfilled") continue;
          anyOk = true;
          raw.push(...s.value);
        }
        const items = rank(
          raw,
          topic,
          language,
          kind,
          maxMinutes,
          channel,
          depth,
          minMinutes,
          target,
          teacher,
          institute,
        );
        const fallback = !anyOk || items.length === 0;
        cache.set(key, { at: Date.now(), items, fallback });
        if (cache.size > 500) cache.clear();
        return Response.json({ items, fetchedAt: Date.now(), fallback });
      },
    },
  },
});
