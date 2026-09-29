/**
 * Application errors carry a stable code, an HTTP status and a message that is
 * safe to show to users. Internal details never leave the server (PRD §73).
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "FORM_CLOSED"
  | "LINK_EXPIRED"
  | "RESPONSE_LIMIT_REACHED"
  | "DUPLICATE_SUBMISSION"
  | "AI_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;

  constructor(code: ErrorCode, message: string, status: number, fields?: FieldErrors) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  constructor(fields: FieldErrors, message = "Please correct the highlighted fields.") {
    super("VALIDATION_ERROR", message, 400, fields);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in.") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Resource") {
    super("NOT_FOUND", `${what} not found.`, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
    this.name = "ConflictError";
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Shape shared by Server Actions and Route Handlers. */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string; fields?: FieldErrors } };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail(err: unknown): ActionResult<never> {
  if (isAppError(err)) {
    return {
      success: false,
      error: { code: err.code, message: err.message, fields: err.fields },
    };
  }
  // Never leak internals to the browser.
  console.error("[unhandled]", err);
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  };
}

/** Wrap a Server Action body so every failure becomes a structured result. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
}
