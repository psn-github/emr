import type { Result, AppError } from "@oxford/core";
import { ok, err, newId } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { StockLot, ColdChainReading } from "./types.js";
import type { StockStore } from "./stock-store.js";
import type { CatalogueStore } from "./store.js";
import { planFefoIssue, isExpired, isExpiringWithin, belowPar, type IssuePlanLine } from "./stock.js";

export interface ReceiveInput {
  readonly itemId: string;
  readonly lotNo: string;
  readonly locationId: string;
  readonly quantity: number;
  readonly expiryDate: string;
  readonly receivedAt: string;
}
export interface IssueInput {
  readonly itemId: string;
  readonly locationId: string;
  readonly quantity: number;
}
export interface DeductItem {
  readonly code: string; // catalogue item id
  readonly lotNo: string;
  readonly quantity: number;
}
export interface CriticalStockAlert {
  readonly itemId: string;
  readonly onHand: number;
  readonly parLevel: number;
}
export interface ExpiryAlert {
  readonly lotId: string;
  readonly itemId: string;
  readonly expiryDate: string;
  readonly expired: boolean;
}
export interface StockAlerts {
  readonly criticalStock: readonly CriticalStockAlert[];
  readonly expiring: readonly ExpiryAlert[];
}

/**
 * Multi-location inventory (docs/01 §E9): receive lots, FEFO issue (never
 * negative), cold-chain logging, and critical-stock/expiry alerts against the
 * catalogue par levels. `deduct` is the InventoryPort the perioperative theatre
 * flow uses to consume a specific received lot (ADR-0026).
 */
export class InventoryService {
  constructor(
    private readonly stock: StockStore,
    private readonly catalogue: CatalogueStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async receive(actorId: string, input: ReceiveInput): Promise<StockLot> {
    const existing = await this.stock.lotAt(input.itemId, input.lotNo, input.locationId);
    const lot: StockLot = existing
      ? { ...existing, quantity: existing.quantity + input.quantity }
      : { id: newId<"StockLot">(), itemId: input.itemId, lotNo: input.lotNo, locationId: input.locationId, quantity: input.quantity, expiryDate: input.expiryDate, receivedAt: input.receivedAt };
    await this.stock.saveLot(lot);
    await this.audit.record({ actorId, entityType: "StockLot", entityId: lot.id, action: existing ? "UPDATE" : "CREATE", after: { itemId: input.itemId, lotNo: input.lotNo, quantity: lot.quantity } });
    await this.events.emit({ type: "StockReceived", aggregateType: "CatalogueItem", aggregateId: input.itemId, data: { lotNo: input.lotNo, quantity: input.quantity } });
    return lot;
  }

  /** FEFO issue from an item's lots at a location. Never drives stock negative. */
  async issue(actorId: string, input: IssueInput): Promise<Result<readonly IssuePlanLine[], AppError>> {
    const lots = (await this.stock.lotsForItem(input.itemId)).filter((l) => l.locationId === input.locationId);
    const plan = planFefoIssue(lots, input.quantity);
    if (!plan.ok) return err(plan.error);
    await this.applyPlan(plan.value);
    await this.audit.record({ actorId, entityType: "CatalogueItem", entityId: input.itemId, action: "UPDATE", after: { issued: input.quantity, location: input.locationId } });
    await this.events.emit({ type: "StockIssued", aggregateType: "CatalogueItem", aggregateId: input.itemId, data: { quantity: input.quantity } });
    return ok(plan.value);
  }

  /** InventoryPort: consume a specific received lot (theatre/point-of-use). */
  async deduct(actorId: string, items: readonly DeductItem[]): Promise<Result<void, AppError>> {
    for (const item of items) {
      const lots = await this.stock.lotsForItemLot(item.code, item.lotNo);
      const plan = planFefoIssue(lots, item.quantity);
      if (!plan.ok) return err(plan.error);
      await this.applyPlan(plan.value);
    }
    await this.audit.record({ actorId, entityType: "StockLot", entityId: "deduct", action: "UPDATE", after: { lines: items.length } });
    return ok(undefined);
  }

  private async applyPlan(plan: readonly IssuePlanLine[]): Promise<void> {
    for (const line of plan) {
      // The plan was just computed from these live lots, so the lot exists.
      const lot = (await this.stock.lotById(line.lotId as never))!;
      await this.stock.saveLot({ ...lot, quantity: lot.quantity - line.quantity });
    }
  }

  coldChainReadings(locationId: string): Promise<readonly ColdChainReading[]> {
    return this.stock.coldChainForLocation(locationId);
  }

  async onHand(itemId: string): Promise<number> {
    return (await this.stock.lotsForItem(itemId)).reduce((s, l) => s + l.quantity, 0);
  }

  async recordColdChain(actorId: string, locationId: string, temperatureC: number, recordedAt: string): Promise<ColdChainReading> {
    const reading: ColdChainReading = { id: newId<"ColdChainReading">(), locationId, temperatureC, recordedAt, recordedBy: actorId };
    await this.stock.saveColdChainReading(reading);
    await this.audit.record({ actorId, entityType: "ColdChainReading", entityId: reading.id, action: "CREATE", after: { locationId, temperatureC } });
    return reading;
  }

  /** Critical-stock (below par) + expiry-imminent/expired alerts. */
  async alerts(asOf: Date, withinDays: number): Promise<StockAlerts> {
    const items = await this.catalogue.items();
    const lots = await this.stock.allLots();
    const criticalStock: CriticalStockAlert[] = [];
    for (const item of items) {
      const onHand = lots.filter((l) => l.itemId === item.id).reduce((s, l) => s + l.quantity, 0);
      if (belowPar(onHand, item.parLevel)) criticalStock.push({ itemId: item.id, onHand, parLevel: item.parLevel });
    }
    const expiring: ExpiryAlert[] = [];
    for (const lot of lots) {
      if (lot.quantity <= 0) continue;
      const expired = isExpired(lot.expiryDate, asOf);
      if (expired || isExpiringWithin(lot.expiryDate, asOf, withinDays)) {
        expiring.push({ lotId: lot.id, itemId: lot.itemId, expiryDate: lot.expiryDate, expired });
      }
    }
    return { criticalStock, expiring };
  }
}
