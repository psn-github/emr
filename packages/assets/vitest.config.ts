import { defineConfig } from "vitest/config";

// Asset management carries a PATIENT-SAFETY gate: a critical device with overdue
// (or missing) calibration must be blocked from use. The blocking/calibration
// logic is held to 100%; declarative/IO-only files are excluded.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
