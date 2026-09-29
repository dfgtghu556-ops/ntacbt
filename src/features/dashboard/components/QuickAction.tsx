/**
 * QuickAction — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { ArrowRight, Play } from "lucide-react";

export function QuickAction({
  href,
  icon: Icon,
  title,
  sub,
  accent,
}: {
  href: string;
  icon: typeof Play;
  title: string;
  sub: string;
  accent: string;
}) {
  return (
    <a
      href={href}
      className={`group rounded-2xl border bg-gradient-to-br ${accent} p-4 transition-all hover:-translate-y-0.5 hover:shadow-md`}
    >
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      <ArrowRight className="mt-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </a>
  );
}
