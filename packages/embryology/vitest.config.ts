import { defineConfig } from "vitest/config";

// Embryology touches the witnessing gate (a hard safety domain). The whole
// module is held to 100% — declarative/IO-only files are excluded from the
// coverage set (interfaces, schema, the Postgres store, the public barrel).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/witness-port.ts", "src/pg-store.ts", "src/qc-pg-store.ts", "src/morphokinetics-pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
