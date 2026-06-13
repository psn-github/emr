import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

// Pre-operative assessment validation (pure, 100%). ASA physical-status grade is
// 1–6; Mallampati airway class is 1–4; fasting must be confirmed and a consent
// reference captured before surgery (docs/01 §E7). These gate a safe pre-op record.

export interface PreOpInput {
  readonly mallampatiClass: number;
  readonly asaGrade: number;
  readonly fastingConfirmed: boolean;
  readonly consentRef: string;
}

export function validatePreOp(input: PreOpInput): Result<void, AppError> {
  if (!Number.isInteger(input.asaGrade) || input.asaGrade < 1 || input.asaGrade > 6) {
    return err(validationError("ASA grade must be an integer 1–6", "perioperative.preop.bad_asa"));
  }
  if (!Number.isInteger(input.mallampatiClass) || input.mallampatiClass < 1 || input.mallampatiClass > 4) {
    return err(validationError("Mallampati class must be an integer 1–4", "perioperative.preop.bad_airway"));
  }
  if (!input.fastingConfirmed) {
    return err(validationError("fasting status must be confirmed before surgery", "perioperative.preop.fasting_unconfirmed"));
  }
  if (input.consentRef.trim() === "") {
    return err(validationError("a surgical/anaesthetic consent reference is required", "perioperative.preop.consent_required"));
  }
  return ok(undefined);
}
