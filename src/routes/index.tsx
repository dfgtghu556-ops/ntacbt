import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  FileText,
  Flame,
  LineChart,
  MonitorPlay,
  Play,
  Sparkles,
  Target,
  TestTube2,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NTACBT | JEE & CBSE Learning OS" },
      {
        name: "description",
        content:
          "Adaptive JEE Main & CBSE learning OS: StudyTube, AI planner, PYQ practice, NTA-style CBT, analytics, focus and AI tutoring — all in one place.",
      },
      {
        property: "og:title",
        content: "NTACBT | JEE & CBSE Learning OS",
      },
      {
        property: "og:description",
        content:
          "Adaptive JEE Main & CBSE learning OS: StudyTube, AI planner, PYQ practice, NTA-style CBT, analytics, focus and AI tutoring — all in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      {/* ─── Top nav ─── */}
      <header className="sticky top-0 z-30 border-b bg-background/90 px-4 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-600 text-sm font-bold text-white">
              N
            </span>
            <span className="text-lg">NTACBT</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            <Link
              to="/app/studytube"
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              StudyTube
            </Link>
            <Link
              to="/app/planner"
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Planner
            </Link>
            <Link
              to="/app/pyq"
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              PYQ
            </Link>
            <Link
              to="/cbt"
              search={{ name: "Quick mixed diagnostic drill" }}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Practice Test
            </Link>
          </nav>
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Sparkles className="h-4 w-4" /> Open app
          </Link>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-blue-50 via-background to-violet-50 px-4 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <Zap className="h-3.5 w-3.5" /> Adaptive · Zero-distraction · Exam-first
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Apni JEE &amp; Boards prep,{" "}
              <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                ek hi OS
              </span>{" "}
              me.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
              StudyTube (YouTube-style study hub), AI planner, PYQ library, NTA-style CBT,
              analytics, focus tracking and Saarthi AI tutor — pura prep ek clean dashboard se. No
              games, no rabbit holes, no guesswork.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                <Play className="h-4 w-4" /> Start learning
              </Link>
              <Link
                to="/cbt"
                search={{ name: "Quick mixed diagnostic drill" }}
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-5 py-3 text-sm font-semibold"
              >
                <TestTube2 className="h-4 w-4" /> Take a diagnostic
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Official-style PYQs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> NTA marking (+4/−1, no neg on
                numerical)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Explainable AI
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-primary/20 via-transparent to-violet-500/20 blur-2xl" />
            <div className="relative rounded-3xl border bg-card p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Mission Control</div>
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                  Ready
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <MiniStat icon={Flame} label="Streak" value="2d" />
                <MiniStat icon={Target} label="Accuracy" value="72%" />
                <MiniStat icon={FileText} label="Attempts" value="18" />
              </div>
              <div className="mt-4 rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Today's plan</span>
                  <span className="font-semibold text-foreground">60%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[60%] bg-gradient-to-r from-primary to-blue-600" />
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-primary p-4 text-primary-foreground">
                <div className="text-[11px] uppercase tracking-wide opacity-80">Next mission</div>
                <div className="mt-1 font-semibold">Rotational Motion — One-shot + 10 PYQs</div>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium">
                  <Play className="h-3.5 w-3.5" /> Continue
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Tool strip ─── */}
      <section className="border-b bg-background px-4 py-10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 md:grid-cols-4">
          <FeatureMini
            icon={MonitorPlay}
            title="StudyTube"
            text="YouTube-style study hub with Dream Team/Teacher picks."
          />
          <FeatureMini
            icon={CalendarDays}
            title="AI Planner"
            text="Daily plan that adapts to your real hours & weakness."
          />
          <FeatureMini
            icon={FileText}
            title="PYQ Library"
            text="Full historical papers with exact NTA keys."
          />
          <FeatureMini
            icon={BarChart3}
            title="Analytics"
            text="Accuracy, mistake DNA, focus and leaderboard-style progress."
          />
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              Why NTACBT
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Sab kuch ek jagah. Har cheez ek wajah ke saath.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Har recommendation explain karta hai <em>kyunki</em>. Isliye tum sirf time pass nahi
              karte — tum apne weak spots ko scientifically fix karte ho.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={MonitorPlay}
              title="StudyTube — YouTube-style"
              text="Home feed, shelves, channel cards, watch later aur Dream Teacher picks. Zero distraction shorts, sirf syllabus-aligned study."
              to="/app/studytube"
              cta="Open StudyTube"
            />
            <FeatureCard
              icon={Brain}
              title="AI Adaptive Planner"
              text="Tumhara daily budget, weak chapters aur exam date mila kar realistic plan banata hai. Tight timeline → one-shots + high-weightage first."
              to="/app/planner"
              cta="Build my plan"
            />
            <FeatureCard
              icon={FileText}
              title="PYQ Practice + CBT"
              text="Official-style previous-year papers full-length NTA interface me solve karo. Result feed Mistake Doctor aur readiness model."
              to="/app/pyq"
              cta="Open PYQ library"
            />
            <FeatureCard
              icon={LineChart}
              title="Analytics & Mistake DNA"
              text="Accuracy, topic breakdown, time×accuracy aur recurring mistakes — pata chalta hai exactly kya galat hai aur kya karna hai."
              to="/app/analytics"
              cta="See analytics"
            />
            <FeatureCard
              icon={Flame}
              title="Focus + Streak"
              text="Real focus tracker ka use karo. Screen-time guilt nahi — genuinely focused days ki streak banta hai."
              to="/app/focus"
              cta="Open focus timer"
            />
            <FeatureCard
              icon={Sparkles}
              title="Saarthi AI Tutor"
              text="Hint-first guidance jo tumhara target, progress aur weak topics pehle se jaanta hai. Answers nahi — thinking dikhata hai."
              to="/app/saarthi"
              cta="Ask Saarthi"
            />
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="border-t bg-muted/30 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              How it works
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">3 steps. Phir routine.</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Step
              n="1"
              icon={Target}
              title="Diagnose"
              text="Quick diagnostic ya pehle ka data — weak chapters aur accuracy ka base ban jata hai."
            />
            <Step
              n="2"
              icon={CalendarDays}
              title="Plan"
              text="AI planner tumhare daily hours ke hisaab se real plan banata hai. Fantasy schedule nahi."
            />
            <Step
              n="3"
              icon={Sparkles}
              title="Practice & improve"
              text="StudyTube + PYQs + CBT, phir analytics se agla step automatically adjust hota hai."
            />
          </div>
          <div className="mt-12 text-center">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
            >
              Start today <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 font-semibold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" /> NTACBT — JEE &amp; CBSE Learning OS
          </span>
          <span>Made for serious aspirants.</span>
          <a href="/jee-cbt.html" className="hover:text-foreground">
            Legacy full platform
          </a>
        </div>
      </footer>
    </main>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-primary" />
      <div className="mt-1 text-lg font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function FeatureMini({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof MonitorPlay;
  title: string;
  text: string;
}) {
  return (
    <div>
      <Icon className="h-6 w-6 text-primary" />
      <div className="mt-2 font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  text,
  to,
  cta,
}: {
  icon: typeof MonitorPlay;
  title: string;
  text: string;
  to: string;
  cta: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
        {cta}{" "}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  text,
}: {
  n: string;
  icon: typeof Target;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <div className="mt-4 flex items-center gap-2 font-semibold">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
