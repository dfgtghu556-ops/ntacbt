/**
 * Sign-in.
 *
 * Deliberately *not* a gate: a student who skips this keeps full access to
 * every local feature. Signing in only adds a device identity (and cloud sync
 * when a backend is configured).
 */
import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "@/features/auth/hooks";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/app/auth/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { login, error, clearError, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldError(null);
    clearError();
    const ok = await login({ email, password });
    if (ok) void navigate({ to: "/app/profile" });
    else setFieldError("Check your email and password and try again.");
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to keep your preparation in one place.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>
            {authService.provider() === "supabase"
              ? "Your account syncs across devices."
              : "No account needed to study — this just remembers this device."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {fieldError || error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {fieldError ?? error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" /> Sign in
                </>
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link to="/app/auth/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheck className="h-4 w-4" /> Your data stays yours
        </p>
        <p className="mt-1">
          Tests, planner progress and watch history are stored on this device. Signing out never
          deletes them.
        </p>
      </div>

      <div className="text-center">
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Skip for now <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
