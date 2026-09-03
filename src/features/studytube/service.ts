/**
 * StudyTube discovery service.
 * The discovery logic (YouTube proxy + explainable ranking) lives server-side
 * in `/api/public/study-planner`. This module is the client contract: it
 * builds the request, handles loading/timeout/error/fallback, and keeps the
 * last successful result in memory for the session.
 */

import type { StudyTubeRequest, StudyTubeResult, StudyTubeVideo } from "./types";

const ENDPOINT = "/api/public/study-planner";
const TIMEOUT_MS = 12_000;

const cache = new Map<string, { at: number; value: StudyTubeResult; ttl: number }>();
const TTL = 20 * 60 * 1000;

function keyOf(req: StudyTubeRequest): string {
  return [
    req.topic,
    req.subject,
    req.language,
    req.kind,
    req.depth,
    req.target,
    req.teacher,
    req.institute,
  ]
    .map((x) =>
      String(x ?? "")
        .toLowerCase()
        .trim(),
    )
    .join("|");
}

export async function discover(req: StudyTubeRequest): Promise<StudyTubeResult> {
  const key = keyOf(req);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) {
    return { ...hit.value, cached: true };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!r.ok) {
      const result: StudyTubeResult = {
        items: [],
        fetchedAt: Date.now(),
        fallback: true,
        cached: false,
        error: `Discovery failed (${r.status}).`,
      };
      cache.set(key, { at: Date.now(), value: result, ttl: 60_000 });
      return result;
    }

    const data = (await r.json()) as {
      items?: StudyTubeVideo[];
      fetchedAt?: number;
      fallback?: boolean;
    };
    const result: StudyTubeResult = {
      items: data.items || [],
      fetchedAt: data.fetchedAt || Date.now(),
      fallback: !!data.fallback,
      cached: false,
    };
    cache.set(key, { at: Date.now(), value: result, ttl: TTL });
    return result;
  } catch {
    const result: StudyTubeResult = {
      items: [],
      fetchedAt: Date.now(),
      fallback: true,
      cached: false,
      error: "Couldn't reach the video service. Try again in a moment.",
    };
    cache.set(key, { at: Date.now(), value: result, ttl: 60_000 });
    return result;
  }
}

export function weakTopicRequest(
  subject: string,
  chapter: string,
  topic: string,
): StudyTubeRequest {
  return {
    topic: `${chapter} ${topic}`.trim(),
    subject,
    language: "hinglish",
    kind: "learn",
    depth: "lecture",
    target: "jeemain",
    maxMinutes: 180,
  };
}
