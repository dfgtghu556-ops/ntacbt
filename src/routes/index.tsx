import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NTACBT | JEE & CBSE CBT Platform" },
      {
        name: "description",
        content:
          "NTA-style JEE Main & CBSE computer based test platform with AI planning, StudyTube, PYQ, analytics and revision.",
      },
      {
        property: "og:title",
        content: "NTACBT | JEE & CBSE CBT Platform",
      },
      {
        property: "og:description",
        content:
          "NTA-style JEE Main & CBSE computer based test platform with AI planning, StudyTube, PYQ, analytics and revision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/** Entry point — opens the original orange CBT platform by default. */
function Index() {
  useEffect(() => {
    window.location.replace("/jee-cbt.html");
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-lg font-bold text-white">
          N
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          NTACBT — JEE &amp; CBSE CBT Platform
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Opening the full platform…{" "}
          <a href="/jee-cbt.html" className="text-orange-500 underline">
            Click here
          </a>{" "}
          if it doesn't load. The new Learning OS is at{" "}
          <a href="/app" className="text-orange-500 underline">
            /app
          </a>
          .
        </p>
      </div>
    </main>
  );
}
