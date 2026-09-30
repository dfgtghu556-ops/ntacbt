/**
 * PWA INSTALL (A10)
 *
 * A student only installs the app if they are asked. Chrome and Edge fire
 * `beforeinstallprompt` when the manifest is valid and the engagement bar is
 * met, but the default mini-infobar is easy to miss and iOS Safari never fires
 * it at all — there the only route is "Add to Home Screen" in the share sheet.
 *
 * This module is the pure decision logic, so the UI is a thin rendering of it
 * and every branch is testable without a browser.
 *
 * **Three rules.**
 *
 *  1. **Never nag.** The prompt is stored once dismissed and not shown again
 *     for a while. A student who said no means no.
 *  2. **Never lie about iOS.** On iOS there is no programmatic prompt, so the
 *     module reports `manual` and the UI shows the real instructions rather
 *     than a button that does nothing.
 *  3. **Say what installing gives them.** "Install" alone is a weak ask. The
 *     reason is the offline app, and that is what the copy leads with.
 */

/** How install can be offered on this device. */
export type InstallMode =
  /** A real `beforeinstallprompt` is available — one tap installs. */
  | "prompt"
  /** No programmatic prompt (iOS Safari, or already installed). */
  | "manual"
  /** Already running as an installed app. */
  | "installed";

export interface InstallAvailability {
  mode: InstallMode;
  /** One honest line for the UI. */
  note: string;
}

const DISMISS_KEY = "ntacbt.pwa.dismissedAt";
/** A dismissed prompt is not re-shown for two weeks. */
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** True when the page is running as an installed PWA rather than a tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari uses navigator.standalone; everything else uses the display-mode
  // media query that the manifest's `display: standalone` triggers.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  const displayStandalone = window.matchMedia?.("(display-mode: standalone)").matches === true;
  return iosStandalone || displayStandalone;
}

/** True when this is iOS, where no programmatic install prompt exists. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Macintosh but has touch points, so the UA alone lies.
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return iOS || iPadOS;
}

/**
 * Whether the install prompt may be shown.
 *
 * A dismissal is respected for the cooldown, and a student who already
 * installed is never asked again.
 */
export function shouldOfferInstall(input: {
  standalone: boolean;
  dismissedAt: number | null;
  now: number;
  /** True when a real beforeinstallprompt has been captured. */
  hasPrompt: boolean;
}): boolean {
  if (input.standalone) return false;
  if (input.dismissedAt && input.now - input.dismissedAt < DISMISS_COOLDOWN_MS) return false;
  return input.hasPrompt;
}

/** The install mode for this device, with the reason. */
export function installMode(input: {
  standalone: boolean;
  ios: boolean;
  hasPrompt: boolean;
}): InstallMode {
  if (input.standalone) return "installed";
  if (input.hasPrompt) return "prompt";
  // iOS never fires beforeinstallprompt, but installing still works through the
  // share sheet — so this is a manual path, not a dead end.
  if (input.ios) return "manual";
  return "manual";
}

export function availabilityNote(mode: InstallMode): string {
  if (mode === "installed") return "You're using the installed app.";
  if (mode === "prompt") return "Install NTACBT to open it full-screen and keep studying offline.";
  return "Install NTACBT from your browser's share menu to open it full-screen and study offline.";
}

/** Record a dismissal so the prompt is not shown again immediately. */
export function rememberDismissal(now: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DISMISS_KEY, String(now));
  } catch {
    /* ignore — a private-mode failure must not break the prompt */
  }
}

/** Read the stored dismissal, or null. */
export function readDismissal(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export { DISMISS_KEY, DISMISS_COOLDOWN_MS };
