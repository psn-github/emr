import type { Clock, Result } from "@oxford/core";
import type { ChainBreak } from "./chain.js";

/** Anything that can verify its own hash chain (AuditLog, DomainEventLog). */
export interface VerifiableChain {
  verifyIntegrity(): Promise<Result<void, ChainBreak>>;
}

export interface ChainIntegrityResult {
  readonly name: string;
  readonly ok: boolean;
  readonly break: ChainBreak | null;
}

export interface IntegrityReport {
  readonly checkedAt: string;
  readonly ok: boolean;
  readonly results: readonly ChainIntegrityResult[];
}

/**
 * The scheduled audit hash-chain integrity check (CLAUDE.md testing bar:
 * "A scheduled job verifies audit hash-chain integrity"). Wired to a BullMQ
 * cron in apps/api (ADR-0010); here it is a pure, testable function. A non-ok
 * report is a sev-1 tamper signal and must alert.
 */
export async function runChainIntegrityCheck(
  clock: Clock,
  chains: Readonly<Record<string, VerifiableChain>>,
): Promise<IntegrityReport> {
  const results: ChainIntegrityResult[] = [];
  for (const [name, chain] of Object.entries(chains)) {
    const result = await chain.verifyIntegrity();
    results.push({
      name,
      ok: result.ok,
      break: result.ok ? null : result.error,
    });
  }
  return {
    checkedAt: clock.now().toISOString(),
    ok: results.every((r) => r.ok),
    results,
  };
}
