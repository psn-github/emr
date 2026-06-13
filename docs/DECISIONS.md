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
- **Consequences:** least-privilege front-desk login without weakening PHI protection; the mapping can be tightened/loosened by authorised admins without a deploy. Risk to watch: ensure the `scheduling` domain never accretes PHI-bearing actions — any such action belongs in a PHI domain.
- **Confirmed reception capability list (product owner, 2026-06-12 — encode as configuration, not code).** Single-factor (password + device trust) front-desk roles MAY: view practitioner schedules; book / reschedule / cancel appointments; run check-in and the patient-flow board (**location/status only — no clinical content**); register patients and edit contact/demographic details (**but NOT record or edit marriage verification — that requires a supervisor role with MFA**); take payments, issue receipts, and view outstanding balances; print appointment letters and non-clinical documents. **Explicitly excluded from single-factor** (require an MFA PHI/financial role): any clinical note, result, cycle, lab, or cryostore data; the clinical document store; **refunds; discounts/price overrides; package modifications; any data export; any user/role administration**. Refunds and discounts require a `financial`-domain role with MFA.

## ADR-0014 — Oracle Cloud Infrastructure (Kuwait region) as the provisional production target
- **Date:** 2026-06-12
- **Status:** proposed (provisional — pending the formal docs/03 residency review and product-owner sign-off)
- **Context:** ADR-0007 established that production needs a genuine in-region (CITRA-permissible) host and that the DigitalOcean VPS is staging/synthetic-only. A concrete provisional target is needed so host-touching code (DB, KMS, object storage) is designed against it now.
- **Options considered:** AWS Bahrain (in-GCC but not in-country), Oracle Cloud Kuwait (in-country region), other GCC CSPs. In-country residency is the strongest posture under CITRA.
- **Decision:** **provisionally** target **Oracle Cloud Infrastructure, Kuwait region**: managed PostgreSQL for the database and **OCI Vault as the production `KeyProvider`** (behind the ADR-0012 seam). Everything host-touching (DB connection, KMS, object storage, Redis) is built so that switching to OCI is a **configuration change**, not a rewrite. This is **provisional**: it does **not** authorise loading real PHI anywhere until the docs/03 residency review is logged and the product owner signs off. The DO VPS remains staging/synthetic-only (ADR-0007, unchanged).
- **Consequences:** gives a concrete in-region design target without committing PHI; if the review selects a different CSP, the seams (KeyProvider, DB config, storage) localise the change. Standing gate: no real PHI until review + sign-off.

## ADR-0015 — Single-person fertility preservation is permitted; treatment/embryo creation stays couple-gated
- **Date:** 2026-06-12
- **Status:** accepted (supersedes the over-broad "all fertility requires marriage" reading; resolves AMD-0002). **Legality + clinic-practice confirmed by the Medical Director, 2026-06-13 — closed, no legal-counsel gate remains.**
- **Context:** the spec gated **any** fertility workflow on a verified marriage. The Medical Director confirmed that **fertility preservation** for an unmarried individual (oocyte/ovarian-tissue for single women; sperm/testicular-tissue for single men) is **legal in Kuwait and standard practice at the clinic**; only **treatment and embryo creation** require a couple.
- **Decision:**
  - **Couple-gated (unchanged):** insemination, IUI, IVF/ICSI, embryo culture, embryo transfer, FET, and **embryo** storage require a verified `Couple` (the marriage hard-gate).
  - **Person-scoped (new, permitted unmarried):** oocyte / ovarian-tissue freezing (single woman) and sperm / testicular-tissue freezing (single man). A **fertility-preservation cycle type linked to a `Person`** — the only cycle type that may be person-scoped. `CryoSpecimen.owner` becomes `person_id` OR `couple_id`. Witnessing, chain-of-custody, consent-to-store, and storage-expiry apply identically.
  - **HARD INVARIANT:** person-owned gametes may never be used in treatment directly. **Thaw-for-treatment** of a person-owned specimen requires, at time of use: a verified `Couple` including that person, **current** marriage verification, and own-gametes-only resolution. Bypass attempts via the API must be server-rejected (adversarial test, Phase 2). **No posthumous-use pathway — not built.**
  - The **indication** (medical vs elective) is a **configurable coded field captured on every preservation cycle as clinical-governance data — NOT a legal gate** (the practice itself is confirmed legal). Configurable so the clinic can analyse/segment without code change.
- **Consequences:** the model stays legally correct and least-permissive (treatment still requires a couple; preservation is the narrow, person-scoped exception with a use-time re-gate). Registry gating gains a treatment-vs-preservation distinction; full build lands in Phase 2 (cryostore/cycle). Detailed docs/01 §E3/§E6 + docs/04 edits accompany that build; docs/03 §1 updated now.

## ADR-0016 — Canonical om-software design system (supersedes docs/02 §2 fonts)
- **Date:** 2026-06-12
- **Status:** accepted (resolves AMD-0001)
- **Context:** docs/02 §2 named Cormorant Garamond + DM Sans/Inter Tight; the product owner supplied the live om-software design system (`PALETTE.md`) so the EMR and existing clinical tools are one visual family.
- **Decision:** adopt the canonical palette as the source of truth: **Satoshi** (display), **Plus Jakarta Sans** (body/UI), **Geist** (data/tables, tabular numerals), **Noto Sans Arabic**; warm-neutral canvas (`#F5F5F0`) + single teal-green accent (`#2A7C6F`); fixed semantic / clinical-status / drug-class colours; 8px spacing scale; clinical LTR exception (drug names, lab values, embryo grades stay LTR in RTL). `@oxford/ui` token **names are stable**; docs/02 §2 updated; the Cormorant/DM Sans reference is superseded.
- **Consequences:** visual coherence with the sister product; one design source of truth. Values may be tuned in the brand file without renaming tokens.

## ADR-0017 — Cliniko migration: cutover + archive (Option B)
- **Date:** 2026-06-13
- **Status:** accepted (product owner chose Option B)
- **Context:** moving off Cliniko at Phase 1 cutover. Two approaches: (A) full historical migration of all Cliniko data into Oxford HIS; (B) migrate only the "active" slice needed to operate forward and keep Cliniko read-only as the historical archive.
- **Options considered:** A — one system, fully searchable history, but high effort/risk and years of unstructured notes imported with low value; B — lower effort/risk, clean cutover, Cliniko retained as the trusted archive, at the cost of historical records not being searchable inside Oxford HIS.
- **Decision:** **Option B — cutover + archive.** Migrate the active slice (active patients + demographics, upcoming appointments, open balances) into Oxford HIS via a dedicated, audited, **re-runnable** import job with a **reconciliation report**; keep Cliniko (read-only) as the historical archive. A later, bounded backfill of high-value structured items (active meds, problem lists, current consent status) is possible without a big-bang import.
- **Consequences:** faster, lower-risk go-live; reconciliation scope is the active slice (fits the parallel-run discipline). Trade-off: staff consult Cliniko for old history; a Cliniko export/subscription is retained. **Residency caveat:** Cliniko's own hosting region must pass a residency check before it is relied upon as the archive (docs/03 §4) — logged in STATE.

## ADR-0018 — RI Witness: build reconciliation/blocking behind the stub now; scope CooperSurgical in parallel
- **Date:** 2026-06-13
- **Status:** accepted (product owner)
- **Context:** RI Witness is the witnessing system of record (ADR-0002). The exact integration path — sync-tool version, EMR-integration licence, whether witnessing/traceability can be pulled back via DB view/export/API, image transfer — must be scoped with CooperSurgical and gates the *real* wiring. Waiting would block the whole Phase 2 lab build.
- **Decision:** build the full reconciliation ledger + **blocking-on-divergence** logic against a **`WitnessingProvider` stub** (a simulated RI provider) now, so the safety behaviour is built and tested immediately. The real `RiWitnessProvider` is wired behind the same seam once CooperSurgical scoping completes (and the RI server passes the docs/03 residency review). Product owner initiates CooperSurgical scoping in parallel.
- **Consequences:** Phase 2 lab modules proceed now; no real witnessing data flows until the adapter is wired and reviewed. Mirrors the Phase 0 seam pattern (KMS/OIDC). Refines ADR-0002.

## ADR-0019 — Time-lapse incubator: vendor-neutral import seam only (no device today)
- **Date:** 2026-06-13
- **Status:** accepted (product owner — no time-lapse incubator deployed at present; may acquire later)
- **Context:** embryology grading can import morphokinetic annotations from a time-lapse incubator (EmbryoScope/Geri/etc.). The clinic has none today.
- **Decision:** build a **vendor-neutral morphokinetic import hook** (a seam on `EmbryoAssessment`) — no platform-specific code. When a device is acquired, a concrete adapter is added behind the seam.
- **Consequences:** no wasted platform-specific work; the embryology model is ready to receive time-lapse data later without rework.

## ADR-0020 — Oxford HIS replaces the om-software tools, tool-by-tool, never big-bang
- **Date:** 2026-06-13
- **Status:** accepted (product owner / Medical Director)
- **Context:** the first-generation om-software clinical point tools (semen-analysis, embryo follow-up, Document Ledger/patient timeline, the HTML clinical tools, the Cliniko-backed patient context) are to be **replaced** by the EMR, not run permanently alongside it. Their functionality is absorbed into the corresponding EMR modules (andrology E5, embryology E4, clinical core E2, scheduling/registry E1) as those are built.
- **Decision (binding principles):**
  1. **Tool-by-tool replacement, never big-bang** — each tool is replaced by its EMR module individually, behind a **parallel-run gate** (EMR runs alongside the live tool; reconciliation proves they agree; only then decommission).
  2. **No decommissioning without proven data migration** — no tool is switched off until all its data is **provably migrated** into the EMR **or archived with guaranteed read access**; the Document Ledger's "history never lost" promise extends across the replacement; each tool's migration ships a **reconciliation report** (as with ADR-0017 Cliniko).
  3. **Map, don't fork** — read om-software to match the design system (ADR-0016) and map each tool's data model/features to the target module so the EMR is a faithful **superset** before cutover; **reimplement** functionality on the EMR's audited/RBAC'd/in-region foundation — do **not** copy om-software's vanilla-HTML/Flask/SQLite architecture.
- **Consequences:** safe, incremental cutover with no data loss and no big-bang risk; the full replacement map lives in `docs/07_OM_SOFTWARE_REPLACEMENT_MAP.md`; per-tool migrations are sequenced into docs/05 (Phase 2 onward; Phase 0/1 unchanged). Needs: om-software **read access** for field-level mapping; product-owner decisions on **retirement order** and **archive-vs-migrate** per tool (STATE).

## ADR-0021 — Clinician-attested death record is the authoritative vital status for the no-posthumous-use gate
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director)
- **Context:** the cryostore thaw-for-treatment re-gate (ADR-0015/AMD-0002) forbids posthumous use of a person-owned specimen. That gate needs an authoritative "is the owner living?" fact. PR 2.7 deferred the cryostore API wiring because no vital-status source existed, and a permissive `ownerAlive=true` default would have silently opened a posthumous path.
- **Decision:** vital status is a **clinician-attested death record** in the registry (`registry.death_record`, one per person: date of death, attesting clinician, death-certificate document ref). Recording a death is a restricted, audited mutation (`clinical:vital_status.write`); re-attestation is rejected. The cryostore `UseGate` derives `ownerAlive` from the **absence** of a death record (`isPersonLiving`), alongside couple verification + membership — all sourced from the registry, never the caller. There is still no override on the pure re-gate.
- **Consequences:** the no-posthumous-use invariant is now enforced **end-to-end through the API** (adversarial e2e: an attested death blocks thaw on real Postgres); cryostore is wired into the composition root + router. A future MOH/civil-registry death feed can replace/augment the manual attestation behind the same `isPersonLiving` accessor without touching the gate.

## ADR-0022 — Cryostorage period: annual renewal while fees paid; MOH regulations otherwise
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director) — resolves the "cryo storage max period" legal-confirm item
- **Context:** AMD-0003 built annual storage billing + a graduated non-engagement pathway, but the storage **maximum period** was a pending legal confirm.
- **Decision:** storage is **billed annually and continues as long as fees are paid**; where fees lapse or a regulatory ceiling applies, **MOH regulations govern** disposition — handled through the existing non-engagement pathway (reminders → overdue → clinical/legal review; **never auto-destroy**). The specific MOH numeric ceiling, when confirmed, is entered as **configuration** (storage-period config), not code.
- **Consequences:** the storage-period model is settled and already implemented (annual consent expiry is configurable; the never-auto-destroy pathway routes lapses to human review). The only remaining detail is the numeric MOH ceiling value, captured in config when the clinic confirms it. The marital-status-change disposition + permitted-PGT-indications confirms remain open with counsel.

_(Claude Code: continue numbering from ADR-0023.)_
