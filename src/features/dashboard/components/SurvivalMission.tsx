/**
 * SurvivalMission — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { Play } from "lucide-react";
import type { ReadinessSnapshot, SurvivalScore } from "@/features/dashboard/types";
import { Link } from "@tanstack/react-router";
import { SurvivalScoreRing } from "./SurvivalScoreRing";
import { useLang, t } from "@/lib/lang";

export function SurvivalMission({
  score,
  status,
  headline,
  nextAction,
  basis,
  components,
  mission,
  missionIsTest,
  lang,
}: {
  score: number;
  status: string;
  headline: string;
  nextAction: string;
  basis: string;
  components: SurvivalScore["components"];
  mission: ReadinessSnapshot["nextMission"];
  missionIsTest: boolean;
  lang: string;
}) {
  return (
    <div className="relative z-10 mt-6 grid gap-4 rounded-2xl border bg-primary p-5 text-primary-foreground lg:grid-cols-[auto_1fr]">
      <div className="flex items-center justify-center lg:items-start">
        <div className="rounded-2xl bg-primary-foreground/95 p-3">
          <SurvivalScoreRing score={score} status={status} />
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
          {t("onTrack", lang as "hinglish")}
        </div>
        <h2 className="mt-1 text-xl font-semibold">{headline}</h2>

        {/* The single executable next action */}
        <div className="mt-3 rounded-xl bg-primary-foreground/10 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
            {t("doThisNext", lang as "hinglish")}
          </div>
          <p className="mt-1 text-sm font-medium">{nextAction}</p>
        </div>

        {mission ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-primary-foreground/10 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                {t("nextMission", lang as "hinglish")}
              </div>
              <div className="text-sm font-semibold">{mission.title}</div>
              <div className="text-xs opacity-90">
                {mission.minutes} min · {mission.kind}
                {mission.subject || mission.chapter
                  ? ` · ${mission.subject || ""} ${mission.chapter || ""}`.trim()
                  : ""}
              </div>
            </div>
            {missionIsTest ? (
              <Link
                to="/cbt"
                search={{
                  name:
                    `${mission.subject || ""} ${mission.chapter || ""}`.trim() ||
                    "Quick mixed diagnostic drill",
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary"
              >
                <Play className="h-4 w-4" /> Start mission
              </Link>
            ) : (
              <Link
                to="/app/studytube"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary"
              >
                <Play className="h-4 w-4" /> Start mission
              </Link>
            )}
          </div>
        ) : null}

        {/* Survscore components — explainable, honest */}
        <div className="mt-3 grid gap-1.5">
          {components.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <span className="w-32 shrink-0 opacity-90">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-foreground/15">
                <div
                  className="h-full rounded-full bg-primary-foreground/80"
                  style={{ width: `${c.rating}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-semibold">{c.rating}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] opacity-70">{basis}</p>
      </div>
    </div>
  );
}
