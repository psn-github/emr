import type { Result, AppError } from "@oxford/core";

// Marriage hard-gate seam. Treatment/embryo-creation cycles require a verified
// `Couple` — but fertility must not import the registry domain (module
// boundaries). The app layer injects a gate wired to registry.canStartFertility.
export interface FertilityGate {
  assertMayTreat(coupleId: string): Promise<Result<void, AppError>>;
}
