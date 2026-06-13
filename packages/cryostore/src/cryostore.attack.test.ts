// Adversarial review (CLAUDE.md — identity + money + gametes/embryos). Proves the
// two cryostore crown-jewel invariants against a real Postgres:
//   1. The THAW-FOR-TREATMENT RE-GATE — a person-owned specimen cannot be thawed
//      into a couple that excludes the owner, nor posthumously; a couple-owned
//      specimen cannot be used by another couple.
//   2. The NON-ENGAGEMENT pathway NEVER destroys — escalation reaches legal
//      review while the specimen stays in storage; only a reviewed human discard
//      changes that. Custody events are registered with the real WitnessingService.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { WitnessingService, PgWitnessingStore, RiWitnessStubProvider } from "@oxford/witnessing";
import { CryostoreService } from "./cryostore-service.js";
import { PgCryostoreStore } from "./pg-store.js";
import type { UseGate, BillingPort, StorageChargeLine } from "./ports.js";
import type { ThawFacts } from "./ownership.js";
import type { CryoPosition, SpecimenOwner } from "./types.js";

const DATABASE_URL = process.env.DATABASE_URL;
const cryoMig = readFileSync(new URL("../migrations/0001_cryostore.sql", import.meta.url), "utf8");
const witMig = readFileSync(new URL("../../witnessing/migrations/0001_witnessing.sql", import.meta.url), "utf8");

class ConfigurableGate implements UseGate {
  facts: ThawFacts = { coupleVerified: true, coupleIncludesOwner: true, ownerAlive: true };
  async thawFacts(_o: SpecimenOwner, _c: string): Promise<ThawFacts> {
    return this.facts;
  }
}
class NoopBilling implements BillingPort {
  async raiseStorageCharge(_a: string, _p: string, _l: StorageChargeLine): Promise<string> {
    return "inv-x";
  }
}

const POS: CryoPosition = { tankId: "t1", canister: "c1", cane: "k1", position: "p1" };

describe.skipIf(!DATABASE_URL)("cryostore — ownership re-gate + never-auto-destroy (real Postgres)", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const clock = fixedClock(new Date("2026-06-22T08:00:00.000Z"));

  function build(gate: ConfigurableGate) {
    const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
    const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
    const witnessing = new WitnessingService(new PgWitnessingStore(pool), new RiWitnessStubProvider(), audit, events, clock);
    const port = { registerHandlingEvent: (a: string, i: Parameters<WitnessingService["registerHandlingEvent"]>[1]) => witnessing.registerHandlingEvent(a, i).then(() => undefined) };
    const svc = new CryostoreService(new PgCryostoreStore(pool), port, gate, new NoopBilling(), audit, events, clock);
    return { svc };
  }

  async function freeze(svc: CryostoreService, owner: SpecimenOwner, kind: "sperm" | "embryo") {
    const r = await svc.freezeIntoStorage("emb-1", { kind, owner, cycleId: "cycle-1", straws: 2, position: POS, freezeEventRef: "fz-1", patientId: "pat-1", occurredAt: "2026-06-22T08:00:00Z" });
    if (!r.ok) throw new Error("freeze failed");
    return r.value;
  }

  beforeAll(async () => {
    await pool.query(witMig);
    await pool.query(cryoMig);
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE witnessing.handling_event, witnessing.reconciliation");
    await pool.query("TRUNCATE cryostore.tank, cryostore.cryo_specimen, cryostore.custody_event, cryostore.storage_consent, cryostore.tank_reading, cryostore.engagement");
  });
  afterAll(async () => {
    await pool.end();
  });

  it("A1: a person-owned specimen cannot be thawed into a couple that excludes the owner", async () => {
    const gate = new ConfigurableGate();
    const { svc } = build(gate);
    const s = await freeze(svc, { kind: "person", id: "per-1" }, "sperm");
    gate.facts = { coupleVerified: true, coupleIncludesOwner: false, ownerAlive: true };
    const r = await svc.thawForTreatment("emb-1", s.id, "cpl-OTHER", "pat-1", "2026-06-27T10:00:00.000Z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.owner_not_in_couple");
    // specimen remains stored — nothing was thawed
    expect((await svc.locate(s.id)).ok && (await svc.locate(s.id)).ok).toBe(true);
  });

  it("A2: posthumous use is blocked", async () => {
    const gate = new ConfigurableGate();
    const { svc } = build(gate);
    const s = await freeze(svc, { kind: "person", id: "per-1" }, "sperm");
    gate.facts = { coupleVerified: true, coupleIncludesOwner: true, ownerAlive: false };
    const r = await svc.thawForTreatment("emb-1", s.id, "cpl-1", "pat-1", "2026-06-27T10:00:00.000Z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.posthumous_blocked");
  });

  it("A3: a couple-owned specimen cannot be used by a different couple", async () => {
    const { svc } = build(new ConfigurableGate());
    const s = await freeze(svc, { kind: "couple", id: "cpl-1" }, "embryo");
    const r = await svc.thawForTreatment("emb-1", s.id, "cpl-OTHER", "pat-1", "2026-06-27T10:00:00.000Z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("cryostore.thaw.couple_mismatch");
  });

  it("A4: non-engagement escalates to legal review with the specimen STILL stored (never auto-destroyed)", async () => {
    const { svc } = build(new ConfigurableGate());
    const s = await freeze(svc, { kind: "couple", id: "cpl-1" }, "embryo");
    await svc.advanceEngagement("fin-1", s.id, "remind");
    await svc.advanceEngagement("fin-1", s.id, "mark_overdue");
    const review = await svc.advanceEngagement("fin-1", s.id, "escalate_review");
    expect(review.ok && review.value).toBe("in_legal_review");
    const loc = await svc.locate(s.id);
    expect(loc.ok && loc.value.specimen.status).toBe("stored"); // not discarded
  });

  it("A5: the legitimate thaw flows once the re-gate passes (and is witnessed)", async () => {
    const { svc } = build(new ConfigurableGate());
    const s = await freeze(svc, { kind: "person", id: "per-1" }, "sperm");
    const r = await svc.thawForTreatment("emb-1", s.id, "cpl-1", "pat-1", "2026-06-27T10:00:00.000Z");
    expect(r.ok && r.value.status).toBe("thawed");
    const loc = await svc.locate(s.id);
    expect(loc.ok && loc.value.custody.some((e) => e.type === "thaw")).toBe(true);
  });
});
