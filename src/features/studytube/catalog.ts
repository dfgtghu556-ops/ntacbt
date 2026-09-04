/**
 * Offline StudyTube catalog.
 *
 * The live discovery endpoint (`/api/public/study-planner`) returns real
 * YouTube videos when it can reach YouTube. This local catalog is the
 * "always works" layer: it builds StudyTube picks from the verified
 * Dream Team / Dream Teacher data so StudyTube never renders as an empty
 * shell. Offline picks open a targeted YouTube search in a new tab instead
 * of pretending a specific video exists.
 */

import type { StudyTubeRequest, StudyTubeVideo } from "./types";
import { INSTITUTES, TEACHERS, boardCoreTeachersFor, isBoardTarget } from "@/data/teachers";

function subjectWord(subject: string): string {
  return subject === "Physics" || subject === "Chemistry" || subject === "Mathematics"
    ? subject
    : "Physics";
}

function langWord(language: StudyTubeRequest["language"]): string {
  return language === "hi" ? " hindi" : language === "hinglish" ? " hindi english" : "";
}

function targetWord(target: StudyTubeRequest["target"]): string {
  if (target === "board12") return " class 12 boards cbse";
  if (target === "cbse27") return " class 12 boards cbse";
  if (target === "board11") return " class 11 cbse";
  if (target === "jeeadv") return " jee advanced";
  return " jee main";
}

function depthWord(depth: StudyTubeRequest["depth"], kind: StudyTubeRequest["kind"]): string {
  if (kind === "revision") return " quick revision one shot";
  if (kind === "practice" || kind === "advanced") return " important questions pyq solved";
  if (depth === "oneshot") return " one shot complete";
  if (depth === "detailed") return " detailed lecture complete concepts";
  return " full chapter lecture";
}

/** Board-accurate durations (seconds) so the pick matches the detail asked for. */
function durationFor(
  depth: StudyTubeRequest["depth"],
  kind: StudyTubeRequest["kind"],
  target?: StudyTubeRequest["target"],
): number {
  const board = isBoardTarget(target);
  if (kind === "revision") return board ? 45 * 60 : 50 * 60;
  if (kind === "practice" || kind === "advanced") return board ? 75 * 60 : 90 * 60;
  if (depth === "oneshot") return board ? 120 * 60 : 180 * 60;
  if (depth === "detailed") return board ? 180 * 60 : 240 * 60;
  return board ? 120 * 60 : 150 * 60;
}

/** Pool of educators eligible for a request target (board → board-core only). */
function teacherPool(req: StudyTubeRequest) {
  const subject = subjectWord(req.subject);
  if (isBoardTarget(req.target)) return boardCoreTeachersFor(subject);
  return TEACHERS.filter((t) => t.subject === subject && t.verified);
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42) || "pick"
  );
}

function buildSearchUrl(req: StudyTubeRequest, channelName?: string, teacherName?: string): string {
  const topic = `${req.topic} ${subjectWord(req.subject)}`.trim();
  const who = teacherName || channelName || req.teacher || req.institute || "";
  const query =
    `${topic} ${who} ${depthWord(req.depth, req.kind)}${targetWord(req.target)}${langWord(req.language)}`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function pickTeacher(req: StudyTubeRequest) {
  const candidates = teacherPool(req);
  const teachers =
    req.teacher != null
      ? candidates.filter((t) => t.id === req.teacher || t.name === req.teacher)
      : candidates.filter((t) => t.instituteId === req.institute);
  const byInstitute = candidates.filter((t) => t.instituteId === req.institute);
  const pool = teachers.length ? teachers : byInstitute.length ? byInstitute : candidates;
  return pool[0] ?? candidates[0];
}

function pickInstitute(req: StudyTubeRequest) {
  if (!req.institute) return undefined;
  return INSTITUTES.find((i) => i.id === req.institute) ?? INSTITUTES[0];
}

/**
 * Build a deterministic set of StudyTube picks that always exist, even with
 * no network. Each item is a study-focused YouTube search discovery card.
 */
export function offlineCatalog(req: StudyTubeRequest): StudyTubeVideo[] {
  const subject = subjectWord(req.subject);
  const teacher = pickTeacher(req);
  const institute = pickInstitute(req);
  const topic = req.topic.trim() || (subject === "Physics" ? "Electrostatics" : subject);
  const titleKeyword =
    req.kind === "revision"
      ? "Quick revision"
      : req.kind === "practice" || req.kind === "advanced"
        ? "PYQ practice"
        : req.depth === "oneshot"
          ? "One Shot"
          : req.depth === "detailed"
            ? "Full detailed lecture"
            : "Full chapter lecture";
  const channelName =
    teacher?.channelName || institute?.officialChannels?.[0] || "StudyTube verified educators";
  const base = {
    score: 0,
    why: "Offline StudyTube pick — opens a targeted YouTube search matched to your target, subject and Dream preferences.",
    subject,
    topic,
    teacher: teacher?.name || "",
    institute: institute?.name || "",
    depth: req.depth,
    kind: req.kind,
  };

  const first: StudyTubeVideo = {
    ...base,
    id: `catalog-${slug(`${topic}-${channelName}`)}`,
    title: `${topic} — ${titleKeyword} | ${channelName}`,
    channel: channelName,
    channelId: teacher?.channelId || "",
    durationSec: durationFor(req.depth, req.kind, req.target),
    externalUrl: buildSearchUrl(req, channelName, teacher?.name),
    why: teacher
      ? `Dream Teacher pick: ${teacher.name} · ${teacher.specialization || "verified board educator"}.`
      : "Top verified educator pick for this topic and target.",
  };

  const more: StudyTubeVideo[] = [];
  const board = isBoardTarget(req.target);
  const variants: Array<[string, string]> = board
    ? [
        ["One-Shot Revision", "one shot quick revision complete"],
        ["PYQ + Case-Based Practice", "pyq important questions case based solved"],
        ["NCERT / Board Explanation", "class 12 cbse ncert explanation easy"],
        ["Higher-Order Board Problems", "class 12 cbse higher order tough questions"],
      ]
    : [
        ["One-Shot Revision", "one shot quick revision complete"],
        ["PYQ + MCQ Practice", "pyq important questions solved"],
        ["Board-Level Explanation", "class 12 cbse board explanation easy"],
        ["Advanced / Tough Problems", "jee advanced level tough problems"],
      ];
  for (const [label, keyword] of variants) {
    void keyword;
    const variantReq: StudyTubeRequest = {
      ...req,
      topic: `${topic} ${label}`,
      kind: label.includes("PYQ")
        ? "practice"
        : label.includes("Advanced") || label.includes("Higher-Order")
          ? "advanced"
          : req.kind,
      depth: label === "One-Shot Revision" ? "oneshot" : req.depth,
    };
    const updated = pickTeacher(variantReq);
    const ch = updated?.channelName || channelName;
    more.push({
      ...base,
      id: `catalog-${slug(`${topic}-${label}-${ch}`)}`,
      title: `${topic} — ${label} | ${ch}`,
      channel: ch,
      channelId: updated?.channelId || "",
      durationSec: durationFor(variantReq.depth, variantReq.kind, variantReq.target),
      externalUrl: buildSearchUrl(variantReq, ch, updated?.name),
      why:
        updated && updated.name !== teacher?.name
          ? `Alternate pick from ${updated.name} (${updated.specialization || "verified educator"}).`
          : `StudyTube pick: ${label.toLowerCase()} for ${subject}.`,
      teacher: updated?.name || "",
    });
  }

  return [first, ...more].filter((v) => v.title.trim().length > 0);
}

/**
 * Channel-style card data for the "Subscriptions"-like Dream rows.
 * Target-aware: for a CBSE/board target ONLY board-core educators are
 * returned (no JEE/NEET faculties); grouped so board vs JEE stays clear.
 */
export function dreamChannels(req: StudyTubeRequest) {
  const subject = subjectWord(req.subject);
  const board = isBoardTarget(req.target);
  const teachers = teacherPool(req).filter(
    (t) => !req.institute || t.instituteId === req.institute,
  );
  // Group: board-first educators first (for board target that's the whole list),
  // then recognised JEE faculties (only shown for JEE targets).
  const boardFirst = teachers.sort((a, b) => {
    const aBoard = a.boardCore ? 0 : 1;
    const bBoard = b.boardCore ? 0 : 1;
    return aBoard - bBoard || a.name.localeCompare(b.name);
  });
  return boardFirst.slice(0, 8).map((t) => ({
    id: t.id,
    name: t.name,
    channelName: t.channelName,
    institute: t.institute,
    specialization: t.specialization,
    boardCore: t.boardCore,
    request: { ...req, teacher: t.id } as StudyTubeRequest,
  }));
}
