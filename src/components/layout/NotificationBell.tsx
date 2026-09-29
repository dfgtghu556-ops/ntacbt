/**
 * NotificationBell — the header bell, finally wired to something.
 *
 * The bell used to be a button with no handler: it looked like a feature and
 * did nothing, which is worse than not having a bell at all. This is the real
 * thing.
 *
 * Design rules carried over from `features/notify/schedule.ts`:
 *
 *  - **In-app first.** The nudges are readable whether or not the student has
 *    granted notification permission. The permission prompt is a *second* step
 *    the student takes deliberately, never something that fires on load.
 *  - **Quiet hours are stated, not hidden.** When it is quiet the panel says so
 *    and says when it ends. A student who wonders why nothing came at 23:00
 *    gets an answer in the same place they set it.
 *  - **Every nudge shows its evidence.** The "why" line under each nudge is the
 *    same string `dueNudges` used to decide, so the student can check the
 *    reasoning instead of taking it on faith.
 *  - **The loss is named honestly.** A loss-framed nudge is marked, and it is
 *    never the only thing on screen — the fix is in the same message.
 */

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Clock3, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quietHoursLabel, type QuietHours } from "@/features/notify/schedule";
import { useNudges } from "@/features/notify/use-nudges";

/** Every hour of the day, for the two quiet-hours selects. */
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { nudges, quiet, canNotify, blockedReason, permission, setQuiet, requestPermission, send } =
    useNudges();
  const rootRef = useRef<HTMLDivElement>(null);

  // Escape closes the panel. A modal that traps a student with no keyboard way
  // out is a bug, not a feature.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const hasNudges = nudges.length > 0;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={hasNudges ? `Notifications — ${nudges.length} for you` : "Notifications"}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
      >
        {canNotify ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        {hasNudges ? (
          <span
            className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-primary"
            aria-hidden="true"
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border bg-popover p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="rounded-full p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {hasNudges ? (
            <ul className="grid gap-2">
              {nudges.map((n) => (
                <li key={n.kind} className="rounded-2xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug">{n.title}</h3>
                    {n.lossFramed ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        at risk
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                  <p
                    className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground"
                    data-evidence="true"
                  >
                    <ShieldCheck className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{n.evidence}</span>
                  </p>
                  {canNotify ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 rounded-full px-2.5 text-xs"
                      onClick={() => {
                        send(n);
                        setOpen(false);
                      }}
                    >
                      Send as notification
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed p-3 text-xs text-muted-foreground">
              Nothing needs you right now. Nudges only appear when your own data says something is
              worth doing — never on a timer.
            </p>
          )}

          <div className="mt-3 border-t pt-3">
            <label className="flex items-center gap-1.5 text-xs font-medium" htmlFor="quiet-start">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Quiet hours
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {quietHoursLabel(quiet)}. No nudge is sent inside this window, whatever the evidence.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <select
                id="quiet-start"
                aria-label="Quiet hours start"
                value={quiet.startHour}
                onChange={(e) => setQuiet({ ...quiet, startHour: Number(e.target.value) })}
                className="h-8 min-w-0 flex-1 rounded-full border border-input bg-background px-2 text-xs"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">to</span>
              <select
                aria-label="Quiet hours end"
                value={quiet.endHour}
                onChange={(e) => setQuiet({ ...quiet, endHour: Number(e.target.value) })}
                className="h-8 min-w-0 flex-1 rounded-full border border-input bg-background px-2 text-xs"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {permission !== "unsupported" && permission !== "granted" ? (
            <div className="mt-3 border-t pt-3">
              <Button
                type="button"
                size="sm"
                className="h-8 w-full rounded-full text-xs"
                onClick={() => void requestPermission()}
              >
                Turn on notifications
              </Button>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Optional. Everything above works without it, and nothing is sent during quiet hours.
              </p>
            </div>
          ) : blockedReason ? (
            <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">{blockedReason}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
