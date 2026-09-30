import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, Play, Search, Sparkles, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { LANG_LABEL, type Lang, useLang, setLang } from "@/lib/lang";
import { useAuthStore } from "@/features/auth/store";
import { NAV } from "@/components/layout/nav";
import { NavPanel } from "@/components/layout/NavPanel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { OfflineBanner } from "@/features/pwa/OfflineBanner";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { hasCompletedOnboarding, loadStudyProfile } from "@/features/onboarding/profile";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const matches = useRouterState({ select: (s) => s.matches.map((m) => m.routeId) });
  const current = (matches[matches.length - 1] ?? "").replace(/\/$/, "");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // The mobile drawer. Closed on first render so SSR and the first client pass
  // agree — a drawer that flashes open after hydration looks like a bug.
  const [navOpen, setNavOpen] = useState(false);
  const lang = useLang();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    // Global search across papers, chapters, topics, teachers, tests and notes.
    navigate({ to: "/app/search", search: { q } });
  }

  const onStudyTube = current.startsWith("/app/studytube");

  // First-run wizard (B6). Read once on mount rather than in an effect so the
  // SSR pass and the first client render agree — a wizard that flashes open
  // after hydration looks like a bug, and a wizard that never opens is worse.
  const [needsOnboarding, setNeedsOnboarding] = useState(
    () => typeof window !== "undefined" && !hasCompletedOnboarding(),
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
        {/*
          Mobile nav trigger. The sidebar below is `hidden lg:flex`, so without
          this a phone had no way to reach Memory Locker, the syllabus map,
          Focus, Saarthi or the progress report — the bottom bar's six items
          were the entire navigation.
        */}
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-input text-muted-foreground hover:bg-accent lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>
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
        <NavPanel current={current} />
      </aside>

      {/*
        A skip link. Every page here starts with the header, then a fixed
        sidebar, then a bottom bar, so a keyboard user tabs through all of it
        before reaching the content they came for. One tab, on every page, and
        they are in the content instead.
      */}
      <a
        href="#ntacbt-main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      {/* A10 — offline state, stated rather than guessed at. Never blocks
          interaction: an attempt in progress keeps autosaving locally. */}
      <OfflineBanner />

      <main
        id="ntacbt-main"
        className="mx-auto w-full max-w-[1500px] flex-1 px-3 pt-6 pb-24 sm:px-5 lg:pl-60"
      >
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
      {/*
        Legal links in the persistent footer. AdSense approval requires a
        reachable privacy policy, and a policy a student cannot find is not a
        policy — so this sits on every screen rather than only the marketing
        routes. The exam runner is deliberately left without it: it is full-
        screen and noindex, and its head links are already occupied.
      */}
      <div className="border-t px-4 py-3 text-center text-[11px] text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/terms" className="hover:text-foreground">
          Terms
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/about" className="hover:text-foreground">
          About
        </Link>
      </div>
      {/*
        Mobile navigation drawer.
        Renders the same NavPanel as the desktop sidebar, so the two surfaces
        can never drift. It closes on navigation, because a drawer left open
        over the page you just asked for reads as broken.
      */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>NTACBT</SheetTitle>
            <SheetDescription>Everywhere in the app</SheetDescription>
          </SheetHeader>
          <div className="px-2 py-3">
            <NavPanel current={current} onNavigate={() => setNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {needsOnboarding ? (
        <OnboardingWizard
          onDone={() => setNeedsOnboarding(false)}
          startTo="/app/planner"
          startLabel="See my first session"
        />
      ) : null}
    </div>
  );
}
