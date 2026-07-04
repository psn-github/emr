import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // pg-store.ts is I/O integration code, proven by the apps/api e2e against a
      // real Postgres, not the unit coverage gate.
      exclude: ["src/index.ts", "src/schema.ts", "src/pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
