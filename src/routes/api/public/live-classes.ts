import { createFileRoute } from "@tanstack/react-router";

/**
 * LIVE CLASS FINDER — backs the "Live Classes" section in public/jee-cbt.html.
 *
 * Finds FREE live classes streaming RIGHT NOW on YouTube for JEE /
 * Class 11 / Class 12 students, with optional subject focus. Works with
 * ZERO API keys and zero cost: it reads YouTube's public live-filtered
 * search results page (the same page any browser gets) and extracts the
 * embedded ytInitialData JSON. The browser can't do this itself (CORS),
 * which is why this tiny server proxy exists.
 *
 * POST body: { level?: "jee"|"class11"|"class12"|"all", subject?: "physics"|"chemistry"|"maths"|"all" }
 * Reply:     { items: LiveItem[], fetchedAt: number, fallback?: boolean }
 *
 * Notes:
 * - POST (not GET) so the PWA service worker never caches live data stale.
 * - Results are cached in-memory for 3 minutes per query to stay polite.
 * - If YouTube can't be reached/parsed (rare), replies { items:[], fallback:true }
 *   and the client falls back to curated channel /live links.
 */

interface LiveItem {
  id: string;          // YouTube video id
  title: string;
  channel: string;
  channelId: string;
  viewers: string;     // e.g. "1.2K watching" (best-effort)
  live: boolean;       // true = LIVE now, false = upcoming/premiere caught by filter
  query: string;       // which search query surfaced it (debug/rank aid)
}

const SP_LIVE = "EgJAAQ%3D%3D"; // YouTube search filter: Type=Video, Feature=Live

function buildQueries(level: string, subject: string): string[] {
  const sub = subject === "all" ? "" : ` ${subject}`;
  const qs: string[] = [];
  if (level === "jee" || level === "all") {
    qs.push(`jee live class${sub}`);
    if (!sub) qs.push("jee main 2026 live");
  }
  if (level === "class11" || level === "all") qs.push(`class 11${sub} live class`);
  if (level === "class12" || level === "all") qs.push(`class 12${sub} live class`);
  if (level === "board12" || level === "all") qs.push(`class 12 board exam${sub} live`);
  return qs.slice(0, 4); // bounded fan-out
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

function parseSearchPage(html: string, query: string): LiveItem[] {
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
  const items: LiveItem[] = [];
  for (const r of renderers) {
    const id = typeof r["videoId"] === "string" ? (r["videoId"] as string) : "";
    if (!id) continue;
    // Is it actually LIVE right now? (the sp filter also lets some upcoming through)
    let live = false;
    const overlays = r["thumbnailOverlays"];
    if (Array.isArray(overlays)) {
      for (const ov of overlays) {
        const st = ov?.thumbnailOverlayTimeStatusRenderer?.style;
        if (st === "LIVE") live = true;
      }
    }
    const badges = r["badges"];
    if (Array.isArray(badges)) {
      for (const b of badges) {
        if (b?.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_LIVE_NOW") live = true;
      }
    }
    if (!live) continue; // strictly live-now: that's the whole point of the feature
    const title = textOf(r["title"]).slice(0, 160);
    const channel = textOf(r["ownerText"]) || textOf(r["longBylineText"]);
    let channelId = "";
    try {
      const runs = (r["ownerText"] as { runs?: unknown[] })?.runs as
        | { navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[]
        | undefined;
      channelId = runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";
    } catch {
      /* optional */
    }
    // "1,234 watching" / shortViewCountText "1.2K watching"
    const viewers =
      textOf(r["shortViewCountText"]) || textOf(r["viewCountText"]) || "";
    if (!title || !channel) continue;
    items.push({ id, title, channel: channel.slice(0, 80), channelId, viewers: viewers.slice(0, 40), live, query });
  }
  return items;
}

async function fetchLive(query: string): Promise<LiveItem[]> {
  const url =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(query) +
    "&sp=" + SP_LIVE + "&hl=en&gl=IN";
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-IN,en;q=0.9",
      // pre-consented cookie avoids the EU consent interstitial page
      Cookie: "CONSENT=YES+cb.20240101-00-p0.en+FX+000; SOCS=CAI",
    },
    signal: AbortSignal.timeout(9_000),
  });
  if (!r.ok) return [];
  const html = await r.text();
  return parseSearchPage(html, query);
}

/* 3-minute in-memory cache per (level,subject) — live lists don't change
   faster than that, and it keeps us from hammering YouTube. */
const cache = new Map<string, { at: number; items: LiveItem[]; fallback: boolean }>();
const TTL = 3 * 60 * 1000;

export const Route = createFileRoute("/api/public/live-classes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { level?: string; subject?: string } = {};
        try {
          body = await request.json();
        } catch {
          /* defaults below */
        }
        const level = ["jee", "class11", "class12", "board12", "all"].includes(body.level || "")
          ? (body.level as string)
          : "all";
        const subject = ["physics", "chemistry", "maths", "all"].includes(body.subject || "")
          ? (body.subject as string)
          : "all";
        const key = level + "|" + subject;
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < TTL) {
          return Response.json({ items: hit.items, fetchedAt: hit.at, fallback: hit.fallback, cached: true });
        }
        const queries = buildQueries(level, subject);
        const settled = await Promise.allSettled(queries.map((q) => fetchLive(q)));
        const seen = new Set<string>();
        const items: LiveItem[] = [];
        let anyOk = false;
        for (const s of settled) {
          if (s.status !== "fulfilled") continue;
          anyOk = true;
          for (const it of s.value) {
            if (seen.has(it.id)) continue;
            seen.add(it.id);
            items.push(it);
          }
        }
        const fallback = !anyOk || items.length === 0;
        const payload = { at: Date.now(), items: items.slice(0, 40), fallback };
        cache.set(key, payload);
        if (cache.size > 24) {
          // drop oldest entries so the map never grows unbounded
          const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) cache.delete(oldest[0]);
        }
        return Response.json({ items: payload.items, fetchedAt: payload.at, fallback });
      },
    },
  },
});
