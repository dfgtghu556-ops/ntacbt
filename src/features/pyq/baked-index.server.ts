/**
 * Reading the baked PYQ index from the server, in a way that works in
 * production.
 *
 * ## The bug this fixes
 *
 * `src/routes/app.pyq.tsx` and `src/routes/about.tsx` both read the baked
 * index with:
 *
 * ```ts
 * readFileSync(join(process.cwd(), "public", "pyq", "index.json"), "utf8")
 * ```
 *
 * That works in dev, and it works in a local `node .output/server/index.mjs`
 * run from the repository root — which is exactly where it was tested, which
 * is exactly why the defect survived.
 *
 * It does **not** work on a real deployment. Measured against the Vercel
 * build output:
 *
 * - `.vercel/output/static/pyq/` exists — the baked index is served from the
 *   CDN at `/pyq/index.json`.
 * - `.vercel/output/functions/__server.func/` contains **no** `public/`
 *   directory. The function bundle is the server code and its dependencies;
 *   the static assets live beside it, not inside it.
 *
 * So on a deployed build `process.cwd()/public/pyq/index.json` does not
 * exist, the read throws, the server function returns an empty list, and the
 * page renders a spinner where the paper list should be. The live site
 * served exactly that: the heading, the text "Loading papers", and none of
 * the papers.
 *
 * ## The three ways to get the same bytes
 *
 * 1. **The filesystem** — dev, and any run started from the repository root.
 * 2. **The build output directory** — a `node .output/server/index.mjs`
 *    started from anywhere else, where Nitro has copied `public/` to
 *    `.output/public/`.
 * 3. **Over HTTP, from the site's own origin** — the case that actually
 *    matters. The static asset is served by the CDN at a known path, so
 *    fetching it by URL works whether the bytes live on the CDN or on disk.
 *
 * The result is memoised per process, because the index is a build artifact:
 * it is immutable for the lifetime of a deployment, so re-reading it on every
 * request would be waste. A failed attempt is not cached, so a transient
 * failure is not remembered as "the library is empty" for the rest of the
 * process's life.
 */

/** The shape both callers need — the paper metadata list. */
export interface BakedPaperMeta {
  id: string;
  year: number;
  month: string;
  label: string;
  total: number;
  counts: { Physics: number; Chemistry: number; Mathematics: number };
  mcq: number;
  integer: number;
}

type IndexFile = { papers?: BakedPaperMeta[]; index?: BakedPaperMeta[] };

/** Memoised per process. `null` means "not resolved yet". */
let cached: BakedPaperMeta[] | null = null;
/** An in-flight build, so concurrent requests do not all read the file. */
let pending: Promise<BakedPaperMeta[]> | null = null;

/**
 * Candidate paths for the baked index, in order.
 *
 * The first is what a dev server or a repo-root run sees. The second is what
 * a `node .output/server/index.mjs` run sees, whether or not it was started
 * from the repository root.
 */
function candidatePaths(): string[] {
  const paths = [
    ["public", "pyq", "index.json"],
    [".output", "public", "pyq", "index.json"],
    [".vercel", "output", "static", "pyq", "index.json"],
  ];
  return paths.map((parts) => parts.join("/"));
}

/** Read the index from disk, trying each known location in turn. */
async function readFromDisk(): Promise<BakedPaperMeta[] | null> {
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const rel of candidatePaths()) {
      const abs = join(process.cwd(), rel);
      if (!existsSync(abs)) continue;
      const raw = readFileSync(abs, "utf8");
      const data = JSON.parse(raw) as IndexFile;
      const papers = data.papers ?? data.index ?? [];
      if (papers.length) return papers;
    }
  } catch {
    /* fall through to the network path */
  }
  return null;
}

/**
 * Read the index over HTTP from the site's own origin.
 *
 * `origin` is the origin of the incoming request when one is known, and the
 * configured `SITE_URL` otherwise. The path `/pyq/index.json` is the same
 * path the browser uses, so this reads the very same bytes the client would.
 */
async function readOverHttp(origin: string): Promise<BakedPaperMeta[] | null> {
  try {
    const res = await fetch(`${origin.replace(/\/$/, "")}/pyq/index.json`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as IndexFile;
    const papers = data.papers ?? data.index ?? [];
    return papers.length ? papers : null;
  } catch {
    return null;
  }
}

/**
 * The baked paper index, or an empty list if it genuinely cannot be read.
 *
 * `requestOrigin` is the origin of the page request being served. It is used
 * to fetch the static asset from the same host the page came from, which is
 * what makes this work behind a CDN and behind a local preview alike.
 */
export async function loadBakedIndex(requestOrigin?: string): Promise<BakedPaperMeta[]> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const fromDisk = await readFromDisk();
    if (fromDisk) {
      cached = fromDisk;
      return fromDisk;
    }

    const { SITE_URL } = await import("@/config/site");
    for (const origin of [requestOrigin, SITE_URL]) {
      if (!origin) continue;
      const overHttp = await readOverHttp(origin);
      if (overHttp) {
        cached = overHttp;
        return overHttp;
      }
    }

    // A missing bake is a normal state before the first build, and a real
    // state when the upstream snapshot cannot be reached at build time.
    // Returning nothing is honest; inventing a count is not.
    return [];
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/**
 * The origin of the request being served, when it can be determined.
 *
 * The server function's context carries the incoming `Request`, and during
 * SSR that is the *page* request — measured, not assumed: a request to
 * `/app/pyq` arrives with `request.url` set to
 * `http://127.0.0.1:3000/app/pyq` in a local production build. Its origin is
 * therefore the origin the static asset is served from, which is exactly what
 * the HTTP fallback needs.
 *
 * A `localhost` origin is kept rather than discarded. It is the correct
 * origin for a local production build and for `npm run dev`; on a hosted
 * platform the request URL is the public URL, so the same code is correct
 * there too. If a platform ever rewrites the URL to an internal address, the
 * fetch from it fails fast and the caller's `SITE_URL` fallback takes over.
 */
export function originFromContext(ctx: unknown): string | undefined {
  const request = (ctx as { request?: Request } | undefined)?.request;
  if (!request || typeof request.url !== "string") return undefined;
  try {
    const url = new URL(request.url);
    if (!url.hostname) return undefined;
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
