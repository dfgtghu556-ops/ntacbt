// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },

    // NOTE: prerendering the content pages (/about, /privacy, /terms) was
    // attempted here and deliberately removed. Two mechanisms exist and both
    // are blocked in this stack combination, verified rather than assumed:
    //
    //   1. Nitro's own `prerender: { routes: [...] }`. It runs *before* the SSR
    //      server bundle is built, so every route answers 404 and it silently
    //      logs "Prerendered 0 routes" while the build still succeeds. A config
    //      that looks right and does nothing is worse than no config.
    //   2. TanStack Start's `prerender` + `pages`. It runs at the right time
    //      (post-build), but its preview server imports a hardcoded
    //      `dist/server/server.js` while Nitro emits `.output/server/index.mjs`,
    //      so every page 500s and the build fails outright.
    //
    // Making either work means repointing Nitro's output at `dist/`, which is
    // what `vercel.json` and the deploy workflow already assume and which the
    // build does not produce - so it would trade a working deploy for ~100ms on
    // three pages. Not worth it, and recorded here so it is not retried blind.
    //
    // The pages are server-rendered either way, which is what search engines
    // actually need: full HTML per URL, with title, description and Open Graph
    // already set by `socialMeta()`. Static versus server-rendered changes
    // time-to-first-byte, not indexing.
  },
  nitro: {
    // The deploy target.
    //
    // The Lovable config defaults nitro to the `cloudflare-module` preset. That
    // produced a Cloudflare Worker in `.output/`, while `vercel.json` and
    // `.github/workflows/deploy.yml` both deploy to Vercel reading a `dist/`
    // directory the build never creates - so the production deploy served
    // nothing. There is no wrangler config in the repo, so Cloudflare was never
    // an intentional target; it was just the default.
    //
    // Vercel is the target everything else is written against, so it is the
    // default here rather than left to auto-detection, which does not fire in
    // this CI.
    //
    // `NITRO_PRESET` still overrides it, which is how `npm run preview:build`
    // verifies the real production bundle locally: the vercel preset emits the
    // Build Output API layout in `.vercel/output/`, which only Vercel itself
    // can serve and which needs credentials to run - so a broken production
    // build would otherwise be undetectable before it shipped.
    preset: process.env["NITRO_PRESET"] || "vercel",
  },
  vite: {
    server: { allowedHosts: true },
    // The lightweight offline service worker lives in public/sw.js and is
    // registered from the root route. It uses runtime caching (network-first
    // pages, cache-first assets) so the Vite build stays warning-free and the
    // shell still works without a network after the first load.
  },
});
