/**
 * About page — a real route, not a static file.
 *
 * Two reasons this exists. AdSense approval asks for one, and more usefully, a
 * student deserves to know what they are using and where the questions come
 * from before they trust a predicted score.
 *
 * The numbers here are read from the baked dataset on the server rather than
 * typed into the prose, so this page cannot hard-code a count the next bake
 * library grows past that. A marketing page with a stale count is a small lie
 * that undermines every other number in the app.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { PaperMeta } from "@/features/pyq/store";
import { publishedCurricula } from "@/data/curriculum";
import { socialMeta } from "@/config/site";

/**
 * The paper library, read from the baked build artifact.
 *
 * Same reasoning as the PYQ route: reading a file on disk costs nothing, keeps
 * the page server-rendered, and means the figure in the prose is the figure
 * actually being served.
 */
const loadLibraryStats = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raw = readFileSync(join(process.cwd(), "public", "pyq", "index.json"), "utf8");
    const data = JSON.parse(raw) as { papers?: PaperMeta[]; index?: PaperMeta[] };
    const papers = data.papers ?? data.index ?? [];

    let questions = 0;
    const years = new Set<number>();
    for (const p of papers) {
      questions += p.total ?? 0;
      if (p.year) years.add(p.year);
    }

    return {
      papers: papers.length,
      questions,
      years: [...years].sort((a, b) => b - a),
    };
  } catch {
    // A missing bake is normal before the first build. Say nothing rather than
    // inventing a count.
    return { papers: 0, questions: 0, years: [] as number[] };
  }
});

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About NTACBT — A JEE Main Practice App" },
      {
        name: "description",
        content:
          "NTACBT is a free, offline-first JEE Main practice platform: real previous-year questions, an NTA-style test runner, an adaptive planner and honest progress analytics.",
      },

      // Open Graph + Twitter + canonical. Without this every route inherits
      // the root card, so sharing this page previews the root title.
      ...socialMeta(
        "About NTACBT — A JEE Main Practice App",
        "NTACBT is a free, offline-first JEE Main practice platform: real previous-year questions, an NTA-style test runner, an adaptive planner and honest progress analytics.",
        "/about",
      ),
    ],
  }),
  loader: () => loadLibraryStats(),
  component: About,
});

const SECTION = "mt-8";
const H2 = "text-lg font-semibold";
const P = "mt-2 text-sm leading-relaxed text-muted-foreground";
const LI = "mt-1 text-sm leading-relaxed text-muted-foreground";

/** The syllabus facts, taken from the validated curriculum rather than memory. */
function curriculumFacts() {
  const rows: string[] = [];
  for (const map of publishedCurricula()) {
    for (const subject of map.subjects) {
      const units = subject.units.length;
      const chapters = subject.units.reduce((n, u) => n + u.chapters.length, 0);
      rows.push(
        `Class ${map.classLevel} ${subject.subject}: ${chapters} chapters across ${units} ${
          units === 1 ? "unit" : "units"
        }`,
      );
    }
  }
  return rows;
}

function About() {
  const stats = Route.useLoaderData();
  const syllabus = curriculumFacts();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">About NTACBT</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A free practice platform for JEE Main, built around the papers that actually exist.
      </p>

      <section className={SECTION}>
        <h2 className={H2}>What this is</h2>
        <p className={P}>
          NTACBT is a study tool for students preparing for JEE Main. It puts the previous-year
          papers, an NTA-style test runner, a planner, revision cards and progress analytics in one
          place, and it works without an account because a student should not have to sign up to
          practise.
        </p>
        <p className={P}>
          It runs on your device. Your answers, your notes and your scores are stored in your own
          browser, so the app keeps working on a train with no signal, and nothing about your
          practice is visible to another student.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>The question library</h2>
        {stats.questions > 0 ? (
          <p className={P}>
            The library holds {stats.questions} transcribed questions from{" "}
            {stats.papers === 1 ? "one paper" : `${stats.papers} papers`}
            {stats.years.length > 0 ? ` (${stats.years.join(", ")})` : ""}, with answers and worked
            solutions. Each paper can be taken as a timed computer-based test or worked through
            question by question.
          </p>
        ) : (
          <p className={P}>
            The question library is served from this site itself, so practising never depends on an
            external service being up.
          </p>
        )}
        <p className={P}>
          The questions are transcribed from public exam data. NTACBT is not an official NTA
          publication and is not affiliated with the agency; where a transcription disagrees with an
          official paper, the official paper is correct.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>The syllabus map</h2>
        <p className={P}>
          The map follows the rationalised CBSE syllabus as published by the board, chapter by
          chapter. It lists topics rather than colour-coding them, because a topic list is checkable
          and a colour is not.
        </p>
        {syllabus.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {syllabus.map((row) => (
              <li key={row} className={LI}>
                {row}
              </li>
            ))}
          </ul>
        )}
        <p className={P}>
          Where the board does not publish a chapter-wise marks split — Physics is one — the map
          says so instead of showing a number that was guessed.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>What we deliberately do not do</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={LI}>
            <strong className="font-medium text-foreground">No leaderboard.</strong> There is no
            peer data to compare against honestly, so a ranking would be invented. The only
            comparison offered is against your own previous best.
          </li>
          <li className={LI}>
            <strong className="font-medium text-foreground">No countdown pressure.</strong> No
            "you're falling behind" framing, and no badge earned by not doing something.
          </li>
          <li className={LI}>
            <strong className="font-medium text-foreground">No invented difficulty.</strong> The
            source data has no difficulty field, so nothing is labelled easy or hard. A thin sample
            shows as unmeasured rather than as failing.
          </li>
          <li className={LI}>
            <strong className="font-medium text-foreground">No predicted rank.</strong> A percentile
            on practice questions is not an admission outcome, and it is never presented as one.
          </li>
        </ul>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Open source</h2>
        <p className={P}>
          The source is public. The question transcription, the curriculum data and the scoring
          logic can all be read and checked, because a study tool that asks you to trust its
          arithmetic should show it.
        </p>
      </section>

      <p className="mt-8 text-sm text-muted-foreground">
        See also the{" "}
        <a href="/privacy" className="text-primary underline">
          privacy policy
        </a>{" "}
        and the{" "}
        <a href="/terms" className="text-primary underline">
          terms of service
        </a>
        .
      </p>
    </div>
  );
}
