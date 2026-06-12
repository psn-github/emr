// Deterministic, canonical JSON serialization. The audit hash-chain hashes the
// canonical form of each payload, so serialization MUST be stable regardless of
// key insertion order. Object keys are sorted recursively; arrays keep order.
//
// Rejects values that cannot be represented deterministically (functions,
// undefined, non-finite numbers, BigInt) so we never silently hash a lossy form.

export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error("canonicalize: non-finite number is not representable");
    }
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (t === "bigint") throw new Error("canonicalize: bigint is not representable");
  if (t === "undefined" || t === "function" || t === "symbol") {
    throw new Error(`canonicalize: ${t} is not representable`);
  }

  if (value instanceof Date) return JSON.stringify(value.toISOString());

  if (Array.isArray(value)) {
    return `[${value.map((v) => serialize(v)).join(",")}]`;
  }

  // Plain object: sort keys, drop nothing (undefined props already rejected above
  // because reading them yields `undefined`, which we skip to match JSON.stringify).
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const v = obj[key];
    if (v === undefined) continue; // mirror JSON.stringify's omission of undefined props
    parts.push(`${JSON.stringify(key)}:${serialize(v)}`);
  }
  return `{${parts.join(",")}}`;
}
