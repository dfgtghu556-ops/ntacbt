import { createFileRoute } from "@tanstack/react-router";

/**
 * AI STUDY PLANNER — YouTube resource discovery service.
 * Backs the "AI Planner" tab inside the Planner section of public/jee-cbt.html.
 *
 * For ONE topic it searches YouTube with several topic-specific query
 * variations (exam + language + lesson-type aware), filters out unsuitable
 * candidates (Shorts, live streams, wrong language, wrong topic, promos),
 * ranks the survivors by EDUCATIONAL FIT (topic relevance first — never
 * "most views wins"), and returns the best few with parsed durations so the
 * client can schedule effective watch time at the student's playback speed.
 *
 * Zero API keys / zero cost: reads YouTube's public search results page and
 * extracts the embedded ytInitialData JSON (same pattern as live-classes.ts,
 * which is already in production here). The browser can't do this itself
 * (CORS) — that is the only reason this server proxy exists.
 *
 * POST body: {
 *   topic: string,            // e.g. "Rotational Motion"
 *   subject?: string,         // Physics | Chemistry | Mathematics
 *   language?: "en"|"hi"|"hinglish",
 *   kind?: "learn"|"practice"|"revision",  // lesson objective
 *   maxMinutes?: number       // duration ceiling the planner wants
 * }
 * Reply: { items: Candidate[], fetchedAt: number, fallback?: boolean }
 */

interface Candidate {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  durationSec: number;
  published: string; // human text, best-effort ("2 years ago")
  score: number;     // internal suitability score (explainable, not shown as fake "quality %")
  why: string;       // short explanation of the ranking (internal transparency)
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
    if (k === key && obj[k] && typeof obj[k] === "object") out.push(obj[k] as Record<string, unknown>);
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
  const p = s.trim().split(":").map((x) => parseInt(x, 10));
  if (p.some((n) => isNaN(n))) return 0;
  if (p.length === 3) return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
  if (p.length === 2) return (p[0] ?? 0) * 60 + (p[1] ?? 0);
  return p[0] ?? 0;
}

/** Build topic-specific, language- and objective-aware search queries.
 *  A preferred channel ("Dream Team" pick) gets its own dedicated query so
 *  its lessons surface when they exist — without excluding better fits. */
function buildQueries(topic: string, subject: string, language: string, kind: string, channel: string): string[] {
  const lang =
    language === "hi" ? " hindi" :
    language === "hinglish" ? " hindi english" : "";
  const kindWords =
    kind === "practice" ? ["questions practice", "important questions jee"] :
    kind === "revision" ? ["revision one shot", "quick revision"] :
    ["one shot lecture", "full chapter class 11 12"];
  const base = `${topic} ${subject}`.trim();
  const qs = kindWords.map((k) => `${base} ${k}${lang} jee`);
  if (channel) qs.unshift(`${base} ${channel}${kind === "practice" ? " questions" : kind === "revision" ? " revision" : " one shot"}`);
  else qs.push(`${base}${lang} jee main`); // broad safety net
  return qs.slice(0, 3); // bounded fan-out — be polite to YouTube
}

const STOP = new Set(["the", "of", "and", "in", "for", "a", "an", "to", "&", "class", "jee", "chapter"]);
function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

interface RawItem {
  id: string; title: string; channel: string; channelId: string;
  durationSec: number; published: string; live: boolean;
}

function parseSearchPage(html: string): RawItem[] {
  const marker = "var ytInitialData = ";
  const at = html.indexOf(marker);
  if (at < 0) return [];
  const start = at + marker.length;
  const end = html.indexOf(";</script>", start);
  if (end < 0) return [];
  let data: unknown;
  try { data = JSON.parse(html.slice(start, end)); } catch { return []; }
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
        | { navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[]
        | undefined;
      channelId = runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";
    } catch { /* optional */ }
    const durationSec = parseDuration(textOf(r["lengthText"]));
    const published = textOf(r["publishedTimeText"]).slice(0, 40);
    if (!title || !channel) continue;
    items.push({ id, title, channel, channelId, durationSec, published, live });
  }
  return items;
}

async function fetchSearch(query: string): Promise<RawItem[]> {
  const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query) + "&hl=en&gl=IN";
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
function rank(raw: RawItem[], topic: string, language: string, kind: string, maxMinutes: number, channel = ""): Candidate[] {
  const topicToks = tokens(topic);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const minSec = kind === "revision" ? 240 : 600;       // no 30-second clips for real lessons
  const maxSec = Math.max(1200, (maxMinutes || 180) * 60 * 1.6); // soft ceiling
  for (const v of raw) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    if (v.live) continue;                                // live streams don't schedule
    if (!v.durationSec || v.durationSec < 65) continue;  // Shorts / clips
    if (v.durationSec < minSec) continue;                // too thin for the objective
    const tl = v.title.toLowerCase();
    if (/#shorts|\bshorts\b|status|whatsapp|motivation|song|dance/.test(tl)) continue;
    // topic relevance — highest priority signal
    const tToks = tokens(v.title);
    const hit = topicToks.filter((t) => tToks.some((x) => x === t || x.startsWith(t) || t.startsWith(x))).length;
    const rel = topicToks.length ? hit / topicToks.length : 0;
    if (rel < 0.5) continue;                             // title must actually be about the topic
    let score = rel * 100;
    const why: string[] = [`topic relevance ${(rel * 100) | 0}%`];
    // language fit
    if (language === "hi" || language === "hinglish") {
      if (/hindi|हिंदी/.test(tl)) { score += 12; why.push("language match"); }
    } else if (!/hindi|हिंदी/.test(tl)) { score += 8; why.push("language match"); }
    // objective fit
    if (kind === "practice" && /question|problem|pyq|practice|numerical/.test(tl)) { score += 14; why.push("problem-solving lesson"); }
    if (kind === "revision" && /revision|one shot|oneshot|short|recap|summary/.test(tl)) { score += 14; why.push("revision lesson"); }
    if (kind === "learn" && /one shot|oneshot|full|complete|lecture|chapter/.test(tl)) { score += 12; why.push("full lecture"); }
    // exam-level fit
    if (/jee|iit|class 11|class 12|neet/.test(tl)) { score += 8; why.push("exam-level"); }
    // duration suitability (don't grab a 9-hour marathon for a 45-min slot)
    if (v.durationSec <= maxSec) { score += 8; why.push("duration fits"); }
    else score -= Math.min(25, ((v.durationSec - maxSec) / maxSec) * 25);
    // mild recency preference (syllabus drifts)
    if (/month|week|day/.test(v.published)) { score += 3; }
    // Dream Team: student's chosen educator gets a strong (not absolute) boost
    if (channel && v.channel.toLowerCase().includes(channel.toLowerCase().slice(0, 14))) {
      score += 18; why.push("your chosen educator");
    }
    out.push({
      id: v.id, title: v.title, channel: v.channel, channelId: v.channelId,
      durationSec: v.durationSec, published: v.published,
      score: Math.round(score), why: why.join(" · "),
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

/* 6-hour in-memory cache per (topic|lang|kind) — lesson lists are stable. */
const cache = new Map<string, { at: number; items: Candidate[]; fallback: boolean }>();
const TTL = 6 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/public/study-planner")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { topic?: string; subject?: string; language?: string; kind?: string; maxMinutes?: number; channel?: string } = {};
        try { body = await request.json(); } catch { /* defaults */ }
        const topic = String(body.topic || "").slice(0, 120).trim();
        if (!topic) return Response.json({ error: "topic required" }, { status: 400 });
        const subject = String(body.subject || "").slice(0, 40);
        const language = ["en", "hi", "hinglish"].includes(body.language || "") ? (body.language as string) : "en";
        const kind = ["learn", "practice", "revision"].includes(body.kind || "") ? (body.kind as string) : "learn";
        const maxMinutes = Math.min(600, Math.max(10, Number(body.maxMinutes) || 180));
        const channel = String(body.channel || "").slice(0, 60).trim(); // Dream Team preference (optional)

        const key = [topic.toLowerCase(), subject, language, kind, channel.toLowerCase()].join("|");
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < TTL) {
          return Response.json({ items: hit.items, fetchedAt: hit.at, fallback: hit.fallback, cached: true });
        }

        const queries = buildQueries(topic, subject, language, kind, channel);
        const settled = await Promise.allSettled(queries.map((q) => fetchSearch(q)));
        const raw: RawItem[] = [];
        let anyOk = false;
        for (const s of settled) {
          if (s.status !== "fulfilled") continue;
          anyOk = true;
          raw.push(...s.value);
        }
        const items = rank(raw, topic, language, kind, maxMinutes, channel);
        const fallback = !anyOk || items.length === 0;
        cache.set(key, { at: Date.now(), items, fallback });
        if (cache.size > 500) cache.clear(); // bounded
        return Response.json({ items, fetchedAt: Date.now(), fallback });
      },
    },
  },
});
