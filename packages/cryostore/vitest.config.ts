import { defineConfig } from "vitest/config";

// Cryostore touches money (annual storage billing, AMD-0003), identity/ownership
// (the thaw-for-treatment re-gate) and witnessing — all hard 100% domains. The
// whole module is held to 100%; declarative/IO-only files are excluded.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/ports.ts", "src/pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
