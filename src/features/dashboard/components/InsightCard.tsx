/**
 * InsightCard — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { CheckCircle2 } from "lucide-react";

export function InsightCard({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: typeof CheckCircle2;
  tone: "green" | "amber" | "blue";
  title: string;
  body: string;
}) {
  const toneCls =
    tone === "green" ? "text-green-600" : tone === "amber" ? "text-amber-500" : "text-blue-600";
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className={`flex items-center gap-2 text-xs font-semibold ${toneCls}`}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
