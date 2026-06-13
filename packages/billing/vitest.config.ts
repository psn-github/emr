import { defineConfig } from "vitest/config";

// Money: 100% coverage is mandatory (CLAUDE.md). Whole module held to 100%.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/pg-store.ts", "src/package-pg-store.ts", "src/instalment-pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
