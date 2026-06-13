import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Pure messaging validation. 100% coverage.

const MAX_BODY = 5000;

/** A message body must be non-empty and within the length cap. */
export function validateMessageBody(body: string): Result<void, AppError> {
  if (body.trim() === "") return err(validationError("message body is required", "messaging.body_required"));
  if (body.length > MAX_BODY) return err(validationError("message is too long", "messaging.body_too_long"));
  return ok(undefined);
}

/** A thread subject must be non-empty. */
export function validateSubject(subject: string): Result<void, AppError> {
  if (subject.trim() === "") return err(validationError("a subject is required", "messaging.subject_required"));
  return ok(undefined);
}
