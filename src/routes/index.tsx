import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eklavya JEE Main CBT Platform | Offline Mock Test Portal" },
      {
        name: "description",
        content:
          "NTA-style JEE Main computer based test platform. Upload Physics, Chemistry and Maths PDFs to auto-generate a 75-question mock test with analytics.",
      },
      { property: "og:title", content: "Eklavya JEE Main CBT Platform | Offline Mock Test Portal" },
      {
        property: "og:description",
        content:
          "NTA-style JEE Main computer based test platform. Upload Physics, Chemistry and Maths PDFs to auto-generate a 75-question mock test with analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/** The whole app is a standalone single HTML file served from /jee-cbt.html. */
function Index() {
  useEffect(() => {
    window.location.replace("/jee-cbt.html");
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground">Eklavya JEE Main CBT Platform</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Opening the exam portal… <a href="/jee-cbt.html">Click here</a> if it doesn't load.
        </p>
      </div>
    </main>
  );
}
