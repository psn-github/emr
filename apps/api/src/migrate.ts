// CLI migration entrypoint (invoked by `make migrate`). Forward-only, additive.
import { createPool, runMigrations } from "./db.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

const pool = createPool(url);
try {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `migrate: applied ${applied.length}:\n  ${applied.join("\n  ")}` : "migrate: up to date");
} finally {
  await pool.end();
}
