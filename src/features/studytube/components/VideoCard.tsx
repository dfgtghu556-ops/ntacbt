import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Flame,
  Play,
  Search,
  Video,
} from "lucide-react";
import type { StudyTubeVideo } from "../types";

function fmtDuration(sec: number, estimated?: boolean): string {
  if (!sec) return "—";
  const s = sec % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const base = h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
  // Estimated lengths (search-picks / offline picks) are labelled, never
  // presented as a measured video duration.
  return estimated ? `~${base}` : base;
}

const REAL_ID = /^[A-Za-z0-9_-]{11}$/;

const SUBJECT_GRADIENT: Record<string, string> = {
  Physics: "from-sky-500 via-blue-600 to-indigo-800",
  Chemistry: "from-emerald-500 via-teal-600 to-cyan-800",
  Mathematics: "from-violet-500 via-purple-600 to-indigo-900",
};

const SUBJECT_TEXT: Record<string, string> = {
  Physics: "text-sky-600 bg-sky-500/10",
  Chemistry: "text-emerald-600 bg-emerald-500/10",
  Mathematics: "text-violet-600 bg-violet-500/10",
};

function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function Thumb({ video }: { video: StudyTubeVideo }) {
  const real = REAL_ID.test(video.id || "");
  const thumb = real ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : "";
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-black/5">
      {real ? (
        <img
          src={thumb}
          alt={video.title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.06]"
        />
      ) : (
        <div
          className={`flex h-full w-full flex-col justify-end bg-gradient-to-br ${SUBJECT_GRADIENT[video.subject || "Physics"]} p-3`}
        >
          <Video className="mb-auto h-6 w-6 text-white/85" />
          <span className="line-clamp-2 text-sm font-semibold text-white drop-shadow">
            {video.topic || video.title}
          </span>
        </div>
      )}
      {video.durationSec ? (
        <span
          className="absolute right-2 bottom-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur"
          title={video.durationEstimated ? "Estimated length" : "Video length"}
        >
          {fmtDuration(video.durationSec, video.durationEstimated)}
        </span>
      ) : null}
      {/* Play overlay on hover */}
      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
          <Play className="h-5 w-5 fill-current" />
        </span>
      </span>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export function VideoCard({
  video,
  onPlay,
  onToggleWatchLater,
  onComplete,
  watchLater,
  watched,
}: {
  video: StudyTubeVideo;
  onPlay?: (v: StudyTubeVideo) => void;
  onToggleWatchLater?: (v: StudyTubeVideo) => void;
  onComplete?: (v: StudyTubeVideo) => void;
  watchLater?: boolean;
  watched?: boolean;
}) {
  const hue = avatarHue(video.channel || video.teacher || "StudyTube");
  const external = video.externalUrl;

  return (
    <article className="group flex h-full w-full flex-col rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
      <button type="button" onClick={() => onPlay?.(video)} className="block w-full text-left">
        <Thumb video={video} />
      </button>

      <div className="mt-2.5 flex flex-1 flex-col">
        <div className="flex gap-2.5">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: `hsl(${hue} 55% 42%)` }}
          >
            {initials(video.channel || video.teacher || "ST")}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
              {video.title}
            </h3>
            <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
              {video.channel || video.teacher || "StudyTube"}
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${SUBJECT_TEXT[video.subject || "Physics"]}`}
          >
            {video.subject || "Physics"}
          </span>
          {video.depth ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {video.depth === "oneshot"
                ? "One-shot"
                : video.depth === "detailed"
                  ? "Detailed"
                  : video.kind === "revision"
                    ? "Revision"
                    : video.kind === "practice"
                      ? "Practice"
                      : video.kind === "advanced"
                        ? "Advanced"
                        : "Lecture"}
            </span>
          ) : null}
        </div>

        {video.topic ? (
          <p className="mt-1.5 truncate text-xs text-muted-foreground"> {video.topic}</p>
        ) : null}
      </div>

      {video.why ? (
        <p className="mt-2 line-clamp-2 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
           {video.why}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
        <button
          type="button"
          onClick={() => onPlay?.(video)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            external
              ? "bg-accent text-accent-foreground hover:bg-accent/80"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {external ? <Search className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {external ? "Find on YouTube" : "Watch"}
        </button>
        {onToggleWatchLater ? (
          <button
            type="button"
            onClick={() => onToggleWatchLater(video)}
            title={watchLater ? "Remove from watch later" : "Save for later"}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              watchLater
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
            }`}
          >
            <Clock3 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onComplete ? (
          <button
            type="button"
            onClick={() => onComplete(video)}
            title={watched ? "Completed" : "Mark as done"}
            className={`inline-flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors ${
              watched
                ? "border-green-500 bg-green-500/10 text-green-600"
                : "border-border text-muted-foreground hover:border-green-500 hover:text-green-600"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {watched ? "Done" : ""}
          </button>
        ) : null}
        {external ? (
          <a
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in YouTube"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function ChannelCard({
  name,
  channelName,
  institute,
  specialization,
  onOpen,
}: {
  name: string;
  channelName?: string | undefined;
  institute?: string | undefined;
  specialization?: string | undefined;
  onOpen: () => void;
}) {
  const hue = avatarHue(name);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-44 shrink-0 flex-col items-center rounded-2xl border border-border/70 bg-card p-3.5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm"
        style={{ backgroundColor: `hsl(${hue} 55% 42%)` }}
      >
        {initials(name)}
      </span>
      <span className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{name}</span>
      {channelName ? (
        <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{channelName}</span>
      ) : null}
      {specialization ? (
        <span className="mt-1.5 line-clamp-2 rounded-lg bg-muted/50 px-2 py-1 text-[10.5px] text-muted-foreground">
          {specialization}
        </span>
      ) : null}
    </button>
  );
}

export function EmptyState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Search className="h-7 w-7" />
      </span>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Helper so the flame icon can be re-used: keeps tree-shaking honest. */
export function WeakIcon() {
  return <Flame className="h-4 w-4" />;
}
