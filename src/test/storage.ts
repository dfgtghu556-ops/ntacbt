/**
 * Test-only localStorage stub. Not a suite - vitest's include pattern only picks
 * up test and spec files, so this is imported as a plain module.
 *
 * Kept in its own file, separate from the router harness, so neither file mixes
 * component and non-component exports - `react-refresh/only-export-components`
 * flags that, and the gate runs eslint with `--max-warnings=0`.
 */

import { vi } from "vitest";

/**
 * Replace `localStorage` with a stub seeded from a plain object.
 *
 * A real `Storage` is available in jsdom, but seeding it means writing every key
 * through the API before each test, and these tests need to read the *final*
 * contents to prove what was persisted - so a stub with a visible backing map.
 *
 * The stub must implement the full `Storage` interface. `src/test/setup.ts` runs a
 * global `afterEach` that calls `localStorage.clear()`, and a partial stub fails
 * there with `localStorage.clear is not a function` rather than in the test under
 * suspicion - which costs an hour of debugging the wrong file.
 *
 * Under jsdom `window.localStorage` and the global `localStorage` are the same
 * object, so stubbing the global is enough; stubbing `window` as well breaks
 * other parts of the environment.
 */
export function installStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("localStorage", storage);
  return map;
}
