import { defineConfig } from "vitest/config";

// KPI computation drives clinical-quality and competency reporting (docs/01 §E12,
// Vienna consensus). Pure; held to 100%.
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
