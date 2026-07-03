import type { Result, AppError, Clock } from "@oxford/core";
import { ok, err, newId, asId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type {
  Prescription,
  PrescriptionItem,
  PrescriptionItemInput,
  PrescriptionStatus,
  DispenseAllocation,
  Dispense,
} from "./types.js";
import type { PharmacyStore } from "./store.js";
import type { FormularyPort, AllergyPort, InventoryPort, ControlledRegisterPort } from "./ports.js";
import {
  nextStatus,
  validatePrescriptionItems,
  screenPrescription,
  controlledItems,
  assertColdChainHandled,
  assertWitnessForControlled,
  assertSufficientStock,
  assertAllocationsCoverItems,
  type PrescriptionAction,
} from "./dispensing.js";

export interface RaisePrescriptionInput {
  readonly patientId: string;
  /** The discharge encounter this script belongs to (the L2 gate case), if any. */
  readonly encounterId?: string;
  readonly items: readonly PrescriptionItemInput[];
}

export interface DispenseInput {
  readonly prescriptionId: string;
  /** The pharmacy stock location to issue from (defaults to config). */
  readonly locationId?: string;
  /** Must be asserted true for a prescription containing cold-chain items. */
  readonly coldChainHandled?: boolean;
  /** Required (second person) for a prescription containing controlled items. */
  readonly witnessStaffId?: string;
  /** Manual lot override; when omitted, lots are chosen FEFO from inventory. */
  readonly allocations?: readonly DispenseAllocation[];
  readonly dispensedAt?: string;
}

export interface PharmacyConfig {
  /** Default stock location the Ground-floor pharmacy dispenses from. */
  readonly pharmacyLocationId: string;
}

/**
 * @oxford/pharmacy (ADR-0066): the Ground-floor dispensing workflow. A clinician
 * raises a FORMULARY-ONLY prescription (allergy screened, advisory only) → it
 * sits in the dispensing queue → the pharmacist dispenses (FEFO stock decrement
 * through the inventory seam; cold-chain asserted; controlled items post a
 * witnessed movement to the controlled-drugs register) → markReady → markCollected.
 * `isPrescriptionFulfilled` implements the perioperative PharmacyPort so the L2
 * discharge gate consumes real fulfilment. Every mutation is audited + emits a
 * domain event.
 */
export class PharmacyService {
  constructor(
    private readonly store: PharmacyStore,
    private readonly formulary: FormularyPort,
    private readonly allergy: AllergyPort,
    private readonly inventory: InventoryPort,
    private readonly controlled: ControlledRegisterPort,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
    private readonly clock: Clock,
    private readonly config: PharmacyConfig,
  ) {}

  // ── Prescription (formulary-only, allergy advisory) ─────────────────────────

  /** Raise a prescription. Every item MUST validate against the formulary — a
   *  non-formulary drug is rejected (there is no free-text item shape). The
   *  patient's allergies are screened at prescribe time (ADVISORY — never blocks;
   *  ADR-0060): matches are recorded on the prescription. */
  async raisePrescription(actorId: string, input: RaisePrescriptionInput): Promise<Result<Prescription, AppError>> {
    const valid = validatePrescriptionItems(input.items);
    if (!valid.ok) return err(valid.error);

    const items: PrescriptionItem[] = [];
    for (const it of input.items) {
      if (!(await this.formulary.isPrescribable(it.drugId))) {
        return err(validationError("drug is not in the formulary", "pharmacy.rx.not_prescribable"));
      }
      const info = await this.formulary.drugInfo(it.drugId);
      if (info === null) {
        return err(validationError("drug is not in the formulary", "pharmacy.rx.not_prescribable"));
      }
      items.push({
        drugId: it.drugId,
        quantity: it.quantity,
        doseInstruction: it.doseInstruction,
        nameEn: info.nameEn,
        nameAr: info.nameAr,
        drugClass: info.drugClass,
        controlled: info.controlled ?? false,
        coldChain: info.coldChain ?? false,
      });
    }

    const allergicClasses = await this.allergy.allergicClasses(input.patientId);
    const warnings = screenPrescription(items, allergicClasses);
    const now = this.now();
    const prescription: Prescription = {
      id: newId<"Prescription">(),
      patientId: input.patientId,
      encounterId: input.encounterId ?? null,
      prescriberId: actorId,
      items,
      status: "pending",
      allergyWarnings: warnings,
      cancelReason: null,
      raisedAt: now,
      updatedAt: now,
    };
    await this.store.savePrescription(prescription);
    await this.audit.record({
      actorId,
      entityType: "Prescription",
      entityId: prescription.id,
      action: "CREATE",
      after: { patientId: input.patientId, encounterId: prescription.encounterId, items: items.map((i) => ({ drugId: i.drugId, quantity: i.quantity })), allergyWarnings: warnings },
    });
    await this.events.emit({ type: "PrescriptionRaised", aggregateType: "Prescription", aggregateId: prescription.id, data: { patientId: input.patientId, encounterId: prescription.encounterId } });
    if (warnings.length > 0) {
      await this.events.emit({ type: "PrescriptionAllergyAdvisory", aggregateType: "Prescription", aggregateId: prescription.id, data: { warnings } });
    }
    return ok(prescription);
  }

  // ── Queue reads ─────────────────────────────────────────────────────────────

  /** The dispensing queue (oldest first), optionally filtered to one status. */
  queue(status?: PrescriptionStatus): Promise<readonly Prescription[]> {
    return this.store.listPrescriptions(status);
  }
  get(prescriptionId: string): Promise<Prescription | null> {
    return this.store.getPrescription(asId<"Prescription">(prescriptionId));
  }

  // ── Dispense (FEFO stock decrement; cold-chain + controlled) ────────────────

  /** Dispense a pending prescription: FEFO-decrement stock through the inventory
   *  seam, record lot allocations, post controlled items to the register (a
   *  witnessed movement), and advance the status to `dispensing`. Insufficient
   *  stock leaves the prescription pending (typed domain error, no partial issue). */
  async dispense(actorId: string, input: DispenseInput): Promise<Result<Dispense, AppError>> {
    const prescription = await this.store.getPrescription(asId<"Prescription">(input.prescriptionId));
    if (prescription === null) return err(notFound("prescription not found", "pharmacy.rx.not_found"));

    const transition = nextStatus(prescription.status, "dispense");
    if (!transition.ok) return err(transition.error);

    const coldChainHandled = input.coldChainHandled ?? false;
    const cold = assertColdChainHandled(prescription.items, coldChainHandled);
    if (!cold.ok) return err(cold.error);
    const witness = assertWitnessForControlled(prescription.items, input.witnessStaffId);
    if (!witness.ok) return err(witness.error);

    const locationId = input.locationId ?? this.config.pharmacyLocationId;
    const at = input.dispensedAt ?? this.now();

    const allocated = await this.allocate(actorId, prescription.items, input.allocations, locationId);
    if (!allocated.ok) return err(allocated.error); // stays pending on any stock error

    // Controlled items → a witnessed issue movement to the controlled-drugs
    // register, per consumed lot (the witness is guaranteed present above).
    for (const item of controlledItems(prescription.items)) {
      for (const alloc of allocated.value.filter((a) => a.drugId === item.drugId)) {
        const posted = await this.controlled.postIssue(actorId, {
          drugId: item.drugId,
          lotNo: alloc.lotNo,
          quantity: alloc.quantity,
          patientRef: prescription.patientId,
          witnessStaffId: input.witnessStaffId!,
          occurredAt: at,
        });
        if (!posted.ok) return err(posted.error);
      }
    }

    const dispense: Dispense = {
      id: newId<"Dispense">(),
      prescriptionId: prescription.id,
      dispensedBy: actorId,
      allocations: allocated.value,
      coldChainHandled,
      witnessStaffId: input.witnessStaffId ?? null,
      dispensedAt: at,
    };
    const updated: Prescription = { ...prescription, status: transition.value, updatedAt: at };
    await this.store.saveDispense(dispense);
    await this.store.savePrescription(updated);
    await this.audit.record({ actorId, entityType: "Prescription", entityId: prescription.id, action: "UPDATE", before: { status: prescription.status }, after: { status: transition.value, dispenseId: dispense.id, allocations: allocated.value } });
    await this.events.emit({ type: "PrescriptionDispensed", aggregateType: "Prescription", aggregateId: prescription.id, data: { patientId: prescription.patientId, dispenseId: dispense.id } });
    return ok(dispense);
  }

  /** Resolve the lots to consume: a caller-chosen override (validated + deducted
   *  exactly), or an automatic FEFO issue per item (pre-flight sufficiency first
   *  so a shortfall never partially decrements). */
  private async allocate(
    actorId: string,
    items: readonly PrescriptionItem[],
    manual: readonly DispenseAllocation[] | undefined,
    locationId: string,
  ): Promise<Result<readonly DispenseAllocation[], AppError>> {
    if (manual !== undefined) {
      const cover = assertAllocationsCoverItems(items, manual);
      if (!cover.ok) return err(cover.error);
      const deducted = await this.inventory.deductLots(actorId, manual);
      if (!deducted.ok) return err(deducted.error);
      return ok([...manual]);
    }
    const availableByDrug = new Map<string, number>();
    for (const item of items) availableByDrug.set(item.drugId, await this.inventory.availableAt(item.drugId, locationId));
    const sufficient = assertSufficientStock(items, availableByDrug);
    if (!sufficient.ok) return err(sufficient.error);
    const allocations: DispenseAllocation[] = [];
    for (const item of items) {
      const issued = await this.inventory.issueFefo(actorId, item.drugId, locationId, item.quantity);
      if (!issued.ok) return err(issued.error);
      allocations.push(...issued.value);
    }
    return ok(allocations);
  }

  // ── Status transitions (ready / collected / cancel) ─────────────────────────

  /** Mark a dispensing prescription READY for collection (the discharge gate
   *  consumes ready-or-collected). */
  markReady(actorId: string, prescriptionId: string): Promise<Result<Prescription, AppError>> {
    return this.advance(actorId, prescriptionId, "ready", "PrescriptionReady");
  }
  /** Close the loop: the patient has collected the prescription. */
  markCollected(actorId: string, prescriptionId: string): Promise<Result<Prescription, AppError>> {
    return this.advance(actorId, prescriptionId, "collected", "PrescriptionCollected");
  }

  /** Cancel a pending (not-yet-dispensed) prescription with a reason. */
  async cancel(actorId: string, prescriptionId: string, reason: string): Promise<Result<Prescription, AppError>> {
    if (reason.trim() === "") return err(validationError("a cancellation reason is required", "pharmacy.cancel.reason_required"));
    const prescription = await this.store.getPrescription(asId<"Prescription">(prescriptionId));
    if (prescription === null) return err(notFound("prescription not found", "pharmacy.rx.not_found"));
    const transition = nextStatus(prescription.status, "cancel");
    if (!transition.ok) return err(transition.error);
    const updated: Prescription = { ...prescription, status: transition.value, cancelReason: reason, updatedAt: this.now() };
    await this.store.savePrescription(updated);
    await this.audit.record({ actorId, entityType: "Prescription", entityId: prescription.id, action: "UPDATE", before: { status: prescription.status }, after: { status: transition.value, cancelReason: reason } });
    await this.events.emit({ type: "PrescriptionCancelled", aggregateType: "Prescription", aggregateId: prescription.id, data: { reason } });
    return ok(updated);
  }

  // ── PharmacyPort (the L2 discharge gate) ────────────────────────────────────

  /** Has the discharge prescription for an encounter been fulfilled? True when at
   *  least one prescription is linked to the encounter AND every one of them is
   *  ready-or-collected. No prescription ⇒ false (mirrors the stub's semantics so
   *  the existing discharge e2e holds). */
  async isPrescriptionFulfilled(encounterId: string): Promise<boolean> {
    const list = await this.store.prescriptionsForEncounter(encounterId);
    if (list.length === 0) return false;
    return list.every((p) => p.status === "ready" || p.status === "collected");
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private async advance(actorId: string, prescriptionId: string, action: PrescriptionAction, eventType: string): Promise<Result<Prescription, AppError>> {
    const prescription = await this.store.getPrescription(asId<"Prescription">(prescriptionId));
    if (prescription === null) return err(notFound("prescription not found", "pharmacy.rx.not_found"));
    const transition = nextStatus(prescription.status, action);
    if (!transition.ok) return err(transition.error);
    const updated: Prescription = { ...prescription, status: transition.value, updatedAt: this.now() };
    await this.store.savePrescription(updated);
    await this.audit.record({ actorId, entityType: "Prescription", entityId: prescription.id, action: "UPDATE", before: { status: prescription.status }, after: { status: transition.value } });
    await this.events.emit({ type: eventType, aggregateType: "Prescription", aggregateId: prescription.id, data: { patientId: prescription.patientId } });
    return ok(updated);
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
