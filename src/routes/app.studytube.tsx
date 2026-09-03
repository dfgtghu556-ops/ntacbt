import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Play, Search, Video } from "lucide-react";
import { DataStore } from "@/lib/store";
import { computeReadiness } from "@/features/readiness/readiness";
import { getLegacyTeachers } from "@/data/sot/legacy-inline";
import { discover } from "@/features/studytube/service";
import type {
  StudyTubeRequest,
  StudyTubeResult,
  StudyTubeSection,
  StudyTubeVideo,
} from "@/features/studytube/types";
import { VideoCard, EmptyState } from "@/features/studytube/components/VideoCard";

export const Route = createFileRoute("/app/studytube")({
  component: StudyTube,
});

interface SectionState {
  loading: boolean;
  result: StudyTubeResult | null;
}

function sectionForWeak(
  weak: { subject: string; chapter: string; topic: string } | undefined,
  target: StudyTubeRequest["target"],
  language: StudyTubeRequest["language"],
  teacher?: string,
  today?: { subject: string; chapter: string; topic?: string },
): StudyTubeSection[] {
  const sections: StudyTubeSection[] = [];
  const weakSubject = (weak?.subject as StudyTubeRequest["subject"]) || "Physics";
  if (weak) {
    sections.push({
      id: "weak",
      title: "Weak topic",
      subtitle: `${weak.subject} — ${weak.chapter}`,
      request: {
        topic: weak.topic ? `${weak.chapter} ${weak.topic}` : weak.chapter,
        subject: weakSubject,
        language,
        kind: "learn",
        depth: "lecture",
        target,
        teacher,
      },
    });
  }
  if (today) {
    sections.push({
      id: "today",
      title: "Today's recommended lecture",
      subtitle: `${today.subject} — ${today.chapter} (from your plan)`,
      request: {
        topic: today.topic ? `${today.chapter} ${today.topic}` : today.chapter,
        subject: today.subject as StudyTubeRequest["subject"],
        language,
        kind: "learn",
        depth: "lecture",
        target,
        teacher,
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
    },
  });
  return sections;
}

const LEGACY_TEACHERS = getLegacyTeachers();

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
  if (!t) return true; // unknown teacher: keep, don't silently destroy user choice
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
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
        active ? "bg-primary text-primary-foreground" : "border border-input text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StudyTube() {
  const [target, setTarget] = useState<StudyTubeRequest["target"]>("jeemain");
  const [language, setLanguage] = useState<StudyTubeRequest["language"]>("hinglish");
  const [teacher, setTeacher] = useState<string | undefined>(undefined);
  const [weak, setWeak] = useState<
    { subject: string; chapter: string; topic: string } | undefined
  >();
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState<StudyTubeResult | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [sections, setSections] = useState<SectionState[]>([]);
  const [activeTab, setActiveTab] = useState("weak");
  const [todayTopic, setTodayTopic] = useState<{
    subject: string;
    chapter: string;
    topic?: string;
  }>();
  const navigate = useNavigate();

  function changeTarget(t: StudyTubeRequest["target"]) {
    setTarget(t);
    setTeacher((prev) => (teacherSupportsTarget(prev, t) ? prev : undefined));
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
  }, []);

  useEffect(() => {
    const sections = sectionForWeak(weak, target, language, teacher, todayTopic);
    const initial = sections.map(() => ({ loading: true, result: null }));
    setSections(initial);
    sections.forEach((section, i) => {
      discover(section.request).then((result) => {
        setSections((prev) => prev.map((s, j) => (j === i ? { loading: false, result } : s)));
      });
    });
  }, [weak, target, language, teacher, todayTopic]);

  async function search() {
    const topic = query.trim();
    if (!topic) return;
    const req: StudyTubeRequest = {
      topic,
      subject: (weak?.subject as StudyTubeRequest["subject"]) || "Physics",
      language,
      kind: "learn",
      depth: "lecture",
      target,
      teacher,
    };
    setManualLoading(true);
    const result = await discover(req);
    setManual(result);
    setManualLoading(false);
  }

  function openTheater(v: StudyTubeVideo) {
    navigate({
      to: "/app/studytube/$video",
      params: { video: v.id },
      search: {
        title: v.title,
        subject: (weak?.subject as string) || v.subject || "",
        topic: v.topic || weak?.chapter || "",
        teacher: v.teacher || teacher || "",
        channel: v.channel,
      },
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">StudyTube</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Study-first discovery. Every recommendation explains why it suits you.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {(["jeemain", "jeeadv", "board12", "cbse27"] as const).map((t) => (
          <Chip key={t} active={target === t} onClick={() => changeTarget(t)}>
            {t === "jeemain"
              ? "JEE Main"
              : t === "jeeadv"
                ? "JEE Advanced"
                : t === "board12"
                  ? "CBSE 12"
                  : "CBSE 12 (27)"}
          </Chip>
        ))}
        {(["hinglish", "en", "hi"] as const).map((l) => (
          <Chip key={l} active={language === l} onClick={() => setLanguage(l)}>
            {l === "hinglish" ? "Hinglish" : l === "en" ? "English" : "Hindi"}
          </Chip>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Target: {targetLabel(target)} · Teacher:{" "}
        {teacher
          ? LEGACY_TEACHERS.find((t) => t.id === teacher)?.name || "Selected"
          : "Auto (best match for this target)"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="pref-teacher">
          Preferred teacher
        </label>
        <select
          id="pref-teacher"
          value={teacher ?? ""}
          onChange={(e) => setTeacher(e.target.value || undefined)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none"
        >
          <option value="">Auto (best match)</option>
          {LEGACY_TEACHERS.filter(
            (t) =>
              t.subject === ((weak?.subject as StudyTubeRequest["subject"]) || "Physics") &&
              teacherSupportsTarget(t.id, target),
          ).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.channelName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search an academic topic, e.g. Ray Optics Boards"
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={search}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          {manualLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Search
        </button>
      </div>

      {(() => {
        const defs = sectionForWeak(weak, target, language, teacher, todayTopic);
        const eff = defs.some((d) => d.id === activeTab) ? activeTab : defs[0]?.id;
        const tabs = defs.map((d) => ({ id: d.id, label: d.title }));
        const hasSearch = Boolean(manual);
        return (
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <Chip key={t.id} active={eff === t.id} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </Chip>
            ))}
            {hasSearch ? (
              <Chip active={activeTab === "search"} onClick={() => setActiveTab("search")}>
                Search results
              </Chip>
            ) : null}
          </div>
        );
      })()}

      {activeTab === "search" && manual ? (
        <Section
          title={`Search: ${query}`}
          subtitle="Search result"
          loading={manualLoading}
          items={manual.items}
          error={manual.error}
          onPlay={openTheater}
        />
      ) : null}

      {(() => {
        const defs = sectionForWeak(weak, target, language, teacher, todayTopic);
        const eff = defs.some((d) => d.id === activeTab) ? activeTab : defs[0]?.id;
        return (
          <>
            {sections
              .map((s, i) => ({ s, sec: defs[i] as StudyTubeSection | undefined }))
              .filter((x) => x.sec?.id === eff)
              .map(({ s, sec }) => (
                <Section
                  key={sec?.id}
                  title={sec?.title ?? "Recommended"}
                  subtitle={sec?.subtitle ?? ""}
                  loading={s.loading}
                  items={s.result?.items ?? []}
                  error={s.result?.error}
                  onPlay={openTheater}
                />
              ))}
          </>
        );
      })()}
    </div>
  );
}

function Section({
  title,
  subtitle,
  loading,
  items,
  error,
  onPlay,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  items: StudyTubeVideo[];
  error?: string | undefined;
  onPlay: (v: StudyTubeVideo) => void;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Video className="h-4 w-4 text-muted-foreground" /> {title}
        </h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 6).map((v) => (
            <VideoCard key={v.id} video={v} onPlay={onPlay} />
          ))}
        </div>
      ) : (
        <EmptyState message={error ?? "No verified recommendations found right now."} />
      )}
    </section>
  );
}
