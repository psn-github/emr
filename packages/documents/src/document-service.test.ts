import { describe, expect, it } from "vitest";
import { fixedClock, asId, err, forbidden, type Result, type AppError } from "@oxford/core";
import { AuditLog, DomainEventLog, InMemoryChainStore, type AuditPayload, type DomainEventPayload } from "@oxford/audit";
import { DocumentService, type CreateDocumentInput } from "./document-service.js";
import { InMemoryDocumentStore } from "./store.js";
import { NoopOcrProvider, type OcrProvider } from "./ocr.js";
import { allowAllGuard, type AccessGuard } from "./access.js";

const textOcr = (text: string): OcrProvider => ({ extract: async () => text });
const denyGuard: AccessGuard = { check: async (): Promise<Result<void, AppError>> => err(forbidden("no", "auth.forbidden")) };

function build(ocr: OcrProvider = new NoopOcrProvider()) {
  const clock = fixedClock(new Date("2026-06-12T12:00:00.000Z"));
  const audit = new AuditLog(new InMemoryChainStore<AuditPayload>(), clock);
  const events = new DomainEventLog(new InMemoryChainStore<DomainEventPayload>(), clock);
  const store = new InMemoryDocumentStore();
  const service = new DocumentService(store, ocr, audit, events, clock);
  return { service, store, audit, events };
}

const consentInput: CreateDocumentInput = {
  kind: "consent",
  subjectRef: "Couple:c1",
  requiredPermission: "clinical:document.read",
  blobRef: "blob://1",
  contentType: "application/pdf",
};

describe("DocumentService.create", () => {
  it("creates v1, OCR-indexes, audits CREATE, emits event", async () => {
    const { service, audit, events } = build(textOcr("marriage certificate text"));
    const doc = await service.create("staff-1", consentInput);
    expect(doc.versions).toHaveLength(1);
    expect(doc.versions[0]!.ocrText).toBe("marriage certificate text");
    expect((await audit.entries())[0]!.payload.action).toBe("CREATE");
    expect((await events.events())[0]!.payload.type).toBe("DocumentCreated");
  });

  it("stores empty OCR text under the no-op provider", async () => {
    const { service } = build();
    const doc = await service.create("staff-1", consentInput);
    expect(doc.versions[0]!.ocrText).toBe("");
  });
});

describe("DocumentService.addVersion", () => {
  it("appends a new version (history preserved)", async () => {
    const { service } = build(textOcr("v"));
    const doc = await service.create("s", consentInput);
    const r = await service.addVersion("s", doc.id, { blobRef: "blob://2", contentType: "application/pdf" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.versions.map((v) => v.version)).toEqual([1, 2]);
    }
  });

  it("reports not-found for an unknown document", async () => {
    const { service } = build();
    const r = await service.addVersion("s", asId<"Document">("ghost"), { blobRef: "b", contentType: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });

  it("refuses to version a deleted document", async () => {
    const { service } = build();
    const doc = await service.create("s", consentInput);
    await service.softDelete("s", doc.id);
    const r = await service.addVersion("s", doc.id, { blobRef: "b", contentType: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detailKey).toBe("documents.deleted");
  });
});

describe("DocumentService.access (RBAC-gated, audited)", () => {
  it("returns content and audits a READ_EXPORT when allowed", async () => {
    const { service, audit } = build();
    const doc = await service.create("s", consentInput);
    const r = await service.access("reader", doc.id, allowAllGuard);
    expect(r.ok).toBe(true);
    expect((await audit.entries()).some((e) => e.payload.action === "READ_EXPORT")).toBe(true);
  });

  it("denies and does NOT audit a read when the guard refuses", async () => {
    const { service, audit } = build();
    const doc = await service.create("s", consentInput);
    const r = await service.access("reader", doc.id, denyGuard);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
    expect((await audit.entries()).some((e) => e.payload.action === "READ_EXPORT")).toBe(false);
  });

  it("reports not-found for unknown and deleted documents", async () => {
    const { service } = build();
    expect((await service.access("r", asId<"Document">("ghost"), allowAllGuard)).ok).toBe(false);
    const doc = await service.create("s", consentInput);
    await service.softDelete("s", doc.id);
    expect((await service.access("r", doc.id, allowAllGuard)).ok).toBe(false);
  });
});

describe("DocumentService.softDelete", () => {
  it("soft-deletes once and is not idempotent on a second call", async () => {
    const { service } = build();
    const doc = await service.create("s", consentInput);
    expect((await service.softDelete("s", doc.id)).ok).toBe(true);
    const again = await service.softDelete("s", doc.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.detailKey).toBe("documents.already_deleted");
  });

  it("reports not-found for an unknown document", async () => {
    const { service } = build();
    expect((await service.softDelete("s", asId<"Document">("ghost"))).ok).toBe(false);
  });
});

describe("DocumentService.listForSubject (access-filtered metadata)", () => {
  it("returns a subject's non-deleted documents the guard allows, and none when denied", async () => {
    const { service } = build();
    await service.create("s", consentInput);
    await service.create("s", { ...consentInput, subjectRef: "Couple:other" });
    const visible = await service.listForSubject("Couple:c1", allowAllGuard);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.subjectRef).toBe("Couple:c1");
    expect(await service.listForSubject("Couple:c1", denyGuard)).toHaveLength(0);
  });

  it("excludes soft-deleted documents", async () => {
    const { service } = build();
    const doc = await service.create("s", consentInput);
    await service.softDelete("s", doc.id);
    expect(await service.listForSubject("Couple:c1", allowAllGuard)).toHaveLength(0);
  });
});

describe("DocumentService.meta (access-gated, not audited)", () => {
  it("returns metadata when allowed and does NOT audit a READ_EXPORT", async () => {
    const { service, audit } = build();
    const doc = await service.create("s", consentInput);
    const r = await service.meta(doc.id, allowAllGuard);
    expect(r.ok).toBe(true);
    expect((await audit.entries()).some((e) => e.payload.action === "READ_EXPORT")).toBe(false);
  });

  it("denies when the guard refuses", async () => {
    const { service } = build();
    const doc = await service.create("s", consentInput);
    const r = await service.meta(doc.id, denyGuard);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });

  it("reports not-found for unknown and deleted documents", async () => {
    const { service } = build();
    expect((await service.meta(asId<"Document">("ghost"), allowAllGuard)).ok).toBe(false);
    const doc = await service.create("s", consentInput);
    await service.softDelete("s", doc.id);
    expect((await service.meta(doc.id, allowAllGuard)).ok).toBe(false);
  });
});

describe("DocumentService.search", () => {
  it("matches OCR text case-insensitively and filters by access", async () => {
    const { service } = build(textOcr("Marriage Certificate — Khaleeji"));
    await service.create("s", consentInput);
    const visible = await service.search("marriage", allowAllGuard);
    expect(visible).toHaveLength(1);
    const hidden = await service.search("marriage", denyGuard);
    expect(hidden).toHaveLength(0);
    expect(await service.search("nonexistent-term", allowAllGuard)).toHaveLength(0);
  });
});
