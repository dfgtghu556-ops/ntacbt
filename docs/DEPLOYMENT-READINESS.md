# Deployment readiness

Verified on 2026-10-01 against commit `2818ffc` on branch `arena/01a0e8ab-ntacbt`.

Everything below was measured by running the commands, not inferred from reading
files. Where something could not be verified in this environment it says so.

---

## Short answer

**The app is deployable.** The production build produces a valid Vercel
artifact and the full quality gate is green.

Two things are not ready, and neither blocks a first deploy:

1. There is no CI in the repository, because the deploy workflow cannot be
   committed with the current GitHub App permissions.
2. The AI features are dark until secrets are set in Vercel. They degrade to a
   clear 503 rather than crashing.

---

## Verified green

| Check            | Command                                   | Result                            |
| ---------------- | ----------------------------------------- | --------------------------------- |
| Types            | `npx tsc --noEmit`                        | 0 errors                          |
| Lint             | `npx eslint scripts src --max-warnings=0` | 0 errors, 9 pre-existing warnings |
| Unit             | `npx vitest run`                          | 964 passed, 56 files              |
| Data + engine    | `npm run validate:all`                    | 0                                 |
| Production build | `npm run build`                           | 0                                 |
| Node preview     | `NITRO_PRESET=node-server npm run build`  | 0, all 6 probed routes 200        |

### The build artifact is real

`npm run build` with the default (`vercel`) Nitro preset emits
`.vercel/output/` — the Vercel Build Output API v3. Its `config.json` declares
framework `nitro`, caches `/assets/(.*)` immutably, handles the filesystem, and
sends everything else to `/__server`. `.vercel/output/static/` contains 16
entries including `favicon.ico`, `icon-192.png`, `icon-512.png`,
`manifest.webmanifest`, `offline.html`, `index.html` and `jee-cbt.html`.

This matters because it is the thing that actually deploys. A build that exits 0
but emits nothing deployable would look identical from the log alone.

### The app runs with an empty environment

`src/routes/api/public/ai-chat.ts` checks all three AI keys and, when none are
present, returns HTTP 503 with:

> "The AI doubt-solver isn't configured yet — add an OPENROUTER_API_KEY or
> GEMINI_API_KEY secret."

That is correct degradation. A first deploy with no secrets set gives a working
exam runner and a clearly-labelled dark AI panel, not a crash.

### `.env` holds only publishable values

Every key in the tracked `.env` decodes to a publishable/anon Supabase value.
There is no `sb_secret_` prefix and no JWT carrying `role: service_role`. An
earlier note in this file advising rotation of a service-role key was wrong and
has been corrected.

---

## Must be done before deployment

### 1. Add `.vercel/` to `.gitignore`

`.output` is ignored (`.gitignore:13`) but `.vercel` is not. The Vercel build
output is the entire server bundle plus every static asset — megabytes. One
`git add -A` would commit it.

```
echo ".vercel" >> .gitignore
```

### 2. Set AI secrets in Vercel, or accept the 503s

| Variable                                              | Enables                           | Without it                                    |
| ----------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| `GEMINI_API_KEY`                                      | Saarthi chat, PDF reformat        | 503 with a clear message                      |
| `OPENROUTER_API_KEY`                                  | Saarthi chat (alternate provider) | 503 with a clear message                      |
| `LOVABLE_API_KEY`                                     | Saarthi chat (Lovable gateway)    | 503 with a clear message                      |
| `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`           | `cloud-config` route              | Route reports unconfigured                    |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` | Account layer, shared library     | Everything stays on-device, no account needed |

`GEMINI_MODEL`, `GEMINI_MODEL_LIGHT`, `OPENROUTER_MODEL`,
`OPENROUTER_MODEL_LIGHT` all have working defaults and are optional.

`.env.example` documents all of this and states that everything works with an
empty file.

### 3. Decide how deploys happen, because CI is not in the repo

`.github/workflows/deploy.yml` exists on disk but is **untracked and cannot be
committed** — the GitHub App installation lacks the `workflows` permission.
`git push` is rejected for any commit touching that path.

So there are two options, and the user has to pick one:

- **Rely on Vercel's Git integration.** Already configured: `vercel.json` sets
  `buildCommand: "npm run build"`, and a push to `main` builds and deploys
  through Vercel. Nothing to do.
- **Grant the GitHub App the `workflows` permission**, then commit the workflow
  to get lint/typecheck/validate/build gating on every push and PR.

The second is better for a "system students can blindly trust", because today
nothing runs the gate automatically.

---

## Responsive optimisation, measured

`npm run audit:responsive` (`scripts/audit-responsive.mjs`) walks all 116
`.tsx` files under `src/` plus `public/css/legacy.css` and reports layout
patterns that break on a small screen.

Current state:

```
Findings: 0 high, 0 medium, 0 low, 16 info unexplained, across 21 files
21 inspected and judged correct (5 high, 13 medium, 3 low, 0 info)
```

The 16 info findings are 11 unused `src/components/ui/*` primitives and 5
`min-h-screen` containers. Neither is a defect.

The audit's first run reported **10 high-severity findings, and all 10 were
wrong.** That is recorded here because it is the reason the audit exists:

- 7 were multi-track CSS grids that _do_ have breakpoint overrides. The override
  detector's regex used `[^}]*`, which cannot cross the `}` of a preceding rule
  inside the `@media` block, so `.g6`, `.ai-metrics`, `.ai-panels` and
  `.mini-grid` all looked unhandled.
- 2 were a calculator keypad and a summary tile pair, where a narrow fixed
  column count is the correct phone layout.
- 1 was the shadcn table primitive, which no route renders.

Two further bugs in the audit itself made the noise worse. Comment-blanking
replaced newlines with spaces, so every CSS line number after a multi-line
comment was wrong and the review excuses were keyed on garbage lines. And the
selector-family matcher used `endsWith`, which cannot match `.mini-grid`
against `.mini-grid.two` because that string ends with `.two`.

Findings a human has inspected are recorded in a `REVIEWED` map with the
reason, reported as `OK` rather than counted, and a stale entry is reported as
stale so it cannot silently excuse a regression later.
`src/test/audit-responsive.test.ts` fails on any unexplained high/medium/low
finding or stale excuse. Verified it bites: deleting the `.mini-grid`
breakpoint override fails the test with
`expected { high: 2 } to deeply equal { high: 0 }`.

### StudyTube specifically

| Surface                                            | Small screen                                                                  | Status |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Legacy `.yt-app`                                   | 1 column ≤900px, horizontal sidebar strip                                     | OK     |
| Legacy shelves                                     | snap carousel, cards `min(250px, 66vw)`                                       | OK     |
| Legacy search-results grid (`.yt-main > .yt-grid`) | 2-up ≤900px, 1-up ≤380px                                                      | OK     |
| React `Shelf`                                      | snap carousel below `sm`; 1→2→3→4 grid from `sm`                              | OK     |
| React filter bar                                   | one flex-wrap, `min-w-[12rem] flex-1` selects                                 | OK     |
| `VideoCard`                                        | `aspect-video w-full` thumb, `h-full w-full flex-col` card                    | OK     |
| `app.studytube.$video.tsx`                         | `grid gap-4 lg:grid-cols-[1fr_340px]`, `aspect-video w-full`, flex-wrap chips | OK     |

---

## What could NOT be verified

**No browser exists in this sandbox.** Not a headless Chromium, not Playwright,
not Puppeteer — confirmed by checking `node_modules/.bin`, `node_modules`, and
`which chromium chromium-browser google-chrome chrome`. Every claim in this
document is about source code and build output. Nothing has ever been visually
confirmed at any viewport width.

Specifically unverified:

- That any layout actually _looks_ right at 320px, 375px, 768px or 1440px.
- That the StudyTube carousels swipe correctly on a real touch device.
- Dark mode rendering (the `.dark` class is applied by `public/js/app.js`, which
  is not exercised by any test).
- That the Vercel deploy succeeds end to end. The artifact is correct; the
  deploy has not been run.

---

## Related

- `docs/UI-UX-PLAN.md` — findings on dark mode, the `buttonface` root cause, and
  the device audit.
- `scripts/audit-responsive.mjs` — the audit itself.
- `.env.example` — every variable, with what each one enables.
