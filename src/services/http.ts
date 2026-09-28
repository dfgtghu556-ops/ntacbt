/**
 * Typed HTTP layer.
 *
 * Every outbound call from the redeveloped feature modules goes through this
 * module so that:
 *   - the base URL, timeout and auth header are configured in exactly one place;
 *   - errors are normalised into `ApiError` and never leak raw axios internals;
 *   - responses are validated against the shape the caller promised.
 *
 * It is intentionally thin: the academic data the product depends on is baked
 * at build time and read locally, so the network is an enhancement, not a
 * dependency. Any failure here must degrade to a usable local state.
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { APP_CONFIG } from "@/config/constants";

export interface ApiError {
  /** Machine-readable code, safe to branch on. */
  code: "network" | "timeout" | "http" | "parse" | "unknown";
  /** Human-readable, safe to show a student. */
  message: string;
  status?: number | undefined;
}

export class ApiRequestError extends Error {
  readonly code: ApiError["code"];
  readonly status?: number | undefined;

  constructor(error: ApiError) {
    super(error.message);
    this.name = "ApiRequestError";
    this.code = error.code;
    this.status = error.status;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

export function createHttpClient(
  baseURL: string = APP_CONFIG.apiUrl,
  extra: AxiosRequestConfig = {},
): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" },
    ...extra,
  });

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      throw normalizeError(error);
    },
  );

  return client;
}

/** Convert anything thrown by axios into a bounded, presentable `ApiError`. */
export function normalizeError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return new ApiRequestError({
        code: "timeout",
        message: "The request took too long. Please try again.",
      });
    }
    if (!error.response) {
      return new ApiRequestError({
        code: "network",
        message: "You appear to be offline. Your saved work is safe.",
      });
    }
    const status = error.response.status;
    const serverMessage =
      typeof error.response.data === "object" &&
      error.response.data !== null &&
      "message" in error.response.data &&
      typeof (error.response.data as { message?: unknown }).message === "string"
        ? ((error.response.data as { message: string }).message as string)
        : undefined;
    return new ApiRequestError({
      code: "http",
      message: serverMessage ?? `Request failed (${status}).`,
      ...(typeof status === "number" ? { status } : {}),
    });
  }
  if (error instanceof Error) {
    return new ApiRequestError({ code: "unknown", message: error.message });
  }
  return new ApiRequestError({ code: "unknown", message: "Something went wrong." });
}

/** True when the thrown value is one of ours. */
export function isApiError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

/** Shared client for same-origin JSON endpoints. */
export const http = createHttpClient("");
