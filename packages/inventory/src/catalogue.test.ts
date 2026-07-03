import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { validateCatalogueItem } from "./catalogue.js";
import { CatalogueService } from "./catalogue-service.js";
import { InMemoryCatalogueStore } from "./store.js";
import { asId } from "@oxford/core";

const good = { name: "Embryo culture medium", category: "media" as const, unit: "vial", packSize: 10, coldChain: true, controlled: false, parLevel: 20 };

describe("validateCatalogueItem (pure)", () => {
  it("accepts a valid item", () => {
    expect(validateCatalogueItem(good).ok).toBe(true);
  });
  it("rejects empty name/unit, bad pack size, bad par level", () => {
    expect(validateCatalogueItem({ ...good, name: " " }).ok).toBe(false);
    expect(validateCatalogueItem({ ...good, unit: "" }).ok).toBe(false);
    const pack = validateCatalogueItem({ ...good, packSize: 0 });
    expect(pack.ok).toBe(false);
    if (!pack.ok) expect(pack.error.detailKey).toBe("inventory.item.bad_pack_size");
    const par = validateCatalogueItem({ ...good, parLevel: -1 });
    expect(par.ok).toBe(false);
    if (!par.ok) expect(par.error.detailKey).toBe("inventory.item.bad_par_level");
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-13T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  return { svc: new CatalogueService(new InMemoryCatalogueStore(), audit, events), audit, events };
}

describe("CatalogueService", () => {
  it("adds a supplier + item (preferred supplier linked) and lists them", async () => {
    const { svc, events } = build();
    const sup = await svc.addSupplier("buyer-1", { name: "Vitrolife", contactEmail: "sales@x" });
    const item = await svc.addItem("buyer-1", { ...good, preferredSupplierId: sup.id });
    expect(item.ok).toBe(true);
    if (item.ok) expect(item.value.preferredSupplierId).toBe(sup.id);
    await svc.addSupplier("buyer-1", { name: "Minimal Co" }); // no contact details → null branch
    expect(await svc.suppliers()).toHaveLength(2);
    expect(await svc.items()).toHaveLength(1);
    expect((await events.events())[0]!.payload.type).toBe("CatalogueItemAdded");
  });
  it("rejects an invalid item", async () => {
    const { svc } = build();
    const r = await svc.addItem("buyer-1", { ...good, packSize: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("inventory.item.bad_pack_size");
  });
  it("accepts an explicit stable id (the drug/formulary code import path)", async () => {
    const { svc } = build();
    const item = await svc.addItem("buyer-1", { ...good, id: "hcg_trigger", controlled: true });
    expect(item.ok).toBe(true);
    if (item.ok) expect(item.value.id).toBe("hcg_trigger");
    expect((await svc.item(asId<"CatalogueItem">("hcg_trigger")))!.controlled).toBe(true);
  });
  it("fetches a single item by id (undefined for unknown)", async () => {
    const { svc } = build();
    const item = await svc.addItem("buyer-1", good);
    if (!item.ok) return;
    expect((await svc.item(item.value.id))!.name).toBe(good.name);
    expect(await svc.item(asId<"CatalogueItem">("nope"))).toBeUndefined();
  });
});

describe("InMemoryCatalogueStore (update + lookup branches)", () => {
  it("upserts suppliers and items and looks them up", async () => {
    const store = new InMemoryCatalogueStore();
    const sup = { id: asId<"Supplier">("s1"), name: "A", contactEmail: null, contactPhone: null, active: true };
    await store.saveSupplier(sup);
    await store.saveSupplier({ ...sup, name: "A (renamed)" }); // update branch
    expect((await store.getSupplier(sup.id))!.name).toBe("A (renamed)");
    expect(await store.getSupplier(asId<"Supplier">("nope"))).toBeUndefined();

    const item = { id: asId<"CatalogueItem">("i1"), name: "X", category: "office" as const, unit: "box", packSize: 1, coldChain: false, controlled: false, parLevel: 0, preferredSupplierId: null };
    await store.saveItem(item);
    await store.saveItem({ ...item, parLevel: 5 }); // update branch
    expect((await store.getItem(item.id))!.parLevel).toBe(5);
    expect(await store.getItem(asId<"CatalogueItem">("nope"))).toBeUndefined();
  });
});
