/**
 * DualLane — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { BookOpen, Rocket } from "lucide-react";
import type { DualLaneReadiness } from "@/features/dashboard/types";
import { LaneCard } from "./LaneCard";

export function DualLane({ dual }: { dual: DualLaneReadiness }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Rocket className="h-4 w-4 text-primary" /> Two lanes, one balanced plan
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LaneCard
          icon={<Rocket className="h-4 w-4 text-blue-600" />}
          title="JEE readiness"
          score={dual.jee.score}
          label={dual.jee.label}
          message={dual.jee.message}
          accent="from-blue-500/10 to-blue-500/5"
        />
        <LaneCard
          icon={<BookOpen className="h-4 w-4 text-emerald-600" />}
          title="Board readiness"
          score={dual.board.score}
          label={dual.board.label}
          message={dual.board.message}
          accent="from-emerald-500/10 to-emerald-500/5"
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{dual.split}</p>
    </section>
  );
}
