import { describe, expect, it } from "vitest";
import { fixedClock, asId } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { planFefoIssue, isExpired, isExpiringWithin, belowPar } from "./stock.js";
import { InventoryService } from "./inventory-service.js";
import { InMemoryStockStore } from "./stock-store.js";
import { InMemoryCatalogueStore } from "./store.js";

describe("stock logic (pure)", () => {
  it("plans a FEFO issue earliest-expiry first; errors on insufficient", () => {
    const lots = [
      { id: "a", quantity: 5, expiryDate: "2027-01-01" },
      { id: "b", quantity: 5, expiryDate: "2026-06-01" }, // earlier → consumed first
    ];
    const r = planFefoIssue(lots, 7);
    expect(r.ok && r.value).toEqual([{ lotId: "b", quantity: 5 }, { lotId: "a", quantity: 2 }]);
    const short = planFefoIssue(lots, 11);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error.detailKey).toBe("inventory.stock.insufficient");
    // satisfied by the first lot(s) → stops early (doesn't touch later lots)
    const early = planFefoIssue([{ id: "b", quantity: 5, expiryDate: "2026-06-01" }, { id: "a", quantity: 5, expiryDate: "2027-01-01" }], 3);
    expect(early.ok && early.value).toEqual([{ lotId: "b", quantity: 3 }]);
  });
  it("expiry + par helpers", () => {
    expect(isExpired("2026-01-01", new Date("2026-06-01"))).toBe(true);
    expect(isExpiringWithin("2026-07-01", new Date("2026-06-20"), 30)).toBe(true);
    expect(isExpiringWithin("2026-01-01", new Date("2026-06-20"), 30)).toBe(false); // already expired
    expect(belowPar(3, 5)).toBe(true);
    expect(belowPar(5, 5)).toBe(false);
  });
});

function build() {
  const clock = fixedClock(new Date("2026-06-20T08:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const stock = new InMemoryStockStore();
  const catalogue = new InMemoryCatalogueStore();
  return { svc: new InventoryService(stock, catalogue, audit, events), catalogue };
}

const ITEM = "item-1";

describe("InventoryService", () => {
  it("receives lots (upsert by item/lot/location), reports on-hand, FEFO issues", async () => {
    const { svc } = build();
    await svc.receive("buyer-1", { itemId: ITEM, lotNo: "L1", locationId: "store", quantity: 10, expiryDate: "2027-01-01", receivedAt: "2026-06-20T08:00:00Z" });
    await svc.receive("buyer-1", { itemId: ITEM, lotNo: "L1", locationId: "store", quantity: 5, expiryDate: "2027-01-01", receivedAt: "2026-06-20T08:00:00Z" }); // upsert → 15
    await svc.receive("buyer-1", { itemId: ITEM, lotNo: "L2", locationId: "store", quantity: 4, expiryDate: "2026-07-01", receivedAt: "2026-06-20T08:00:00Z" });
    expect(await svc.onHand(ITEM)).toBe(19);

    const issued = await svc.issue("nurse-1", { itemId: ITEM, locationId: "store", quantity: 6 });
    expect(issued.ok).toBe(true);
    expect(await svc.onHand(ITEM)).toBe(13); // FEFO: 4 from L2 (earlier) + 2 from L1
    const over = await svc.issue("nurse-1", { itemId: ITEM, locationId: "store", quantity: 999 });
    expect(over.ok).toBe(false);

    // lotsForItem (published read used by the pharmacy dispensing seam, ADR-0066)
    const lots = await svc.lotsForItem(ITEM);
    expect(lots.map((l) => l.lotNo).sort()).toEqual(["L1", "L2"]);
    expect(await svc.lotsForItem("no-such-item")).toEqual([]);
  });

  it("deduct consumes a specific lot (InventoryPort); errors when insufficient", async () => {
    const { svc } = build();
    await svc.receive("buyer-1", { itemId: ITEM, lotNo: "LOT-A", locationId: "theatre", quantity: 3, expiryDate: "2027-01-01", receivedAt: "2026-06-20T08:00:00Z" });
    const ok = await svc.deduct("scrub-1", [{ code: ITEM, lotNo: "LOT-A", quantity: 2 }]);
    expect(ok.ok).toBe(true);
    expect(await svc.onHand(ITEM)).toBe(1);
    const fail = await svc.deduct("scrub-1", [{ code: ITEM, lotNo: "LOT-A", quantity: 5 }]);
    expect(fail.ok).toBe(false);
    if (!fail.ok) expect(fail.error.detailKey).toBe("inventory.stock.insufficient");
  });

  it("raises critical-stock + expiry alerts against catalogue par levels", async () => {
    const { svc, catalogue } = build();
    const item = await catalogue.saveItem({ id: asId<"CatalogueItem">(ITEM), name: "Medium", category: "media", unit: "vial", packSize: 1, coldChain: true, controlled: false, parLevel: 20, preferredSupplierId: null });
    void item;
    await svc.receive("buyer-1", { itemId: ITEM, lotNo: "L1", locationId: "lab", quantity: 5, expiryDate: "2026-07-01", receivedAt: "2026-06-20T08:00:00Z" }); // expiring within 30d
    await svc.receive("buyer-1", { itemId: ITEM, lotNo: "L2", locationId: "lab", quantity: 2, expiryDate: "2026-01-01", receivedAt: "2026-06-20T08:00:00Z" }); // already expired
    await svc.receive("buyer-1", { itemId: ITEM, lotNo: "L3", locationId: "lab", quantity: 4, expiryDate: "2030-01-01", receivedAt: "2026-06-20T08:00:00Z" }); // far future
    // emptied lot (qty 0) is skipped in the expiry scan
    await svc.deduct("scrub-1", [{ code: ITEM, lotNo: "L3", quantity: 4 }]);

    const alerts = await svc.alerts(new Date("2026-06-20T08:00:00Z"), 30);
    expect(alerts.criticalStock).toEqual([{ itemId: ITEM, onHand: 7, parLevel: 20 }]); // 5 + 2 (L3 emptied)
    expect(alerts.expiring.some((e) => !e.expired)).toBe(true); // L1 expiring
    expect(alerts.expiring.some((e) => e.expired)).toBe(true); // L2 expired
    expect(alerts.expiring).toHaveLength(2); // L3 (empty) + far-future excluded
  });

  it("logs cold-chain readings and reads them back by location", async () => {
    const { svc } = build();
    const r = await svc.recordColdChain("tech-1", "fridge-1", 4.2, "2026-06-20T08:00:00Z");
    expect(r.temperatureC).toBe(4.2);
    expect(await svc.coldChainReadings("fridge-1")).toHaveLength(1);
  });
});
