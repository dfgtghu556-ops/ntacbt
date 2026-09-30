/**
 * Profile / identity surface.
 *
 * Shows who the device thinks you are, which auth provider is live, and offers
 * sign-in / sign-out. Progress is explicitly listed as device-local and is
 * never touched by signing out.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { CloudOff, LogIn, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/features/auth/hooks";
import { BackupPanel } from "@/features/backup/BackupPanel";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { socialMeta } from "@/config/site";

export const Route = createFileRoute("/app/profile")({
  head: () => ({
    meta: [
      { title: "Your JEE Profile — Exam, Class and Daily Study Target" },
      {
        name: "description",
        content:
          "Set your exam, class and daily study target once, and every surface adapts to your scope.",
      },

      // Open Graph + Twitter + canonical. Without this every route inherits
      // the root card, so sharing this page previews the root title.
      ...socialMeta(
        "Your Study Profile",
        "Set your exam target, class, subjects and daily study goal.",
        "/app/profile",
      ),
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const provider = authService.provider();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your identity on this device, and how your data is stored.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserRound className="h-5 w-5" />
            {isAuthenticated ? (user?.name ?? "Signed in") : "Not signed in"}
          </CardTitle>
          <CardDescription>
            {isAuthenticated
              ? `${user?.email} · ${user?.role}`
              : "You are using NTACBT without an account. Everything still works."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-0.5 font-medium">{isAuthenticated ? "Signed in" : "Guest"}</dd>
            </div>
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">Account provider</dt>
              <dd className="mt-0.5 font-medium">
                {provider === "supabase" ? "Cloud (Supabase)" : "This device only"}
              </dd>
            </div>
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 font-medium">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
              </dd>
            </div>
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">Device id</dt>
              <dd className="mt-0.5 font-mono text-xs">{user?.id ?? "—"}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            {isAuthenticated ? (
              <Button variant="outline" onClick={() => void logout()} disabled={isLoading}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Button>
            ) : (
              <>
                <Button asChild>
                  <Link to="/app/auth/login">
                    <LogIn className="mr-2 h-4 w-4" /> Sign in
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/app/auth/register">Create account</Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" /> Where your preparation lives
          </CardTitle>
          <CardDescription>Stated plainly, because trust is a feature.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Tests, answers, planner progress, focus sessions and watch history are stored in this
            browser. Signing out — or never signing in at all — does not delete any of it.
          </p>
          <p className="flex items-center gap-2">
            <CloudOff className="h-4 w-4" />
            {provider === "supabase"
              ? "A cloud backend is configured, so an account can sync your test library."
              : "No cloud backend is configured, so nothing leaves this device."}
          </p>
        </CardContent>
      </Card>

      {/*
        Sits directly under "where your preparation lives" because that card
        states the limitation and this one is the answer to it.
      */}
      <BackupPanel />
    </div>
  );
}
