// Typed application errors. Domain code returns these inside Result; the API
// layer maps them to transport codes. No PHI in error messages (CLAUDE.md:
// "No PHI in logs, URLs, or analytics events").

export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "PRECONDITION_FAILED"
  | "INTERNAL";

export interface AppErrorShape {
  readonly code: ErrorCode;
  readonly message: string;
  /** Machine-readable, non-PHI detail for clients/i18n (e.g. a translation key). */
  readonly detailKey?: string;
}

export class AppError extends Error implements AppErrorShape {
  readonly code: ErrorCode;
  readonly detailKey?: string;

  constructor(code: ErrorCode, message: string, detailKey?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (detailKey !== undefined) this.detailKey = detailKey;
  }
}

export const validationError = (message: string, detailKey?: string): AppError =>
  new AppError("VALIDATION", message, detailKey);
export const notFound = (message: string, detailKey?: string): AppError =>
  new AppError("NOT_FOUND", message, detailKey);
export const conflict = (message: string, detailKey?: string): AppError =>
  new AppError("CONFLICT", message, detailKey);
export const forbidden = (message: string, detailKey?: string): AppError =>
  new AppError("FORBIDDEN", message, detailKey);
export const unauthenticated = (message: string, detailKey?: string): AppError =>
  new AppError("UNAUTHENTICATED", message, detailKey);
export const preconditionFailed = (message: string, detailKey?: string): AppError =>
  new AppError("PRECONDITION_FAILED", message, detailKey);
