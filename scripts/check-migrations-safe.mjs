#!/usr/bin/env node
// Data-safety guard (CLAUDE.md / docs/PATIENT-DATA.md): migrations are
// forward-only and ADDITIVE; destructive statements are BLOCKED. This is the
// `make check-migrations-safe` gate that deploy.yml runs before any deploy.
//
// Scans every packages/*/migrations/*.sql for destructive DDL/DML. A finding
// fails the build — a PR that introduces one cannot deploy.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

// Destructive patterns. CREATE ... (incl. IF NOT EXISTS) and additive ALTER ...
// ADD are allowed; the rest are blocked.
const FORBIDDEN = [
  { name: "DROP TABLE", re: /\bdrop\s+table\b/i },
  { name: "DROP SCHEMA", re: /\bdrop\s+schema\b/i },
  { name: "DROP COLUMN", re: /\bdrop\s+column\b/i },
  { name: "DROP DATABASE", re: /\bdrop\s+database\b/i },
  { name: "TRUNCATE", re: /\btruncate\b/i },
  { name: "DELETE (unscoped DML)", re: /\bdelete\s+from\b/i },
  { name: "ALTER ... DROP", re: /\balter\s+table[\s\S]*?\bdrop\b/i },
  { name: "ALTER COLUMN ... TYPE (rewrite)", re: /\balter\s+column[\s\S]*?\btype\b/i },
];

function migrationFiles() {
  const out = [];
  const pkgs = join(ROOT, "packages");
  if (!existsSync(pkgs)) return out;
  for (const dir of readdirSync(pkgs)) {
    const mdir = join(pkgs, dir, "migrations");
    if (!existsSync(mdir)) continue;
    for (const f of readdirSync(mdir)) {
      if (f.endsWith(".sql")) out.push(join(mdir, f));
    }
  }
  return out;
}

let findings = 0;
const files = migrationFiles();
for (const file of files) {
  if (statSync(file).size > 2_000_000) continue;
  const sql = readFileSync(file, "utf8");
  // Strip line comments so commented examples don't trip the guard.
  const stripped = sql.replace(/--.*$/gm, "");
  for (const { name, re } of FORBIDDEN) {
    if (re.test(stripped)) {
      console.error(`DESTRUCTIVE MIGRATION ${file.replace(ROOT + "/", "")} — ${name}`);
      findings++;
    }
  }
}

if (findings > 0) {
  console.error(`\ncheck-migrations-safe: ${findings} destructive statement(s) blocked.`);
  process.exit(1);
}
console.log(`check-migrations-safe: clean (${files.length} migration file(s) — all additive).`);
