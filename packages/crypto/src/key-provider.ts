import type { Result } from "@oxford/core";

// The KeyProvider seam (ADR-0012). Field-level encryption for sensitive data
// (Civil ID, payment refs — docs/02 §5, docs/03 §4) is built and tested against
// this interface NOW; the real in-region KMS (Oracle Cloud Kuwait / approved
// CSP) is implemented behind the SAME interface after the residency review, so
// the provider decision never blocks the encryption logic.

/** Opaque serialized ciphertext envelope (iv + auth tag + ciphertext). */
export type EncryptedValue = string & { readonly __brand: "EncryptedValue" };

export type DecryptError = "MALFORMED" | "AUTH_FAILED";

export interface KeyProvider {
  /**
   * Encrypt plaintext. `aad` (additional authenticated data — e.g. the field
   * name "person.civil_id") is bound into the ciphertext, so a value cannot be
   * silently relocated to a different field. Async to match a network KMS.
   */
  encrypt(plaintext: string, aad: string): Promise<EncryptedValue>;
  /** Decrypt; fails (does not throw) on a malformed envelope or AAD/tag mismatch. */
  decrypt(value: EncryptedValue, aad: string): Promise<Result<string, DecryptError>>;
}
