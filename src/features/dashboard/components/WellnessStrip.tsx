/**
 * WellnessStrip — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { Coffee, HeartPulse } from "lucide-react";
import { computeWellness } from "@/features/readiness/wellness";
import { useEffect, useMemo, useState } from "react";

export function WellnessStrip({ focusMin, plannedMin }: { focusMin: number; plannedMin: number }) {
  const signals = useMemo(() => computeWellness(focusMin, plannedMin), [focusMin, plannedMin]);
  const tones = {
    green:
      "text-green-600 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300",
    amber:
      "text-amber-600 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    blue: "text-blue-600 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
  } as const;
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <HeartPulse className="h-4 w-4 text-primary" /> Balance, not burnout
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {signals.map((s) => (
          <div key={s.id} className={`rounded-2xl border p-4 ${tones[s.tone]}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Coffee className="h-4 w-4" /> {s.title}
            </div>
            <p className="mt-2 text-xs opacity-90">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
