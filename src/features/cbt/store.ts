/**
 * CBT attempt persistence (React area), isolated from the legacy blob.
 * Both the full test run and a "review analysis" page read the same local
 * store. Legacy `jeecbt.v1` is never written by this module.
 */

import type { CbtAttemptRecord, CbtTest } from "./types";

export const CBT_STORE_KEY = "ntacbt.cbt.v1";

export interface CbtStore {
  schemaVersion: number;
  tests: CbtTest[];
  attempts: CbtAttemptRecord[];
}

function empty(): CbtStore {
  return { schemaVersion: 1, tests: [], attempts: [] };
}

export function loadCbtStore(): CbtStore {
  if (typeof window === "undefined") return empty();
  try {
    const raw = JSON.parse(localStorage.getItem(CBT_STORE_KEY) || "{}") as Partial<CbtStore>;
    return {
      ...empty(),
      ...raw,
      tests: Array.isArray(raw.tests) ? raw.tests : [],
      attempts: Array.isArray(raw.attempts) ? raw.attempts : [],
    };
  } catch {
    return empty();
  }
}

function save(store: CbtStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CBT_STORE_KEY, JSON.stringify(store));
}

export function saveCbtTest(test: CbtTest) {
  const store = loadCbtStore();
  const idx = store.tests.findIndex((t) => t.id === test.id);
  if (idx >= 0) store.tests[idx] = test;
  else store.tests.unshift(test);
  if (store.tests.length > 30) store.tests = store.tests.slice(0, 30);
  save(store);
}

export function saveCbtAttempt(attempt: CbtAttemptRecord) {
  const store = loadCbtStore();
  const idx = store.attempts.findIndex((a) => a.id === attempt.id);
  if (idx >= 0) store.attempts[idx] = attempt;
  else store.attempts.unshift(attempt);
  if (store.attempts.length > 60) store.attempts = store.attempts.slice(0, 60);
  save(store);
}

export function getCbtTest(id: string): CbtTest | undefined {
  return loadCbtStore().tests.find((t) => t.id === id);
}
