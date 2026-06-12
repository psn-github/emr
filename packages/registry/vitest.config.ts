import { defineConfig } from "vitest/config";

// The marriage gate and the identity model are clinical-safety-critical — hold
// the whole module to 100%. (schema.ts declarative; index.ts re-exports.)
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // pg-store.ts is I/O integration code, proven by the adversarial integration
      // tests against a real Postgres, not the unit coverage gate.
      exclude: ["src/index.ts", "src/schema.ts", "src/couple.ts", "src/person.ts", "src/pg-store.ts", "src/**/*.test.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
