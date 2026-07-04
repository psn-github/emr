import { defineConfig } from "vitest/config";

// @oxford/records — paper medical-records module. The whole module carries the
// ≥80% domain bar; the pure Code 128 encoder and label renderers are safety-/
// print-critical deterministic output and are held to 100% (ADR-0065). IO-only
// files (schema/types/pg-store/index) are excluded from the module measurement.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/pg-store.ts", "src/**/*.test.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // 100% on the deterministic encoder + label renderers (ADR-0065).
        "**/code128.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "**/labels.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "**/mrn.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
