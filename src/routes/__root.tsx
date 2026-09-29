import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * The 500 page.
 *
 * The boundary already existed and already did the right things — log, report,
 * offer a retry — but it rendered HTTP 200. A server that answers a crash with
 * "200 OK" is lying to every monitor watching it, and it tells a student's
 * browser the page loaded correctly, so a broken page can sit in a cache looking
 * healthy. Setting the status is the difference between an error boundary and a
 * 500 page.
 *
 * It is set in an effect rather than during render because the boundary also
 * renders on the client, and calling `setResponseStatus` while rendering is not
 * safe. On a client-side failure there is no response to set and the call is a
 * no-op, which is the correct behaviour there.
 */
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    // The tab title on a failed render.
    //
    // The status code is already right — a throwing route loader returns HTTP
    // 500, verified against the production build. But the `<title>` keeps
    // whatever the route set, because the head was rendered before the error
    // surfaced. So a crashed page's tab reads "Focus Timer for JEE
    // Preparation", which tells a student the page loaded and is merely broken
    // rather than that the request failed.
    //
    // `document.title` is the right tool here precisely because the error can
    // arrive after hydration: this runs on both the server pass and on any
    // client navigation that fails, and there is no server response to set at
    // that point.
    document.title = "Something went wrong — NTACBT";
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NTACBT | JEE & CBSE Learning OS" },
      {
        name: "description",
        content:
          "Adaptive JEE Main & CBSE learning OS: planner, StudyTube, PYQ practice, NTA-style CBT, analytics, focus and AI tutoring.",
      },
      { name: "author", content: "NTACBT" },
      {
        property: "og:title",
        content: "NTACBT | JEE & CBSE Learning OS",
      },
      {
        property: "og:description",
        content:
          "Adaptive JEE Main & CBSE learning OS: planner, StudyTube, PYQ practice, NTA-style CBT, analytics, focus and AI tutoring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      {
        name: "twitter:title",
        content: "NTACBT | JEE & CBSE Learning OS",
      },
      {
        name: "twitter:description",
        content:
          "Adaptive JEE Main & CBSE learning OS: planner, StudyTube, PYQ practice, NTA-style CBT, analytics, focus and AI tutoring.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/84a87eb0-1c9d-44bc-b9ff-278acebbcdb8",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/84a87eb0-1c9d-44bc-b9ff-278acebbcdb8",
      },
      { name: "theme-color", content: "#2563eb" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    scripts: [
      // Structured data. Without it a search result is a blue link; with it the
      // site can appear as an organisation, a sitelinks search box, and — on the
      // content routes — as learning resources. Nothing here claims anything
      // the app does not do: the feature list is the shipped one.
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://ntacbt.vercel.app/#organization",
              name: "NTACBT",
              url: "https://ntacbt.vercel.app",
              description:
                "A JEE Main and CBSE practice platform: previous-year papers, an adaptive planner, spaced repetition, focus sessions and honest progress analytics.",
            },
            {
              "@type": "WebSite",
              "@id": "https://ntacbt.vercel.app/#website",
              url: "https://ntacbt.vercel.app",
              name: "NTACBT",
              publisher: { "@id": "https://ntacbt.vercel.app/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: "https://ntacbt.vercel.app/app/search?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
            },
            {
              "@type": "WebApplication",
              name: "NTACBT",
              applicationCategory: "EducationalApplication",
              operatingSystem: "Any",
              offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
              featureList: [
                "JEE Main previous-year papers with worked solutions",
                "NTA-style computer-based test runner",
                "Adaptive daily study planner",
                "CBSE Class 11 and 12 syllabus map",
                "Spaced repetition revision cards",
                "Focus timer",
                "Progress analytics",
              ],
            },
          ],
        }),
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://i.ytimg.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://www.youtube.com" },
      { rel: "preconnect", href: "https://www.youtube-nocookie.com" },
      { rel: "dns-prefetch", href: "https://i.ytimg.com" },
      { rel: "dns-prefetch", href: "https://www.youtube.com" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is best-effort; never break the app over it.
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {/* Mounted once here rather than per route. `sonner` was already a
          dependency and `components/ui/sonner.tsx` already existed, but nothing
          rendered it and nothing called `toast()` - so a failed save or a copied
          link produced no feedback at all. Inline "Watch later" labels were the
          only confirmation anywhere in the app. */}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
