import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalDiskBlobStore } from "./blob-store.js";

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");

function store(maxBytes?: number): LocalDiskBlobStore {
  const dir = mkdtempSync(join(tmpdir(), "oxford-blob-"));
  return new LocalDiskBlobStore(dir, false, maxBytes !== undefined ? { maxBytes } : {});
}

describe("LocalDiskBlobStore", () => {
  it("refuses to construct in production (mirrors the dev-provider guards)", () => {
    expect(() => new LocalDiskBlobStore("/tmp/x", true)).toThrow(/must not run in production/);
  });

  it("puts content-addressed and round-trips the bytes + content-type intact", async () => {
    const s = store();
    const put = await s.put({ bytesBase64: b64("scanned-consent"), contentType: "image/png" });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    expect(put.value).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    const got = await s.get(put.value);
    expect(got).toEqual({ bytesBase64: b64("scanned-consent"), contentType: "image/png" });
  });

  it("is content-addressed: identical bytes yield the same ref", async () => {
    const s = store();
    const a = await s.put({ bytesBase64: b64("same"), contentType: "text/plain" });
    const b = await s.put({ bytesBase64: b64("same"), contentType: "text/plain" });
    expect(a.ok && b.ok && a.value === b.value).toBe(true);
  });

  it("rejects invalid base64 cleanly", async () => {
    const s = store();
    const bad = await s.put({ bytesBase64: "not*base*64!", contentType: "image/png" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detailKey).toBe("documents.blob.invalid_base64");
    const wrongLen = await s.put({ bytesBase64: "abc", contentType: "image/png" }); // length % 4 !== 0
    expect(wrongLen.ok).toBe(false);
    if (!wrongLen.ok) expect(wrongLen.error.detailKey).toBe("documents.blob.invalid_base64");
  });

  it("rejects an empty blob", async () => {
    const s = store();
    const empty = await s.put({ bytesBase64: "", contentType: "image/png" });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.detailKey).toBe("documents.blob.empty");
  });

  it("enforces the size cap at the port boundary", async () => {
    const s = store(4); // 4-byte cap
    const tooBig = await s.put({ bytesBase64: b64("12345"), contentType: "image/png" }); // 5 bytes
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error.detailKey).toBe("documents.blob.too_large");
  });

  it("get returns null for an unknown ref", async () => {
    const s = store();
    expect(await s.get("a".repeat(64))).toBeNull();
  });

  it("a malformed blobRef cannot escape the store dir (path-traversal-safe)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oxford-blob-"));
    const s = new LocalDiskBlobStore(dir);
    // Plant a file OUTSIDE the store dir; a traversal ref must never read it.
    const secret = join(tmpdir(), `oxford-secret-${Date.now()}.txt`);
    writeFileSync(secret, "top-secret");
    expect(await s.get("../".repeat(8) + secret)).toBeNull();
    expect(await s.get("../../etc/passwd")).toBeNull();
    expect(await s.get("NOTHEX")).toBeNull();
  });

  it("falls back to octet-stream when the type sidecar is absent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "oxford-blob-"));
    const s = new LocalDiskBlobStore(dir);
    // Write only the bytes file (no `.type` sidecar) at a valid hash name.
    const ref = "b".repeat(64);
    writeFileSync(join(dir, ref), Buffer.from("x"));
    const got = await s.get(ref);
    expect(got?.contentType).toBe("application/octet-stream");
  });
});
