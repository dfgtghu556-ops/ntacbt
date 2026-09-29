/**
 * Syllabus Map (A7)
 *
 * The board's own unit → chapter → topic structure, coloured by the student's
 * real chapter-level evidence.
 *
 * **What this deliberately does not do.** It does not draw prerequisite edges
 * between topics. A prerequisite is a claim about how knowledge works, and a
 * wrong one is worse than a missing one — a student told chapter B *requires*
 * chapter A will skip B believing they are not ready. The published CBSE
 * syllabus states no prerequisites, so none are invented here. The ordering
 * shown is the board's own, which is the order a student is examined in.
 *
 * **Topics are listed, not coloured.** Mastery is measured per chapter, because
 * that is the granularity the question bank carries. Painting a topic green
 * because its chapter is green would be a claim the evidence does not support.
 */

import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Layers, Map as MapIcon } from "lucide-react";
import { DataStore } from "@/lib/store";
import { loadStudyTubeProgress } from "@/features/studytube/progress";
import { masteryFromStores } from "@/features/mastery/collect";
import { buildSyllabusMap, type MapChapter } from "@/features/curriculum/map";
import type { SyllabusMap } from "@/features/curriculum/map";

export const Route = createFileRoute("/app/map")({
  head: () => ({
    meta: [
      { title: "CBSE Class 11 & 12 Syllabus 2026-27 — Unit-wise Chapters and Topics" },
      {
        name: "description",
        content:
          "The complete rationalised CBSE Class 11 and Class 12 syllabus for Physics, Chemistry and Mathematics, unit by unit, with every topic listed.",
      },
    ],
  }),
  component: SyllabusMapPage,
});

/** A chapter's visual state, from its evidence. */
function chapterTone(chapter: MapChapter): string {
  if (chapter.state === null) return "border-dashed bg-muted/30 text-muted-foreground";
  if (chapter.isWeak) return "border-rose-300 bg-rose-50 dark:bg-rose-950/40";
  if (chapter.state === "Mastered")
    return "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40";
  if (chapter.state === "Strong") return "border-green-300 bg-green-50 dark:bg-green-950/40";
  return "border-amber-300 bg-amber-50 dark:bg-amber-950/40";
}

function chapterBadge(chapter: MapChapter): string {
  if (chapter.state === null) return "No evidence";
  if (chapter.accuracy === null)
    return `${chapter.attempts} attempt${chapter.attempts === 1 ? "" : "s"}`;
  return `${chapter.accuracy}%`;
}

/**
 * The objective the map defaults to when the student has not chosen one.
 *
 * This is the whole fix for the page's publishing problem. `buildSyllabusMap`
 * reads a static curriculum module and nothing else, so it can run during SSR
 * and costs no network — but the page used to seed its state from a
 * `useEffect` reading localStorage, so the server shipped a pulse skeleton and
 * not one chapter name. Verified: `curl /app/map` returned 5 KB containing
 * neither "Units and Measurements" nor "Vector Algebra". A crawler therefore
 * saw an empty page on the route holding the app's most searchable content —
 * students search "CBSE class 11 physics syllabus" by name.
 *
 * Seeding from Class 12 also means the *structure* a student with no profile
 * sees is the same structure a crawler sees, so nothing is being shown to
 * search that a student cannot also reach.
 */
const DEFAULT_TARGET = "cbse27";

function SyllabusMapPage() {
  // Built synchronously, not in an effect. The syllabus is static data, so the
  // first render - server or client - has everything it needs.
  const [map, setMap] = useState<SyllabusMap>(() => buildSyllabusMap(DEFAULT_TARGET, new Map()));
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [openChapter, setOpenChapter] = useState<string | null>(null);

  useEffect(() => {
    // The upgrade: read the student's own objective and real chapter evidence,
    // then rebuild with the mastery colouring applied. This only ever replaces
    // the seed; it is what makes the page personal, not what makes it visible.
    const store = new DataStore();
    const profile = store.planner?.profile;
    const chosen = profile?.target || DEFAULT_TARGET;
    setTarget(chosen);
    try {
      const mastery = masteryFromStores(store, loadStudyTubeProgress(), Date.now());
      setMap(buildSyllabusMap(chosen, mastery));
    } catch {
      // Keep the synchronously built map. A failure to read local storage is
      // not a reason to blank a page whose content does not depend on it.
      setMap(buildSyllabusMap(chosen, new Map()));
    }
  }, []);

  const totals = useMemo(() => {
    if (!map) return null;
    return {
      evidenced: map.evidencedChapters,
      weak: map.weakChapters,
      mastered: map.masteredChapters,
      total: map.totalChapters,
    };
  }, [map]);

  if (!map.key) {
    return (
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <MapIcon className="h-6 w-6 text-primary" /> Syllabus Map
        </h1>
        <section className="rounded-2xl border border-dashed p-8 text-center">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No syllabus map for this objective</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{map.note}</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
            The map is shown for a CBSE board target. JEE objectives are examination goals rather
            than a class syllabus, so there is no board structure to draw for them.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <MapIcon className="h-6 w-6 text-primary" /> Syllabus Map
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            CBSE Class {map.key.classLevel} {map.key.academicYear} · the board&apos;s own unit and
            chapter order, coloured by your attempts.
          </p>
        </div>
        {totals ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-3 py-1 tabular-nums">
              {totals.evidenced}/{totals.total} evidenced
            </span>
            <span className="rounded-full border border-rose-300 px-3 py-1 tabular-nums text-rose-700 dark:text-rose-300">
              {totals.weak} weak
            </span>
            <span className="rounded-full border border-emerald-300 px-3 py-1 tabular-nums text-emerald-700 dark:text-emerald-300">
              {totals.mastered} mastered
            </span>
          </div>
        ) : null}
      </section>

      <p className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">{map.note}</p>

      {map.nextInOrder ? (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Your weakest measured chapter is followed by{" "}
            <strong>
              {map.nextInOrder.subject} — {map.nextInOrder.chapter}
            </strong>{" "}
            in the board&apos;s own order.
          </span>
        </p>
      ) : null}

      <div className="space-y-6">
        {map.subjects.map((subject) => (
          <section key={subject.subject}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {subject.subject}
              </h2>
              <span className="text-[11px] text-muted-foreground">
                {subject.theoryMarks === null
                  ? "no published unit weightage"
                  : `${subject.theoryMarks} theory marks`}
              </span>
            </div>
            <div className="mt-2 space-y-3">
              {subject.units.map((unit) => (
                <div key={`${subject.subject}-${unit.numeral}`} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium">
                      Unit {unit.numeral} — {unit.name}
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                      {unit.marks === null
                        ? "unit marks not published here"
                        : `${unit.marks} marks`}
                      {unit.accuracy === null
                        ? ""
                        : ` · ${unit.accuracy}% mean over sampled chapters`}
                    </span>
                  </div>
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {unit.chapters.map((chapter) => {
                      const key = `${subject.subject}-${chapter.number}`;
                      const open = openChapter === key;
                      return (
                        <li key={key}>
                          <button
                            onClick={() => setOpenChapter(open ? null : key)}
                            className={`w-full rounded-md border px-2.5 py-2 text-left text-xs ${chapterTone(
                              chapter,
                            )}`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">
                                <span className="tabular-nums text-muted-foreground">
                                  {chapter.number}.
                                </span>{" "}
                                {chapter.name}
                              </span>
                              <span className="shrink-0 text-[10px] font-medium tabular-nums">
                                {chapterBadge(chapter)}
                              </span>
                            </span>
                          </button>
                          {open ? (
                            <div className="mt-1 rounded-md border bg-background p-2.5 text-xs">
                              <p className="text-muted-foreground">{chapter.reason}</p>
                              <p className="mt-1.5 flex items-center gap-1.5 font-medium">
                                <BookOpen className="h-3.5 w-3.5" /> {chapter.topics.length} topics
                              </p>
                              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                {chapter.topics.map((t) => (
                                  <li key={t.name}>· {t.name}</li>
                                ))}
                              </ul>
                              <p className="mt-2 text-[10px] text-muted-foreground">
                                Topics are listed, not scored — mastery is measured per chapter,
                                because that is the granularity the question bank carries.
                              </p>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        No prerequisite links are drawn: the published CBSE syllabus states none, and an invented
        dependency would tell a student to skip a chapter they are ready for.
      </p>
    </div>
  );
}
