import { describe, expect, it } from "vitest";
import { LocalKeyProvider } from "./local-key-provider.js";
import type { EncryptedValue } from "./key-provider.js";

const aad = "person.civil_id";

describe("LocalKeyProvider", () => {
  it("refuses to construct in production", () => {
    expect(() => new LocalKeyProvider(true)).toThrow(/never run in production/);
  });

  it("round-trips a value under the same AAD", async () => {
    const kp = new LocalKeyProvider(false);
    const ct = await kp.encrypt("284010112345", aad);
    expect(ct).not.toContain("284010112345"); // not stored in clear
    const r = await kp.decrypt(ct, aad);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("284010112345");
  });

  it("produces a fresh IV each time (ciphertexts differ)", async () => {
    const kp = new LocalKeyProvider(false);
    const a = await kp.encrypt("same", aad);
    const b = await kp.encrypt("same", aad);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt under a different AAD (field-relocation defence)", async () => {
    const kp = new LocalKeyProvider(false);
    const ct = await kp.encrypt("secret", "person.civil_id");
    const r = await kp.decrypt(ct, "billing.payment_ref");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("AUTH_FAILED");
  });

  it("fails AUTH on a tampered ciphertext", async () => {
    const kp = new LocalKeyProvider(false);
    const ct = await kp.encrypt("secret", aad);
    const parts = ct.split(".");
    parts[3] = Buffer.from("tampered-bytes").toString("base64");
    const r = await kp.decrypt(parts.join(".") as EncryptedValue, aad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("AUTH_FAILED");
  });

  it("reports MALFORMED on a bad envelope", async () => {
    const kp = new LocalKeyProvider(false);
    expect((await kp.decrypt("not-an-envelope" as EncryptedValue, aad)).ok).toBe(false);
    const wrongVersion = "v9.a.b.c" as EncryptedValue;
    const r = await kp.decrypt(wrongVersion, aad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("MALFORMED");
  });
});
