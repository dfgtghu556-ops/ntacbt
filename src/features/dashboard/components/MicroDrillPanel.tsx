/**
 * MicroDrillPanel — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import type { MicroDrillCard } from "@/features/dashboard/types";
import { useEffect, useMemo, useState } from "react";

export function MicroDrillPanel({ cards }: { cards: MicroDrillCard[] }) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const first = cards[0] as MicroDrillCard | undefined;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => {
        const isFlipped = !!flipped[c.id];
        return (
          <button
            key={c.id}
            onClick={() => setFlipped((m) => ({ ...m, [c.id]: !isFlipped }))}
            className={`group relative min-h-[11rem] overflow-hidden rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
              isFlipped ? "border-primary/40 bg-primary/5" : ""
            }`}
            aria-label={isFlipped ? "Show question" : "Show answer"}
          >
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                {c.subject}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {c.tagLabel}
              </span>
            </div>
            <div className="mt-3 text-xs font-medium text-muted-foreground">
              {isFlipped ? "Self-check" : "Recall"}
              <span className="ml-1 text-[10px] text-muted-foreground/70">— tap to flip</span>
            </div>
            {isFlipped ? (
              <p className="mt-2 text-sm font-medium">{c.answer}</p>
            ) : (
              <p className="mt-2 text-sm">{c.prompt}</p>
            )}
          </button>
        );
      })}

      {first ? (
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-dashed p-4 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Why this drill
          </div>
          <p className="text-sm text-muted-foreground">
            Built from your{" "}
            <span className="font-medium text-foreground">{first.tagLabel.toLowerCase()}</span>{" "}
            strongest mistake pattern on {first.subject}. Retrieving beats re-watching — say the
            answer, then check.
          </p>
        </div>
      ) : null}
    </div>
  );
}
