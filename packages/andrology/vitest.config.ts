import { defineConfig } from "vitest/config";

// Andrology: held to 100% (diagnostic flagging drives clinical decisions; the
// freeze touches the witnessing seam). Declarative/IO-only files excluded.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/witness-port.ts", "src/pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
