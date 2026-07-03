// Test runner wrapper. When DATABASE_URL is set, every DB-backed test project
// (the 12 package integration suites + the apps/api e2e suite) shares that one
// Postgres, and vitest schedules files from ALL workspace projects concurrently
// — so one project's TRUNCATE can wipe rows another project's test just seeded
// (observed: a package integration file truncating fertility tables mid-flight
// broke a portal e2e). Serialize all test files whenever a shared database is
// in play; pure-unit runs (no DATABASE_URL) keep full parallelism.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const vitestBin = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");

const args = [vitestBin, "run", ...process.argv.slice(2)];
if (process.env.DATABASE_URL) args.push("--fileParallelism=false");

const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
