import { defineConfig } from "vitest/config";

// CLAUDE.md testing bar: 100% on witnessing/money/dose — and the audit spine is
// held to the same bar. Coverage runs as part of `test`, so CI fails on any gap.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // pg-store.ts is I/O integration code, proven by the adversarial integration
      // test (audit-tamper.attack.test.ts) against a real Postgres, not the unit
      // coverage gate. The pure hash-chain logic remains at 100%.
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
