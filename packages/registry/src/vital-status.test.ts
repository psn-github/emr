import { describe, expect, it } from "vitest";
import { fixedClock } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { LocalKeyProvider } from "@oxford/crypto";
import { RegistryService } from "./registry-service.js";
import { InMemoryRegistryStore } from "./store.js";
import { personIsLiving } from "./vital-status.js";
import type { RegisterPersonInput } from "./person.js";

function build() {
  const clock = fixedClock(new Date("2026-06-13T10:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const service = new RegistryService(new InMemoryRegistryStore(), new LocalKeyProvider(false), audit, events, clock);
  return { service, audit, events };
}

const male: RegisterPersonInput = { name: { ar: "علي", en: "Ali" }, civilId: "284010100001", dob: "1984-01-01", sex: "male", nationality: "KW", languagePref: "ar" };
const female: RegisterPersonInput = { name: { ar: "نورة", en: "Noura" }, civilId: "288050100002", dob: "1988-05-01", sex: "female", nationality: "KW", languagePref: "ar" };

describe("personIsLiving", () => {
  it("is living iff there is no death record", () => {
    expect(personIsLiving(null)).toBe(true);
    expect(personIsLiving({ id: "d" as never, personId: "p" as never, dateOfDeath: "2026-01-01", attestedBy: "doc", documentRef: "cert", recordedAt: "2026-01-02T00:00:00Z" })).toBe(false);
  });
});

describe("RegistryService.recordDeath (clinician-attested vital status)", () => {
  it("records a death, flips isPersonLiving, audits + emits, and rejects re-attestation", async () => {
    const { service, audit, events } = build();
    const p = await service.registerPerson("doc-1", male);
    expect(await service.isPersonLiving(p.id)).toBe(true);

    const r = await service.recordDeath("doc-1", p.id, { dateOfDeath: "2026-06-01", documentRef: "cert-9" });
    expect(r.ok && r.value.attestedBy).toBe("doc-1");
    expect(await service.isPersonLiving(p.id)).toBe(false);
    expect((await audit.entries()).at(-1)!.payload.after).toMatchObject({ living: false });
    expect((await events.events()).at(-1)!.payload.type).toBe("DeathRecorded");

    const again = await service.recordDeath("doc-1", p.id, { dateOfDeath: "2026-06-01", documentRef: "cert-9" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detailKey).toBe("registry.death.already_recorded");
  });

  it("rejects a death record for an unknown person", async () => {
    const { service } = build();
    const r = await service.recordDeath("doc-1", "ghost" as never, { dateOfDeath: "2026-06-01", documentRef: "cert" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.person.not_found");
  });
});

describe("RegistryService thaw facts (couple membership + verification)", () => {
  it("reports couple verification and membership accurately", async () => {
    const { service } = build();
    const h = await service.registerPerson("doc-1", male);
    const w = await service.registerPerson("doc-1", female);
    const stranger = await service.registerPerson("doc-1", { ...male, civilId: "284010100003" });
    const couple = await service.createCouple("doc-1", h.id, w.id);
    expect(couple.ok).toBe(true);
    if (!couple.ok) return;
    const coupleId = couple.value.id;

    expect(await service.isCoupleVerified(coupleId)).toBe(false);
    expect(await service.coupleIncludes(coupleId, h.id)).toBe(true);
    expect(await service.coupleIncludes(coupleId, stranger.id)).toBe(false);

    await service.verifyMarriage("doc-1", coupleId, { documentRef: "mrg-1", method: "certificate" });
    expect(await service.isCoupleVerified(coupleId)).toBe(true);

    // unknown couple → not verified, includes nobody
    expect(await service.isCoupleVerified("nope" as never)).toBe(false);
    expect(await service.coupleIncludes("nope" as never, h.id)).toBe(false);
  });

  it("dissolveCouple sets dissolved (idempotent) and rejects an unknown couple", async () => {
    const { service, events } = build();
    const h = await service.registerPerson("doc-1", male);
    const w = await service.registerPerson("doc-1", female);
    const couple = await service.createCouple("doc-1", h.id, w.id);
    if (!couple.ok) return;
    const d = await service.dissolveCouple("doc-1", couple.value.id, "divorce");
    expect(d.ok && d.value.status).toBe("dissolved");
    expect((await events.events()).at(-1)!.payload.type).toBe("CoupleDissolved");
    // idempotent
    const again = await service.dissolveCouple("doc-1", couple.value.id, "divorce");
    expect(again.ok && again.value.status).toBe("dissolved");
    // unknown couple
    const missing = await service.dissolveCouple("doc-1", "nope" as never, "x");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.detailKey).toBe("registry.couple.not_found");
  });
});
