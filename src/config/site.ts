/**
 * The site's public origin.
 *
 * Every absolute URL the app emits — canonical links, Open Graph images, the
 * sitemap, the robots `Sitemap:` directive — comes from here rather than being
 * typed inline. A hardcoded host in one place and a different one in another is
 * how a canonical ends up pointing at the wrong domain, which tells a crawler
 * the page it is reading is not the one it should index.
 *
 * Overridable for a custom domain: set `VITE_SITE_URL` at build time.
 *
 * The default is the host students actually use. It used to be
 * `https://ntacbt.vercel.app`, which was wrong on both counts: that domain
 * serves a different, older build of this app (its `/app/*` routes 404), so
 * every canonical, every `og:url` and all sixteen sitemap entries were
 * pointing a crawler at pages that do not exist there. Keep this and
 * `scripts/build-sitemap.mjs` in step with wherever the app is deployed.
 */

const FALLBACK = "https://ntacbt.lovable.app";

export const SITE_URL = (import.meta.env["VITE_SITE_URL"] || FALLBACK).replace(/\/$/, "");

/**
 * Open Graph and Twitter metadata for a route.
 *
 * The root already had `og:title` and `twitter:card: summary_large_image`, but
 * every route below it inherited that one card — so sharing the syllabus map
 * and sharing the question library produced an identical preview, with the
 * root's title. The image also pointed at a Google Storage URL that no longer
 * resolves (measured: connection refused), so the card was broken outright:
 * `summary_large_image` promising an image that 404s.
 *
 * A shared helper rather than 15 copies of the same five tags, so a route opts
 * in by describing itself and cannot forget the image or the dimensions.
 */
export function socialMeta(
  title: string,
  description: string,
  path: string,
): {
  property?: string;
  name?: string;
  rel?: string;
  href?: string;
  content?: string;
}[] {
  const url = `${SITE_URL}${path}`;
  const image = `${SITE_URL}/og-image.png`;
  return [
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:site_name", content: "NTACBT" },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: `${title} — NTACBT` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: `${title} — NTACBT` },
    { rel: "canonical", href: url },
  ];
}
