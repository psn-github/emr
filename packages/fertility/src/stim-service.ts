import type { Clock, Result, AppError } from "@oxford/core";
import { ok, err, newId, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import { validateDrugDose } from "./stim-validate.js";
import type { RecordDayInput, StimulationDay } from "./stimulation.js";
import type { StimStore } from "./stim-store.js";

/**
 * Stimulation charting. Records a day's drug doses (validated against the
 * controlled formulary — no free text, positive dose, matching unit), follicle
 * measurements, endometrium, and endocrine values. Audited. Dosing is
 * clinician-entered + validated; the om-software dosing calculator is a follow-on.
 */
export class StimulationService {
  constructor(
    private readonly store: StimStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
  ) {}

  async recordDay(actorId: string, cycleId: string, input: RecordDayInput): Promise<Result<StimulationDay, AppError>> {
    if (!Number.isInteger(input.day) || input.day < 1) {
      return err(validationError("stimulation day must be a positive integer", "fertility.stim.bad_day"));
    }
    for (const drug of input.drugs) {
      const valid = validateDrugDose(drug);
      if (!valid.ok) return err(valid.error);
    }
    const day: StimulationDay = {
      id: newId<"StimulationDay">(),
      cycleId,
      day: input.day,
      drugs: input.drugs,
      follicles: input.follicles ?? [],
      endometriumMm: input.endometriumMm ?? null,
      endocrine: input.endocrine ?? {},
      recordedBy: actorId,
      at: this.clock.now().toISOString(),
    };
    await this.store.saveDay(day);
    await this.audit.record({ actorId, entityType: "StimulationDay", entityId: `${cycleId}:${input.day}`, action: "CREATE", after: { day: input.day, drugCount: input.drugs.length } });
    await this.events.emit({ type: "StimDayRecorded", aggregateType: "Cycle", aggregateId: cycleId, data: { day: input.day } });
    return ok(day);
  }

  chart(cycleId: string): Promise<readonly StimulationDay[]> {
    return this.store.daysForCycle(cycleId);
  }
}
