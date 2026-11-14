import type { ActionResult, AppErrorCode } from "@/lib/domain/types";

/** Typed application error. Services throw these; actions/route handlers translate them. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  INTEGRATION: 502,
  INTERNAL: 500,
};

export const forbidden = (message = "You do not have access to this resource.") =>
  new AppError("FORBIDDEN", message);
export const notFound = (message = "Not found.") => new AppError("NOT_FOUND", message);
export const unauthenticated = (message = "Please sign in.") =>
  new AppError("UNAUTHENTICATED", message);
export const validationError = (message: string) => new AppError("VALIDATION", message);
export const conflict = (message: string) => new AppError("CONFLICT", message);
export const integrationError = (message: string) => new AppError("INTEGRATION", message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Convert any thrown value into a safe ActionResult failure (never leaks stack traces). */
export function toActionError(error: unknown): { ok: false; error: string; code: AppErrorCode } {
  if (isAppError(error)) return { ok: false, error: error.message, code: error.code };
  console.error("[DoctorLoop] Unexpected error:", error);
  return { ok: false, error: "Something went wrong. Please try again.", code: "INTERNAL" };
}

/** Run an async function and wrap the outcome in an ActionResult. */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    // Let Next.js redirect()/notFound() control-flow errors propagate.
    if (isNextControlFlowError(error)) throw error;
    return toActionError(error);
  }
}

function isNextControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = String((error as { digest: unknown }).digest);
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND";
}
