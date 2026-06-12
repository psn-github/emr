import type { Clock } from "@oxford/core";
import { runChainIntegrityCheck, type IntegrityReport, type VerifiableChain } from "@oxford/audit";

// The scheduled audit hash-chain integrity check (CLAUDE.md testing bar:
// "A scheduled job verifies audit hash-chain integrity"). The job is a pure
// function; the transport is pluggable. Production uses BullMQ on Redis
// (ADR-0010); the in-process IntervalScheduler covers dev/single-node.

export interface Scheduler {
  scheduleRecurring(name: string, intervalMs: number, job: () => Promise<void>): void;
  stop(): void;
}

export class IntervalScheduler implements Scheduler {
  private readonly timers: NodeJS.Timeout[] = [];

  scheduleRecurring(_name: string, intervalMs: number, job: () => Promise<void>): void {
    const timer = setInterval(() => {
      void job();
    }, intervalMs);
    // Don't keep the process alive solely for this timer.
    if (typeof timer.unref === "function") timer.unref();
    this.timers.push(timer);
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers.length = 0;
  }
}

/** Build the chain-integrity job. A non-ok report is a sev-1 tamper signal. */
export function chainIntegrityJob(
  clock: Clock,
  chains: Readonly<Record<string, VerifiableChain>>,
  onReport: (report: IntegrityReport) => void,
): () => Promise<void> {
  return async () => {
    onReport(await runChainIntegrityCheck(clock, chains));
  };
}
