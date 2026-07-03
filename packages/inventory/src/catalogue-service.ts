import type { Result, AppError } from "@oxford/core";
import { ok, err, newId, asId } from "@oxford/core";
import type { AuditLog, DomainEventLog } from "@oxford/audit";
import type { Supplier, CatalogueItem, CatalogueItemId, ItemCategory } from "./types.js";
import type { CatalogueStore } from "./store.js";
import { validateCatalogueItem } from "./catalogue.js";

export interface AddSupplierInput {
  readonly name: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
}
export interface AddItemInput {
  /** Optional stable catalogue code (the drug/formulary code import path). When
   *  omitted a fresh id is allocated; when supplied the row upserts on it, so a
   *  catalogue item can share a drug's formulary code — the join the pharmacy
   *  dispensing seam uses to key stock + the controlled register (ADR-0066). */
  readonly id?: string;
  readonly name: string;
  readonly category: ItemCategory;
  readonly unit: string;
  readonly packSize: number;
  readonly coldChain: boolean;
  readonly controlled: boolean;
  readonly parLevel: number;
  readonly preferredSupplierId?: string;
}

/** Supplier + item catalogue (docs/01 §E9). Items are validated (no free-text
 *  units/empty names; positive pack size); every mutation is audited. */
export class CatalogueService {
  constructor(
    private readonly store: CatalogueStore,
    private readonly audit: AuditLog,
    private readonly events: DomainEventLog,
  ) {}

  async addSupplier(actorId: string, input: AddSupplierInput): Promise<Supplier> {
    const supplier: Supplier = {
      id: newId<"Supplier">(),
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      active: true,
    };
    await this.store.saveSupplier(supplier);
    await this.audit.record({ actorId, entityType: "Supplier", entityId: supplier.id, action: "CREATE", after: { name: input.name } });
    return supplier;
  }

  async addItem(actorId: string, input: AddItemInput): Promise<Result<CatalogueItem, AppError>> {
    const valid = validateCatalogueItem(input);
    if (!valid.ok) return err(valid.error);
    const item: CatalogueItem = {
      id: input.id !== undefined ? asId<"CatalogueItem">(input.id) : newId<"CatalogueItem">(),
      name: input.name,
      category: input.category,
      unit: input.unit,
      packSize: input.packSize,
      coldChain: input.coldChain,
      controlled: input.controlled,
      parLevel: input.parLevel,
      preferredSupplierId: input.preferredSupplierId ?? null,
    };
    await this.store.saveItem(item);
    await this.audit.record({ actorId, entityType: "CatalogueItem", entityId: item.id, action: "CREATE", after: { name: input.name, category: input.category, controlled: input.controlled } });
    await this.events.emit({ type: "CatalogueItemAdded", aggregateType: "CatalogueItem", aggregateId: item.id, data: { category: input.category } });
    return ok(item);
  }

  suppliers(): Promise<readonly Supplier[]> {
    return this.store.suppliers();
  }
  items(): Promise<readonly CatalogueItem[]> {
    return this.store.items();
  }
  item(id: CatalogueItemId): Promise<CatalogueItem | undefined> {
    return this.store.getItem(id);
  }
}
