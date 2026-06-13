// e2e — supplier + item catalogue THROUGH the tRPC API on real Postgres (docs/01
// §E9). Proves RBAC (admin/ops domain), validation, and persistence.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

const stores: Session = {
  sessionId: "s-stores",
  subject: { staffId: "stores-1", roles: [{ id: "stores", name: "stores", permissions: ["admin:inventory.read", "admin:inventory.write"] }] },
  mfa: true,
};
const clinician: Session = {
  sessionId: "s-doc",
  subject: { staffId: "doc-1", roles: [{ id: "consultant", name: "consultant", permissions: ["clinical:*"] }] },
  mfa: true,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("inventory catalogue (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;

  beforeAll(async () => {
    await runMigrations(pool);
    services = buildServices(pool);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE inventory.supplier, inventory.catalogue_item");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("adds a supplier + item, lists items, and validates", async () => {
    const ops = appRouter.createCaller({ session: stores, patient: null, services });
    const { supplierId } = await ops.inventory.addSupplier({ name: "Vitrolife" });
    const { itemId } = await ops.inventory.addItem({ name: "Culture medium", category: "media", unit: "vial", packSize: 10, coldChain: true, controlled: false, parLevel: 20, preferredSupplierId: supplierId });
    expect(itemId).toBeTruthy();
    const { items } = await ops.inventory.listItems();
    expect(items).toHaveLength(1);
    await expectCode(() => ops.inventory.addItem({ name: "", category: "office", unit: "box", packSize: 1, coldChain: false, controlled: false, parLevel: 0 }), "BAD_REQUEST");
  });

  it("RBAC: a clinical role cannot manage the catalogue", async () => {
    const doc = appRouter.createCaller({ session: clinician, patient: null, services });
    await expectCode(() => doc.inventory.addSupplier({ name: "X" }), "FORBIDDEN");
  });
});
