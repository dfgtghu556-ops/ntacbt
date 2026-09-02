import { createFileRoute } from "@tanstack/react-router";

/* RATE LIMIT: this public endpoint hands out the cloud config to any
 * caller. The publishable key is intentionally public (safe for the
 * browser), but an unauthenticated endpoint that never rate-limits is an
 * easy abuse vector (hammering, rediscovery). Sliding 1-minute window per
 * IP, in-memory (same pattern as ai-chat.ts). 60 req/min is far above any
 * legitimate client, especially with the 300s cache-control below. */
const rlBuckets = new Map<string, number[]>();
const RL_MAX = 60;
const RL_WINDOW = 60_000;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (rlBuckets.get(ip) || []).filter((t) => now - t < RL_WINDOW);
  if (arr.length >= RL_MAX) {
    rlBuckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  rlBuckets.set(ip, arr);
  if (rlBuckets.size > 2000) rlBuckets.clear(); // bounded memory
  return false;
}
/** Safely extract a client IP from proxy headers without trusting an
 *  arbitrarily long/invalid value (mirrors ai-chat.ts). */
function clientIp(request: Request): string {
  const forwarded = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.length > 0 && s.length <= 64);
  return forwarded || request.headers.get("cf-connecting-ip") || "anon";
}

export const Route = createFileRoute("/api/public/cloud-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (rateLimited(clientIp(request))) {
          return Response.json(
            { error: "Too many requests. Try again in a minute." },
            { status: 429 },
          );
        }

        const url = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

        if (!url || !publishableKey) {
          return Response.json({ error: "Cloud configuration unavailable" }, { status: 503 });
        }

        return Response.json(
          { url, publishableKey },
          { headers: { "cache-control": "public, max-age=300" } },
        );
      },
    },
  },
});
