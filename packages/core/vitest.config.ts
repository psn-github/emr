import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.test.ts"],
      // Shared primitives underpin clinical logic — hold them high.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
