/**
 * Vitest configuration.
 *
 * Kept separate from `vite.config.ts` (which is owned by
 * `@lovable.dev/vite-tanstack-config`) so the app build and the test runner can
 * evolve independently. The existing Rolldown-based `.mjs` harnesses in
 * `scripts/` are untouched — this adds a normal unit/component test layer on top.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The `.mjs` harnesses are run by `npm run validate:*`, not by vitest.
    exclude: ["node_modules", "dist", "scripts"],
    restoreMocks: true,
  },
});
