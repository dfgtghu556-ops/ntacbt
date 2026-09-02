import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cloud-config")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

        if (!url || !publishableKey) {
          return Response.json({ error: "Cloud configuration unavailable" }, { status: 503 });
        }

        return Response.json(
          { url, publishableKey },
          { headers: { "cache-control": "public, max-age=300" } },
        );
      },
    },
  },
});
