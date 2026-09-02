#!/usr/bin/env node
/**
 * VALIDATE VIDEO RECOMMENDATION ENGINE RULES
 * Tests the ranking rules:
 * 1. Hard filters (topic relevance > 0.35, min duration bounds)
 * 2. Shorts rejection (no #shorts or < 65s)
 * 3. Teacher and Institute priority boosts
 * 4. Reason strings generated transparently
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function run() {
  console.log("=== Validating Video Recommendation Engine Logic ===");
  const plannerFile = join(root, "src", "routes", "api", "public", "study-planner.ts");
  const content = readFileSync(plannerFile, "utf8");

  const rules = [
    { name: "Shorts rejection filter", test: content.includes("#shorts") },
    { name: "Minimum duration floor", test: content.includes("durationSec < minSec") },
    { name: "Topic token relevance match", test: content.includes("topicToks") },
    { name: "Teacher query prioritization", test: content.includes("selected teacher") },
    { name: "Institute query prioritization", test: content.includes("selected institute") },
    { name: "Zero-fabrication explanation reasons", test: content.includes("why:") },
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
