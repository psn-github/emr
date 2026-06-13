#!/usr/bin/env node
// Deterministic module-boundary enforcement (CLAUDE.md / docs/02 §1):
//   "Module boundaries are hard: no cross-module table access; depend only on a
//    module's published interface and emitted events. CI enforces import boundaries."
//
// Rules enforced:
//   1. Cross-package imports must target a package's PUBLISHED ENTRY POINT
//      (`@oxford/<pkg>`), never a deep path (`@oxford/<pkg>/src/...`). This is
//      the "published interface only" rule — no reaching into internals.
//   2. A package may only depend on packages whose TYPE is allowed for its own
//      type. Domain modules may NOT import other domain modules directly; they
//      integrate through platform packages (events/audit) — relax only via ADR.
//
// Dependency-free; parses static/dynamic import + re-export specifiers.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

// type → set of types it may import. `core` may import nothing else in-repo.
const ALLOWED = {
  core: new Set([]),
  platform: new Set(["platform", "core"]),
  domain: new Set(["platform", "core"]),
  app: new Set(["app", "domain", "platform", "core"]),
};

// Explicit classification; anything else under packages/ defaults to `domain`.
const PLATFORM = new Set(["core", "audit", "i18n", "ui", "notifications", "documents", "crypto", "migration", "witnessing"]);
function classify(area, dir) {
  if (area === "apps") return "app";
  if (dir === "core") return "core";
  if (PLATFORM.has(dir)) return "platform";
  return "domain";
}

function listPackages() {
  const pkgs = new Map(); // name -> { dir, type, root }
  for (const area of ["packages", "apps"]) {
    const base = join(ROOT, area);
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base)) {
      const root = join(base, dir);
      const manifest = join(root, "package.json");
      if (!existsSync(manifest)) continue;
      const name = JSON.parse(readFileSync(manifest, "utf8")).name;
      if (!name) continue;
      pkgs.set(name, { dir, type: classify(area, dir), root });
    }
  }
  return pkgs;
}

function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === "dist" || entry === "build") continue;
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      // Boundaries govern PRODUCTION code. Tests may cross module boundaries
      // (e.g. adversarial integration tests exercising several modules together).
      else if (
        /\.(ts|tsx)$/.test(entry) &&
        !/\.d\.ts$/.test(entry) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(entry)
      )
        out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

const IMPORT_RE =
  /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const pkgs = listPackages();
const names = [...pkgs.keys()];
let errors = 0;
const err = (file, msg) => {
  console.error(`BOUNDARY ${file}: ${msg}`);
  errors++;
};

for (const [name, info] of pkgs) {
  for (const file of sourceFiles(join(info.root, "src"))) {
    const code = readFileSync(file, "utf8");
    const rel = file.replace(ROOT + "/", "");
    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      const target = names.find((n) => spec === n || spec.startsWith(n + "/"));
      if (!target) continue; // external dep or relative import
      if (spec !== target) {
        err(rel, `deep import "${spec}" — import only the published entry point "${target}"`);
        continue;
      }
      const targetType = pkgs.get(target).type;
      if (!ALLOWED[info.type].has(targetType)) {
        err(
          rel,
          `${info.type} package "${name}" may not depend on ${targetType} package "${target}"`,
        );
      }
    }
  }
}

if (errors > 0) {
  console.error(`\ncheck-boundaries: ${errors} violation(s).`);
  process.exit(1);
}
console.log(`check-boundaries: clean (${pkgs.size} packages).`);
