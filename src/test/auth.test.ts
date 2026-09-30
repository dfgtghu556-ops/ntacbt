/**
 * Unit tests for the auth service and the register validator.
 * No backend is configured in tests, so the local device provider is exercised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// The repo ships a real `.env` with Supabase keys, so the service would pick the
// cloud provider. These tests are about the local (default) provider, which is
// what every student without a backend gets — pin it explicitly.
vi.mock("@/config/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/constants")>();
  return {
    ...actual,
    APP_CONFIG: { ...actual.APP_CONFIG, supabaseUrl: "", supabaseKey: "" },
    hasCloudBackend: () => false,
  };
});

const { authService, AuthServiceError } = await import("@/services/auth.service");
const { validateRegister } = await import("@/routes/app.auth.register");
const { STORAGE_KEYS } = await import("@/config/constants");

beforeEach(() => {
  localStorage.clear();
});

describe("validateRegister", () => {
  const base = {
    name: "Aarav Sharma",
    email: "aarav@example.com",
    password: "secret123",
    confirmPassword: "secret123",
  };

  it("accepts a well-formed payload", () => {
    expect(validateRegister(base)).toEqual({});
  });

  it("rejects a one-character name", () => {
    expect(validateRegister({ ...base, name: "A" })["name"]).toBeTruthy();
  });

  it("rejects a malformed email", () => {
    expect(validateRegister({ ...base, email: "not-an-email" })["email"]).toBeTruthy();
  });

  it("rejects a short password", () => {
    expect(validateRegister({ ...base, password: "abc" })["password"]).toBeTruthy();
  });

  it("rejects mismatched confirmation", () => {
    expect(validateRegister({ ...base, confirmPassword: "other" })["confirmPassword"]).toBeTruthy();
  });
});

describe("authService (local provider)", () => {
  it("reports the local provider when no cloud backend is configured", () => {
    expect(authService.provider()).toBe("local");
  });

  it("registers a student and persists the identity", async () => {
    const response = await authService.register({
      name: "Aarav Sharma",
      email: "Aarav@Example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });
    expect(response.user.email).toBe("aarav@example.com");
    expect(response.user.role).toBe("student");
    expect(response.token).toContain(response.user.id);
    expect(localStorage.getItem(STORAGE_KEYS.USER_DATA)).toContain("aarav@example.com");
  });

  it("restores the persisted session", async () => {
    await authService.register({
      name: "Aarav",
      email: "aarav@example.com",
      password: "secret123",
      confirmPassword: "secret123",
    });
    const restored = await authService.getCurrentUser();
    expect(restored?.user.email).toBe("aarav@example.com");
  });

  it("returns null when there is no session", async () => {
    expect(await authService.getCurrentUser()).toBeNull();
  });

  it("rejects a bad email without touching storage", async () => {
    await expect(
      authService.login({ email: "nope", password: "secret123" }),
    ).rejects.toBeInstanceOf(AuthServiceError);
    expect(localStorage.getItem(STORAGE_KEYS.USER_DATA)).toBeNull();
  });

  it("rejects a short password", async () => {
    await expect(
      authService.login({ email: "aarav@example.com", password: "123" }),
    ).rejects.toMatchObject({ code: "weak_password" });
  });

  it("signing out clears the identity but never legacy progress", async () => {
    localStorage.setItem(STORAGE_KEYS.LEGACY_STATE, '{"attempts":[1,2,3]}');
    await authService.login({ email: "aarav@example.com", password: "secret123" });
    expect(localStorage.getItem(STORAGE_KEYS.USER_DATA)).toBeTruthy();
    await authService.logout();
    expect(localStorage.getItem(STORAGE_KEYS.USER_DATA)).toBeNull();
    // The legacy blob is untouched.
    expect(localStorage.getItem(STORAGE_KEYS.LEGACY_STATE)).toBe('{"attempts":[1,2,3]}');
  });
});
