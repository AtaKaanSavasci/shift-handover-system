import type { Message } from "./types";
export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export const aborted = () => new DOMException("Session changed", "AbortError");
export const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";
export function errorMessage(error: unknown): Message {
  return error instanceof ApiError ? { api: error.code, error: true } : { text: error instanceof Error ? error.message : "", key: error instanceof Error && error.message ? undefined : "failed", error: true };
}
