import { defineConfig } from "vitest/config";

// @oxford/print — pure, deterministic bilingual print renderers (ADR-0068). The
// renderers are the single tested source of truth every UI shell open-and-prints,
// so the whole module is held to 100% (index.ts is a re-export barrel).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
