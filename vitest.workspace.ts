import { defineWorkspace } from "vitest/config";

// One test project per workspace package. Coverage thresholds that encode the
// CLAUDE.md testing bar (100% on audit/witnessing/money/dose) are declared in
// each package's own vitest.config.ts so they travel with the module.
export default defineWorkspace(["packages/*", "apps/*"]);
