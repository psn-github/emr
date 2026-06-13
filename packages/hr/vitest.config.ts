import { defineConfig } from "vitest/config";

// HR carries licence/competency expiry (clinician fitness-to-practise) — the
// expiry logic is held to 100%. Declarative/IO-only excluded.
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
