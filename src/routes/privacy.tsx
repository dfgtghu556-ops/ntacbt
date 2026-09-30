/**
 * Privacy policy — a real route, not a static file.
 *
 * This exists because AdSense will not approve a site without one, and more
 * importantly because the app stores real student data and a student is owed an
 * accurate account of where it goes. Every claim below was checked against the
 * code: the storage keys are the ones `src/config/constants.ts` and the feature
 * stores actually write, and Supabase is described as what it is — an optional
 * account sync, not a requirement.
 *
 * Do not add a claim here that the code does not implement. A privacy policy
 * that overstates what is collected is worse than none.
 */

import { createFileRoute } from "@tanstack/react-router";
import { socialMeta } from "@/config/site";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — NTACBT" },
      {
        name: "description",
        content:
          "What NTACBT stores on your device, what an optional account syncs, and what is never collected.",
      },

      // Open Graph + Twitter + canonical. Without this every route inherits
      // the root card, so sharing this page previews the root title.
      ...socialMeta(
        "Privacy Policy — NTACBT",
        "What NTACBT stores on your device, what an optional account syncs, and what is never collected.",
        "/privacy",
      ),
    ],
  }),
  component: Privacy,
});

const SECTION = "mt-8";
const H2 = "text-lg font-semibold";
const P = "mt-2 text-sm leading-relaxed text-muted-foreground";
const LI = "mt-1 text-sm leading-relaxed text-muted-foreground";

function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated 29 September 2026</p>

      <p className="text-sm text-muted-foreground">
        See also the{" "}
        <a href="/terms" className="text-primary underline">
          terms of service
        </a>{" "}
        and{" "}
        <a href="/about" className="text-primary underline">
          what NTACBT is
        </a>
        .
      </p>

      <section className={SECTION}>
        <h2 className={H2}>The short version</h2>
        <p className={P}>
          NTACBT keeps your practice data on your own device. You can use the planner, the
          previous-year papers, the exam runner, spaced repetition and every other feature without
          an account. If you choose to create one, your attempt history syncs so you can move
          between devices. We do not sell your data, and we do not run advertising profiling on it.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>What is stored on your device</h2>
        <p className={P}>
          Everything below lives in your browser's local storage. It never leaves your device unless
          you create an account, and you can clear all of it at any time from your browser's site
          settings.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={LI}>
            <strong className="font-medium text-foreground">Your answers and attempts</strong> —
            which questions you attempted, what you selected, how long you spent, and the resulting
            scores. This is what the analytics and mastery surfaces are built from.
          </li>
          <li className={LI}>
            <strong className="font-medium text-foreground">An in-progress exam</strong> — if you
            close the tab mid-test, your draft answers are saved so you can resume.
          </li>
          <li className={LI}>
            <strong className="font-medium text-foreground">Your notes and watch-later list</strong>{" "}
            — the active-recall notes you write on a lecture, and the lectures you save.
          </li>
          <li className={LI}>
            <strong className="font-medium text-foreground">Your spaced-repetition cards</strong> —
            scheduling state for each revision card.
          </li>
          <li className={LI}>
            <strong className="font-medium text-foreground">Your planner progress</strong> — which
            planned tasks you have ticked off, and your focus-session history.
          </li>
          <li className={LI}>
            <strong className="font-medium text-foreground">Your preferences</strong> — theme,
            language, quiet hours for notifications, and whether you have seen onboarding.
          </li>
        </ul>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>What an account adds</h2>
        <p className={P}>
          An account is optional. Creating one stores your email address and your attempt history on
          our authentication provider so that your progress follows you to another device. Signing
          out stops the sync. Deleting your account deletes that record.
        </p>
        <p className={P}>
          Nothing about your practice is shared with another student, a teacher, or an institute.
          There is no leaderboard and no peer comparison in this product.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>What we do not collect</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li className={LI}>No location, contacts, camera or microphone access.</li>
          <li className={LI}>
            No advertising identifiers, and no cross-site tracking for ad targeting.
          </li>
          <li className={LI}>No sale, rental or trade of your data to anyone, for any purpose.</li>
        </ul>
        <p className={P}>
          The one image upload in the app — asking Saarthi about a photo of a question — uses your
          device's file picker. The image is sent only to answer that question and is not retained.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Analytics</h2>
        <p className={P}>
          We measure aggregate page views and performance so we can tell whether the site is fast
          and where it breaks. These measurements are not linked to your practice data and are not
          used to identify you.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Your choices</h2>
        <p className={P}>
          Clear your browser's site data to remove everything stored locally. Sign out and delete
          your account to remove the synced copy. Both are effective immediately and neither
          requires you to contact us.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Children</h2>
        <p className={P}>
          NTACBT is built for students preparing for competitive entrance exams, which includes
          users under 18. We collect only what is described above, we do not profile minors for
          advertising, and we do not require an account to use the app.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Changes</h2>
        <p className={P}>
          If this policy changes, the date at the top changes with it. A change that widens what is
          collected will be stated plainly rather than folded into quieter wording.
        </p>
      </section>
    </div>
  );
}
