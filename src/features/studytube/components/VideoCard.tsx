import { CheckCircle2, Clock3, ExternalLink, Play, Search, Video } from "lucide-react";
import type { StudyTubeVideo } from "../types";

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const s = sec % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

const REAL_ID = /^[A-Za-z0-9_-]{11}$/;

const SUBJECT_COLOR: Record<string, string> = {
  Physics: "from-sky-500/80 via-blue-600/80 to-indigo-800",
  Chemistry: "from-emerald-500/80 via-teal-600/80 to-cyan-800",
  Mathematics: "from-violet-500/80 via-purple-600/80 to-indigo-900",
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
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
      {real ? (
        <img
          src={thumb}
          alt={video.title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.03]"
        />
      ) : (
        <div
          className={`flex h-full w-full flex-col justify-end bg-gradient-to-br ${SUBJECT_COLOR[video.subject || "Physics"]} p-3`}
        >
          <Video className="mb-auto h-5 w-5 text-white/80" />
          <span className="line-clamp-2 text-sm font-semibold text-white">
            {video.topic || video.title}
          </span>
        </div>
      )}
      {video.durationSec ? (
        <div className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {fmtDuration(video.durationSec)}
        </div>
      ) : null}
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
    <article className="group w-full">
      <button type="button" onClick={() => onPlay?.(video)} className="block w-full text-left">
        <Thumb video={video} />
      </button>

      <div className="mt-2 flex gap-2">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: `hsl(${hue} 55% 42%)` }}
        >
          {initials(video.channel || video.teacher || "ST")}
        </span>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{video.title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {video.channel || video.teacher || "StudyTube"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {video.subject}
            {video.topic ? ` · ${video.topic}` : ""}
            {video.depth ? ` · ${video.depth === "oneshot" ? "One-shot" : video.depth}` : ""}
            {video.published ? ` · ${video.published}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPlay?.(video)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
              watchLater ? "border-primary text-primary" : "border-input text-muted-foreground"
            }`}
          >
            <Clock3 className="h-3.5 w-3.5" /> {watchLater ? "Saved" : "Save"}
          </button>
        ) : null}
        {onComplete ? (
          <button
            type="button"
            onClick={() => onComplete(video)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
              watched
                ? "border-green-500 text-green-600"
                : "border-input text-muted-foreground hover:border-green-500"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> {watched ? "Done" : "Mark done"}
          </button>
        ) : null}
        {external ? (
          <a
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-input px-3 py-1.5 text-xs text-muted-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Search
          </a>
        ) : null}
      </div>

      {video.why ? (
        <p className="mt-2 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
          💡 {video.why}
        </p>
      ) : null}
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
      className="flex w-40 shrink-0 flex-col items-center rounded-xl border p-3 text-center transition-colors hover:bg-accent/60"
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full text-base font-bold text-white"
        style={{ backgroundColor: `hsl(${hue} 55% 42%)` }}
      >
        {initials(name)}
      </span>
      <span className="mt-2 line-clamp-2 text-sm font-semibold">{name}</span>
      {channelName ? (
        <span className="mt-0.5 text-xs text-muted-foreground">{channelName}</span>
      ) : null}
      {institute ? <span className="mt-0.5 text-xs text-muted-foreground">{institute}</span> : null}
      {specialization ? (
        <span className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
          {specialization}
        </span>
      ) : null}
      <span className="mt-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
        Follow
      </span>
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <Search className="h-8 w-8 text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-input px-3 py-1.5 text-xs"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
