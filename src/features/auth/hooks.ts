/**
 * Auth hooks.
 *
 * `useAuth()` is the single read/write surface components should use. It also
 * restores a persisted session exactly once per mount so a reload does not
 * flash a signed-out header.
 */
import { useEffect } from "react";
import { useAuthStore } from "./store";

export function useAuth() {
  const store = useAuthStore();
  const { restore, isLoading, isAuthenticated } = store;

  useEffect(() => {
    if (isAuthenticated || isLoading) return;
    void restore();
    // `restore` is stable (defined once in the store creator).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return store;
}

/**
 * Guard for surfaces that genuinely need an identity (profile, cloud sync).
 * Returns `false` instead of redirecting, because NTACBT must stay usable
 * signed-out — the caller decides what to render.
 */
export function useRequireAuth(): boolean {
  const { isAuthenticated, isLoading } = useAuth();
  return isAuthenticated && !isLoading;
}
