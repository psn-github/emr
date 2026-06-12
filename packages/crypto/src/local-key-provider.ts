import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import type { Result } from "@oxford/core";
import { ok, err } from "@oxford/core";
import type { DecryptError, EncryptedValue, KeyProvider } from "./key-provider.js";

// Local development KeyProvider: real AES-256-GCM authenticated encryption, but
// with a DETERMINISTIC DEV KEY derived from a label — never used for real PHI.
// It refuses to construct in production (mirrors DevOidcProvider, ADR-0011/0012)
// so the dev key can never become the custodian for real Civil IDs.

const ENVELOPE_VERSION = "v1";
const DEV_KEY_LABEL = "oxford-his-local-dev-key — NOT FOR REAL PHI";

export class LocalKeyProvider implements KeyProvider {
  private readonly key: Buffer;

  constructor(isProduction: boolean) {
    if (isProduction) {
      throw new Error(
        "LocalKeyProvider must never run in production — wire the in-region KMS provider (ADR-0012)",
      );
    }
    // 32-byte key deterministically derived from the label (dev only).
    this.key = createHash("sha256").update(DEV_KEY_LABEL).digest();
  }

  async encrypt(plaintext: string, aad: string): Promise<EncryptedValue> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      ENVELOPE_VERSION,
      iv.toString("base64"),
      tag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(".") as EncryptedValue;
  }

  async decrypt(value: EncryptedValue, aad: string): Promise<Result<string, DecryptError>> {
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
      return err("MALFORMED");
    }
    try {
      const iv = Buffer.from(parts[1]!, "base64");
      const tag = Buffer.from(parts[2]!, "base64");
      const ciphertext = Buffer.from(parts[3]!, "base64");
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return ok(plaintext.toString("utf8"));
    } catch {
      // Wrong AAD, tampered ciphertext/tag, or bad iv length — all surface here.
      return err("AUTH_FAILED");
    }
  }
}
