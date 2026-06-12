import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/types.ts", "src/**/*.test.ts"],
      // i18n is infrastructure from commit one — hold it to 100%.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
