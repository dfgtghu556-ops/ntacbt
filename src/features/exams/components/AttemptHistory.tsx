/**
 * Attempt history - every submitted attempt on this device, newest first.
 *
 * This is the missing half of the fix in `DataStore.attempts`. Making attempts
 * flow into analytics is what makes the *trend* honest; this is what makes them
 * *reachable*. Before it, a student could see that they had sat five mocks but
 * could not open any of them - the result they were shown the day they finished
 * a paper was the only copy, and it vanished on reload.
 *
 * The order is newest first because this is a "what did I do recently" list, and
 * it is the opposite of the ascending `submittedAt` order `DataStore` returns,
 * which exists for the chart. The inversion happens here, once, rather than in
 * every consumer.
 *
 * `AttemptSummary` carries no paper name - it is the aggregate shape every
 * consumer of the trend needs, and adding a display field to it would widen the
 * contract for the sake of one row. The name is looked up from the React store,
 * which is where the paper is stored with the attempt. An attempt with no name
 * there is a legacy one, and it is labelled by date rather than given a fake
 * name.
 */

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { loadCbtStore } from "@/features/cbt/store";
import { pageSummary, paginate } from "@/features/ui/pagination";
import type { AttemptSummary } from "@/lib/store";

/** How many attempts to show before paging. Matches the review page size. */
const PAGE_SIZE = 10;

function when(unixMs: number): string {
  // The attempt's own timestamp, not "now" - a paper sat last month should read
  // as last month, however long ago the student opened this page.
  return new Date(unixMs).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function marks(a: AttemptSummary): string {
  if (!a.result) return "Not graded";
  return `${a.result.all.marks}/${a.result.all.max ?? a.result.all.total}`;
}

/**
 * Paper names, by attempt id.
 *
 * Returns an empty map rather than throwing if the React store is missing or
 * malformed: this runs inside a `useMemo` during render, so an exception would
 * blank the analytics page rather than just dropping the names.
 */
function paperNames(): Map<string, string> {
  const names = new Map<string, string>();
  if (typeof window === "undefined") return names;
  try {
    for (const a of loadCbtStore().attempts) {
      const name = a.test?.name;
      if (a && typeof a.submittedAt === "number" && name) names.set(a.id, name);
    }
  } catch {
    return names;
  }
  return names;
}

export function AttemptHistory({ attempts }: { attempts: AttemptSummary[] }) {
  const names = useMemo(paperNames, []);

  // Newest first: see the module comment for why this is the opposite of the
  // ascending order `DataStore` hands out.
  const rows = useMemo(
    () =>
      attempts
        .filter((a) => a && typeof a.submittedAt === "number")
        .sort((a, b) => (b.submittedAt as number) - (a.submittedAt as number)),
    [attempts],
  );

  const [page, setPage] = useState(1);
  const view = paginate(rows, { page, pageSize: PAGE_SIZE });

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border p-4" data-testid="attempt-history">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ClipboardList className="h-4 w-4 text-muted-foreground" /> Your attempts
      </h2>
      <ul className="divide-y">
        {view.items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
            <Link
              to="/app/attempts/$attemptId"
              params={{ attemptId: a.id }}
              className="font-medium hover:underline"
            >
              {names.get(a.id) ?? `Attempt of ${when(a.submittedAt as number)}`}
            </Link>
            <span className="text-sm text-muted-foreground">{when(a.submittedAt as number)}</span>
            <span className="ml-auto text-sm font-semibold tabular-nums">{marks(a)}</span>
            {a.result ? (
              <span className="text-sm text-muted-foreground tabular-nums">
                {a.result.all.accuracy}%
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {view.totalPages > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!view.hasPrev}
            className="rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">{pageSummary(view, "attempts")}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!view.hasNext}
            className="rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
