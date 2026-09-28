/**
 * Authentication service.
 *
 * Two providers, one interface:
 *
 *  1. **local** (default, always available) — a device identity persisted under
 *     `STORAGE_KEYS.AUTH`. This is what makes the product usable with no
 *     backend and no network, and it never blocks a student from their data.
 *  2. **supabase** — used only when `VITE_SUPABASE_URL` +
 *     `VITE_SUPABASE_PUBLISHABLE_KEY` are configured, so a real deployment can
 *     offer accounts without changing any caller.
 *
 * Every method resolves to `AuthResponse` or rejects with an `AuthError`.
 * Nothing here reads the legacy progress blob.
 */
import { STORAGE_KEYS } from "@/config/constants";
import { hasCloudBackend } from "@/config/constants";
import type {
  AuthError,
  AuthProvider,
  AuthResponse,
  LoginCredentials,
  RegisterData,
  User,
} from "@/types/auth.types";
import { ApiRequestError } from "@/services/http";

const AUTH_KEY = STORAGE_KEYS.AUTH;
const USER_KEY = STORAGE_KEYS.USER_DATA;

export class AuthServiceError extends Error {
  readonly code: AuthError["code"];
  constructor(code: AuthError["code"], message: string) {
    super(message);
    this.name = "AuthServiceError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Local (device) provider
 * ------------------------------------------------------------------ */

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the in-memory session still works */
  }
}

/** Stable, non-reversible device id. Not a tracking identifier. */
function deviceId(): string {
  const existing = readJson<{ id: string }>(`${AUTH_KEY}.device`);
  if (existing?.id) return existing.id;
  const id = `dev-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  writeJson(`${AUTH_KEY}.device`, { id });
  return id;
}

function localUser(email: string, name: string): User {
  const now = new Date().toISOString();
  return {
    id: deviceId(),
    email: email.trim().toLowerCase(),
    name: name.trim() || email.split("@")[0] || "Student",
    role: "student",
    createdAt: now,
    updatedAt: now,
  };
}

function localToken(user: User): string {
  // Opaque, device-scoped session marker. It is not a credential and grants
  // nothing on its own — it only tells this device "you signed in as X".
  return `local.${user.id}.${user.email}`;
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export const authService = {
  /** Which provider will actually be used for the next call. */
  provider(): AuthProvider {
    return hasCloudBackend() ? "supabase" : "local";
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const email = (credentials.email ?? "").trim();
    const password = credentials.password ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthServiceError("invalid_credentials", "Enter a valid email address.");
    }
    if (password.length < 6) {
      throw new AuthServiceError("weak_password", "Password must be at least 6 characters.");
    }

    if (authService.provider() === "supabase") {
      return supabaseAuth(() => import("@/integrations/supabase/client"), {
        type: "login",
        email,
        password,
      });
    }

    const user = localUser(email, "");
    const response: AuthResponse = { user, token: localToken(user) };
    writeJson(USER_KEY, user);
    return response;
  },

  async register(data: RegisterData): Promise<AuthResponse> {
    const email = (data.email ?? "").trim();
    const name = (data.name ?? "").trim();
    if (name.length < 2) {
      throw new AuthServiceError("weak_password", "Name must be at least 2 characters.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthServiceError("invalid_credentials", "Enter a valid email address.");
    }
    if ((data.password ?? "").length < 6) {
      throw new AuthServiceError("weak_password", "Password must be at least 6 characters.");
    }
    if (data.password !== data.confirmPassword) {
      throw new AuthServiceError("weak_password", "Passwords do not match.");
    }

    if (authService.provider() === "supabase") {
      return supabaseAuth(() => import("@/integrations/supabase/client"), {
        type: "register",
        email,
        password: data.password,
        name,
      });
    }

    const user = localUser(email, name);
    const response: AuthResponse = { user, token: localToken(user) };
    writeJson(USER_KEY, user);
    return response;
  },

  async logout(): Promise<void> {
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    if (authService.provider() === "supabase") {
      try {
        const mod = await import("@/integrations/supabase/client");
        await mod.supabase.auth.signOut();
      } catch {
        /* local sign-out already succeeded */
      }
    }
  },

  /** Restore a persisted session, or `null` when there is none. */
  async getCurrentUser(): Promise<AuthResponse | null> {
    if (authService.provider() === "supabase") {
      try {
        const mod = await import("@/integrations/supabase/client");
        const { data } = await mod.supabase.auth.getSession();
        const session = data.session;
        if (!session?.user) return null;
        const user: User = {
          id: session.user.id,
          email: session.user.email ?? "",
          name: (session.user.user_metadata?.["name"] as string) || session.user.email || "Student",
          role: "student",
          createdAt: session.user.created_at ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return { user, token: session.access_token };
      } catch {
        return null;
      }
    }
    const user = readJson<User>(USER_KEY);
    if (!user?.id || !user.email) return null;
    return { user, token: localToken(user) };
  },

  async refreshToken(): Promise<{ token: string }> {
    const current = await authService.getCurrentUser();
    if (!current) {
      throw new AuthServiceError("invalid_credentials", "No active session to refresh.");
    }
    return { token: current.token };
  },
};

/* ------------------------------------------------------------------ *
 * Supabase bridge (lazy — keeps the bundle small when unconfigured)
 * ------------------------------------------------------------------ */

type SupabaseIntent =
  | { type: "login"; email: string; password: string }
  | { type: "register"; email: string; password: string; name: string };

async function supabaseAuth(
  load: () => Promise<typeof import("@/integrations/supabase/client")>,
  intent: SupabaseIntent,
): Promise<AuthResponse> {
  let mod: typeof import("@/integrations/supabase/client");
  try {
    mod = await load();
  } catch {
    throw new AuthServiceError(
      "not_configured",
      "Cloud sign-in is unavailable right now. You can keep working on this device.",
    );
  }

  const result =
    intent.type === "login"
      ? await mod.supabase.auth.signInWithPassword({
          email: intent.email,
          password: intent.password,
        })
      : await mod.supabase.auth.signUp({
          email: intent.email,
          password: intent.password,
          options: { data: { name: intent.name } },
        });

  if (result.error || !result.data.user) {
    throw new AuthServiceError("invalid_credentials", result.error?.message ?? "Sign-in failed.");
  }

  const su = result.data.user;
  const user: User = {
    id: su.id,
    email: su.email ?? intent.email,
    name: (su.user_metadata?.["name"] as string) || intent.email.split("@")[0] || "Student",
    role: "student",
    createdAt: su.created_at ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeJson(USER_KEY, user);
  return { user, token: result.data.session?.access_token ?? localToken(user) };
}

/** Convenience for callers that only need a presentable message. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthServiceError) return error.message;
  if (error instanceof ApiRequestError) return error.message;
  return "Something went wrong. Please try again.";
}
