import { afterEach, describe, expect, it } from "vitest";
import {
  DISMISS_COOLDOWN_MS,
  DISMISS_KEY,
  availabilityNote,
  installMode,
  isIOS,
  isStandalone,
  readDismissal,
  rememberDismissal,
  shouldOfferInstall,
} from "@/features/pwa/install";

const NOW = 1_700_000_000_000;

function setUA(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

afterEach(() => {
  localStorage.clear();
  Object.defineProperty(window.navigator, "userAgent", {
    value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    configurable: true,
  });
});

describe("isIOS", () => {
  it("detects iPhone and iPad", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    expect(isIOS()).toBe(true);
    setUA("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    expect(isIOS()).toBe(true);
  });

  it("detects iPadOS 13+, which reports as Macintosh but has touch", () => {
    // The UA alone says Mac; the touch points are what give it away.
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15");
    Object.defineProperty(window.navigator, "maxTouchPoints", { value: 5, configurable: true });
    expect(isIOS()).toBe(true);
  });

  it("does not mistake a desktop Mac for an iPad", () => {
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15");
    Object.defineProperty(window.navigator, "maxTouchPoints", { value: 0, configurable: true });
    expect(isIOS()).toBe(false);
  });

  it("does not mistake Android for iOS", () => {
    setUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile");
    expect(isIOS()).toBe(false);
  });
});

describe("isStandalone", () => {
  it("is false in a normal browser tab", () => {
    expect(isStandalone()).toBe(false);
  });

  it("is true on iOS Safari's standalone mode", () => {
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
  });

  it("is true when the display-mode media query matches", () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("standalone") })) as never;
    expect(isStandalone()).toBe(true);
  });
});

describe("installMode", () => {
  it("offers a real prompt when beforeinstallprompt was captured", () => {
    expect(installMode({ standalone: false, ios: false, hasPrompt: true })).toBe("prompt");
  });

  it("reports installed when already running standalone", () => {
    expect(installMode({ standalone: true, ios: false, hasPrompt: true })).toBe("installed");
    expect(installMode({ standalone: true, ios: true, hasPrompt: false })).toBe("installed");
  });

  it("falls back to manual on iOS, which never fires the event", () => {
    expect(installMode({ standalone: false, ios: true, hasPrompt: false })).toBe("manual");
  });

  it("falls back to manual on Android before the event fires", () => {
    expect(installMode({ standalone: false, ios: false, hasPrompt: false })).toBe("manual");
  });
});

describe("availabilityNote", () => {
  it("leads with what installing gives the student", () => {
    for (const mode of ["prompt", "manual", "installed"] as const) {
      const note = availabilityNote(mode);
      expect(note.length).toBeGreaterThan(0);
      if (mode !== "installed") expect(note).toContain("offline");
    }
  });

  it("says something different for each mode", () => {
    const notes = new Set(
      (["prompt", "manual", "installed"] as const).map((m) => availabilityNote(m)),
    );
    expect(notes.size).toBe(3);
  });
});

describe("shouldOfferInstall", () => {
  it("offers when a prompt is available and nothing was dismissed", () => {
    expect(
      shouldOfferInstall({ standalone: false, dismissedAt: null, now: NOW, hasPrompt: true }),
    ).toBe(true);
  });

  it("never offers when already installed", () => {
    expect(
      shouldOfferInstall({ standalone: true, dismissedAt: null, now: NOW, hasPrompt: true }),
    ).toBe(false);
  });

  it("never offers without a real prompt, so no dead button appears", () => {
    // A button that does nothing is worse than no button.
    expect(
      shouldOfferInstall({ standalone: false, dismissedAt: null, now: NOW, hasPrompt: false }),
    ).toBe(false);
  });

  it("respects a dismissal for the whole cooldown", () => {
    const dismissedAt = NOW - DISMISS_COOLDOWN_MS + 60_000;
    expect(shouldOfferInstall({ standalone: false, dismissedAt, now: NOW, hasPrompt: true })).toBe(
      false,
    );
  });

  it("offers again once the cooldown has passed", () => {
    const dismissedAt = NOW - DISMISS_COOLDOWN_MS - 60_000;
    expect(shouldOfferInstall({ standalone: false, dismissedAt, now: NOW, hasPrompt: true })).toBe(
      true,
    );
  });

  it("ignores a dismissal with no timestamp", () => {
    expect(
      shouldOfferInstall({ standalone: false, dismissedAt: 0, now: NOW, hasPrompt: true }),
    ).toBe(true);
  });
});

describe("dismissal persistence", () => {
  it("round-trips through localStorage", () => {
    expect(readDismissal()).toBeNull();
    rememberDismissal(NOW);
    expect(readDismissal()).toBe(NOW);
  });

  it("uses a namespaced key so it cannot collide with app state", () => {
    expect(DISMISS_KEY).toBe("ntacbt.pwa.dismissedAt");
  });

  it("returns null on a corrupt value rather than NaN", () => {
    localStorage.setItem(DISMISS_KEY, "not-a-number");
    expect(readDismissal()).toBeNull();
  });

  it("does not throw when localStorage is unavailable", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("private mode");
    };
    expect(() => rememberDismissal(NOW)).not.toThrow();
    Storage.prototype.setItem = original;
  });
});
