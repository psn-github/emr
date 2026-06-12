# STATE — Oxford HIS build journal

> Living file. Claude Code updates this **every session**: what was built, what changed, what's open. Newest entry at the top. This is the first thing to read when starting a session.

## Current status
- **Phase:** Phase 0 — Foundation (merge train in progress). Scaffold + audit + auth/RBAC merged/landing; i18n/RTL + registry next.
- **Last updated:** 2026-06-12 — auth + RBAC + MFA-domain policy (ADR-0013) + OCI provisional host (ADR-0014) (PR 0.2).

## How to use this file
Each session, prepend an entry in this format:

```
## YYYY-MM-DD — <session goal in one line>
**Shipped:** <what was built and merged>
**Changed:** <schema/contract/config changes; note any migrations>
**Decisions:** <new ADRs written to docs/DECISIONS.md, by number>
**Open / needs product owner:** <blocking questions, [CONFIRM] items hit>
**Next:** <the obvious next task>
```

## Outstanding before build cutover (from the spec pack)
These do **not** block starting Phase 0, but must be resolved before the dependent module goes to production. Tracked here so they aren't lost.

- **[legal]** Cryostorage maximum period + consent-renewal cadence (docs/03 §2). Blocks cryostore cutover.
- **[legal]** Hosting region / approved CSP under CITRA Cloud Framework (docs/03 §4). Blocks any production PHI hosting.
- **[ops]** Select + provision the in-region (GCC/Kuwait-permissible) production host + managed PostgreSQL to replace the DigitalOcean VPS, which is staging/synthetic-only (ADR-0007, docs/PATIENT-DATA.md). Blocks loading any real PHI / go-live; swapping the deploy target is a secrets change.
- **[legal]** Permitted PGT indications scope (docs/03 §1). Blocks PGT capture cutover.
- **[legal]** Marital-status-change specimen disposition handling (docs/03 §1). Blocks cryostore cutover.
- **[legal]** Medical-record retention period (docs/03 §3). Blocks retention job.
- **[integration]** RI Witness integration path with CooperSurgical — sync-tool version, EMR-integration licence, programmatic pull-back of witnessing/traceability vs report-only (docs/02 §4, docs/01 §G). Prerequisite for Phase 2 embryology build.
- **[clinical]** Time-lapse incubator platform (EmbryoScope/Geri/other) — first integration target (docs/01 §G).
- **[ops]** KNET integration: direct bank vs gateway aggregator (docs/01 §G). Affects billing + residency review.
- **[ops]** Cliniko migration: full history vs cutover+archive (docs/01 §G). Affects Phase 1 exit.
- **[ops]** L2 bed reservation coupling (auto-reserve on theatre booking vs assign-on-day) and pre-op holding location modelling (docs/01 §E7). Confirm against real clinic flow.
- **[clinical]** Whether any inpatient stay is overnight/multi-day (e.g. post-delivery) or all same-day — determines if the bed model needs a night-census concept (docs/01 §E7).
- **[data]** On-site HL7/DICOM availability for lab analyser + PACS interfaces (docs/01 §G).

## Build log

## 2026-06-12 — Auth (OIDC relying-party seam) + deny-by-default RBAC (PR 0.2)
**Shipped:** `@oxford/identity` — permission model namespaced by domain (clinical/embryology/financial/hr/admin) with `<domain>:<action>` + `<domain>:*` + `*:*` matching; `can()` deny-by-default authorization; `Authorizer` server-side enforcement point (MFA step-up required for clinical/financial by default, configurable) that writes every denial to the audit log; `AuthService` that verifies a token via the OIDC seam, maps claims→staff/roles, and audits LOGIN / LOGIN_FAILED; `OidcProvider` interface + `DevOidcProvider` (refuses to run in production); Drizzle schema (`identity`: staff, role, role_assignment — cross-module refs as logical ids, not DB FKs). **100% coverage** (24 tests), CI-enforced.
**Changed:** security events (LOGIN/LOGIN_FAILED/PERMISSION_DENIED) now flow into the PR 0.1 audit chain. Added non-PHI `scheduling` permission domain; MFA now required by default for all PHI domains (clinical/embryology/financial/hr/admin) via `DEFAULT_MFA_REQUIRED_DOMAINS`, sourced as configuration and injected (not hardcoded).
**Decisions:** ADR-0011 (OIDC RP seam); **ADR-0013** (MFA required for all PHI domains; reception password+device-trust on `scheduling` only, auto-escalates to MFA on any PHI permission; domain→MFA mapping is configuration); **ADR-0014** (Oracle Cloud Kuwait provisional production target + OCI Vault as production KeyProvider — provisional, gated on residency review; host-touching code is config-swappable).
**Open / needs product owner:** [CONFIRM] exact reception capability list (ADR-0013); OCI Kuwait + KMS pending the formal docs/03 residency review and sign-off (ADR-0014) — no real PHI until then.
**Next:** PR 0.3 — i18n/RTL framework (en/ar) + Oxford design-system UI shell; zero hardcoded strings, RTL tested.

## 2026-06-12 — Immutable, hash-chained audit + domain-event subsystem (PR 0.1)
**Shipped:** `@oxford/audit` — generic append-only `HashChainLog` with SHA-256 link hashing over canonical payloads (binds prevHash + seq + occurredAt + payload, so reorder/back-date/edit all break the chain); `AuditLog` (who/what/when/before/after; CREATE/UPDATE/SOFT_DELETE/RESTORE/READ_EXPORT/LOGIN/LOGIN_FAILED/PERMISSION_DENIED) and `DomainEventLog`; `ChainStore` interface + `InMemoryChainStore`; `verifyChain` tamper detector (seq-out-of-order / prev-hash-mismatch / hash-mismatch); `runChainIntegrityCheck` scheduled-job function. **100% coverage** (CI-enforced via the package's own threshold).
**Changed:** Drizzle schema (`audit`: `audit_log`, `domain_event` — append-only, hash-unique, prev-hash linked) + forward-only migration `migrations/0001_audit.sql`; **Postgres-backed `PgAuditChainStore`** with advisory-lock-serialised appends (no UPDATE/DELETE paths).
**Decisions:** no new ADRs (implements ADR-0003); follows ADR-0008 (Drizzle) for the schema.
**Adversarial self-review (pre-merge, against real Postgres — attack a):** actively attacked the audit log at rest in the database, bypassing the app, and confirmed the hash chain catches it. Actual test output:
- `[attack a1] chain intact before attack: true`
- `[attack a1] after tampering with seq 2 → verification: DETECTED (hash-mismatch @ seq 2)` — editing an invoice total directly in `audit.audit_log` is caught.
- `[attack a2] after deleting seq 2 → verification: DETECTED (seq-out-of-order @ seq 3)` — deleting a row to hide it is caught.
- No false positives: a genuinely intact chain still verifies. Pure-logic coverage remains 100%. Attacks fail as required → cleared to merge.
**Open / needs product owner:** none new.
**Next:** PR 0.2 — auth + deny-by-default RBAC (OIDC relying-party seam per ADR-0011), every audit-worthy security event flowing into this log.

## 2026-06-12 — Phase 0 kickoff: monorepo scaffold + locked stack ADRs (PR 0.0)
**Shipped:** pnpm-workspace monorepo (`apps/{api,web,portal}`, `packages/core` + placeholders), TypeScript strict (no `any`), ESLint flat config, Prettier, Vitest workspace; `@oxford/core` shared primitives (Result, typed AppError, branded ids, injectable Clock, canonical JSON for audit hashing) at **100% coverage**; deterministic module-boundary checker (`scripts/check-boundaries.mjs`) and dependency-free secret scan (`scripts/secret-scan.mjs`); CI activated (`pnpm -r typecheck/lint/test/build` + module-boundaries + secret-scan now run for real, no longer a no-op).
**Changed:** no DB/schema yet (Drizzle migrations land with the audit module). `.github/workflows/ci.yml` gained Module-boundaries + real secret-scan steps.
**Decisions:** ADR-0008 Drizzle (forward-only, reviewable migrations as a data-safety control); ADR-0009 tRPC + thin versioned REST/FHIR surface; ADR-0010 Redis + BullMQ; ADR-0011 self-hosted OIDC behind an OIDC-standard relying-party seam (managed in-region IdP swappable later; leaning Oracle Cloud Kuwait); ADR-0012 `KeyProvider` seam so Civil-ID field-level encryption is built/tested now with the real in-region KMS slotted in after the residency review.
**Open / needs product owner:** residency review (ADR-0006/0007) still gates the real IdP + KMS + Redis/Postgres hosting choice — building behind interfaces so it doesn't block; in-region production host selection (Oracle Cloud Kuwait leaning) outstanding.
**Next:** PR 0.1 — immutable, hash-chained audit/event subsystem (must pass its tests, incl. a chain-integrity verifier, before any downstream module builds on it).

_(first entry above this line; newest on top going forward)_
