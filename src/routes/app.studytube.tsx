import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock3, Flame, MonitorPlay, Play, Search, Target, TrendingUp } from "lucide-react";
import { DataStore } from "@/lib/store";
import { computeReadiness } from "@/features/readiness/readiness";
import { getLegacyTeachers, type LegacyTeacher } from "@/data/sot/legacy-inline";
import { INSTITUTES, findInstituteById } from "@/data/teachers";
import { discover } from "@/features/studytube/service";
import { dreamChannels, offlineCatalog } from "@/features/studytube/catalog";
import {
  loadStudyTubeProgress,
  markWatched,
  toggleWatchLater,
} from "@/features/studytube/progress";
import type {
  StudyTubeRequest,
  StudyTubeResult,
  StudyTubeSection,
  StudyTubeVideo,
} from "@/features/studytube/types";
import { VideoCard, ChannelCard, EmptyState } from "@/features/studytube/components/VideoCard";

export const Route = createFileRoute("/app/studytube")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search["q"] === "string" && search["q"].trim() ? search["q"] : undefined;
    return q ? { q } : {};
  },
  component: StudyTube,
});

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

interface ShelfState {
  loading: boolean;
  result: StudyTubeResult | null;
}

function sectionForWeak(
  weak: { subject: string; chapter: string; topic: string } | undefined,
  target: StudyTubeRequest["target"],
  language: StudyTubeRequest["language"],
  teacher?: string,
  institute?: string,
  today?: { subject: string; chapter: string; topic?: string },
): StudyTubeSection[] {
  const sections: StudyTubeSection[] = [];
  const weakSubject = (weak?.subject as StudyTubeRequest["subject"]) || "Physics";
  if (weak) {
    sections.push({
      id: "weak",
      title: "Weak topic — fix this first",
      subtitle: `${weak.subject} — ${weak.chapter}`,
      request: {
        topic: weak.topic ? `${weak.chapter} ${weak.topic}` : weak.chapter,
        subject: weakSubject,
        language,
        kind: "learn",
        depth: "lecture",
        target,
        teacher,
        institute,
      },
    });
  }
  if (today) {
    sections.push({
      id: "today",
      title: "Today's planned lecture",
      subtitle: `${today.subject} — ${today.chapter} (from your plan)`,
      request: {
        topic: today.topic ? `${today.chapter} ${today.topic}` : today.chapter,
        subject: today.subject as StudyTubeRequest["subject"],
        language,
        kind: "learn",
        depth: "lecture",
        target,
        teacher,
        institute,
      },
    });
  }
  sections.push({
    id: "revision",
    title: "Revision due",
    subtitle: "Spaced recall for recently learned topics",
    request: {
      topic: weak?.chapter ?? "Electrostatics",
      subject: weakSubject,
      language,
      kind: "revision",
      depth: "oneshot",
      target,
      teacher,
      institute,
    },
  });
  return sections;
}

const LEGACY_TEACHERS = getLegacyTeachers();

interface DreamTeamOption {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  subjects: StudyTubeRequest["subject"][];
}

const DREAM_TEAMS: DreamTeamOption[] = [
  ...INSTITUTES.map((i) => ({
    id: i.id,
    name: i.name,
    shortName: i.shortName,
    icon: i.id === "science-fun" ? "🧪" : "🏛️",
    subjects: ["Physics", "Chemistry", "Mathematics"],
  })),
].sort((a, b) => a.name.localeCompare(b.name));

function dreamTeamName(id: string | undefined): string {
  if (!id) return "Auto (best available)";
  return (
    DREAM_TEAMS.find((i) => i.id === id)?.name ?? findInstituteById(id)?.name ?? "Selected group"
  );
}

function teacherSupportsInstitute(
  teacherId: string | undefined,
  instituteId: string | undefined,
): boolean {
  if (!teacherId || !instituteId) return true;
  const t = LEGACY_TEACHERS.find((x) => x.id === teacherId);
  if (!t) return true;
  return t.instituteId === instituteId;
}

function subjectOf(weak: { subject: string } | undefined): StudyTubeRequest["subject"] {
  const s = weak?.subject;
  if (s === "Physics" || s === "Chemistry" || s === "Mathematics") return s;
  return "Physics";
}

function targetLabel(t: StudyTubeRequest["target"]): string {
  return t === "jeemain"
    ? "JEE Main"
    : t === "jeeadv"
      ? "JEE Advanced"
      : t === "board12"
        ? "CBSE 12"
        : "CBSE 12 (2026-27)";
}

function teacherSupportsTarget(
  teacherId: string | undefined,
  target: StudyTubeRequest["target"],
): boolean {
  if (!teacherId) return true;
  const t = LEGACY_TEACHERS.find((x) => x.id === teacherId);
  if (!t) return true;
  const arr = t.examTarget || [];
  if (target === "board12" || target === "cbse27")
    return arr.includes("board12") || arr.includes("cbse27");
  if (target === "board11") return arr.includes("board11");
  if (target === "jeeadv") return arr.includes("jeeadv");
  return arr.includes("jeemain");
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "border border-input text-muted-foreground hover:bg-accent/70"
      }`}
    >
      {children}
    </button>
  );
}

function StudyTube() {
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate();
  const [target, setTarget] = useState<StudyTubeRequest["target"]>("jeemain");
  const [language, setLanguage] = useState<StudyTubeRequest["language"]>("hinglish");
  const [teacher, setTeacher] = useState<string | undefined>(undefined);
  const [institute, setInstitute] = useState<string | undefined>(undefined);
  const [weak, setWeak] = useState<{ subject: string; chapter: string; topic: string }>();
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState<StudyTubeResult | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [sections, setSections] = useState<Record<string, ShelfState>>({});
  const [filter, setFilter] = useState("all");
  const [todayTopic, setTodayTopic] = useState<{
    subject: string;
    chapter: string;
    topic?: string;
  }>();
  const [watchLaterIds, setWatchLaterIds] = useState<string[]>([]);
  const [savedVideos, setSavedVideos] = useState<Record<string, StudyTubeVideo>>({});
  const [watchedIds, setWatchedIds] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);

  function changeTarget(t: StudyTubeRequest["target"]) {
    setTarget(t);
    setTeacher((prev) => (teacherSupportsTarget(prev, t) ? prev : undefined));
  }

  function changeInstitute(id: string | undefined) {
    setInstitute(id || undefined);
    setTeacher((prev) => (teacherSupportsInstitute(prev, id) ? prev : undefined));
  }

  function toggleTeacher(t: LegacyTeacher) {
    if (teacher === t.id) {
      setTeacher(undefined);
    } else {
      setTeacher(t.id);
      setInstitute(t.instituteId);
    }
  }

  useEffect(() => {
    const store = new DataStore();
    const planner = store.planner;
    const profile = planner?.profile;
    const loadedTarget = (profile?.target || "jeemain") as StudyTubeRequest["target"];
    if (profile?.target) setTarget(loadedTarget);
    if (profile?.language) setLanguage(profile.language as StudyTubeRequest["language"]);
    const profileTeachers = (profile as Record<string, unknown> | undefined)?.["teachers"] as
      Record<string, unknown> | undefined;
    const preferredPhysics = profileTeachers?.["Physics"];
    if (
      typeof preferredPhysics === "string" &&
      teacherSupportsTarget(preferredPhysics, loadedTarget)
    )
      setTeacher(preferredPhysics);
    const readiness = computeReadiness(store);
    if (readiness.weakTopics[0]) setWeak(readiness.weakTopics[0]);
    const first = store.todayTasks()[0];
    if (first?.subject && first?.chapter)
      setTodayTopic({ subject: first.subject, chapter: first.chapter, topic: first.topic });
    const progress = loadStudyTubeProgress();
    setWatchLaterIds(progress.watchLater);
    setWatchedIds(
      Object.fromEntries(Object.entries(progress.watched).map(([id, w]) => [id, !!w.finished])),
    );
  }, []);

  useEffect(() => {
    const defs = sectionForWeak(weak, target, language, teacher, institute, todayTopic);
    const initial: Record<string, ShelfState> = {};
    defs.forEach((d) => (initial[d.id] = { loading: true, result: null }));
    const manualKey = "search";
    if (search.q?.trim()) initial[manualKey] = { loading: manualLoading, result: manual };
    setSections(initial);
    defs.forEach((section) => {
      discover(section.request).then((result) => {
        setSections((prev) => ({ ...prev, [section.id]: { loading: false, result } }));
      });
    });
    if (search.q?.trim()) {
      setManualLoading(true);
      const req: StudyTubeRequest = {
        topic: search.q.trim(),
        subject: subjectOf(weak),
        language,
        kind: "learn",
        depth: "lecture",
        target,
        teacher,
        institute,
      };
      discover(req).then((result) => {
        setManual(result);
        setManualLoading(false);
        setSections((prev) => ({ ...prev, [manualKey]: { loading: false, result } }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weak, target, language, teacher, institute, todayTopic, search.q]);

  function openExternal(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openVideo(v: StudyTubeVideo) {
    if (v.externalUrl) {
      openExternal(v.externalUrl);
      return;
    }
    if (!YT_ID.test(v.id)) {
      const q = `${v.topic || v.title} ${v.channel || v.teacher || ""}`.trim();
      openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
      return;
    }
    navigate({
      to: "/app/studytube/$video",
      params: { video: v.id },
      search: {
        title: v.title,
        subject: v.subject || weak?.subject || "",
        topic: v.topic || weak?.chapter || "",
        teacher: v.teacher || teacher || "",
        channel: v.channel,
      },
    });
  }

  function saveVideo(v: StudyTubeVideo) {
    // Offline search picks are not real video ids — open the search instead of
    // persisting a synthetic id that would produce a broken iframe later.
    if (v.externalUrl && !YT_ID.test(v.id)) {
      openExternal(v.externalUrl);
      return;
    }
    const has = toggleWatchLater(v.id);
    setWatchLaterIds((prev) => (has ? [...prev, v.id] : prev.filter((x) => x !== v.id)));
    setSavedVideos((prev) => {
      const next = { ...prev };
      if (has) next[v.id] = v;
      else delete next[v.id];
      return next;
    });
  }

  function completeVideo(v: StudyTubeVideo) {
    if (!YT_ID.test(v.id)) {
      if (v.externalUrl) openExternal(v.externalUrl);
      return;
    }
    markWatched(v.id, v.title, true);
    setWatchedIds((prev) => ({ ...prev, [v.id]: true }));
  }

  const progress = useMemo(() => loadStudyTubeProgress(), []);
  const continueWatching = useMemo(() => {
    return Object.values(progress.watched)
      .filter((w) => !w.finished && YT_ID.test(w.videoId))
      .slice(0, 8)
      .map<StudyTubeVideo>((w) => ({
        id: w.videoId,
        title: w.title,
        channel: "",
        durationSec: 0,
        score: 0,
        why: "Continue watching — finish the watch → practice handshake.",
      }));
  }, [progress]);
  const saved = useMemo(
    () =>
      watchLaterIds
        .filter((id) => YT_ID.test(id))
        .map<StudyTubeVideo>(
          (id) =>
            savedVideos[id] ?? {
              id,
              title: "Watch later",
              channel: "",
              durationSec: 0,
              score: 0,
              why: "Saved for later.",
            },
        )
        .slice(0, 8),
    [watchLaterIds, savedVideos],
  );

  const currentSubject = subjectOf(weak);
  const dreamTeamOptions = DREAM_TEAMS.filter((i) =>
    LEGACY_TEACHERS.some(
      (t) =>
        t.instituteId === i.id &&
        t.subject === currentSubject &&
        teacherSupportsTarget(t.id, target),
    ),
  );
  const dreamTeachers = LEGACY_TEACHERS.filter(
    (t) =>
      t.subject === currentSubject &&
      teacherSupportsTarget(t.id, target) &&
      (!institute || t.instituteId === institute),
  );
  const channels = useMemo(
    () =>
      dreamChannels({
        topic: weak?.chapter || "Physics",
        subject: currentSubject,
        language,
        kind: "learn",
        depth: "lecture",
        target,
        teacher,
        institute,
      }),
    [weak?.chapter, currentSubject, language, target, teacher, institute],
  );

  const teacherShelf = useMemo(
    () =>
      offlineCatalog({
        topic: weak?.chapter || currentSubject,
        subject: currentSubject,
        language,
        kind: "learn",
        depth: "lecture",
        target,
        teacher,
        institute,
      }).slice(0, 6),
    [weak?.chapter, currentSubject, language, target, teacher, institute],
  );
  const oneshotShelf = useMemo(
    () =>
      offlineCatalog({
        topic: weak?.chapter || currentSubject,
        subject: currentSubject,
        language,
        kind: "revision",
        depth: "oneshot",
        target,
        teacher,
        institute,
      }).slice(0, 6),
    [weak?.chapter, currentSubject, language, target, teacher, institute],
  );

  function matches(v: StudyTubeVideo): boolean {
    if (filter === "all") return true;
    if (filter === "Physics" || filter === "Chemistry" || filter === "Mathematics")
      return v.subject === filter;
    if (filter === "oneshot") return v.depth === "oneshot" || v.kind === "revision";
    if (filter === "revision") return v.kind === "revision";
    return true;
  }

  function openSearchQuery(q: string) {
    navigate({ to: "/app/studytube", search: { q } });
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white">
            <Play className="h-4 w-4 fill-current" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">StudyTube</h1>
            <p className="text-xs text-muted-foreground">
              Study-first discovery · zero-distraction study hub
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <select
            value={institute ?? ""}
            onChange={(e) => changeInstitute(e.target.value || undefined)}
            className="rounded-full border border-input bg-background px-3 py-1.5 text-xs outline-none"
            aria-label="Dream Team"
          >
            <option value="">🏆 Dream Team: Auto</option>
            {dreamTeamOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.icon} {i.name}
              </option>
            ))}
          </select>
          <select
            value={teacher ?? ""}
            onChange={(e) => {
              const id = e.target.value || undefined;
              const t = LEGACY_TEACHERS.find((x) => x.id === id);
              if (t) toggleTeacher(t);
              else setTeacher(undefined);
            }}
            className="rounded-full border border-input bg-background px-3 py-1.5 text-xs outline-none"
            aria-label="Dream Teacher"
          >
            <option value="">🎯 Dream Teacher: Auto</option>
            {dreamTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.channelName}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {(["all", "Physics", "Chemistry", "Mathematics", "oneshot", "revision"] as const).map(
          (f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f === "all"
                ? "All"
                : f === "Physics"
                  ? "Physics"
                  : f === "Chemistry"
                    ? "Chemistry"
                    : f === "Mathematics"
                      ? "Maths"
                      : f === "oneshot"
                        ? "⚡ One-shots"
                        : "🔁 Revision"}
            </Chip>
          ),
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openSearchQuery(query)}
            placeholder="Search a topic, chapter or teacher — e.g. Ray Optics Boards"
            className="w-full rounded-lg border border-input bg-background py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => openSearchQuery(query)}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Search
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-input px-3 py-2 text-xs text-muted-foreground"
        >
          {open ? "Hide" : "Preferences"}
        </button>
      </div>

      {open ? (
        <section className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold">StudyTube preferences</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Target</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(["jeemain", "jeeadv", "board12", "cbse27"] as const).map((t) => (
                  <Chip key={t} active={target === t} onClick={() => changeTarget(t)}>
                    {t === "jeemain"
                      ? "JEE Main"
                      : t === "jeeadv"
                        ? "JEE Adv"
                        : t === "board12"
                          ? "CBSE 12"
                          : "CBSE 27"}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Language</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(["hinglish", "en", "hi"] as const).map((l) => (
                  <Chip key={l} active={language === l} onClick={() => setLanguage(l)}>
                    {l === "hinglish" ? "Hinglish" : l === "en" ? "English" : "Hindi"}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Dream Team · Dream Teacher
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {dreamTeamName(institute)} →{" "}
                {teacher
                  ? LEGACY_TEACHERS.find((t) => t.id === teacher)?.name || "Selected"
                  : "Auto best fit"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {channels.slice(0, 6).map((c) => (
              <ChannelCard
                key={c.id}
                name={c.name}
                channelName={c.channelName}
                institute={c.institute}
                specialization={c.specialization}
                onOpen={() => openSearchQuery(`${weak?.chapter || currentSubject} ${c.name}`)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {continueWatching.length ? (
        <Shelf
          title="Continue watching"
          subtitle="Finish what you started — the handshake turns watching into mastery."
          icon={Play}
          items={continueWatching.filter(matches)}
          loading={false}
          fallback={false}
          onPlay={openVideo}
          onSave={saveVideo}
          onDone={completeVideo}
          watchLaterIds={watchLaterIds}
          watchedIds={watchedIds}
        />
      ) : null}

      {sections["today"] ? (
        <Shelf
          title="Today's planned lecture"
          subtitle="From your planner"
          icon={MonitorPlay}
          items={(sections["today"].result?.items ?? []).filter(matches)}
          loading={sections["today"].loading}
          fallback={!!sections["today"].result?.fallback}
          onPlay={openVideo}
          onSave={saveVideo}
          onDone={completeVideo}
          watchLaterIds={watchLaterIds}
          watchedIds={watchedIds}
        />
      ) : null}

      <Shelf
        title="🎯 Dream Teacher picks"
        subtitle="Chosen faculty, lesson depth matched to your target."
        icon={Target}
        items={teacherShelf.filter(matches)}
        loading={false}
        fallback
        onPlay={openVideo}
        onSave={saveVideo}
        onDone={completeVideo}
        watchLaterIds={watchLaterIds}
        watchedIds={watchedIds}
      />

      {sections["weak"] ? (
        <Shelf
          title={weak ? "Weak topic — fix this first" : "Weak topic"}
          subtitle={weak ? `${weak.subject} — ${weak.chapter}` : "From your evidence"}
          icon={Flame}
          items={(sections["weak"].result?.items ?? []).filter(matches)}
          loading={sections["weak"].loading}
          fallback={!!sections["weak"].result?.fallback}
          onPlay={openVideo}
          onSave={saveVideo}
          onDone={completeVideo}
          watchLaterIds={watchLaterIds}
          watchedIds={watchedIds}
        />
      ) : null}

      <Shelf
        title="⚡ Quick one-shot revision"
        subtitle="Crash-mode, high-weightage revision that fits tight timelines."
        icon={TrendingUp}
        items={oneshotShelf.filter(matches)}
        loading={false}
        fallback
        onPlay={openVideo}
        onSave={saveVideo}
        onDone={completeVideo}
        watchLaterIds={watchLaterIds}
        watchedIds={watchedIds}
      />

      {sections["revision"] ? (
        <Shelf
          title="Revision due"
          subtitle="Spaced recall for recently learned topics"
          icon={Clock3}
          items={(sections["revision"].result?.items ?? []).filter(matches)}
          loading={sections["revision"].loading}
          fallback={!!sections["revision"].result?.fallback}
          onPlay={openVideo}
          onSave={saveVideo}
          onDone={completeVideo}
          watchLaterIds={watchLaterIds}
          watchedIds={watchedIds}
        />
      ) : null}

      {saved.length ? (
        <Shelf
          title="Watch later"
          subtitle="Saved to study when you have time."
          icon={Clock3}
          items={saved.filter(matches)}
          loading={false}
          fallback={false}
          onPlay={openVideo}
          onSave={saveVideo}
          onDone={completeVideo}
          watchLaterIds={watchLaterIds}
          watchedIds={watchedIds}
        />
      ) : null}

      {search.q || manual ? (
        <Shelf
          title={`Search: ${search.q || query || "results"}`}
          subtitle="Matched against your target, Dream Team and Dream Teacher."
          icon={Search}
          items={(manual?.items ?? []).filter(matches)}
          loading={manualLoading}
          fallback={!!manual?.fallback}
          onPlay={openVideo}
          onSave={saveVideo}
          onDone={completeVideo}
          watchLaterIds={watchLaterIds}
          watchedIds={watchedIds}
        />
      ) : null}
    </div>
  );
}

function Shelf({
  title,
  subtitle,
  icon: Icon,
  items,
  loading,
  fallback,
  onPlay,
  onSave,
  onDone,
  watchLaterIds,
  watchedIds,
}: {
  title: string;
  subtitle: string;
  icon: typeof Play;
  items: StudyTubeVideo[];
  loading: boolean;
  fallback: boolean;
  onPlay: (v: StudyTubeVideo) => void;
  onSave: (v: StudyTubeVideo) => void;
  onDone: (v: StudyTubeVideo) => void;
  watchLaterIds: string[];
  watchedIds: Record<string, boolean>;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" /> {title}
        </h2>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          {fallback && items.length ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
              offline picks
            </span>
          ) : null}
        </div>
      </div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onPlay={onPlay}
              onToggleWatchLater={onSave}
              onComplete={onDone}
              watchLater={watchLaterIds.includes(v.id)}
              watched={!!watchedIds[v.id]}
            />
          ))}
        </div>
      ) : (
        <EmptyState message="Nothing matches this filter — switch back to All or change the target." />
      )}
    </section>
  );
}
