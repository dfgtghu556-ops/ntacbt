import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NTACBT | JEE & CBSE Learning OS" },
      {
        name: "description",
        content:
          "Adaptive JEE Main & CBSE learning OS: planner, StudyTube, PYQ practice, NTA-style CBT, analytics, focus and AI tutoring.",
      },
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
    ],
  }),
  component: Index,
});

/** Entry point for the legacy full platform; the React Learning OS stays available. */
function Index() {
  useEffect(() => {
    window.location.replace("/jee-cbt.html");
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground">
          NTACBT — JEE &amp; CBSE Learning OS
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Opening the full platform… <a href="/jee-cbt.html">Click here</a> if it doesn't load. The
          new Learning OS is at <a href="/app">/app</a>.
        </p>
      </div>
    </main>
  );
}
