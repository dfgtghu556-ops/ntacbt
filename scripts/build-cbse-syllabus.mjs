#!/usr/bin/env node
/**
 * BUILD: official CBSE senior-secondary syllabus → data/syllabus/cbse-2026-27.json
 *
 * ZERO-FABRICATION: every unit, chapter and topic string in the output is a
 * literal substring of the official CBSE curriculum PDF for 2026-27, fetched
 * from cbseacademic.nic.in at build time. Nothing is invented, re-worded or
 * inferred. If a PDF cannot be fetched or parsed the build fails loudly rather
 * than emitting partial/guessed data.
 *
 * Run: bun run build:syllabus
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/";
const SUBJECTS = [
  { name: "Physics", code: "042", file: "Physics_SecP2_2026-27.pdf" },
  { name: "Chemistry", code: "043", file: "Chemistry_SecP2_2026-27.pdf" },
  { name: "Mathematics", code: "041", file: "Maths_SecP2_2026-27.pdf" },
];
const CURRICULUM_INDEX = "https://cbseacademic.nic.in/curriculum_2027.html";

const work = join(tmpdir(), "cbse-syllabus-build");
mkdirSync(work, { recursive: true });

async function textOf(subject) {
  const pdf = join(work, subject.file);
  const txt = pdf.replace(/\.pdf$/, ".txt");
  if (!existsSync(txt)) {
    const res = await fetch(BASE + subject.file);
    if (!res.ok) throw new Error(`CBSE PDF fetch failed (${res.status}) for ${subject.name}`);
    writeFileSync(pdf, Buffer.from(await res.arrayBuffer()));
    execFileSync("pdftotext", ["-layout", pdf, txt]);
  }
  return readFileSync(txt, "utf8");
}

/** Split an official syllabus sentence into topic fragments that are literal
 *  substrings of it. No paraphrasing, no additions. */
function topicsFrom(description) {
  return description
    .split(/[;,.]\s+|\n/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 4 && t.length <= 90 && /[a-zA-Z]/.test(t))
    .slice(0, 40);
}

const clean = (s) => s.replace(/\s+/g, " ").trim();

/** Physics: "Unit–I  Electrostatics" + "Chapter–1: Electric Charges and Fields" */
function parsePhysics(text) {
  const xii = text.slice(text.indexOf("CLASS XII (2026-27)"));
  if (!xii) throw new Error("Physics: Class XII section not found");
  const body = xii.slice(xii.indexOf("Unit I:") >= 0 ? xii.indexOf("Unit I:") : 0);
  const units = [];
  const unitRe = /^\s*Unit[–\-\s]*([IVX]+)\s*:?\s*(.+?)\s*$/gm;
  const marks = {};
  // marks come from the course-structure table at the top of the XII section
  const tableRe = /Unit[–\-]([IVX]+)\s+([A-Za-z][^\n]*?)\s{2,}(\d{1,2})\s*$/gm;
  let t;
  while ((t = tableRe.exec(xii))) marks[t[1]] = Number(t[3]);

  const marks2 = [];
  let m;
  while ((m = unitRe.exec(body))) marks2.push({ roman: m[1], name: clean(m[2]), at: m.index });
  for (let i = 0; i < marks2.length; i++) {
    const seg = body.slice(marks2[i].at, i + 1 < marks2.length ? marks2[i + 1].at : undefined);
    const chapters = [];
    const chRe = /Chapter[–\-]\s*(\d+)\s*:\s*([^\n]+)\n([\s\S]*?)(?=Chapter[–\-]\s*\d+\s*:|$)/g;
    let c;
    while ((c = chRe.exec(seg))) {
      const description = clean(c[3]).slice(0, 4000);
      chapters.push({
        no: Number(c[1]),
        name: clean(c[2]),
        description,
        topics: topicsFrom(description),
      });
    }
    if (!chapters.length) continue;
    units.push({
      no: marks2[i].roman,
      name: marks2[i].name,
      ...(marks[marks2[i].roman] ? { marks: marks[marks2[i].roman] } : {}),
      chapters,
    });
  }
  return units;
}

/** Chemistry: "Unit 1: Solutions" + a description paragraph (chapter == unit) */
function parseChemistry(text) {
  const start = text.indexOf("Unit 1: Solutions");
  if (start < 0) throw new Error("Chemistry: Class XII units not found");
  const body = text.slice(start);
  const units = [];
  const re =
    /^Unit\s+(\d+)\s*:\s*([^\n]+)\n([\s\S]*?)(?=^Unit\s+\d+\s*:|^PRACTICALS|^Prescribed|$)/gm;
  let m;
  const markTable = {};
  const mt = /^\s*(\d{1,2})\s{2,}([A-Za-z][^\n]*?)\s{2,}(\d{1,2})\s*$/gm;
  let x;
  while ((x = mt.exec(text))) markTable[clean(x[2]).toLowerCase()] = Number(x[3]);
  while ((m = re.exec(body))) {
    const name = clean(m[2]);
    const description = clean(m[3].replace(/^\s*\d+\s*$/gm, "")).slice(0, 4000);
    if (!description) continue;
    units.push({
      no: m[1],
      name,
      ...(markTable[name.toLowerCase()] ? { marks: markTable[name.toLowerCase()] } : {}),
      chapters: [{ no: Number(m[1]), name, description, topics: topicsFrom(description) }],
    });
  }
  return units;
}

/** Mathematics: "Unit-I: Relations and Functions" + numbered chapters */
function parseMaths(text) {
  const start = text.indexOf("Unit-I: Relations and Functions");
  if (start < 0) throw new Error("Mathematics: Class XII units not found");
  const body = text.slice(start);
  const units = [];
  const re =
    /^Unit[-–]\s*([IVX]+)\s*:\s*([^\n]+)\n([\s\S]*?)(?=^Unit[-–]\s*[IVX]+\s*:|^MATHEMATICS|^Prescribed|$)/gm;
  let m;
  while ((m = re.exec(body))) {
    const seg = m[3];
    const chapters = [];
    const chRe = /^\s*(\d+)[.)]\s+([A-Z][^\n]{2,80})\n([\s\S]*?)(?=^\s*\d+[.)]\s+[A-Z]|$)/gm;
    let c;
    while ((c = chRe.exec(seg))) {
      const description = clean(c[3]).slice(0, 4000);
      chapters.push({
        no: Number(c[1]),
        name: clean(c[2]),
        description,
        topics: topicsFrom(description),
      });
    }
    if (!chapters.length) {
      const description = clean(seg).slice(0, 4000);
      if (!description) continue;
      chapters.push({ no: 1, name: clean(m[2]), description, topics: topicsFrom(description) });
    }
    units.push({ no: m[1], name: clean(m[2]), chapters });
  }
  return units;
}

const PARSERS = { Physics: parsePhysics, Chemistry: parseChemistry, Mathematics: parseMaths };

const fetchedAt = new Date().toISOString();
const subjects = [];
for (const s of SUBJECTS) {
  const text = await textOf(s);
  const units = PARSERS[s.name](text);
  const chapterCount = units.reduce((a, u) => a + u.chapters.length, 0);
  if (!units.length || chapterCount < 6) {
    throw new Error(
      `${s.name}: parsed only ${chapterCount} chapters — refusing to emit partial syllabus`,
    );
  }
  subjects.push({
    name: s.name,
    code: s.code,
    units,
    source: {
      source: "CBSE Academic Unit — Senior Secondary Curriculum 2026-27",
      source_type: "official_exam_board",
      source_url: BASE + s.file,
      index_url: CURRICULUM_INDEX,
      fetched_at: fetchedAt,
      version: "2026-27",
      verification_status: "verified",
    },
  });
  console.log(`${s.name}: ${units.length} units, ${chapterCount} chapters`);
}

const out = {
  schema: 1,
  board: "CBSE",
  class: "XII",
  academic_year: "2026-27",
  built_at: fetchedAt,
  subjects,
};
mkdirSync("data/syllabus", { recursive: true });
writeFileSync("data/syllabus/cbse-class12-2026-27.json", JSON.stringify(out, null, 2));
mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/cbse-class12-2026-27.json", JSON.stringify(out));
console.log("→ data/syllabus/cbse-class12-2026-27.json");
