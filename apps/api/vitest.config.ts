import { defineConfig } from "vitest/config";

export default defineConfig({
  // The e2e files share the one Postgres; run files serially so their
  // truncate/seed cannot race.
  test: { include: ["src/**/*.test.ts"], fileParallelism: false },
});
