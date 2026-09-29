# NTACBT — Full Redevelopment & Publishing Readiness Prompt

> A copy-paste prompt for an AI coding agent, derived from the Compile Future
> methodology (micro-tool sites built for Google ranking + AdSense) and mapped
> onto what this repository actually is.
>
> Every claim below was verified against the repo at commit `0bb4e69`. Numbers
> are measured, not estimated.

---

## The prompt

```
You are working on NTACBT, a JEE Main & CBSE practice platform in
/home/user/ntacbt (branch arena/01a0e8ab-ntacbt). It is TanStack Start + React
19 + TypeScript + Tailwind v4, deployed to Vercel. It is a real, working
application with 695 tests across 40 suites — not a scaffold. Preserve that.

Your goal is to make it publishable: discoverable on Google, fast enough to
rank, legally complete enough to monetise, and honest about what it claims.

## What already exists — do not rebuild it

- Exam runner (`/cbt`) with NTA-style instructions, question palette,
  calculator, autosave, and a result page whose question review is paginated.
- 5 transcribed JEE Main 2026 papers / 375 questions, baked at build time.
- CBSE curriculum maps for Class XI and Class XII, both validated at build time.
- Planner, StudyTube, Saarthi mentor, Memory (spaced repetition), Focus,
  Analytics, PYQ browser, global search, onboarding, PWA/offline, XP.
- A build gate: 10 offline data validators run before `vite build`.

## The five gaps that block publishing, in priority order

### 1. The content is invisible to Google — this is the whole problem

Every data-driven route fetches in `useEffect` and renders a spinner. Verified
on the live build: `GET /app/pyq` returns the shell heading plus the literal
string "Loading papers" and **none of the 375 questions**. The syllabus map,
StudyTube catalogue and search results are the same.

A crawler sees an empty page. The app's entire value — real previous-year
questions, a real syllabus — does not exist as far as search is concerned.

Fix it by server-rendering the content, not by changing frameworks:

- Load the PYQ index and paper list in route `loader`s so the HTML ships
  populated. TanStack Start is already SSR; the data simply is not being loaded
  on the server.
- Server-render the syllabus map (`/app/map`) — it is static data in the repo
  and needs no client fetch at all.
- Keep client fetching only where the data is genuinely per-user and private
  (attempts, notes, mastery, planner). Public, immutable content must render
  server-side.
- Verify with `curl -s --compressed http://localhost:8080/app/pyq | grep -c
  "21 Jan 2026"` — a non-zero count is the pass condition. Do not accept a
  change that still requires JavaScript to show content.

### 2. No per-route metadata — all 18 routes

`grep -c "head:" src/routes/app.*.tsx` returns 0 for every route. Only the root
route sets a title. Every page therefore shares one title and description.

Add a `head()` to every route with a distinct title and description written for
search intent, e.g. `/app/pyq` → "JEE Main 2026 Previous Year Papers — 375
Solved Questions | NTACBT", `/app/map` → "CBSE Class 11 & 12 Syllabus 2026-27 —
Unit-wise Chapters and Topics". Add canonical URLs, Open Graph and Twitter
cards. The root already has OG tags; extend the pattern.

### 3. No sitemap, no structured data

`public/robots.txt` exists and correctly allows crawlers, but there is no
`public/sitemap.xml` and no JSON-LD anywhere in the repo.

- Generate `sitemap.xml` at build time from the route list, including the
  syllabus map and PYQ routes.
- Add `application/ld+json` structured data: `Organization`, `WebSite` with
  `SearchAction`, `FAQPage` on content routes, and `LearningResource` on the
  syllabus and PYQ pages. Validate with Google's Rich Results Test.
- Reference the sitemap from `robots.txt`.

### 4. No legal pages — this blocks monetisation entirely

There is no privacy policy, terms, or about page. AdSense will not approve a
site without a privacy policy, and this app stores real student data
(attempts, notes, mastery) in `localStorage` plus a Supabase integration.

Create `/privacy`, `/terms` and `/about` as real routes, not static files. The
privacy policy must state plainly what is stored locally, what is sent to
Supabase, and that nothing is sold. Link them from the footer of every route.

### 5. Performance and error surfaces

- 455 KB of gzipped JavaScript across 87 files; the entry chunk alone is 150 KB
  gzipped. That is acceptable for an app shell but it is the main Core Web
  Vitals risk. Route-level lazy loading is already in place — verify the
  analytics and StudyTube chunks are not in the entry bundle, and move any that
  are.
- Add a 500 error page. A 404 exists; a server error currently renders a bare
  "Error" document.
- Add `<link rel="preconnect">` for Supabase and the YouTube thumbnail host if
  not already present (the root already preconnects YouTube — extend it).

## Constraints you must not violate

- **Do not** delete `public/jee-cbt.html` or edit `public/js/app.js`. The legacy
  PDF paper builder is still the only way to turn an arbitrary PDF into a test.
- **Do not** add a login wall. The product is deliberately local-first; a
  student must be able to practise without an account.
- **Do not** change the Eklavya planner schedule or invent planner data.
- **Do not** fabricate teacher, video, or rank data. Anything unverifiable is
  labelled as such or hidden.
- **Do not** invent an admission outcome, percentile promise, seat or college
  prediction. Percentile is not an admission outcome.
- **Do not** rewrite the app in Astro. See the note below.

## What from the source methodology does not apply, and why

The videos build single-purpose micro-tool sites where every page is content and
there is no authenticated state. NTACBT is the opposite: an interactive
application with a timed exam runner, a question palette, autosave and per-user
mastery state.

- **AstroJS** would be the right choice for a static content site and is the
  wrong choice here — the exam runner, planner and analytics are genuinely
  interactive and would all become islands. Server-rendering the *content*
  routes inside the existing TanStack Start app captures the SEO benefit without
  the rewrite. Do not change framework.
- **Cloudflare free hosting** — the deploy target is now Vercel, fixed in
  `88bdb3a`. Do not change it without a decision; the build emits the Vercel
  Build Output API layout in `.vercel/output/`.
- **The "12 micro-tools a year" strategy** is not applicable — this is one
  product, not a portfolio. Ignore it.

## Advertising — a decision, not an implementation

If AdSense is the goal, place ads **only** on public content routes (syllabus
map, PYQ browser, marketing pages). Never on `/cbt` during an attempt, never on
the result page, and never in the focus timer. A student sitting a timed mock
exam must not see an ad. Implementing ad slots is a product decision — ask
before adding them, and if they are added, keep them out of every timed
surface.

## Definition of done

- `curl -s --compressed http://localhost:8080/app/pyq` contains real question
  text, not "Loading papers".
- Every route sets its own title and description; no two routes share a title.
- `sitemap.xml` is generated at build time and referenced from `robots.txt`.
- JSON-LD validates on the syllabus and PYQ routes.
- `/privacy`, `/terms` and `/about` exist, are linked from every footer, and
  state accurately what is stored where.
- A 500 page renders.
- The gate stays green: `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors,
  `npx vitest run` all passing, `npm run validate:all` exit 0,
  `npm run build` exit 0.
- `npm run preview` builds with `node-server` and serves the real production
  bundle; verify routes return 200 against it, not just against the dev server.
```

---

## What I verified, and how

| Claim                      | Evidence                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Content is client-rendered | `curl -s --compressed http://localhost:8080/app/pyq` returns `PYQ Papers` + `Loading papers`, no question text |
| No per-route meta          | `grep -c "head:\|meta:" src/routes/app.*.tsx` → 0 for all 18 routes                                            |
| No sitemap                 | `ls public/sitemap*.xml` → absent; `robots.txt` present and permissive                                         |
| No structured data         | `grep -rn "ld+json\|schema.org" src/ public/` → no matches                                                     |
| No legal pages             | `ls src/routes/ \| grep -i "privacy\|terms\|about"` → absent                                                   |
| No 500 page                | no error route; 404 exists in `__root.tsx`                                                                     |
| 455 KB gzipped JS          | measured across 87 files in `.vercel/output/static/assets/`                                                    |
| 695 tests / 40 suites      | `npx vitest run` on `0bb4e69`                                                                                  |

## The one thing to do first

If you do nothing else from this prompt, do **gap 1**. Server-rendering the
syllabus map and PYQ list is what turns a private practice tool into something
Google can send students to. Everything else — metadata, sitemap, schema, legal
pages — amplifies content that is currently not in the HTML at all.
