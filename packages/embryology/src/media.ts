import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { MediaApplication } from "./types.js";

// Pure media-lot ↔ embryo traceability logic (docs/01 §E4). Validation of a media
// application and the recall-reachability reduction live here so the safety logic
// is unit-tested to 100%. No IO, no cross-module imports.

export interface MediaApplicationInput {
  readonly cycleId: string;
  readonly embryoId?: string | null;
  readonly oocyteId?: string | null;
  readonly itemId: string;
  readonly lotNo: string;
  readonly step: string;
  readonly quantity: number;
  readonly appliedAt: string;
}

/** A media application must name the media lot, a lab step, a positive whole
 *  quantity, and the subject it touched (an embryo or an oocyte). */
export function validateMediaApplication(input: MediaApplicationInput): Result<void, AppError> {
  if (input.itemId.trim() === "" || input.lotNo.trim() === "") {
    return err(validationError("media item and lot are required", "embryology.media.lot_required"));
  }
  if (input.step.trim() === "") {
    return err(validationError("a lab step is required", "embryology.media.step_required"));
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return err(validationError("quantity must be a positive whole number", "embryology.media.quantity_invalid"));
  }
  if (!hasValue(input.embryoId) && !hasValue(input.oocyteId)) {
    return err(validationError("an embryo or oocyte must be named", "embryology.media.subject_required"));
  }
  return ok(undefined);
}

/** True when an optional id field carries a real (non-empty) value. */
export function hasValue(id: string | null | undefined): boolean {
  return (id ?? "") !== "";
}

export interface RecallReach {
  readonly itemId: string;
  readonly lotNo: string;
  readonly applicationCount: number;
  readonly embryoIds: readonly string[];
  readonly oocyteIds: readonly string[];
  readonly cycleIds: readonly string[];
}

/** Reduce a lot's applications to the distinct embryos/oocytes/cycles exposed —
 *  the blast radius of a media-lot recall. */
export function recallReachability(itemId: string, lotNo: string, apps: readonly MediaApplication[]): RecallReach {
  const embryoIds = new Set<string>();
  const oocyteIds = new Set<string>();
  const cycleIds = new Set<string>();
  for (const a of apps) {
    if (a.embryoId !== null) embryoIds.add(a.embryoId);
    if (a.oocyteId !== null) oocyteIds.add(a.oocyteId);
    cycleIds.add(a.cycleId);
  }
  return { itemId, lotNo, applicationCount: apps.length, embryoIds: [...embryoIds], oocyteIds: [...oocyteIds], cycleIds: [...cycleIds] };
}
