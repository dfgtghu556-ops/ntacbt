/**
 * RankPredictor — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { BarChart3, Info } from "lucide-react";
import type { RankPrediction } from "@/features/dashboard/types";

export function RankPredictor({ prediction }: { prediction: RankPrediction }) {
  const p = prediction;
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <BarChart3 className="h-4 w-4 text-primary" /> Mock to reality — where this score lands
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4">
          <div className="text-xs font-medium text-muted-foreground">Percentile</div>
          <div className="mt-1 text-3xl font-bold">{p.percentile}%</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {p.marks}/{p.maxMarks} marks
            {p.evidence.percentileVerified ? " · verified table" : " · provisional"}
          </div>
        </div>
        {p.reliable ? (
          <>
            <div className="rounded-2xl border bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
              <div className="text-xs font-medium text-muted-foreground">Estimated rank (AIR)</div>
              <div className="mt-1 text-3xl font-bold">~{p.rank.toLocaleString("en-IN")}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                JEE Main, ~14 lakh candidates · an estimate
              </div>
            </div>
            <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 md:col-span-2">
              <div className="text-xs font-medium text-muted-foreground">Where you land</div>
              <div className="mt-1 text-sm font-semibold">{p.tier}</div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-4 md:col-span-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Info className="h-3.5 w-3.5" /> Not enough data to estimate reliably
            </div>
            <p className="mt-2 text-sm">{p.fallback}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Confidence: {p.confidence}. The percentile above is from a verified table; the rank
              and band are withheld rather than guessed.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Honest expectation
          </div>
          <p className="mt-1 text-sm">{p.expectation}</p>
        </div>
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            The one thing to fix
          </div>
          <p className="mt-1 text-sm">{p.topFix}</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">{p.basis}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href={p.evidence.percentileSource.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Percentile source
        </a>
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href={p.evidence.rankSource.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Candidate-count source
        </a>
        <span>
          {p.evidence.attempts} attempt{p.evidence.attempts === 1 ? "" : "s"} behind this figure
        </span>
      </div>
    </section>
  );
}
