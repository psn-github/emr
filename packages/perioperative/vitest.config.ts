import { defineConfig } from "vitest/config";

// Perioperative journey gates patient movement + (later) the WHO checklist and
// the discharge gate — held to 100%. Declarative/IO-only files excluded.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/ports.ts", "src/pg-store.ts", "src/theatre-pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
