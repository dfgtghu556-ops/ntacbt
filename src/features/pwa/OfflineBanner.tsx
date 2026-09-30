/**
 * Tell the student when they are offline.
 *
 * The app installs as a PWA and works from cache — that is the whole point of
 * the offline work, and the audience is students on patchy connectivity. But
 * `navigator.onLine` was read nowhere in the codebase, so a student who has lost
 * their connection has no way to tell whether the app is working from cache,
 * waiting, or quietly failing. The one audience the PWA was built for is the one
 * audience that cannot see what state it is in.
 *
 * Deliberately quiet: a banner at the top of the page, never a toast and never a
 * modal. A student mid-exam must not be interrupted by a connectivity notice —
 * the attempt autosaves locally and keeps running either way, and the honest
 * thing is to say so rather than to alarm.
 */

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";

/**
 * Whether the browser currently reports a connection.
 *
 * `navigator.onLine` is a hint, not a measurement — it is false in some cases
 * where the network is fine and true in some where it is not. That is exactly
 * why this is a banner and not a blocker: it tells the student what the browser
 * thinks, and nothing more.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      data-print="hide"
      className="flex flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        You are offline. Everything you have already opened still works, and your progress keeps
        saving on this device — it will sync the next time you are connected.
      </span>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400 px-2 py-1 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40"
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
