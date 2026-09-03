import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Play, Search } from "lucide-react";
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

export function VideoCard({
  video,
  onPlay,
}: {
  video: StudyTubeVideo;
  onPlay?: (v: StudyTubeVideo) => void;
}) {
  const thumb = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  const watch = `https://www.youtube.com/watch?v=${video.id}`;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => onPlay?.(video)}
        className="group relative block w-full text-left"
      >
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <img
            src={thumb}
            alt={video.title}
            loading="lazy"
            className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 shadow-lg">
              <Play className="h-5 w-5 text-foreground" />
            </div>
          </div>
          <div className="absolute right-2 bottom-2 rounded px-1.5 py-0.5 bg-black/80 text-xs font-medium text-white">
            {fmtDuration(video.durationSec)}
          </div>
        </div>
      </button>
      <CardContent className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {video.subject ? <Badge variant="secondary">{video.subject}</Badge> : null}
          {video.topic ? (
            <Badge variant="outline" className="max-w-[180px] truncate">
              {video.topic}
            </Badge>
          ) : null}
          {video.teacher ? <Badge variant="outline">{video.teacher}</Badge> : null}
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{video.title}</h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">{video.channel}</p>
        {video.why ? (
          <p className="mt-2 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
            💡 {video.why}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onPlay?.(video)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Play className="h-3.5 w-3.5" /> Watch
          </button>
          <a
            href={watch}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" /> YouTube
          </a>
        </div>
      </CardContent>
    </Card>
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
