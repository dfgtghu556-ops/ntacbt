import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileQuestion,
  FlaskConical,
  LineChart,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import {
  loadStudyTubeProgress,
  markWatched,
  saveHandshake,
  setNote,
  toggleWatchLater,
  type MasteryState,
} from "@/features/studytube/progress";

export const Route = createFileRoute("/app/studytube/$video")({
  validateSearch: (search: Record<string, unknown>): TheaterSearch => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    const out: TheaterSearch = {};
    const title = str(search["title"]);
    const subject = str(search["subject"]);
    const topic = str(search["topic"]);
    const teacher = str(search["teacher"]);
    const channel = str(search["channel"]);
    if (title) out.title = title;
    if (subject) out.subject = subject;
    if (topic) out.topic = topic;
    if (teacher) out.teacher = teacher;
    if (channel) out.channel = channel;
    return out;
  },
  component: StudyTheater,
});

interface TheaterSearch {
  title?: string;
  subject?: string;
  topic?: string;
  teacher?: string;
  channel?: string;
}

function StudyTheater() {
  const { video } = Route.useParams();
  const search = useSearch({ from: Route.id }) as TheaterSearch;
  const title = search.title || "Video lesson";
  const duration = search.topic ? undefined : undefined;
  void duration;

  const [tab, setTab] = useState("notes");
  const [note, setNoteText] = useState("");
  const [recall, setRecall] = useState<number | null>(null);
  const [practice, setPractice] = useState<number | null>(null);
  const [mastery, setMastery] = useState<MasteryState>("Learning");
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const store = loadStudyTubeProgress();
    const w = store.watched[video];
    setFinished(!!w?.finished);
    setNoteText(store.notes[video]?.text ?? "");
    const h = store.handshakes[video];
    if (h) {
      setRecall(h.recall);
      setPractice(h.practice);
      setMastery(h.mastery);
    }
  }, [video]);

  function completeHandshake() {
    markWatched(video, title, true);
    saveHandshake(video, { recall, practice, mastery });
    setFinished(true);
    setSaved(true);
  }

  function toggleNote() {
    setNote(video, note);
  }

  const tabs = useMemo(
    () => [
      { id: "notes", label: "Notes", icon: NotebookPen },
      { id: "chapter", label: "Chapter", icon: BookOpen },
      { id: "formulae", label: "Formulae", icon: FlaskConical },
      { id: "pyq", label: "PYQs", icon: FileQuestion },
      { id: "saarthi", label: "Saarthi", icon: Sparkles },
      { id: "progress", label: "Progress", icon: LineChart },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/app/studytube"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> StudyTube
        </Link>
        <button
          type="button"
          onClick={() => setSaved(toggleWatchLater(video))}
          className="ml-auto rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          {saved ? "✓ Watch later" : "Watch later"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border bg-black">
            <iframe
              className="aspect-video w-full"
              src={`https://www.youtube.com/embed/${video}?rel=0`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          <div>
            <h1 className="text-lg font-semibold leading-snug">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {search.channel || search.teacher || "Verified educator"} · {search.subject || ""} ·{" "}
              {search.topic || ""}
            </p>
          </div>

          <section className="rounded-xl border p-4">
            <h2 className="text-sm font-semibold">Watch → practice handshake</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Watching alone is not mastery. Complete this chain and the planner will revise at the
              right time.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="rounded-md border p-3">
                <span className="text-xs font-medium text-muted-foreground">1. Active recall</span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Self-score: how many of 5 key points can you recall now?
                </p>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={recall ?? ""}
                  onChange={(e) => setRecall(Number(e.target.value))}
                  className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="rounded-md border p-3">
                <span className="text-xs font-medium text-muted-foreground">
                  2. Targeted questions
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  How many PYQs on this topic did you solve correctly?
                </p>
                <input
                  type="number"
                  min={0}
                  max={25}
                  value={practice ?? ""}
                  onChange={(e) => setPractice(Number(e.target.value))}
                  className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="mt-3">
              <label className="text-xs font-medium text-muted-foreground">3. Mastery now</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["Learning", "Improving", "Strong", "Mastered"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMastery(m)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                      mastery === m
                        ? "bg-primary text-primary-foreground"
                        : "border border-input text-muted-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={completeHandshake}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              <CheckCircle2 className="h-4 w-4" /> Mark complete & schedule revision
            </button>
            {finished ? (
              <p className="mt-2 text-xs text-green-600">
                {saved
                  ? "Saved. Revision scheduled based on your mastery."
                  : "Step 3 set — complete this handshake to schedule revision."}
              </p>
            ) : null}
          </section>
        </div>

        <div className="rounded-xl border p-3">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                    tab === t.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              );
            })}
          </div>

          {tab === "notes" ? (
            <div className="mt-4 space-y-3">
              <textarea
                value={note}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your own active-recall notes here — in your own words."
                rows={10}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={toggleNote}
                className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                Save note
              </button>
            </div>
          ) : null}

          {tab === "chapter" ? (
            <div className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold">Chapter context</h3>
              <dl className="rounded-md border p-3 text-sm">
                <dt className="text-xs font-medium text-muted-foreground">Subject</dt>
                <dd>{search.subject || "—"}</dd>
                <dt className="mt-2 text-xs font-medium text-muted-foreground">Topic</dt>
                <dd>{search.topic || "—"}</dd>
                <dt className="mt-2 text-xs font-medium text-muted-foreground">Educator</dt>
                <dd>{search.teacher || search.channel || "—"}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                Syllabus match and per-topic provenance are resolved by the academic source-of-truth
                layer. Recommendations are explainable; a video is not treated as mastery.
              </p>
            </div>
          ) : null}

          {tab === "formulae" ? (
            <div className="mt-4 rounded-md border p-3 text-sm text-muted-foreground">
              <h3 className="mb-1 text-sm font-semibold text-foreground">Formulae</h3>
              The full curated formula sheet lives in the legacy platform{" "}
              <a href="/jee-cbt.html#formulas" className="text-primary underline">
                here
              </a>
              . Review at the start of revision, never instead of practice.
            </div>
          ) : null}

          {tab === "pyq" ? (
            <div className="mt-4 rounded-md border p-3 text-sm">
              <h3 className="text-sm font-semibold">Targeted PYQ practice</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Papers are in the PYQ browser. The handshake above records how many you solved so
                the planner and analytics can use it.
              </p>
              <Link
                to="/app/pyq"
                className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                Open PYQ browser
              </Link>
            </div>
          ) : null}

          {tab === "saarthi" ? (
            <div className="mt-4 rounded-md border p-3 text-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Saarthi
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Get hint-first guidance on this topic. It already knows your target, progress and
                weak topics.
              </p>
              <Link
                to="/app/saarthi"
                className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                Open Saarthi
              </Link>
            </div>
          ) : null}

          {tab === "progress" ? (
            <div className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold">Progress</h3>
              <dl className="rounded-md border p-3 text-sm">
                <dt className="text-xs font-medium text-muted-foreground">Finished</dt>
                <dd>{finished ? "Yes" : "No"}</dd>
                <dt className="mt-2 text-xs font-medium text-muted-foreground">Active recall</dt>
                <dd>{recall == null ? "—" : `${recall}/5`}</dd>
                <dt className="mt-2 text-xs font-medium text-muted-foreground">PYQs solved</dt>
                <dd>{practice == null ? "—" : practice}</dd>
                <dt className="mt-2 text-xs font-medium text-muted-foreground">Mastery</dt>
                <dd>{mastery}</dd>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
