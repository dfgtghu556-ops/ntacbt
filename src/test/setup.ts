/**
 * Vitest setup: jest-dom matchers + a deterministic localStorage.
 *
 * `restoreMocks` is on in the config, and every test starts from an empty
 * storage so the auth/exam stores can never leak state between cases.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
