import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  FileText,
  LayoutDashboard,
  MonitorPlay,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/app/_layout")({
  component: AppLayout,
});

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/app", label: "Home", icon: LayoutDashboard },
  { to: "/app/planner", label: "Planner", icon: CalendarDays },
  { to: "/app/studytube", label: "Study", icon: MonitorPlay },
  { to: "/app/pyq", label: "PYQ", icon: FileText },
  { to: "/app/analytics", label: "Stats", icon: BarChart3 },
];

function AppLayout() {
  const matches = useRouterState({ select: (s) => s.matches.map((m) => m.routeId) });
  const current = (matches[matches.length - 1] ?? "").replace(/\/$/, "");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
        <Link to="/app" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            N
          </span>
          <span className="hidden sm:inline">NTACBT</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/app/saarthi"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" /> Saarthi
          </Link>
          <a
            href="/jee-cbt.html"
            className="inline-flex items-center rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground"
          >
            Full platform
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-5">
          {NAV.map((item) => {
            const active = current === item.to || current.startsWith(`${item.to}.`);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
