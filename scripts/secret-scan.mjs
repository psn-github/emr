#!/usr/bin/env node
// Lightweight, dependency-free secret scan for CI (CLAUDE.md: "No secrets in
// the repo; CI scans for them"). This is a fast first line of defence; a
// dedicated scanner (gitleaks/trufflehog) is wired in Phase 0 CI hardening.
//
// Scans tracked, text-like files for high-signal secret patterns. Exits non-zero
// on any finding so the CI step fails.
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const PATTERNS = [
  { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "Generic API/secret assignment", re: /(?:api[_-]?key|secret|passwd|password|token)\s*[:=]\s*["'][A-Za-z0-9+/_\-]{16,}["']/i },
  { name: "Slack token", re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: "Google OAuth client secret", re: /GOCSPX-[0-9A-Za-z_-]{20,}/ },
  { name: "JWT-looking literal", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

// Allowlist: files/paths that legitimately contain pattern-like text.
const ALLOW_PATH = [/(^|\/)scripts\/secret-scan\.mjs$/, /\.env\.example$/, /pnpm-lock\.yaml$/];
const BIN_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|eot|zip|gz|lock)$/i;

function tracked() {
  return execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
}

let findings = 0;
for (const file of tracked()) {
  if (ALLOW_PATH.some((re) => re.test(file)) || BIN_EXT.test(file)) continue;
  let content;
  try {
    if (statSync(file).size > 2_000_000) continue;
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) {
        console.error(`SECRET? ${file}:${i + 1} — ${name}`);
        findings++;
      }
    }
  });
}

if (findings > 0) {
  console.error(`\nsecret-scan: ${findings} potential secret(s) found. Failing.`);
  process.exit(1);
}
console.log("secret-scan: clean.");
