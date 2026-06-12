# CLAUDE.md — Oxford HIS repository conventions

This file governs day-to-day work in this repository. It is the operational, subordinate copy of the rules in `docs/00_MASTER_ORCHESTRATION_PROMPT.md`. Read the `/docs` set in precedence order before working: `03` (regulatory, highest) → `01` (PRD) → `02` (architecture) → `05` (roadmap) → `00` (how to work) → this file.

## Every session
1. Read `docs/STATE.md`, `docs/DECISIONS.md`, and the current phase in `docs/05_DELIVERY_ROADMAP.md`.
2. State the session goal and tasks with definitions of done before writing code.
3. Build with tests alongside code. Run full suite + lint before finishing.
4. Update `docs/STATE.md`; write ADRs to `docs/DECISIONS.md`; log conflicts/proposed changes to `docs/AMENDMENTS.md`.
5. End with a summary: shipped / deferred / decisions needed.

## Hard rules (never relax without product-owner + legal sign-off)
- **Witnessing:** done by RI Witness (RFID) in the lab — the authoritative system. Oxford HIS integrates: it is demographic master into RI Witness and consumer of witnessing/traceability back, reconciles every handling event against the RI Witness record, and blocks cycle-step sign-off on divergence. No competing witness UI; no override of RI Witness. Behind a `WitnessingProvider`/`RiWitnessProvider` adapter.
- **Audit:** all clinical/financial mutations go to the immutable, hash-chained audit log (who/what/when/before/after). Soft-delete clinical data only.
- **Identity gates:** no fertility cycle without a verified marriage record. No donor/surrogacy/social-sex-selection anything — structurally absent.
- **Drugs:** prescribable items come from the formulary table, never free text. 100% test coverage on dose logic.
- **Money:** 100% test coverage on billing/instalment logic.
- **Privacy/residency:** PHI in approved region only. No new third-party PHI processor without a residency review logged as an ADR.
- **Bilingual:** no hardcoded user-facing strings. All through i18n (en/ar). RTL tested, not assumed.

## Code conventions
- TypeScript strict; no `any` in domain code.
- Module boundaries are hard: no cross-module table access; depend only on a module's published interface and emitted events. CI enforces import boundaries.
- Configuration is data: protocols, appointment types, consent sets, packages, formulary, par levels, KPI thresholds live in versioned config tables, not code.
- Migrations forward-only in production; review every migration against the append-only rules.
- Conventional commits; one logical change per commit; CI green before merge to main.
- No secrets in the repo; CI scans for them.
- No PHI in logs, URLs, or analytics events.

## Deployment & patient-data safety
- Deploys are automated: merging to `main` runs CI (`.github/workflows/ci.yml`) and then the gated deploy (`.github/workflows/deploy.yml`) — path-based selective, approval-gated on the `staging` environment. See `docs/CICD_SETUP.md`.
- **Data-safety invariant (law, not preference):** the database lives outside the deployed code; deploys are additive and destructive migrations are blocked; clinical data is append-only/soft-delete; patient & clinical history survives every deploy; backups run nightly; every mutation is in the hash-chained audit log. Full statement in `docs/PATIENT-DATA.md` — a PR that violates it fails review.
- **Residency:** the DigitalOcean VPS is staging/synthetic-data only (no GCC region) and must never hold real PHI; production runs on an in-region host selected before go-live (ADR-0007, docs/03).

## Testing bar
- ≥80% coverage on domain logic; **100% on money, drug-dose, and witnessing logic**.
- Each module ships migrations, seed data, unit tests, integration tests on API routes, and ≥1 e2e of its core happy path.
- A scheduled job verifies audit hash-chain integrity.

## When unsure
If a requirement touches money, drugs, gametes/embryos, identity, or Kuwaiti law and is ambiguous: do **not** build the permissive path. Log it in `docs/AMENDMENTS.md` and ask the product owner. For everything else, make a reasonable call, record an ADR, and proceed.

## Definition of done (per module)
- Acceptance criteria in `docs/01_PRODUCT_REQUIREMENTS.md` met.
- Tests at the bar above, green in CI.
- Bilingual + RTL verified on its screens.
- Audit events emitted and verified.
- `docs/STATE.md` updated; ADRs written.
