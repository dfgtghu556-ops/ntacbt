#!/usr/bin/env node
/**
 * EXTRACT LEGACY INLINE ACADEMIC DATA → src/data/sot/legacy-inline.json
 *
 * Phase 2 (source of truth). The legacy single-file app carries its own
 * planner topic list (`JEE_TOPICS`, `BOARD_EXTRA_TOPICS`, `ADV_EXTRA_TOPICS`,
 * `CBSE27_TOPICS`) and its own faculty catalog (`AIP_TEACHERS`) inside
 * public/jee-cbt.html. This script reads THOSE literal blocks (no behavior
 * change to the legacy app) and writes one committed snapshot that the
 * source-of-truth adapter and validators can consume.
 *
 * If the legacy file's literals change, re-run:
 *   npm run extract:legacy
 * and re-run `npm run validate:sot` to verify the snapshot is in sync.
 *
 * The script never writes back into jee-cbt.html.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "public", "jee-cbt.html"), "utf8");

const TARGETS = [
  { key: "JEE_TOPICS", name: "jeeTopics" },
  { key: "BOARD_EXTRA_TOPICS", name: "boardExtraTopics" },
  { key: "ADV_EXTRA_TOPICS", name: "advExtraTopics" },
  { key: "CBSE27_TOPICS", name: "cbse27Topics" },
  { key: "AIP_DEPTHS", name: "aipDepths" },
  { key: "AIP_TEACHERS", name: "aipTeachers" },
  { key: "AIP_CHANNELS", name: "aipChannels" },
];

/** Balanced scan from the first '{' or '[' at `start` until the matching close. */
function sliceLiteral(start, open, close) {
  let depth = 0;
  let inString = false;
  let quote = "";
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function extract(key) {
  const marker = `const ${key} = `;
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`Could not find const ${key} in jee-cbt.html`);
  const start = at + marker.length;
  const open = html[start];
  if (open !== "{" && open !== "[") {
    throw new Error(`Unexpected start for ${key}: "${open}"`);
  }
  const literal = sliceLiteral(start, open, open === "{" ? "}" : "]");
  if (!literal) throw new Error(`Could not balance ${key}`);
  return literal;
}

function evaluate(literal) {
  // The literals are plain data (objects/arrays). Evaluating our own,
  // statically-known data literal is safe and the simplest way to get it
  // into JSON without maintaining a hand-written duplicate.
  const fn = new Function(`"use strict"; return (${literal});`);
  return fn();
}

const out = {
  extractedAt: new Date().toISOString(),
  sourceFile: "public/jee-cbt.html",
  schema: 1,
  data: {},
};

for (const t of TARGETS) {
  const literal = extract(t.key);
  const value = evaluate(literal);
  out.data[t.name] = value;
  console.log(
    `[extract] ${t.key} → ${t.name} (${Array.isArray(value) ? value.length : Object.keys(value).length} entries)`,
  );
}

const outDir = join(root, "src", "data", "sot");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "legacy-inline.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("→ " + outPath);
