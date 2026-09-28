/**
 * Authentication contracts.
 *
 * NTACBT is local-first: a student's progress lives on the device and must
 * remain reachable with no account at all. An account is therefore an
 * *optional* layer that adds cross-device sync — never a gate in front of the
 * product.
 */

export type UserRole = "student" | "admin" | "instructor";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

/**
 * Which backend satisfied the request. `local` is the default and always
 * available; `supabase` is only used when the public env vars are configured.
 */
export type AuthProvider = "local" | "supabase";

/** Normalised error shape — services never throw raw axios/fetch errors. */
export interface AuthError {
  code:
    | "invalid_credentials"
    | "email_taken"
    | "weak_password"
    | "network"
    | "not_configured"
    | "unknown";
  message: string;
}
