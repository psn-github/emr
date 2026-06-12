import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Postgres connection + forward-only migration runner. The DB lives OUTSIDE the
// deployed code (docs/PATIENT-DATA.md); this only connects and applies additive
// SQL. Every module ships its own packages/<m>/migrations/*.sql; they are applied
// in (package, filename) order and recorded so each runs once.

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

export function migrationFiles(): string[] {
  const out: string[] = [];
  const pkgs = join(REPO_ROOT, "packages");
  if (!existsSync(pkgs)) return out;
  for (const dir of readdirSync(pkgs).sort()) {
    const mdir = join(pkgs, dir, "migrations");
    if (!existsSync(mdir)) continue;
    for (const f of readdirSync(mdir).sort()) {
      if (f.endsWith(".sql")) out.push(join(mdir, f));
    }
  }
  return out;
}

export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  await pool.query(
    `CREATE SCHEMA IF NOT EXISTS _meta;
     CREATE TABLE IF NOT EXISTS _meta.migrations (
       name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const applied: string[] = [];
  for (const file of migrationFiles()) {
    const name = file.replace(REPO_ROOT, "");
    const seen = await pool.query("SELECT 1 FROM _meta.migrations WHERE name = $1", [name]);
    if (seen.rowCount && seen.rowCount > 0) continue;
    await pool.query(readFileSync(file, "utf8"));
    await pool.query("INSERT INTO _meta.migrations (name) VALUES ($1)", [name]);
    applied.push(name);
  }
  return applied;
}
