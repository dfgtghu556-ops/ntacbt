/**
 * Registration.
 *
 * Validation is intentionally explicit (not delegated to a resolver) so the
 * exact rule that failed is visible in the UI and testable without a DOM.
 */
import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/features/auth/hooks";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { socialMeta } from "@/config/site";

export const Route = createFileRoute("/app/auth/register")({
  head: () => ({
    meta: [
      { title: "Create your NTACBT account" },
      {
        name: "description",
        content:
          "Create an NTACBT account to sync your JEE practice across devices. Everything works without one too.",
      },

      // Open Graph + Twitter + canonical. Without this every route inherits
      // the root card, so sharing this page previews the root title.
      ...socialMeta(
        "Create an account — NTACBT",
        "Create a free NTACBT account to sync your practice history.",
        "/app/auth/register",
      ),
    ],
  }),
  component: RegisterPage,
});

/** Pure, exported so the unit tests can exercise every rule directly. */
export function validateRegister(input: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.name.trim().length < 2) errors["name"] = "Name must be at least 2 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors["email"] = "Enter a valid email address.";
  }
  if (input.password.length < 6) errors["password"] = "Password must be at least 6 characters.";
  if (input.password !== input.confirmPassword) {
    errors["confirmPassword"] = "Passwords do not match.";
  }
  return errors;
}

function RegisterPage() {
  const navigate = useNavigate();
  const { register, error, clearError, isLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    const found = validateRegister({ name, email, password, confirmPassword });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const ok = await register({ name, email, password, confirmPassword });
    if (ok) void navigate({ to: "/app/profile" });
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Two minutes now, one less thing to think about later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sign up</CardTitle>
          <CardDescription>
            {authService.provider() === "supabase"
              ? "Your account syncs across devices."
              : "No account needed to study — this just remembers this device."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="register-name" className="text-sm font-medium">
                Full name
              </label>
              <Input
                id="register-name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              {errors["name"] ? <FieldError message={errors["name"]} /> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="register-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="register-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {errors["email"] ? <FieldError message={errors["email"]} /> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="register-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="register-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {errors["password"] ? <FieldError message={errors["password"]} /> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="register-confirm" className="text-sm font-medium">
                Confirm password
              </label>
              <Input
                id="register-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {errors["confirmPassword"] ? (
                <FieldError message={errors["confirmPassword"]} />
              ) : null}
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" /> Create account
                </>
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/app/auth/login" className="font-medium text-primary hover:underline">
              Sign in
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

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
