import type { Result } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";
import type { CycleStatus } from "./types.js";

// Cycle status lifecycle. Supports both treatment (…→fertilisation→…→transfer→
// luteal→outcome) and preservation (retrieval→outcome, freeze handled in
// cryostore). Any active state can be cancelled (reason captured for KPIs).
const ALLOWED: Record<CycleStatus, readonly CycleStatus[]> = {
  planned: ["stimulating", "cancelled"],
  stimulating: ["triggered", "cancelled"],
  triggered: ["retrieval", "cancelled"],
  retrieval: ["fertilisation", "outcome", "cancelled"],
  fertilisation: ["culture", "cancelled"],
  culture: ["transfer", "cancelled"],
  transfer: ["luteal", "cancelled"],
  luteal: ["outcome", "cancelled"],
  outcome: [],
  cancelled: [],
};

export function canAdvance(from: CycleStatus, to: CycleStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertAdvance(from: CycleStatus, to: CycleStatus): Result<void, ReturnType<typeof validationError>> {
  if (!canAdvance(from, to)) {
    return err(validationError(`illegal cycle transition ${from} → ${to}`, "fertility.bad_transition"));
  }
  return ok(undefined);
}
