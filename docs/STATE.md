# STATE — Oxford HIS build journal

> Living file. Claude Code updates this **every session**: what was built, what changed, what's open. Newest entry at the top. This is the first thing to read when starting a session.

## Current status
- **Phase:** Phase 0 — Foundation (in progress). Gating modules + document store done. Remaining: notifications (PR 0.6), then API/DB wiring + e2e.
- **Last updated:** 2026-06-12 — versioned, access-controlled, OCR-indexed document store (PR 0.5).

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

## 2026-06-12 — Versioned, access-controlled, OCR-indexed document store (PR 0.5)
**Shipped:** `@oxford/documents` — `DocumentService` with append-only versioning (consent forms, ID scans, marriage certificates, external reports), `OcrProvider` seam (+ `NoopOcrProvider`) feeding a searchable index, and an `AccessGuard` seam so reads are RBAC-gated **without** documents depending on the identity module (platform→domain forbidden). create / addVersion / access (audited READ_EXPORT, denial not audited as a read — the Authorizer audits it) / softDelete / search (OCR text, access-filtered). Blobs live in encrypted in-region storage — only refs are stored. **100% coverage** (11 tests), CI-enforced.
**Changed:** Drizzle `documents` schema (document, document_version — append-only versions, soft-delete).
**Decisions:** none new (the OcrProvider follows the seam pattern of ADR-0011/0012; real OCR provider is residency-reviewed before wiring).
**Open / needs product owner:** real OCR provider + object storage are residency-reviewed before wiring (docs/03 §4).
**Next:** PR 0.6 — notification service (SMS/WhatsApp/email, provider-abstracted, bilingual, discreet, audit-logged), then API/DB wiring (Postgres-backed stores, tRPC/REST routes, BullMQ chain-integrity cron) + the e2e proving the exit gate end-to-end.

## 2026-06-12 — Patient & couple registry + marriage-verification HARD GATE (PR 0.4)
**Shipped:** `@oxford/crypto` — `KeyProvider` seam + `LocalKeyProvider` (AES-256-GCM with AAD field-binding; refuses to run in production), so Civil-ID field-level encryption is built/tested now (ADR-0012). `@oxford/registry` — `Person` (Arabic+English names; **Civil ID held only as an encrypted envelope**, plaintext never stored/logged/audited), `Couple` as the first-class clinical unit with **explicit husband/wife → own-gametes-only by construction** (no donor/surrogate field exists — ADR-0005), `MarriageVerification`, and `assertMayStartFertility` — **THE HARD GATE**, enforced server-side. `RegistryService`: registerPerson / createCouple (validates own-gametes roles) / verifyMarriage / canStartFertility / revealCivilId (audited sensitive export, value never recorded) / mergePersons (audited de-dup with couple-reference repointing). All mutations audited + emit domain events. **100% coverage** (crypto 6 + registry 22 tests), CI-enforced.
**Changed:** added `crypto` to the platform tier in the boundary checker. Drizzle `registry` schema (person/couple/marriage_verification — encrypted Civil ID column, logical cross-refs, soft-delete only).
**Decisions:** implements ADR-0005 (donor/surrogacy structurally absent) + ADR-0012 (KeyProvider seam).
**Open / needs product owner:** the real in-region KMS slots in behind `KeyProvider` after the residency review; marital-status-change → specimen disposition workflow is a docs/03 `[CONFIRM]` item for the cryostore phase (couple `dissolved` status is modelled, the disposition workflow is not — correctly deferred).
**Next:** PR 0.5 — versioned, access-controlled, OCR-indexed document store (consent forms, ID scans, marriage certificates, external reports); then PR 0.6 notifications.

## 2026-06-12 — i18n/RTL framework (en/ar) + design-system foundation (PR 0.3)
**Shipped:** `@oxford/i18n` — `I18n` translator (named-param interpolation; missing key throws rather than shipping an untranslated string), `directionFor`/`isRtl` (Arabic RTL, tested), Intl number + **dual-calendar Gregorian/Hijri (Umm al-Qura)** formatting (ar-KW / en-GB), catalog parity tools (`findMissingKeys`/`assertCatalogComplete`) that guarantee the "zero untranslated strings" exit-gate condition, bilingual `coreMessages` seed (en/ar at parity), Drizzle schema (`i18n`: translation_key, translation — versioned config). `@oxford/ui` — Oxford design tokens (Cormorant Garamond + DM Sans/Inter Tight, palette, spacing) and RTL helpers (`htmlDirAttributes` flips dir/lang; logical→physical side mapping). **100% coverage** (23 tests across both packages), CI-enforced.
**Changed:** none to existing modules.
**Decisions:** implements ADR-0004 (bilingual + RTL from commit one).
**Open / needs product owner:** confirm exact Oxford palette hex against the brand guide (token names are stable; values are placeholders). React component library + the actual web shell that sets `<html dir/lang>` land in Phase 1 on this foundation.
**Next:** PR 0.4 — patient & **couple** registry with the **marriage-verification hard gate** (the second gating module; must pass its tests before downstream), Civil-ID field-level encryption via the `KeyProvider` seam (ADR-0012), audited merge tooling.

## 2026-06-12 — Auth (OIDC relying-party seam) + deny-by-default RBAC (PR 0.2)
**Shipped:** `@oxford/identity` — permission model namespaced by domain (clinical/embryology/financial/hr/admin) with `<domain>:<action>` + `<domain>:*` + `*:*` matching; `can()` deny-by-default authorization; `Authorizer` server-side enforcement point (MFA step-up required for clinical/financial by default, configurable) that writes every denial to the audit log; `AuthService` that verifies a token via the OIDC seam, maps claims→staff/roles, and audits LOGIN / LOGIN_FAILED; `OidcProvider` interface + `DevOidcProvider` (refuses to run in production); Drizzle schema (`identity`: staff, role, role_assignment — cross-module refs as logical ids, not DB FKs). **100% coverage** (24 tests), CI-enforced.
**Changed:** security events (LOGIN/LOGIN_FAILED/PERMISSION_DENIED) now flow into the PR 0.1 audit chain.
**Decisions:** implements ADR-0011 (self-hosted OIDC behind an RP seam; managed in-region IdP swappable later).
**Open / needs product owner:** real OIDC provider + the staff↦role seed/admin UI land with DB wiring and Phase 1; MFA-required domain set is a config default to confirm with the clinic.
**Next:** PR 0.3 — i18n/RTL framework (en/ar) + Oxford design-system UI shell; zero hardcoded strings, RTL tested.

## 2026-06-12 — Immutable, hash-chained audit + domain-event subsystem (PR 0.1)
**Shipped:** `@oxford/audit` — generic append-only `HashChainLog` with SHA-256 link hashing over canonical payloads (binds prevHash + seq + occurredAt + payload, so reorder/back-date/edit all break the chain); `AuditLog` (who/what/when/before/after; CREATE/UPDATE/SOFT_DELETE/RESTORE/READ_EXPORT/LOGIN/LOGIN_FAILED/PERMISSION_DENIED) and `DomainEventLog`; `ChainStore` interface + `InMemoryChainStore`; `verifyChain` tamper detector (seq-out-of-order / prev-hash-mismatch / hash-mismatch); `runChainIntegrityCheck` scheduled-job function. **100% coverage** (CI-enforced via the package's own threshold).
**Changed:** added Drizzle schema (`audit` schema: `audit_log`, `domain_event` — append-only, hash-unique, prev-hash linked). No live migration yet — the Postgres-backed `ChainStore` + integration test land with DB infra wiring; unit gate runs on the pure logic + in-memory store.
**Decisions:** no new ADRs (implements ADR-0003); follows ADR-0008 (Drizzle) for the schema.
**Open / needs product owner:** none new. Postgres-backed store + advisory-lock serialization is the one deferred piece (tracked for the DB-infra step).
**Next:** PR 0.2 — auth + deny-by-default RBAC (OIDC relying-party seam per ADR-0011), every audit-worthy security event flowing into this log.

## 2026-06-12 — Phase 0 kickoff: monorepo scaffold + locked stack ADRs (PR 0.0)
**Shipped:** pnpm-workspace monorepo (`apps/{api,web,portal}`, `packages/core` + placeholders), TypeScript strict (no `any`), ESLint flat config, Prettier, Vitest workspace; `@oxford/core` shared primitives (Result, typed AppError, branded ids, injectable Clock, canonical JSON for audit hashing) at **100% coverage**; deterministic module-boundary checker (`scripts/check-boundaries.mjs`) and dependency-free secret scan (`scripts/secret-scan.mjs`); CI activated (`pnpm -r typecheck/lint/test/build` + module-boundaries + secret-scan now run for real, no longer a no-op).
**Changed:** no DB/schema yet (Drizzle migrations land with the audit module). `.github/workflows/ci.yml` gained Module-boundaries + real secret-scan steps.
**Decisions:** ADR-0008 Drizzle (forward-only, reviewable migrations as a data-safety control); ADR-0009 tRPC + thin versioned REST/FHIR surface; ADR-0010 Redis + BullMQ; ADR-0011 self-hosted OIDC behind an OIDC-standard relying-party seam (managed in-region IdP swappable later; leaning Oracle Cloud Kuwait); ADR-0012 `KeyProvider` seam so Civil-ID field-level encryption is built/tested now with the real in-region KMS slotted in after the residency review.
**Open / needs product owner:** residency review (ADR-0006/0007) still gates the real IdP + KMS + Redis/Postgres hosting choice — building behind interfaces so it doesn't block; in-region production host selection (Oracle Cloud Kuwait leaning) outstanding.
**Next:** PR 0.1 — immutable, hash-chained audit/event subsystem (must pass its tests, incl. a chain-integrity verifier, before any downstream module builds on it).

_(first entry above this line; newest on top going forward)_
