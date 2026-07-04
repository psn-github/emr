// Blob storage seam for document CONTENT (ADR-0067). The metadata store
// (`DocumentStore`) holds the versioned record + the opaque `blobRef`; the bytes
// live behind this port. Staging uses `LocalDiskBlobStore` (content-addressed
// files on disk); the in-region object store is the production backend behind the
// SAME port (presigned uploads + residency ADR). Kept out of the deploy path,
// mirroring the DB rule.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Result, AppError } from "@oxford/core";
import { ok, err, validationError } from "@oxford/core";

/** The bytes (base64 over the wire) + content-type of one stored blob. */
export interface BlobData {
  readonly bytesBase64: string;
  readonly contentType: string;
}

/**
 * Content-storage boundary. `put` is content-addressed — the returned `blobRef`
 * is the sha256 of the decoded bytes — and validates/size-caps at the boundary.
 * `get` returns null for an unknown OR malformed ref (never throws, never touches
 * the filesystem for a non-hash ref → path-traversal-safe).
 */
export interface BlobStorePort {
  put(blob: BlobData): Promise<Result<string, AppError>>;
  get(blobRef: string): Promise<BlobData | null>;
}

/** A valid blobRef is exactly a 64-char lowercase hex sha256 — nothing else is
 *  ever used to build a filesystem path, so `../…` can never escape the root. */
const HEX64 = /^[a-f0-9]{64}$/;
/** Decoded-size cap at the port boundary (staging base64-over-tRPC scale). */
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface LocalDiskBlobStoreOptions {
  /** Decoded-byte cap; defaults to 10 MB. Configuration, not code. */
  readonly maxBytes?: number;
}

/**
 * Staging blob store: content-addressed files under `rootDir` (the sha256 hex is
 * the filename; the content-type sits in a `.type` sidecar). REFUSES production
 * (mirrors DevOidcProvider / LocalKeyProvider) — the in-region object store is the
 * production backend behind `BlobStorePort`. Path-traversal-safe and size-capped.
 */
export class LocalDiskBlobStore implements BlobStorePort {
  private readonly maxBytes: number;

  constructor(
    private readonly rootDir: string,
    isProduction = false,
    options: LocalDiskBlobStoreOptions = {},
  ) {
    if (isProduction) {
      throw new Error(
        "LocalDiskBlobStore must not run in production — wire the in-region object store behind BlobStorePort",
      );
    }
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async put(blob: BlobData): Promise<Result<string, AppError>> {
    const decoded = decodeBase64(blob.bytesBase64);
    if (decoded === null) return err(validationError("blob is not valid base64", "documents.blob.invalid_base64"));
    if (decoded.length === 0) return err(validationError("blob is empty", "documents.blob.empty"));
    if (decoded.length > this.maxBytes) {
      return err(validationError(`blob exceeds the ${this.maxBytes}-byte cap`, "documents.blob.too_large"));
    }
    const ref = createHash("sha256").update(decoded).digest("hex");
    await mkdir(this.rootDir, { recursive: true });
    const path = this.pathFor(ref);
    await writeFile(path, decoded);
    await writeFile(`${path}.type`, blob.contentType, "utf8");
    return ok(ref);
  }

  async get(blobRef: string): Promise<BlobData | null> {
    if (!HEX64.test(blobRef)) return null; // traversal-safe: only a bare hash is a path
    const path = this.pathFor(blobRef);
    if (!existsSync(path)) return null;
    const bytes = await readFile(path);
    const contentType = existsSync(`${path}.type`)
      ? await readFile(`${path}.type`, "utf8")
      : "application/octet-stream";
    return { bytesBase64: bytes.toString("base64"), contentType };
  }

  private pathFor(ref: string): string {
    return join(this.rootDir, ref);
  }
}

/** Strict base64 decode: rejects non-base64 input (Buffer.from is too lenient,
 *  silently dropping invalid characters). Returns null on any malformed input. */
function decodeBase64(s: string): Buffer | null {
  if (s.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  return Buffer.from(s, "base64");
}
