/**
 * PAGINATION (Phase 6 — performance)
 *
 * The rebuild plan asks for "virtualized lists, lazy dataset loading,
 * pagination". The PYQ browser is the clearest case: it loads the full
 * historical library, which can be hundreds of papers, and rendering every one
 * on a low-end phone means hundreds of buttons and hundreds of layout passes
 * before the page is interactive. On the connectivity and hardware the research
 * doc targets, that is the difference between usable and not.
 *
 * **Why a window rather than full virtualization.** Virtualization needs a
 * scroll container with a known height and a measured row size, which a card
 * grid with wrapping text does not have. A page window has neither requirement,
 * degrades to "load more" semantics if the caller wants, and keeps every card
 * reachable by keyboard. For a few hundred items the window is the simpler and
 * more robust answer.
 *
 * **Clamping, not erroring.** A page number past the end returns the last page
 * rather than an empty list, so a stale deep link or a shrunk dataset never
 * shows a blank grid with no explanation.
 */

export interface Page<T> {
  items: T[];
  /** The page actually returned, after clamping. */
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  /** The 1-based index of the first item on this page. */
  from: number;
  /** The 1-based index of the last item on this page. */
  to: number;
}

export interface PaginateOptions {
  page?: number;
  pageSize?: number;
}

/** A safe page size. A zero or negative one would make the maths degenerate. */
function safePageSize(n: number | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 24;
  return Math.max(1, Math.floor(n));
}

/**
 * Slice `items` into a page window.
 *
 * Never throws on malformed input: a non-array yields an empty page, so a bad
 * API response degrades to "nothing here" rather than a blank screen.
 */
export function paginate<T>(items: readonly T[], options: PaginateOptions = {}): Page<T> {
  const list = Array.isArray(items) ? items : [];
  const pageSize = safePageSize(options.pageSize);
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requested =
    typeof options.page === "number" && Number.isFinite(options.page)
      ? Math.floor(options.page)
      : 1;
  // Clamp into [1, totalPages]. A page past the end is the last page.
  const page = Math.min(Math.max(1, requested), totalPages);
  const start = (page - 1) * pageSize;
  const slice = list.slice(start, start + pageSize);

  return {
    items: slice,
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    from: totalItems === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

/**
 * The page buttons to render, with gaps where pages are elided.
 *
 * Always includes the first and last page and a window around the current one,
 * so a student can always jump to the start or the end without stepping through
 * every page. `null` marks an elided gap.
 *
 * **A run of exactly one hidden page is shown, not elided.** Eliding a single
 * page makes it unreachable — there is no way to navigate to page 4 from
 * `1 · 2 · 3 · … · 5` — so a gap marker is only used when two or more pages are
 * hidden.
 */
export function pageWindow(current: number, totalPages: number, span = 2): Array<number | null> {
  const total = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(current)), total);
  const half = Math.max(0, Math.floor(span));
  const out: Array<number | null> = [];

  const first = Math.max(1, cur - half);
  const last = Math.min(total, cur + half);

  // Leading run: pages 2 .. first-1 are hidden between page 1 and the window.
  if (first > 1) {
    out.push(1);
    const hiddenBefore = first - 2;
    if (hiddenBefore >= 2) out.push(null);
    else if (hiddenBefore === 1) out.push(2);
  }

  for (let p = first; p <= last; p++) out.push(p);

  // Trailing run: pages last+1 .. total-1 are hidden between the window and the
  // last page.
  if (last < total) {
    const hiddenAfter = total - 1 - last;
    if (hiddenAfter >= 2) out.push(null);
    else if (hiddenAfter === 1) out.push(total - 1);
    out.push(total);
  }
  return out;
}

/** One honest line for the screen-reader summary of a paged list. */
export function pageSummary<T>(page: Page<T>, noun = "items"): string {
  if (page.totalItems === 0) return `No ${noun}.`;
  return `Showing ${page.from} to ${page.to} of ${page.totalItems} ${noun}.`;
}
