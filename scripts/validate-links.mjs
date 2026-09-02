#!/usr/bin/env node
/**
 * VALIDATE INTERNAL LINKS & ASSET PATHS
 * Checks that internal data references and route structures exist.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function run() {
  console.log("=== Validating App Links, Assets and Endpoints ===");
  const paths = [
    "public/jee-cbt.html",
    "src/data/teachers.ts",
    "src/data/syllabus.ts",
    "src/routes/api/public/study-planner.ts",
    "src/routes/api/public/live-classes.ts",
    "data/jee2026/transcribed/jeeMain_2026_21Jan_shift1.json",
  ];

  let errors = 0;
  for (const p of paths) {
    const full = join(root, p);
    if (!existsSync(full)) {
      console.error(`[ERROR] Path does not exist: ${p}`);
      errors++;
    } else {
      console.log(`[PASS] Verified asset: ${p}`);
    }
  }

  if (errors > 0) {
    console.error(`Validation failed with ${errors} missing assets.`);
    process.exit(1);
  }
  console.log("\nAll core assets and links verified!\n");
}

run();
