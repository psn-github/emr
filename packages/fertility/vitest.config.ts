import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/gate.ts", "src/protocols.ts", "src/stimulation.ts", "src/monitoring.ts", "src/pg-store.ts", "src/stim-pg-store.ts", "src/monitoring-pg-store.ts", "src/reason-pg-store.ts", "src/cycle-template-pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
