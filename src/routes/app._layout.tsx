import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Bookmark,
  CalendarDays,
  Clock3,
  FileText,
  Flame,
  LayoutDashboard,
  MonitorPlay,
  Play,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/app/_layout")({
  component: AppLayout,
});

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/app", label: "Home", icon: LayoutDashboard },
  { to: "/app/planner", label: "Planner", icon: CalendarDays },
  { to: "/app/studytube", label: "StudyTube", icon: MonitorPlay },
  { to: "/app/pyq", label: "PYQ", icon: FileText },
  { to: "/app/analytics", label: "Stats", icon: BarChart3 },
];

const SHELF: Array<{
  to: string;
  label: string;
  icon: LucideIcon;
  search?: { q: string };
}> = [
  { to: "/app/studytube", label: "Home feed", icon: Play },
  { to: "/app/studytube", label: "One-shot", icon: Flame, search: { q: "one shot" } },
  { to: "/app/studytube", label: "Revision", icon: Clock3, search: { q: "revision" } },
  { to: "/app/pyq", label: "PYQ practice", icon: FileText },
];

function AppLayout() {
  const matches = useRouterState({ select: (s) => s.matches.map((m) => m.routeId) });
  const current = (matches[matches.length - 1] ?? "").replace(/\/$/, "");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    navigate({ to: "/app/studytube", search: q ? { q } : {} });
  }

  const onStudyTube = current.startsWith("/app/studytube");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
        <Link to="/app" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            <Play className="h-4 w-4" />
          </span>
          <span className="hidden text-sm sm:inline">NTACBT</span>
        </Link>

        <form
          onSubmit={submitSearch}
          className="mx-auto flex h-9 w-full max-w-xl items-center overflow-hidden rounded-full border border-input focus-within:ring-2 focus-within:ring-ring"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search StudyTube — topic, chapter, teacher…"
            className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none"
            aria-label="Search StudyTube"
          />
          <button
            type="submit"
            className="flex h-full items-center gap-1.5 border-l border-input bg-muted/50 px-3 text-xs text-muted-foreground hover:bg-accent"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
          </button>
        </form>

        <div className="flex items-center gap-1.5">
          <Link
            to="/app/saarthi"
            className="hidden items-center gap-1.5 rounded-full border border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5" /> Saarthi
          </Link>
          <a
            href="/jee-cbt.html"
            className="hidden items-center gap-1.5 rounded-full bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground md:inline-flex"
          >
            Full platform
          </a>
          <Link
            to="/app"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-muted-foreground"
            aria-label="Profile"
          >
            <UserRound className="h-4 w-4" />
          </Link>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </header>

      <aside className="fixed top-14 bottom-0 left-0 z-20 hidden w-52 flex-col gap-1 overflow-y-auto border-r bg-background px-2 py-3 lg:flex">
        <div className="grid gap-1">
          {SHELF.map((item) => {
            const Icon = item.icon;
            const active = item.to === "/app/studytube" && onStudyTube;
            return (
              <Link
                key={item.label}
                to={item.to}
                {...(item.search ? { search: item.search } : {})}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/80 hover:bg-accent/60"
                }`}
              >
                <Icon className="h-5 w-5" /> {item.label}
              </Link>
            );
          })}
          <div className="my-2 border-t" />
        </div>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Learning OS
        </div>
        <div className="grid gap-1">
          {NAV.map((item) => {
            const active = current === item.to || current.startsWith(`${item.to}.`);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/80 hover:bg-accent/60"
                }`}
              >
                <Icon className="h-5 w-5" /> {item.label}
              </Link>
            );
          })}
          <Link
            to="/app/focus"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/60"
          >
            <Clock3 className="h-5 w-5" /> Focus
          </Link>
          <Link
            to="/app/saarthi"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/60"
          >
            <Sparkles className="h-5 w-5" /> Saarthi
          </Link>
          <Link
            to="/app/studytube"
            search={{ q: "board exams" }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/60"
          >
            <Bookmark className="h-5 w-5" /> Boards
          </Link>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 pt-6 pb-24 sm:px-5 lg:pl-60">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
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
