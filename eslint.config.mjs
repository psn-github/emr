// Flat ESLint config for the Oxford HIS monorepo.
// Code quality + "no `any` in domain code" (CLAUDE.md). Module-boundary
// enforcement is a separate, deterministic gate: `pnpm boundaries`
// (scripts/check-boundaries.mjs), run in CI.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.config.*",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLAUDE.md hard rule: no `any` in domain code.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: ["error", "always"],
      "no-var": "error",
    },
  },
  {
    // Tests may relax a couple of rules for fixtures/mocks.
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
