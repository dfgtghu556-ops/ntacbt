import { createFileRoute } from "@tanstack/react-router";
import { sanitizePlannerRequest } from "../../../features/planner/normalize";
import {
  planRecommendations,
  parseSearchPage,
  type Candidate,
  type RawItem,
} from "../../../features/planner/engine";

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
 *
 * This file is intentionally thin: input hygiene lives in
 * `features/planner/normalize` and the pure decision logic (queries, parsing,
 * ranking, merge) lives in `features/planner/engine`, so every branch is
 * unit-testable without the network or the router.
 */

/** Fetch + parse a public YouTube search page. Network failures return []. */
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

/* 6-hour in-memory cache per (topic|lang|kind) — lesson lists are stable. */
const cache = new Map<string, { at: number; items: Candidate[]; fallback: boolean }>();
const TTL = 6 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/public/study-planner")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Robust body parsing: null / non-JSON / non-object all become {}.
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          /* defaults */
        }
        const req = sanitizePlannerRequest(body);
        if (!req.topic) return Response.json({ error: "topic required" }, { status: 400 });

        const key = [
          req.topic.toLowerCase(),
          req.subject,
          req.language,
          req.kind,
          req.depth,
          req.target,
          req.channel.toLowerCase(),
          req.teacher.toLowerCase(),
          req.institute.toLowerCase(),
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

        const { items, fallback } = await planRecommendations(req, fetchSearch);
        cache.set(key, { at: Date.now(), items, fallback });
        if (cache.size > 500) cache.clear();
        return Response.json({ items, fetchedAt: Date.now(), fallback });
      },
    },
  },
});
