import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, asId, notFound, validationError } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { CdMovement } from "./types.js";
import type { ControlledRegisterStore } from "./controlled-store.js";
import type { CatalogueStore } from "./store.js";
import { newBalance, validateWitness, reconcile, type CdMovementType, type Reconciliation } from "./controlled.js";

export interface RecordMovementInput {
  readonly itemId: string;
  readonly lotNo: string;
  readonly type: Exclude<CdMovementType, "adjustment">;
  readonly quantity: number;
  readonly reason: string;
  readonly patientRef?: string;
  readonly witnessedBy: string;
  readonly occurredAt: string;
}

export interface ReconcileInput {
  readonly itemId: string;
  readonly lotNo: string;
  readonly physicalCount: number;
  readonly witnessedBy: string;
  readonly reason: string;
  readonly occurredAt: string;
}

export interface PeriodReportRow {
  readonly itemId: string;
  readonly openingBalance: number;
  readonly closingBalance: number;
  readonly movements: readonly CdMovement[];
}

/**
 * Controlled-drugs register (docs/01 §E8 P0) — legal-grade, witnessed, reconcilable.
 * Every movement of a `controlled` catalogue item is an append-only, two-person
 * (witnessed) ledger entry carrying the running book balance; the balance can
 * never go negative. A physical count reconciles against the book and any
 * discrepancy is corrected by a witnessed `adjustment` (the discrepancy is
 * audited, never silently absorbed). `periodReport` is the MOH-reporting hook
 * (the report FORMAT is regulatory config — AMD-0005).
 */
export class ControlledDrugsService {
  constructor(
    private readonly store: ControlledRegisterStore,
    private readonly catalogue: CatalogueStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  /** Current book balance for a controlled item (0 before any movement). */
  async balance(itemId: string): Promise<number> {
    const ms = await this.store.movementsForItem(itemId);
    return ms.length === 0 ? 0 : ms[ms.length - 1]!.balanceAfter;
  }

  /** Record a witnessed movement (receipt/issue/wastage/destruction/return). */
  async record(actorId: string, input: RecordMovementInput): Promise<Result<CdMovement, AppError>> {
    const w = validateWitness(actorId, input.witnessedBy);
    if (!w.ok) return err(w.error);
    const guard = await this.assertControlled(input.itemId);
    if (!guard.ok) return err(guard.error);
    const prior = await this.balance(input.itemId);
    const next = newBalance(prior, input.type, input.quantity);
    if (!next.ok) return err(next.error);
    return ok(await this.append(actorId, { ...input, type: input.type, balanceAfter: next.value, patientRef: input.patientRef ?? null }));
  }

  /** Reconcile a physical count against the book; a discrepancy is corrected by a
   *  witnessed adjustment and audited. Returns the reconciliation outcome. */
  async reconcileCount(actorId: string, input: ReconcileInput): Promise<Result<Reconciliation, AppError>> {
    const w = validateWitness(actorId, input.witnessedBy);
    if (!w.ok) return err(w.error);
    const guard = await this.assertControlled(input.itemId);
    if (!guard.ok) return err(guard.error);
    const prior = await this.balance(input.itemId);
    const result = reconcile(prior, input.physicalCount);
    if (!result.matched) {
      await this.append(actorId, {
        itemId: input.itemId,
        lotNo: input.lotNo,
        type: "adjustment",
        quantity: input.physicalCount,
        balanceAfter: input.physicalCount,
        reason: `${input.reason} (discrepancy ${result.discrepancy})`,
        patientRef: null,
        witnessedBy: input.witnessedBy,
        occurredAt: input.occurredAt,
      });
      await this.audit.record({ actorId, entityType: "CdMovement", entityId: input.itemId, action: "UPDATE", after: { discrepancy: result.discrepancy, physicalCount: input.physicalCount } });
      await this.events.emit({ type: "ControlledDrugDiscrepancy", aggregateType: "CatalogueItem", aggregateId: input.itemId, data: { discrepancy: result.discrepancy } });
    }
    return ok(result);
  }

  /** MOH-reporting hook: movements + opening/closing balance for a window. */
  async periodReport(itemId: string, from: string, to: string): Promise<PeriodReportRow> {
    const all = await this.store.movementsForItem(itemId);
    const before = all.filter((m) => m.occurredAt < from);
    const within = all.filter((m) => m.occurredAt >= from && m.occurredAt <= to);
    const opening = before.length === 0 ? 0 : before[before.length - 1]!.balanceAfter;
    const closing = within.length === 0 ? opening : within[within.length - 1]!.balanceAfter;
    return { itemId, openingBalance: opening, closingBalance: closing, movements: within };
  }

  movements(itemId: string): Promise<readonly CdMovement[]> {
    return this.store.movementsForItem(itemId);
  }

  /** The register applies only to items flagged `controlled` in the catalogue —
   *  the safety gate is the explicit per-item flag, not a derived schedule. */
  private async assertControlled(itemId: string): Promise<Result<void, AppError>> {
    const item = await this.catalogue.getItem(asId<"CatalogueItem">(itemId));
    if (item === undefined) return err(notFound("controlled item not found", "inventory.cd.item_not_found"));
    if (!item.controlled) return err(validationError("item is not a controlled drug", "inventory.cd.not_controlled"));
    return ok(undefined);
  }

  private async append(actorId: string, m: Omit<CdMovement, "id" | "actorId">): Promise<CdMovement> {
    const movement: CdMovement = { id: newId<"CdMovement">(), actorId, ...m };
    await this.store.appendMovement(movement);
    await this.audit.record({ actorId, entityType: "CdMovement", entityId: movement.id, action: "CREATE", after: { itemId: m.itemId, type: m.type, quantity: m.quantity, balanceAfter: m.balanceAfter, witnessedBy: m.witnessedBy } });
    await this.events.emit({ type: "ControlledDrugMovement", aggregateType: "CatalogueItem", aggregateId: m.itemId, data: { type: m.type, balanceAfter: m.balanceAfter } });
    return movement;
  }
}
