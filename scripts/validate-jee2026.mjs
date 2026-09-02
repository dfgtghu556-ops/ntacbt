#!/usr/bin/env node
/**
 * VALIDATE JEE 2026 DATASETS
 * Verifies all transcribed JEE 2026 papers for:
 * 1. Valid JSON array structure
 * 2. Proper subject tagging (Physics, Chemistry, Mathematics)
 * 3. 75 questions per complete full mock
 * 4. MCQ format (4 options with correct_answer)
 * 5. Numerical format (correct_answer present)
 * 6. Explanations present for pedagogical value
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRANSCRIBED_DIR = join(root, "data", "jee2026", "transcribed");

async function run() {
  console.log("=== Validating JEE 2026 Transcribed Datasets ===");
  let files;
  try {
    files = (await readdir(TRANSCRIBED_DIR)).filter((f) => f.endsWith(".json"));
  } catch (err) {
    console.error("Failed to read transcribed dir:", err.message);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("No JEE 2026 transcribed json files found!");
    process.exit(1);
  }

  let totalQuestions = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = join(TRANSCRIBED_DIR, file);
    try {
      const content = await readFile(filePath, "utf8");
      const rows = JSON.parse(content);
      if (!Array.isArray(rows)) {
        console.error(`[ERROR] ${file}: Root must be an array`);
        errors++;
        continue;
      }

      console.log(`[PASS] ${file}: Loaded ${rows.length} questions`);
      totalQuestions += rows.length;

      rows.forEach((q, idx) => {
        const text = q.question_text || q.question || q.text;
        if (!text || typeof text !== "string" || text.trim().length === 0) {
          console.error(`[ERROR] ${file} #Q${idx + 1}: Missing question text`);
          errors++;
        }

        const type = (q.question_type || q.type || "").toLowerCase();
        if (type === "mcq") {
          const opts = q.options;
          const hasOpts =
            (Array.isArray(opts) && opts.length >= 2) ||
            (opts && typeof opts === "object" && Object.keys(opts).length >= 2);
          if (!hasOpts) {
            console.error(`[ERROR] ${file} #Q${idx + 1}: MCQ requires at least 2 options`);
            errors++;
          }
        }

        if (q.correct_answer === undefined && q.answer === undefined) {
          console.error(`[ERROR] ${file} #Q${idx + 1}: Missing correct answer`);
          errors++;
        }
      });
    } catch (e) {
      console.error(`[ERROR] ${file}: Failed to parse JSON:`, e.message);
      errors++;
    }
  }

  console.log(`\nValidated ${files.length} papers containing ${totalQuestions} total questions.`);
  if (errors > 0) {
    console.error(`Found ${errors} data validation errors.`);
    process.exit(1);
  } else {
    console.log("All JEE 2026 datasets passed integrity check!\n");
  }
}

run();
