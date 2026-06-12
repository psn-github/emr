import { defineConfig } from "vitest/config";

// Auth is security-critical: hold the decision logic to 100%. (schema.ts is
// declarative; index.ts is re-exports.)
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/schema.ts", "src/session.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
