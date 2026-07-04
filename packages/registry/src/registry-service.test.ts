import { describe, expect, it } from "vitest";
import { fixedClock, asId, err, type Result } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import type { DecryptError, EncryptedValue, KeyProvider } from "@oxford/crypto";
import { LocalKeyProvider } from "@oxford/crypto";
import { RegistryService } from "./registry-service.js";
import { InMemoryRegistryStore } from "./store.js";
import type { PersonId, RegisterPersonInput } from "./person.js";

function build(keys: KeyProvider = new LocalKeyProvider(false)) {
  const clock = fixedClock(new Date("2026-06-12T11:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const store = new InMemoryRegistryStore();
  const service = new RegistryService(store, keys, audit, events, clock);
  return { service, store, audit, events };
}

const husbandInput: RegisterPersonInput = {
  name: { ar: "محمد", en: "Mohammed" },
  civilId: "284010112345",
  dob: "1984-01-01",
  sex: "male",
  nationality: "KW",
  languagePref: "ar",
  contact: { phone: "+965500000" },
  photoRef: "photo-1",
};

const wifeInput: RegisterPersonInput = {
  name: { ar: "سارة", en: "Sara" },
  civilId: "286050167890",
  dob: "1986-05-01",
  sex: "female",
  nationality: "KW",
  languagePref: "ar",
};

describe("RegistryService.registerPerson", () => {
  it("encrypts the Civil ID, audits CREATE, emits PersonRegistered", async () => {
    const { service, audit, events } = build();
    const person = await service.registerPerson("staff-1", husbandInput);
    expect(person.civilIdEnc).not.toContain("284010112345");
    expect(person.contact).toEqual({ phone: "+965500000" });
    expect(person.photoRef).toBe("photo-1");

    const entries = await audit.entries();
    expect(entries[0]!.payload.action).toBe("CREATE");
    // No plaintext Civil ID anywhere in the audit payload.
    expect(JSON.stringify(entries[0]!.payload)).not.toContain("284010112345");
    expect((await events.events())[0]!.payload.type).toBe("PersonRegistered");
  });

  it("defaults contact and photoRef when omitted", async () => {
    const { service } = build();
    const person = await service.registerPerson("staff-1", wifeInput);
    expect(person.contact).toEqual({});
    expect(person.photoRef).toBeNull();
  });

  it("reads a person by id (bilingual name); null for an unknown id", async () => {
    const { service } = build();
    const person = await service.registerPerson("staff-1", husbandInput);
    expect((await service.person(person.id))?.name.en).toBe(husbandInput.name.en);
    expect(await service.person(asId<"Person">("ghost"))).toBeNull();
  });
});

describe("RegistryService.createCouple", () => {
  it("creates a pending couple from a husband and wife", async () => {
    const { service } = build();
    const h = await service.registerPerson("s", husbandInput);
    const w = await service.registerPerson("s", wifeInput);
    const r = await service.createCouple("s", h.id, w.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("pending_verification");
  });

  it("rejects the same person as both partners", async () => {
    const { service } = build();
    const h = await service.registerPerson("s", husbandInput);
    const r = await service.createCouple("s", h.id, h.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.couple.same_person");
  });

  it("rejects when a partner is not registered", async () => {
    const { service } = build();
    const h = await service.registerPerson("s", husbandInput);
    const r = await service.createCouple("s", h.id, asId<"Person">("ghost"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("enforces husband=male, wife=female (own-gametes roles)", async () => {
    const { service } = build();
    const w1 = await service.registerPerson("s", wifeInput);
    const w2 = await service.registerPerson("s", { ...wifeInput, civilId: "286050199999" });
    const r = await service.createCouple("s", w1.id, w2.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.couple.roles");
  });
});

async function verifiedCouple() {
  const ctx = build();
  const h = await ctx.service.registerPerson("s", husbandInput);
  const w = await ctx.service.registerPerson("s", wifeInput);
  const created = await ctx.service.createCouple("s", h.id, w.id);
  if (!created.ok) throw new Error("setup failed");
  return { ...ctx, husband: h, wife: w, couple: created.value };
}

describe("RegistryService.verifyMarriage + the fertility gate", () => {
  it("verifies a couple and then permits fertility", async () => {
    const ctx = await verifiedCouple();
    const r = await ctx.service.verifyMarriage("registrar", ctx.couple.id, { documentRef: "doc-1", method: "certificate" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("verified");
      expect(r.value.marriageVerificationId).not.toBeNull();
    }
    expect((await ctx.service.canStartFertility(ctx.couple.id)).ok).toBe(true);
  });

  it("blocks fertility before verification", async () => {
    const ctx = await verifiedCouple();
    const r = await ctx.service.canStartFertility(ctx.couple.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.marriage.unverified");
  });

  it("canStartFertility reports not-found for an unknown couple", async () => {
    const { service } = build();
    const r = await service.canStartFertility(asId<"Couple">("nope"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("verifyMarriage reports not-found for an unknown couple", async () => {
    const { service } = build();
    const r = await service.verifyMarriage("r", asId<"Couple">("nope"), { documentRef: "d", method: "m" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("refuses to verify a dissolved couple", async () => {
    const ctx = await verifiedCouple();
    await ctx.store.saveCouple({ ...ctx.couple, status: "dissolved" });
    const r = await ctx.service.verifyMarriage("r", ctx.couple.id, { documentRef: "d", method: "m" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.couple.dissolved");
  });
});

describe("RegistryService.revealCivilId", () => {
  it("decrypts and audits a sensitive export without recording the value", async () => {
    const { service, audit } = build();
    const person = await service.registerPerson("s", husbandInput);
    const r = await service.revealCivilId("auditor", person.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("284010112345");
    const exportEntry = (await audit.entries()).find((e) => e.payload.action === "READ_EXPORT");
    expect(exportEntry!.payload.after).toEqual({ field: "civil_id" });
    expect(JSON.stringify(exportEntry!.payload)).not.toContain("284010112345");
  });

  it("reports not-found for an unknown person", async () => {
    const { service } = build();
    const r = await service.revealCivilId("s", asId<"Person">("ghost"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("surfaces an internal error if decryption fails", async () => {
    const failingKeys: KeyProvider = {
      encrypt: async () => "v1.x.y.z" as EncryptedValue,
      decrypt: async (): Promise<Result<string, DecryptError>> => err("AUTH_FAILED"),
    };
    const { service } = build(failingKeys);
    const person = await service.registerPerson("s", husbandInput);
    const r = await service.revealCivilId("s", person.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INTERNAL");
  });
});

describe("RegistryService.mergePersons", () => {
  it("rejects merging a person into itself", async () => {
    const { service } = build();
    const p = await service.registerPerson("s", husbandInput);
    const r = await service.mergePersons("s", p.id, p.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("registry.merge.same_person");
  });

  it("rejects when a person is missing", async () => {
    const { service } = build();
    const p = await service.registerPerson("s", husbandInput);
    const r = await service.mergePersons("s", p.id, asId<"Person">("ghost"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("repoints couple references (husband and wife) and tombstones the duplicate", async () => {
    const { service, store, events } = build();
    const survivingHusband = await service.registerPerson("s", husbandInput);
    const dupHusband = await service.registerPerson("s", { ...husbandInput, civilId: "284010100000" });
    const survivingWife = await service.registerPerson("s", wifeInput);
    const dupWife = await service.registerPerson("s", { ...wifeInput, civilId: "286050100000" });
    const wifeForC1 = await service.registerPerson("s", { ...wifeInput, civilId: "286050111111" });
    const husbandForC2 = await service.registerPerson("s", { ...husbandInput, civilId: "284010122222" });

    // c1: duplicate appears as the husband; c2: a duplicate appears as the wife.
    const c1 = await service.createCouple("s", dupHusband.id, wifeForC1.id);
    const c2 = await service.createCouple("s", husbandForC2.id, dupWife.id);
    if (!c1.ok || !c2.ok) throw new Error("setup failed");

    expect((await service.mergePersons("s", survivingHusband.id, dupHusband.id)).ok).toBe(true);
    expect((await service.mergePersons("s", survivingWife.id, dupWife.id)).ok).toBe(true);

    expect((await store.getCouple(c1.value.id))!.husbandPersonId).toBe(survivingHusband.id);
    expect((await store.getCouple(c2.value.id))!.wifePersonId).toBe(survivingWife.id);

    const dup = await store.getPerson(dupHusband.id as PersonId);
    expect(dup!.deletedAt).not.toBeNull();
    expect(dup!.mergedInto).toBe(survivingHusband.id);
    expect((await events.events()).some((e) => e.payload.type === "PersonsMerged")).toBe(true);
  });
});
