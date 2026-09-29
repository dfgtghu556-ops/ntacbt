import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bookmark, Clock3, Flame, Play, Search, Sparkles, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { LANG_LABEL, type Lang, useLang, setLang } from "@/lib/lang";
import { useAuthStore } from "@/features/auth/store";
import { NAV, SHELF } from "@/components/layout/nav";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { NotificationBell } from "@/components/layout/NotificationBell";

export const Route = createFileRoute("/app/_layout")({
  component: AppLayout,
});

function AppLayout() {
  const matches = useRouterState({ select: (s) => s.matches.map((m) => m.routeId) });
  const current = (matches[matches.length - 1] ?? "").replace(/\/$/, "");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const lang = useLang();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    // Global search across papers, chapters, topics, teachers, tests and notes.
    navigate({ to: "/app/search", search: { q } });
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
            placeholder="Search papers, chapters, topics, teachers, tests…"
            className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none"
            aria-label="Search NTACBT"
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
          <button
            type="button"
            onClick={() => {
              const order: Lang[] = ["hinglish", "en", "hi"];
              const next = order[(order.indexOf(lang) + 1) % order.length] as Lang;
              setLang(next);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            aria-label="Change language"
            title="Switch language (Hinglish / English / Hindi)"
          >
            <Sparkles className="h-3.5 w-3.5" /> {LANG_LABEL[lang]}
          </button>
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
          {!isAuthenticated ? (
            <Link
              to="/app/auth/login"
              className="hidden items-center gap-1.5 rounded-full border border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent sm:inline-flex"
            >
              <UserRound className="h-3.5 w-3.5" /> Sign in
            </Link>
          ) : null}
          <Link
            to="/app/profile"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-muted-foreground"
            aria-label="Profile"
          >
            <UserRound className="h-4 w-4" />
          </Link>
          <NotificationBell />
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
        {/* A10 — the install ask sits above the page, never over it. */}
        <InstallPrompt />
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div
          className="mx-auto grid max-w-5xl"
          style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}
        >
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
