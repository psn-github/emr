import { defineConfig } from "vitest/config";

// @oxford/pharmacy — prescriptions + theatre drugs (ADR-0069, supersedes the
// dispensing model of ADR-0066). The whole module carries the ≥80% domain bar; the
// pure drug-quantity/administration logic (status lifecycle, allocation math, cold-
// chain + controlled requirements) is drug-safety logic and is held to 100%
// (CLAUDE.md drugs bar). IO-only files (schema/types/ports/pg-store/index) are
// excluded from the module measurement.
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
        // 100% on the deterministic administration / drug-quantity logic (drugs bar).
        "**/administration.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
