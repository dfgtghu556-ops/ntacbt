/**
 * Client-side auth state.
 *
 * zustand + `persist` so a signed-in student stays signed in across reloads
 * without a server round-trip. The store deliberately holds **no academic
 * data** — progress lives in the legacy blob / IndexedDB and is untouched by
 * signing in or out.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/config/constants";
import type { AuthState, AuthResponse, LoginCredentials, RegisterData } from "@/types/auth.types";
import { authService, authErrorMessage } from "@/services/auth.service";

interface AuthStore extends AuthState {
  /** Last error message, cleared on the next attempt. */
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  /** Rehydrate a persisted session on boot. */
  restore: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response: AuthResponse = await authService.login(credentials);
          set({
            user: response.user,
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return true;
        } catch (error) {
          set({ isLoading: false, error: authErrorMessage(error) });
          return false;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.register(data);
          set({
            user: response.user,
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return true;
        } catch (error) {
          set({ isLoading: false, error: authErrorMessage(error) });
          return false;
        }
      },

      logout: async () => {
        await authService.logout();
        // Progress is never cleared here — only the identity.
        set({ user: null, token: null, isAuthenticated: false, isLoading: false, error: null });
      },

      restore: async () => {
        set({ isLoading: true });
        const session = await authService.getCurrentUser();
        if (session) {
          set({
            user: session.user,
            token: session.token,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          set({ isLoading: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: STORAGE_KEYS.AUTH,
      // Only the identity is persisted; transient flags are re-derived on boot.
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

/** Selector helpers — keeps components off raw store internals. */
export const selectUser = (state: AuthStore) => state.user;
export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated;
