// Boot entrypoint for the HTTP host (ADR-0062). Staging/dev only until the real
// OIDC provider + staff provisioning are wired: production boot is REFUSED so a
// synthetic-identity server can never front real PHI (mirrors DevOidcProvider /
// LocalKeyProvider guards). Migrations run forward-only on boot (idempotent).
import { createPool, runMigrations } from "./db.js";
import { buildServices } from "./context.js";
import { createApiServer } from "./http-host.js";
import { devStaffDirectory } from "./staff-directory.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("serve: DATABASE_URL is not set");
  process.exit(1);
}
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  console.error(
    "serve: refusing to start in production — the HTTP host currently authenticates against the dev/staging " +
      "staff directory (synthetic identities). Wire the in-region OIDC provider + identity provisioning first (ADR-0062).",
  );
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8060);

const pool = createPool(databaseUrl);
const applied = await runMigrations(pool);
if (applied.length > 0) console.log(`serve: applied ${applied.length} migration(s)`);

const services = buildServices(pool, isProduction);
const server = createApiServer({ services, pool, isProduction, resolveSubject: devStaffDirectory(isProduction) });

server.listen(port, () => {
  console.log(`serve: oxford-his-api listening on :${port} (staging/synthetic-data mode)`);
});

let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.log(`serve: ${signal} — draining`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
