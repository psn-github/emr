import { createHash } from "node:crypto";
import { canonicalize } from "@oxford/core";

// The genesis link for an empty chain. 64 hex zeros (sha-256 width).
export const GENESIS_HASH = "0".repeat(64);

/**
 * Hash of one chain link. Binds the previous hash, the sequence number, the
 * timestamp, and the canonical payload together, so ANY of these changing —
 * including reordering (seq) or back-dating (occurredAt) — breaks the chain.
 *
 * hash = SHA-256( canonical({ prevHash, seq, occurredAt, payload }) )
 */
export function computeLinkHash(
  prevHash: string,
  seq: number,
  occurredAt: string,
  payload: unknown,
): string {
  const material = canonicalize({ prevHash, seq, occurredAt, payload });
  return createHash("sha256").update(material, "utf8").digest("hex");
}
