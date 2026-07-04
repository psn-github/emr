// e2e — the documents module THROUGH the tRPC API on real Postgres (docs/
// PHASE8_PLAN §8.2, ADR-0067). Proves the scanned-paper flow: upload a small
// scanned consent (base64 bytes) → it lands versioned + access-gated → list by
// subjectRef → read the bytes back INTACT → addVersion supersedes → a role WITHOUT
// the document's requiredPermission is FORBIDDEN on read AND the content read is
// audited (READ_EXPORT) → oversize/invalid blobs are rejected cleanly → the audit
// hash-chain stays intact. Runs where DATABASE_URL is set.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@oxford/identity";
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { appRouter } from "./router.js";

const DATABASE_URL = process.env.DATABASE_URL;

// A small fake PNG (a few bytes of binary) — the scanned-consent payload.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
const PNG_B64 = PNG_BYTES.toString("base64");
const V2_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]).toString("base64");
const REQUIRED = "clinical:document.read";

const clerk: Session = {
  sessionId: "s-clerk",
  subject: { staffId: "clerk-1", roles: [{ id: "records-clerk", name: "records-clerk", permissions: ["clinical:document.write", "clinical:document.read"] }] },
  mfa: true,
};
// A clinician who may READ the document (holds its requiredPermission) but is a
// different actor than the uploader.
const reader: Session = {
  sessionId: "s-reader",
  subject: { staffId: "reader-1", roles: [{ id: "reader", name: "reader", permissions: ["clinical:document.read"] }] },
  mfa: true,
};
// A role WITHOUT the document's requiredPermission (booking only) → forbidden read.
const deskOnly: Session = {
  sessionId: "s-desk",
  subject: { staffId: "desk-1", roles: [{ id: "desk", name: "desk", permissions: ["scheduling:appointment.book"] }] },
  mfa: false,
};

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected tRPC error ${code}, got success`);
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe.skipIf(!DATABASE_URL)("documents (e2e via the API + real Postgres)", () => {
  const pool = createPool(DATABASE_URL!);
  let services: ReturnType<typeof buildServices>;
  let clerkApi: ReturnType<typeof appRouter.createCaller>;
  let readerApi: ReturnType<typeof appRouter.createCaller>;
  const savedEnv = { dir: process.env.DOCUMENT_STORE_DIR, max: process.env.DOCUMENT_MAX_BYTES };

  beforeAll(async () => {
    await runMigrations(pool);
    // Isolate the blob root to a temp dir and cap uploads small so oversize is cheap.
    process.env.DOCUMENT_STORE_DIR = mkdtempSync(join(tmpdir(), "oxford-docs-e2e-"));
    process.env.DOCUMENT_MAX_BYTES = "64";
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE documents.document, documents.document_version, audit.audit_log");
    services = buildServices(pool);
    clerkApi = appRouter.createCaller({ session: clerk, patient: null, services });
    readerApi = appRouter.createCaller({ session: reader, patient: null, services });
  });
  afterAll(async () => {
    process.env.DOCUMENT_STORE_DIR = savedEnv.dir;
    process.env.DOCUMENT_MAX_BYTES = savedEnv.max;
    await pool.end();
  });

  it("uploads a scanned consent, lists it, reads bytes back intact, versions it, audits", async () => {
    const subjectRef = "Couple:c-1";
    const up = await clerkApi.documents.upload({ kind: "consent", subjectRef, requiredPermission: REQUIRED, contentType: "image/png", bytesBase64: PNG_B64 });
    expect(up.version).toBe(1);

    // list by subjectRef (metadata only — never the blobRef)
    const listed = await readerApi.documents.list({ subjectRef });
    expect(listed.documents).toHaveLength(1);
    expect(listed.documents[0]).toMatchObject({ documentId: up.documentId, kind: "consent", subjectRef, requiredPermission: REQUIRED, currentVersion: 1, contentType: "image/png" });
    expect(JSON.stringify(listed.documents[0])).not.toContain("blobRef");

    // read back — the base64 round-trips byte-for-byte
    const read = await readerApi.documents.read({ documentId: up.documentId });
    expect(read.contentType).toBe("image/png");
    expect(read.bytesBase64).toBe(PNG_B64);
    expect(Buffer.from(read.bytesBase64, "base64").equals(PNG_BYTES)).toBe(true);

    // addVersion supersedes (current version → 2); the read now returns v2 bytes
    const v2 = await clerkApi.documents.addVersion({ documentId: up.documentId, contentType: "image/png", bytesBase64: V2_B64 });
    expect(v2.version).toBe(2);
    expect((await readerApi.documents.meta({ documentId: up.documentId })).currentVersion).toBe(2);
    expect((await readerApi.documents.read({ documentId: up.documentId })).bytesBase64).toBe(V2_B64);

    // the content read is audited as a sensitive READ_EXPORT on the document
    const trail = await services.audit.entriesForEntity("Document", up.documentId);
    expect(trail.some((e) => e.payload.action === "READ_EXPORT")).toBe(true);
    expect(trail.some((e) => e.payload.action === "CREATE")).toBe(true);

    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });

  it("FORBIDS a role without the document's requiredPermission on read/meta (and does not leak content)", async () => {
    const subjectRef = "Person:p-9";
    const up = await clerkApi.documents.upload({ kind: "id_scan", subjectRef, requiredPermission: REQUIRED, contentType: "image/png", bytesBase64: PNG_B64 });
    const desk = appRouter.createCaller({ session: deskOnly, patient: null, services });
    await expectCode(() => desk.documents.read({ documentId: up.documentId }), "FORBIDDEN");
    await expectCode(() => desk.documents.meta({ documentId: up.documentId }), "FORBIDDEN");
    // list filters out inaccessible documents rather than erroring
    expect((await desk.documents.list({ subjectRef })).documents).toHaveLength(0);
    // the denied read did NOT audit a READ_EXPORT (the authorizer audited the denial)
    const trail = await services.audit.entriesForEntity("Document", up.documentId);
    expect(trail.some((e) => e.payload.action === "READ_EXPORT")).toBe(false);
  });

  it("rejects oversize and malformed blobs cleanly (BAD_REQUEST)", async () => {
    const big = Buffer.alloc(128).toString("base64"); // 128 bytes > 64-byte test cap
    await expectCode(() => clerkApi.documents.upload({ kind: "other", subjectRef: "Person:p-1", requiredPermission: REQUIRED, contentType: "image/png", bytesBase64: big }), "BAD_REQUEST");
    await expectCode(() => clerkApi.documents.upload({ kind: "other", subjectRef: "Person:p-1", requiredPermission: REQUIRED, contentType: "image/png", bytesBase64: "not*base64*" }), "BAD_REQUEST");
    expect((await services.audit.verifyIntegrity()).ok).toBe(true);
  });
});
