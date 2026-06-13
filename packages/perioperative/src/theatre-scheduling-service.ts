import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, notFound } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { TheatreCase, TheatreCaseId } from "./types.js";
import type { TheatreCaseStore } from "./theatre-store.js";
import type { SchedulingPort } from "./ports.js";
import { bedReservationStatus, type BedReservationStatus } from "./bed-reservation.js";
import { theatreUtilisation, type TheatreUtilisation } from "./analytics.js";

export interface ScheduleCaseInput {
  readonly typeId: string;
  readonly patientId: string;
  readonly encounterId?: string;
  readonly procedure: string;
  readonly theatreResourceId: string;
  readonly surgeonResourceId: string;
  readonly supportResourceIds?: readonly string[];
  readonly equipment?: readonly string[];
  readonly scheduledDate: string;
  readonly start: string;
  readonly end: string;
}

export interface ScheduleCaseResult {
  readonly theatreCase: TheatreCase;
  /** The day's provisional L2 bed reservation after this case. */
  readonly bedReservation: BedReservationStatus;
}

/**
 * Two-theatre case scheduling. Books the theatre + staff on the SHARED resource
 * calendar via the scheduling seam (conflict-aware — a clash is rejected), then
 * provisionally reserves an L2 bed for the case's day and flags when the day's
 * list would exceed the L2 bed count (docs/01 §E7). The flag is a warning, not a
 * block.
 */
export class TheatreSchedulingService {
  constructor(
    private readonly store: TheatreCaseStore,
    private readonly scheduling: SchedulingPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly l2BedCapacity: number,
  ) {}

  async scheduleCase(actorId: string, input: ScheduleCaseInput): Promise<Result<ScheduleCaseResult, AppError>> {
    const support = input.supportResourceIds ?? [];
    const booked = await this.scheduling.bookTheatreSlot(actorId, {
      typeId: input.typeId,
      patientId: input.patientId,
      surgeonResourceId: input.surgeonResourceId,
      resourceIds: [input.theatreResourceId, ...support],
      start: input.start,
      end: input.end,
    });
    if (!booked.ok) return err(booked.error); // conflict on the shared calendar

    const theatreCase: TheatreCase = {
      id: newId<"TheatreCase">(),
      patientId: input.patientId,
      encounterId: input.encounterId ?? null,
      procedure: input.procedure,
      theatreResourceId: input.theatreResourceId,
      surgeonResourceId: input.surgeonResourceId,
      supportResourceIds: support,
      equipment: input.equipment ?? [],
      scheduledDate: input.scheduledDate,
      start: input.start,
      end: input.end,
      status: "scheduled",
      appointmentRef: booked.value.appointmentId,
    };
    await this.store.save(theatreCase);

    const reservation = bedReservationStatus((await this.store.scheduledForDate(input.scheduledDate)).length, this.l2BedCapacity);
    await this.audit.record({ actorId, entityType: "TheatreCase", entityId: theatreCase.id, action: "CREATE", after: { theatre: input.theatreResourceId, scheduledDate: input.scheduledDate } });
    await this.events.emit({ type: "TheatreCaseScheduled", aggregateType: "TheatreCase", aggregateId: theatreCase.id, data: { scheduledDate: input.scheduledDate } });
    if (reservation.exceedsBeds) {
      await this.events.emit({ type: "TheatreListExceedsBeds", aggregateType: "Facility", aggregateId: input.scheduledDate, data: { reserved: reservation.reserved, capacity: reservation.capacity } });
    }
    return ok({ theatreCase, bedReservation: reservation });
  }

  async cancelCase(actorId: string, caseId: TheatreCaseId, reason: string): Promise<Result<TheatreCase, AppError>> {
    const existing = await this.store.get(caseId);
    if (existing === undefined) return err(notFound("theatre case not found", "perioperative.case.not_found"));
    const cancelled: TheatreCase = { ...existing, status: "cancelled" };
    await this.store.save(cancelled);
    await this.audit.record({ actorId, entityType: "TheatreCase", entityId: caseId, action: "UPDATE", before: { status: existing.status }, after: { status: "cancelled", reason } });
    await this.events.emit({ type: "TheatreCaseCancelled", aggregateType: "TheatreCase", aggregateId: caseId, data: { reason } });
    return ok(cancelled);
  }

  /** The day's list + its provisional bed reservation status. */
  async dayList(scheduledDate: string): Promise<{ cases: readonly TheatreCase[]; bedReservation: BedReservationStatus }> {
    const cases = await this.store.scheduledForDate(scheduledDate);
    return { cases, bedReservation: bedReservationStatus(cases.length, this.l2BedCapacity) };
  }

  /** Utilisation + turnaround analytics for one theatre on a day (docs/01 §E7 P1). */
  async utilisation(theatreResourceId: string, scheduledDate: string, availableMinutes: number): Promise<TheatreUtilisation> {
    const cases = (await this.store.scheduledForDate(scheduledDate)).filter((c) => c.theatreResourceId === theatreResourceId);
    return theatreUtilisation(cases, availableMinutes);
  }
}
