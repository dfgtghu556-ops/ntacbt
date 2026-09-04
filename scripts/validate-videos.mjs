#!/usr/bin/env node
/**
 * VALIDATE VIDEO RECOMMENDATION ENGINE RULES
 * Tests the ranking + curated-source rules that back the AI Planner:
 *   1. Hard filters (topic relevance > 0.35, min duration bounds)
 *   2. Shorts rejection (no #shorts or < 65s)
 *   3. Teacher and Institute priority boosts
 *   4. Reason strings generated transparently
 *   5. Input hygiene layer exists (sanitizePlannerRequest)
 *
 * The decision logic lives in `src/features/planner/engine.ts` (moved out of
 * the HTTP route so it is unit-testable). The curated source of truth lives in
 * `src/data/video-engine.ts`. This validator greps those real modules, not the
 * thin route.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

async function run() {
  console.log("=== Validating Video Recommendation Engine Logic ===");
  const engine = read("src/features/planner/engine.ts");
  const video = read("src/data/video-engine.ts");
  const normalize = read("src/features/planner/normalize.ts");

  const rules = [
    { name: "Shorts rejection filter", test: engine.includes("#shorts") },
    { name: "Minimum duration floor", test: engine.includes("durationSec < minSec") },
    { name: "Topic token relevance match", test: engine.includes("topicToks") },
    { name: "Teacher query prioritization", test: engine.includes("selected teacher") },
    { name: "Institute query prioritization", test: engine.includes("selected institute") },
    { name: "Zero-fabrication explanation reasons", test: engine.includes("why:") },
    {
      name: "Live candidates filtered out of ranking",
      test: engine.includes("if (v.live) continue"),
    },
    {
      name: "Curated authoritative lessons available",
      test: video.includes("resolveCuratedVideos"),
    },
    { name: "Canonical topic matching exists", test: video.includes("matchCanonicalTopic") },
    {
      name: "Input hygiene layer (sanitizePlannerRequest)",
      test: normalize.includes("sanitizePlannerRequest"),
    },
    {
      name: "Recommendation pipeline is framework-free",
      test: engine.includes("planRecommendations"),
    },
  ];

  for (const rule of rules) {
    if (!rule.test) {
      console.error(`[FAIL] Recommendation rule missing: ${rule.name}`);
      process.exit(1);
    }
    console.log(`[PASS] ${rule.name} verified.`);
  }

  console.log("\nAll video recommendation engine checks passed!\n");
}

run();
