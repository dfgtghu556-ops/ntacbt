/**
 * Reopen a stored attempt: `/app/attempts/$attemptId`.
 *
 * This route exists because a result used to be a one-time view. The screen shown
 * the moment a paper was submitted was the only copy - reload the page, navigate
 * away, close the tab, and it was gone, even though the attempt itself sat in
 * `ntacbt.cbt.v1` the whole time. Every aggregate in the app (the trend, subject
 * performance, readiness) could see the attempt; nothing could open it.
 *
 * The attempt is read from the React store on mount, because the store is
 * client-side `localStorage` and there is nothing to server-render. A page that
 * arrives without a stored attempt is an unknown or stale id - a bookmark from a
 * backup that was never restored, or a hand-typed URL - and it says so rather
 * than rendering a blank screen or a fabricated result.
 */

import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { loadCbtStore } from "@/features/cbt/store";
import { AttemptDetail } from "@/features/exams/components/AttemptDetail";
import type { CbtAttemptRecord } from "@/features/cbt/types";

function AttemptPage() {
  const { attemptId } = Route.useParams();
  const [attempt, setAttempt] = useState<CbtAttemptRecord | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let found: CbtAttemptRecord | null = null;
    try {
      found = loadCbtStore().attempts.find((a) => a.id === attemptId) ?? null;
    } catch {
      // A malformed store is treated as "no attempts", which lands on the same
      // honest not-found screen as a genuinely unknown id.
      found = null;
    }
    setAttempt(found);
    setChecked(true);
  }, [attemptId]);

  if (!checked)
    return <div className="mx-auto max-w-4xl p-4 text-sm text-muted-foreground">Loading…</div>;

  if (!attempt) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <section className="rounded-xl border border-dashed p-8 text-center">
          <h1 className="font-semibold">Attempt not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This attempt isn&rsquo;t on this device. Attempts are stored in this browser, so
            restoring from a backup on another device won&rsquo;t bring them across.
          </p>
          <Link
            to="/app/analytics"
            className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Back to analytics
          </Link>
        </section>
      </div>
    );
  }

  return <AttemptDetail attempt={attempt} />;
}

export const Route = createFileRoute("/app/attempts/$attemptId")({
  component: AttemptPage,
});
