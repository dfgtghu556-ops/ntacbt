/**
 * InstallPrompt — the A10 PWA install surface.
 *
 * A student only installs the app if they are asked, and Chrome's default
 * mini-infobar is easy to miss. This surfaces a real ask, with the reason
 * attached, and it stays out of the way once dismissed.
 *
 * **iOS gets instructions, not a dead button.** Safari never fires
 * `beforeinstallprompt`, so there is nothing to tap. Showing a button that
 * does nothing would be worse than showing nothing, so on iOS the card
 * renders the actual share-sheet steps.
 *
 * **Already installed means never asked again.** `isStandalone()` catches both
 * the display-mode media query and iOS's `navigator.standalone`.
 */

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import {
  availabilityNote,
  installMode,
  isIOS,
  isStandalone,
  readDismissal,
  rememberDismissal,
  shouldOfferInstall,
  type InstallMode,
} from "@/features/pwa/install";

/** The event we capture so `prompt()` can be called from our own button. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function capturePrompt(): BeforeInstallPromptEvent | null {
  const w = window as unknown as { __ntacbtInstallPrompt?: BeforeInstallPromptEvent };
  return w.__ntacbtInstallPrompt ?? null;
}

function storePrompt(evt: BeforeInstallPromptEvent): void {
  (
    window as unknown as { __ntacbtInstallPrompt?: BeforeInstallPromptEvent }
  ).__ntacbtInstallPrompt = evt;
}

export function InstallPrompt() {
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      // Stop Chrome's own mini-infobar: we are going to ask properly.
      e.preventDefault();
      storePrompt(e as BeforeInstallPromptEvent);
      setMode("prompt");
    }
    function onInstalled() {
      setMode("installed");
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Resolve the mode once, after mount. SSR renders nothing, because
  // `display-mode` and `navigator.standalone` are client-only facts.
  useEffect(() => {
    const standalone = isStandalone();
    const resolved = installMode({
      standalone,
      ios: isIOS(),
      hasPrompt: capturePrompt() !== null,
    });
    const offer = shouldOfferInstall({
      standalone,
      dismissedAt: readDismissal(),
      now: Date.now(),
      hasPrompt: resolved === "prompt",
    });
    setMode(offer ? resolved : resolved === "installed" ? "installed" : null);
  }, []);

  if (mode === null || mode === "installed" || dismissed) return null;

  async function install() {
    const evt = capturePrompt();
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      setMode("installed");
    } else {
      // A "no" from the browser dialog counts as a dismissal, so the student is
      // not asked again on the next page load.
      setDismissed(true);
    }
  }

  function dismiss() {
    rememberDismissal(Date.now());
    setDismissed(true);
  }

  return (
    <section
      data-testid="install-prompt"
      data-print="hide"
      className="mx-3 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Download className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Install NTACBT</p>
        <p className="text-xs text-muted-foreground">{availabilityNote(mode)}</p>
      </div>

      {mode === "prompt" ? (
        <button
          onClick={() => void install()}
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
        >
          Install
        </button>
      ) : (
        <p className="shrink-0 text-xs text-muted-foreground">
          <Share className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          Share → Add to Home Screen
        </p>
      )}

      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
