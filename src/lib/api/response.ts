import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, isAppError, type FieldErrors } from "./errors";

/** Standard API envelope (PRD §73). */
export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function jsonError(err: unknown) {
  if (isAppError(err)) {
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.message, fields: err.fields } },
      { status: err.status },
    );
  }
  console.error("[api:unhandled]", err);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong." } },
    { status: 500 },
  );
}

/** Route Handler wrapper: converts thrown AppErrors into the standard envelope. */
export function withApi<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      return jsonError(err);
    }
  };
}

/** Flatten a Zod error into { fieldPath: [messages] }. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.map(String).join(".") : "_form";
    (fields[path] ??= []).push(issue.message);
  }
  return fields;
}

/** Parse or throw a ValidationError-compatible AppError. */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Please correct the highlighted fields.",
      400,
      zodFieldErrors(result.error),
    );
  }
  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
  }
}
