# DECISIONS — Architecture Decision Record log

> Living file. One ADR per consequential choice. Claude Code appends; never rewrites history. Format below. Newest at the bottom (chronological) so numbers are stable.

## ADR template
```
## ADR-NNNN — <short title>
- **Date:** YYYY-MM-DD
- **Status:** proposed | accepted | superseded by ADR-MMMM
- **Context:** what forced a decision (constraint, requirement, conflict)
- **Options considered:** the real alternatives, briefly
- **Decision:** what was chosen
- **Consequences:** what this makes easy, what it makes hard, what to watch
```

## Decisions already fixed by the spec pack
These are recorded as accepted ADRs because the spec pack already committed to them. Claude Code should treat them as binding and reference them rather than relitigating.

## ADR-0001 — Modular monolith, not microservices
- **Date:** spec
- **Status:** accepted
- **Context:** one four-level clinic, small team; need operational simplicity now with a scalability path later.
- **Decision:** single deployable app with hard module boundaries (published interfaces + domain events); service-extractable later under load.
- **Consequences:** simple ops and local dev now; CI must enforce import boundaries so the monolith doesn't rot into a big ball of mud; extraction path documented in docs/02 §10.

## ADR-0002 — RI Witness is the witnessing system of record; Oxford HIS integrates, never reimplements
- **Date:** spec
- **Status:** accepted
- **Context:** the lab runs CooperSurgical RI Witness (RFID), a validated electronic witnessing system. A parallel software double-witness would be duplicative, weaker, and a source of dangerous divergence.
- **Decision:** Oxford HIS is demographic master into RI Witness and consumer of witnessing/traceability back, reconciling every handling event and blocking cycle-step sign-off on divergence; no competing witness UI. Behind a `WitnessingProvider`/`RiWitnessProvider` adapter.
- **Consequences:** removes a whole risky subsystem from our scope; adds a hard dependency on RI's integration capability (scoping ADR to follow once CooperSurgical confirms the path).

## ADR-0003 — Append-only, hash-chained audit as the spine
- **Date:** spec
- **Status:** accepted
- **Context:** MOH/accreditation inspection-readiness and medico-legal defensibility require an immutable, complete trail.
- **Decision:** immutable hash-chained `AuditLog` + `DomainEvent`; clinical data soft-delete only; a scheduled job verifies chain integrity.
- **Consequences:** strong defensibility and reconstructable history; storage growth and care needed that nothing bypasses the audit path; 100% test coverage required on this subsystem.

## ADR-0004 — Bilingual (en/ar) + RTL is infrastructure from commit one
- **Date:** spec
- **Status:** accepted
- **Context:** Gulf clinic; Arabic RTL and Khaleeji terminology are not a later feature.
- **Decision:** i18n layer mandatory from Phase 0; no hardcoded user-facing strings; RTL tested.
- **Consequences:** small upfront cost, avoids a catastrophic retrofit; CI/lint should flag hardcoded strings.

## ADR-0005 — Donor/surrogacy/social-sex-selection are structurally absent, not feature-flagged
- **Date:** spec
- **Status:** accepted
- **Context:** Kuwaiti law (docs/03). A disabled-but-present capability could be misused and is wrong, not merely out of scope.
- **Decision:** no donor/surrogate entities or code paths exist; `sperm_source`→husband, `oocyte_source`→wife by construction; marriage-verification is a hard gate.
- **Consequences:** the data model is legally correct by design; if law changes, this is a deliberate, reviewed addition — never an accidental toggle.

## ADR-0006 — In-region hosting by default; every cross-border PHI processor reviewed before use
- **Date:** spec
- **Status:** accepted (pending region/CSP confirmation — see STATE outstanding items)
- **Context:** CITRA/DPPR + medical-record duties (docs/03 §4); no blanket localisation mandate but transfers are constrained.
- **Decision:** default in-region (GCC/Kuwait-permissible) hosting; any third-party PHI processor (SMS/WhatsApp, payments, translation, AI, analytics) gets a residency review logged as an ADR before integration.
- **Consequences:** some convenient global SaaS disallowed; integration choices are deliberately gated.

## ADR-0007 — DigitalOcean VPS is staging/synthetic-only; production PHI needs an in-region host
- **Date:** 2026-06-12
- **Status:** accepted
- **Context:** the cloud build/deploy pipeline (docs/CICD_SETUP.md) ships to a DigitalOcean VPS. DigitalOcean has no GCC/Kuwait region, so it cannot lawfully hold real PHI under the in-region/residency duties in docs/03 §4 and ADR-0006. We still want a working deploy target from day one.
- **Options considered:** (a) run production on the DO VPS — rejected, violates residency; (b) wait for an in-region host before any deploy automation — rejected, blocks early pipeline value; (c) split targets: DO VPS as staging/synthetic-only now, in-region host as production later.
- **Decision:** the DO VPS is the **staging / synthetic-data target only** and must never load real PHI. Production runs on an **in-region (GCC/Kuwait-permissible) managed PostgreSQL + host** selected before go-live; swapping the deploy target to it is a secrets change. The `deploy.yml` and `docs/PATIENT-DATA.md` encode this.
- **Consequences:** the pipeline is usable immediately for synthetic-data staging; a hard prerequisite remains (select + provision the in-region production host) before any real PHI — tracked in docs/STATE.md outstanding items. Refines ADR-0006 for this specific hosting choice.

## ADR-0008 — Drizzle for ORM + migrations (explicit, reviewable, forward-only)
- **Date:** 2026-06-12
- **Status:** accepted
- **Context:** docs/02 §2 names "Prisma or Drizzle". The append-only/forward-only migration rule (CLAUDE.md, docs/PATIENT-DATA.md) is a **data-safety control, not a preference**: every migration must be human-reviewable against the destructive-migration block (`make check-migrations-safe`) before it can run in deploy.
- **Options considered:** Prisma (ergonomic, but migrations are engine-generated SQL and the client abstracts the schema) vs Drizzle (TypeScript-first schema, plain-SQL migration files checked into the repo and reviewed like code).
- **Decision:** **Drizzle**. Migrations are explicit SQL artifacts in the repo, diffable in PRs and greppable for destructive statements (DROP/ALTER...DROP/TRUNCATE) by the deploy guardrail. Type-safe query builder; one Postgres database, schema-per-module-domain (docs/02 §2).
- **Consequences:** migration review is a first-class PR gate and the destructive-migration block can pattern-match real SQL; slightly more manual migration authoring than Prisma's auto-flow, accepted deliberately as the price of reviewability. Forward-only enforced in production.

## ADR-0009 — API surface: tRPC for internal clients + a thin versioned REST/FHIR surface
- **Date:** 2026-06-12
- **Status:** accepted
- **Context:** docs/02 §2 calls for a typed RPC layer for internal web/portal clients plus a versioned REST/FHIR-flavoured surface for external/integration consumers and future apps.
- **Decision:** **tRPC** for `apps/web` and `apps/portal` (end-to-end types, no codegen, contracts shared via packages); **a separate thin, versioned REST surface modelled in FHIR-compatible shapes** (Patient, Encounter, Observation, DiagnosticReport, MedicationRequest) for integration consumers — without becoming a full FHIR server in v1 (docs/02 §6). Both are mounted in `apps/api`; domain packages contribute routers behind the deny-by-default auth middleware (ADR-0010).
- **Consequences:** internal velocity and type-safety from tRPC; a stable, language-agnostic boundary for integrations and any future national-health-system interop. Two surfaces to maintain — kept thin by sharing the same domain services beneath both.

## ADR-0010 — Redis + BullMQ for cache, sessions, and background jobs
- **Date:** 2026-06-12
- **Status:** accepted
- **Context:** docs/02 §2 specifies Redis for sessions/rate-limits and a lightweight queue (BullMQ) for notifications, reminders, reconciliation jobs, and scheduled reports — including the scheduled **audit hash-chain integrity job** (CLAUDE.md testing bar) and the RI Witness reconciliation jobs.
- **Decision:** **Redis** (in-region, inherits residency rules) for cache/sessions/rate-limits; **BullMQ** for durable background jobs. Job processors live in `apps/api`; jobs are enqueued by domain modules via a published queue interface, never by reaching into another module.
- **Consequences:** reminders, reconciliation, and chain-verification run reliably off the request path; one more piece of in-region infrastructure to provision and back up. Residency review covers the Redis deployment alongside Postgres (ADR-0007).

## ADR-0011 — Self-hosted OIDC identity provider, behind an OIDC-standard interface
- **Date:** 2026-06-12
- **Status:** accepted (provider gated on the in-region residency review — ADR-0006/0007)
- **Context:** docs/02 §2/§5 require OIDC-capable auth with MFA and field-level encryption keyed in-region. A managed IdP could move identity/PHI-adjacent data cross-border, which the residency review (ADR-0006) has not yet cleared.
- **Decision:** default to a **self-hosted, in-region OIDC provider** for now, and build all auth against a **standard OIDC interface** (authorization-code + PKCE, standard discovery/JWKS) so an in-region **managed** IdP can be swapped in later — we are leaning **Oracle Cloud Kuwait** for in-region hosting per ADR-0007 — **without a rewrite**. No bespoke crypto; the app is an OIDC relying party, not an identity store.
- **Consequences:** no cross-border identity dependency taken before the review; the relying-party seam keeps the provider decision reversible. Running an IdP is operational overhead, accepted as the residency-safe default; revisit once the managed in-region option clears review (would supersede this ADR).

## ADR-0012 — KeyProvider seam for field-level encryption; build the crypto now, slot the in-region KMS in later
- **Date:** 2026-06-12
- **Status:** accepted (real KMS provider gated on the residency review — ADR-0006/0007)
- **Context:** docs/02 §5 / docs/03 §4 require field-level encryption for Civil ID (and payment refs) with keys in an in-region KMS. The KMS/CSP choice is blocked on the residency review, but the **encryption logic itself must not be blocked** — it underpins the registry (PR 0.4) and must be built and tested now.
- **Decision:** put key operations behind a **`KeyProvider` interface** (wrap/unwrap data keys, or encrypt/decrypt envelopes — KMS-shaped) with a **local development implementation** (a deterministic, clearly-labelled dev key, never used for real PHI). The Civil-ID field-level encryption path is built and unit-tested against this seam now; the real **in-region KMS** (Oracle Cloud Kuwait / approved CSP) is implemented behind the same interface after the review. The dev provider refuses to run where a production flag is set.
- **Consequences:** the encryption code, key-rotation shape, and tests exist and are exercised in CI immediately; only the key-custody backend remains pending the review. Risk to manage: ensure the dev provider can never be selected in staging/production (guarded by config + a startup assertion). Pairs with ADR-0011's residency posture.

## ADR-0013 — MFA required for all PHI domains; reception is the only password-only domain; the mapping is configuration
- **Date:** 2026-06-12
- **Status:** accepted
- **Context:** docs/02 §2 requires MFA for clinical/financial roles. The product owner widened this: MFA is required for **anyone who can read or write PHI, lab data, money, or staff records** — the `clinical`, `embryology`, `financial`, `hr`, and `admin` domains. Reception/front-desk roles limited to booking and check-in (no clinical-note read) may use **password + device trust**, but must **escalate to MFA the moment they are granted any PHI-domain permission**.
- **Decision:** add a non-PHI **`scheduling`** permission domain for front-desk work. The MFA-required set = all domains **except** `scheduling` (`DEFAULT_MFA_REQUIRED_DOMAINS`). Because MFA is enforced per-domain at the point of authorization, a reception role that is later granted, say, `clinical:note.read` automatically requires MFA for that action — escalation is structural, not a separate rule. The domain→MFA mapping is **configuration, not code**: it lives in the versioned config table (docs/02 §1) and is injected into the `Authorizer`; the constant is only the default.
- **Consequences:** least-privilege front-desk login without weakening PHI protection; the mapping can be tightened/loosened by authorised admins without a deploy. Risk to watch: ensure the `scheduling` domain never accretes PHI-bearing actions — any such action belongs in a PHI domain. **[CONFIRM with clinic]** the exact reception capability list before go-live.

## ADR-0014 — Oracle Cloud Infrastructure (Kuwait region) as the provisional production target
- **Date:** 2026-06-12
- **Status:** proposed (provisional — pending the formal docs/03 residency review and product-owner sign-off)
- **Context:** ADR-0007 established that production needs a genuine in-region (CITRA-permissible) host and that the DigitalOcean VPS is staging/synthetic-only. A concrete provisional target is needed so host-touching code (DB, KMS, object storage) is designed against it now.
- **Options considered:** AWS Bahrain (in-GCC but not in-country), Oracle Cloud Kuwait (in-country region), other GCC CSPs. In-country residency is the strongest posture under CITRA.
- **Decision:** **provisionally** target **Oracle Cloud Infrastructure, Kuwait region**: managed PostgreSQL for the database and **OCI Vault as the production `KeyProvider`** (behind the ADR-0012 seam). Everything host-touching (DB connection, KMS, object storage, Redis) is built so that switching to OCI is a **configuration change**, not a rewrite. This is **provisional**: it does **not** authorise loading real PHI anywhere until the docs/03 residency review is logged and the product owner signs off. The DO VPS remains staging/synthetic-only (ADR-0007, unchanged).
- **Consequences:** gives a concrete in-region design target without committing PHI; if the review selects a different CSP, the seams (KeyProvider, DB config, storage) localise the change. Standing gate: no real PHI until review + sign-off.

_(Claude Code: continue numbering from ADR-0015.)_
