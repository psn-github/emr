import { defineConfig } from "vitest/config";

// @oxford/pharmacy — Ground-floor dispensing (ADR-0066). The whole module carries
// the ≥80% domain bar; the pure dispensing/drug-quantity logic (status lifecycle,
// allocation math, cold-chain + controlled requirements) is drug-safety logic and
// is held to 100% (CLAUDE.md drugs bar). IO-only files (schema/types/ports/pg-
// store/index) are excluded from the module measurement.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/ports.ts", "src/pg-store.ts", "src/**/*.test.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // 100% on the deterministic dispensing / drug-quantity logic (drugs bar).
        "**/dispensing.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
