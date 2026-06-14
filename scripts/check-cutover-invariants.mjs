#!/usr/bin/env node
// Cutover invariant check (go-live gate). Asserts the structural product-owner
// rules that must hold before production — the ones that are STRUCTURALLY ABSENT,
// not merely disabled (CLAUDE.md / AMD-0006). Complements check-migrations-safe
// (additive deploys) and check-boundaries (module isolation). Dependency-free.
//
// Scope is deliberately narrow + grep-safe: the broader invariants (no posthumous
// use, own-gametes-only, append-only audit, witnessing gate) are enforced by the
// adversarial test suite — see docs/GO_LIVE_CHECKLIST.md for the full matrix.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${detail}`);
};

// 1. NO CASH (ADR-0034): PaymentMethod is exactly knet|card — cash is not a member.
const billingTypes = readFileSync(join(ROOT, "packages/billing/src/types.ts"), "utf8");
const pm = billingTypes.match(/PAYMENT_METHODS\s*=\s*\[([^\]]*)\]/);
check("no-cash", pm !== null, "PAYMENT_METHODS constant not found in billing/types.ts");
if (pm !== null) {
  const members = [...pm[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  check("no-cash", JSON.stringify(members) === JSON.stringify(["card", "knet"]), `PaymentMethod must be exactly [card, knet], found [${members.join(", ")}]`);
}

// 2. NO TAX (ADR-0035): the billing money model carries no tax field/calculation.
for (const f of ["packages/billing/src/types.ts", "packages/billing/src/money.ts"]) {
  const src = readFileSync(join(ROOT, f), "utf8");
  check("no-tax", !/\btaxFils\b|\btaxRateBps\b|\btaxAmount\b/.test(src), `tax field/calc present in ${f} (no tax in Kuwait, ADR-0035)`);
}

if (failures.length > 0) {
  console.error("check-cutover-invariants: FAILED");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("check-cutover-invariants: clean (no-cash + no-tax structural rules hold).");
