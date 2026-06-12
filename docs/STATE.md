# STATE — Oxford HIS build journal

> Living file. Claude Code updates this **every session**: what was built, what changed, what's open. Newest entry at the top. This is the first thing to read when starting a session.

## Current status
- **Phase:** Phase 0 — Foundation. **All six foundation modules built (PRs 0.0–0.6) and merged to `main`** (CI green per PR; two gating modules carry adversarial self-reviews against real Postgres). Remaining for the exit gate: integration wiring (tRPC/REST routes behind the auth middleware, BullMQ chain-integrity cron) + the cross-cutting e2e.
- **Last updated:** 2026-06-12 — notification service + 7-template starter set (PR 0.6); Phase 0 modules merged bottom-up.

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

## 2026-06-12 — Notification service (provider-abstracted, bilingual, discreet) (PR 0.6)
**Shipped:** `@oxford/notifications` — `NotificationService` renders templated, **bilingual** messages from the i18n catalog (no hardcoded strings; previews **discreet** — no clinically explicit content, docs/03 §5), sends via a pluggable `NotificationProvider` (SMS/WhatsApp/email; `RecordingNotificationProvider` for dev — real providers residency-reviewed before wiring), and audit-logs each dispatch as a `NotificationEvent` with **metadata only — never the recipient or rendered body** (no PHI in logs). Bilingual `notificationMessages` seed (en/ar at parity); Drizzle `notifications` schema. **100% coverage** (6 tests), CI-enforced.
**Changed:** none to existing modules.
**Changed (templates):** seeded the 7-template starter set (bilingual en/ar, all discreet — no IVF/embryo or clinical values in any preview): appointment.reminder (T-48h/T-3h), monitoring.next_step, results.ready, payment.due, discharge.prescription_ready, consent.awaiting_signature, message.secure. A test scans every body in both locales for forbidden terms.
**Decisions:** implements PRD E0 notification requirement under ADR-0006 residency posture (provider abstraction).
**Open / needs product owner [assigned: PO]:** (1) **refine the template copy, especially the Khaleeji Arabic wording**, before go-live — current wording is placeholder. (2) real SMS/WhatsApp/email providers need a residency review (docs/03 §4) before any is wired.
**Next (Phase 0 closeout):** integration wiring — Postgres-backed stores + Drizzle migrations (incl. the advisory-lock audit append), tRPC/REST routes behind the auth middleware, the BullMQ chain-integrity cron, and the cross-cutting **e2e** proving the exit gate (no-permission user sees nothing; audit chain verified; RTL flip with zero untranslated strings; marriage gate blocks fertility server-side; CI green).

## 2026-06-12 — Versioned, access-controlled, OCR-indexed document store (PR 0.5)
**Shipped:** `@oxford/documents` — `DocumentService` with append-only versioning (consent forms, ID scans, marriage certificates, external reports), `OcrProvider` seam (+ `NoopOcrProvider`) feeding a searchable index, and an `AccessGuard` seam so reads are RBAC-gated **without** documents depending on the identity module (platform→domain forbidden). create / addVersion / access (audited READ_EXPORT, denial not audited as a read — the Authorizer audits it) / softDelete / search (OCR text, access-filtered). Blobs live in encrypted in-region storage — only refs are stored. **100% coverage** (11 tests), CI-enforced.
**Changed:** Drizzle `documents` schema (document, document_version — append-only versions, soft-delete).
**Decisions:** none new (the OcrProvider follows the seam pattern of ADR-0011/0012; real OCR provider is residency-reviewed before wiring).
**Open / needs product owner:** real OCR provider + object storage are residency-reviewed before wiring (docs/03 §4).
**Next:** PR 0.6 — notification service (SMS/WhatsApp/email, provider-abstracted, bilingual, discreet, audit-logged), then API/DB wiring (Postgres-backed stores, tRPC/REST routes, BullMQ chain-integrity cron) + the e2e proving the exit gate end-to-end.

## 2026-06-12 — Patient & couple registry + marriage-verification HARD GATE (PR 0.4)
**Shipped:** `@oxford/crypto` — `KeyProvider` seam + `LocalKeyProvider` (AES-256-GCM with AAD field-binding; refuses to run in production), so Civil-ID field-level encryption is built/tested now (ADR-0012). `@oxford/registry` — `Person` (Arabic+English names; **Civil ID held only as an encrypted envelope**, plaintext never stored/logged/audited), `Couple` as the first-class clinical unit with **explicit husband/wife → own-gametes-only by construction** (no donor/surrogate field exists — ADR-0005), `MarriageVerification`, and `assertMayStartFertility` — **THE HARD GATE**, enforced server-side. `RegistryService`: registerPerson / createCouple (validates own-gametes roles) / verifyMarriage / canStartFertility / revealCivilId (audited sensitive export, value never recorded) / mergePersons (audited de-dup with couple-reference repointing). All mutations audited + emit domain events. **100% coverage** (crypto 6 + registry 22 tests), CI-enforced.
**Changed:** added `crypto` to the platform tier in the boundary checker; boundary checker now skips test files (tests may legitimately span modules). Drizzle `registry` schema + forward-only migration `migrations/0001_registry.sql`; **Postgres-backed `PgRegistryStore`** (Civil ID persisted as encrypted envelope only; soft-delete only).
**Decisions:** implements ADR-0005 (donor/surrogacy structurally absent) + ADR-0012 (KeyProvider seam).
**Adversarial self-review (pre-merge, against real Postgres — attacks b, c, d):** actual test output:
- `[attack b] start fertility, NO marriage record → REJECTED (registry.marriage.unverified)`; verified couple → `ALLOWED`. The fertility gate holds at the server-side enforcement path (the API route is a thin wrapper over `canStartFertility`), not the UI.
- `[attack c] raw civil_id_enc at rest: v1.9lo1OEB/EVMVmPnC.g5Da…` · `contains plaintext Civil ID? NO (encrypted)`. Reading the column straight from Postgres yields only the AES-256-GCM envelope; the value is recoverable solely through the audited `revealCivilId` path.
- `[attack d] non-embryology role → embryology:lab.read: DENIED (auth.forbidden)`; embryologist → `ALLOWED`. Deny-by-default holds across permission domains.
- All attacks fail as required; module coverage remains 100% → cleared to merge.
**Open / needs product owner:** the real in-region KMS slots in behind `KeyProvider` after the residency review; marital-status-change → specimen disposition workflow is a docs/03 `[CONFIRM]` item for the cryostore phase (couple `dissolved` status is modelled, the disposition workflow is not — correctly deferred).
**Next:** PR 0.5 — versioned, access-controlled, OCR-indexed document store (consent forms, ID scans, marriage certificates, external reports); then PR 0.6 notifications.

## 2026-06-12 — i18n/RTL framework (en/ar) + design-system foundation (PR 0.3)
**Shipped:** `@oxford/i18n` — `I18n` translator (named-param interpolation; missing key throws rather than shipping an untranslated string), `directionFor`/`isRtl` (Arabic RTL, tested), Intl number + **dual-calendar Gregorian/Hijri (Umm al-Qura)** formatting (ar-KW / en-GB), catalog parity tools (`findMissingKeys`/`assertCatalogComplete`) that guarantee the "zero untranslated strings" exit-gate condition, bilingual `coreMessages` seed (en/ar at parity), Drizzle schema (`i18n`: translation_key, translation — versioned config). `@oxford/ui` — Oxford design tokens (Cormorant Garamond + DM Sans/Inter Tight, palette, spacing) and RTL helpers (`htmlDirAttributes` flips dir/lang; logical→physical side mapping). **100% coverage** (23 tests across both packages), CI-enforced.
**Changed:** none to existing modules.
**Decisions:** implements ADR-0004 (bilingual + RTL from commit one).
**Open / needs product owner:** palette now uses the **canonical om-software `PALETTE.md`** (Satoshi/Plus Jakarta Sans/Geist/Noto Sans Arabic; warm-neutral canvas + teal accent; fixed clinical/drug-class colours; clinical LTR exception) — this **conflicts with docs/02 §2** (Cormorant/DM Sans), logged as **AMD-0001**: confirm docs/02 §2 should be updated to match. React component library + the web shell that sets `<html dir/lang>` land in Phase 1 on this foundation.
**Next:** PR 0.4 — patient & **couple** registry with the **marriage-verification hard gate** (the second gating module; must pass its tests before downstream), Civil-ID field-level encryption via the `KeyProvider` seam (ADR-0012), audited merge tooling.

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
