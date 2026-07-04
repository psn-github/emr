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

## ADR-0023 — Perioperative journey builds on the Phase 1 facility/flow model (no new bed model)
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director — "approved as proposed")
- **Context:** Phase 3 (docs/01 §E7) needs admit→bed→recovery→theatre→recovery→bed→discharge with audited floor transfers, a live bed board, and capacity awareness. The Phase 1 `@oxford/facility` module already models the real building (Ground pharmacy; L1 = 2 theatres + 3 recovery beds; L2 = 6 inpatient beds; L3 = clinic + lab) with `Floor`/`LocationNode`/`Bed`, and `FlowService` already tracks patient location, audited `LocationMovement`s, the bed board, and `BedCapacity`.
- **Decision:** Phase 3 **reuses** the facility/flow model rather than introducing a parallel bed model. A new `@oxford/perioperative` domain module owns the `SurgicalEncounter` and the perioperative **journey state machine**, and **drives bed allocation/transfers through an injected facility/flow seam** (app-layer wiring to `FacilityService`/`FlowService`) — no cross-domain table access. Capacity numbers are the seeded topology: **6 × L2 inpatient, 3 × L1 recovery, 2 × L1 theatres, admit on L3** (confirmed by the Medical Director).
- **Consequences:** one source of truth for "who is where"; the flow board (E1) shows perioperative patients automatically; module boundaries preserved via a seam. Theatre scheduling reuses the Phase 1 `scheduling` shared-resource calendar.

## ADR-0024 — InventoryPort seam for theatre consumables/implants (real module is Phase 4)
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director — "approved as proposed")
- **Context:** intra-op consumables/implants must deduct from stock and flow to billing (docs/01 §E7), but the inventory/ERP module is Phase 4.
- **Decision:** capture consumables/implants at point of use behind an **`InventoryPort` seam** (a stub records the deduction now; the real `@oxford/inventory` adapter is wired in Phase 4). Billing of consumables uses the existing `@oxford/billing` via a port (integer fils stays in billing). Implant/lot identifiers are captured for traceability now regardless of the inventory backend.
- **Consequences:** the theatre flow is built and tested now; real stock deduction lands with Phase 4 behind the same seam (mirrors RI Witness/KMS seam pattern).

## ADR-0025 — PharmacyPort seam; discharge gated on prescription fulfilment (real is E8 pharmacy)
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director — "approved as proposed")
- **Context:** discharge from L2 is **gated on the discharge prescription being fulfilled/handed over by the Ground-floor pharmacy** + a follow-up booking (docs/01 §E7), but the pharmacy module (E8) is later.
- **Decision:** model discharge-prescription fulfilment behind a **`PharmacyPort` seam** (a stub marks fulfilment now; the real pharmacy adapter is wired with E8). Discharge from L2 is **blocked** until the port reports the prescription fulfilled/handed over and a follow-up is booked — enforced server-side, adversarially tested.
- **Consequences:** the discharge gate (a patient-safety control) is built and proven now; the real pharmacy integration slots in behind the seam without changing the gate.

## ADR-0026 — Real `@oxford/inventory` behind the Phase-3 InventoryPort seam
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director — "approved as proposed")
- **Context:** Phase 3 captured theatre consumables/implants behind an `InventoryPort` stub (ADR-0024). Phase 4 builds the real inventory.
- **Decision:** a new `@oxford/inventory` domain module provides multi-location stock with **lot + expiry tracking, FEFO issue, cold-chain logging, and min/max/par + critical-stock/expiry-imminent alerts**. It is wired behind the existing `InventoryPort` (the app adapter swaps the stub for the real `deduct`), so the Phase-3 theatre flow now deducts real stock with no change to the perioperative module. Inventory locations map onto the Phase-1 facility levels (Ground pharmacy / L1 / L2 / L3 / stores).
- **Consequences:** consumable burn is real and lot-traced; the seam pattern means Phase 3 is unchanged; FEFO/alert logic is held to 100%.

## ADR-0027 — Procurement accounts-payable money is separate from patient billing
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director)
- **Context:** procurement involves supplier invoices (accounts payable); `@oxford/billing` is patient accounts-receivable.
- **Decision:** procurement keeps its **own integer-fils AP money** (PO / GRN / supplier-invoice totals + the 3-way match) in the procurement module — NOT in `@oxford/billing`. Same money discipline (integer fils, no float, 100% on match logic); the two ledgers stay distinct and reconcile to finance separately (Phase 5).
- **Consequences:** clean separation of AR (patient) and AP (supplier); no accidental cross-contamination of patient invoices with supplier costs.

## ADR-0028 — Controlled-drugs register: generic + configurable Kuwaiti schedule
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director) — Kuwait schedule/reporting is a pending config/counsel value
- **Context:** controlled substances need a reconciling register; the exact Kuwaiti controlled-substance schedule + MOH reporting format are not yet confirmed.
- **Decision:** build a **generic controlled-drugs register** — receipts / issues / wastage with a **running balance that must reconcile and can never go negative** (100%, adversarial). Which items are controlled, and the regulatory reporting format, are **configuration** (a schedule list) populated when the clinic confirms with counsel. Do not hardcode a schedule.
- **Consequences:** the safety/reconciliation mechanism ships now; the Kuwaiti schedule + reporting format drop into config later (logged as an open item).

## ADR-0029 — Asset calibration blocking keyed off a per-asset criticality flag
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director)
- **Context:** docs/01 §E10 requires **blocking** overdue-calibration alerts for critical equipment (e.g. incubators), and alert-only for the rest.
- **Decision:** each asset carries a **criticality flag** (configuration). An overdue PPM/calibration on a **critical** asset **blocks its use** (a server-side gate, adversarially tested) and raises a lab-visible alert; non-critical overdue raises an alert only. Default use-blocking classes: incubators + anything flagged critical (clinic-configurable).
- **Consequences:** the patient-safety control (no unsafe critical device in use) is enforced, not advisory; the blocking set is data, not code.

## ADR-0030 — IVF media-lot ↔ embryo traceability via a lot id on culture records
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director)
- **Context:** a media lot used in culture must be traceable to the embryos cultured in it (docs/01 §E9 acceptance; E4 P1 lab-QC media-lot tracking) — for recall.
- **Decision:** embryology records the **inventory media-lot id** on its culture/grading records; the traceability link is that lot id (no cross-module table access — embryology stores the string the inventory module issued). A **lot-recall query** answers "given a media lot → which embryos were cultured in it." Module boundaries preserved; the lot id is the join.
- **Consequences:** a media-lot recall enumerates affected embryos directly; inventory and embryology stay decoupled (linked only by the lot id).

## ADR-0031 — Media traceability as a dedicated append-only record; traceability-only (no stock coupling)
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** implementing ADR-0030. Two choices surfaced: (a) overload grading/culture records with a lot id, vs a dedicated record; and (b) whether applying a media lot should also *deduct* inventory stock through a port.
- **Decision:** record each media application as a **dedicated, append-only `embryology.media_application` row** (cycle, embryo **or** oocyte, `itemId` + `lotNo`, step, quantity, when, who) rather than overloading grading — one media event maps to one row, and pre-embryo (oocyte-stage) applications are representable. The lot is keyed by the inventory's own **(itemId, lotNo)** — a shared-identifier cross-reference, not a cross-module dependency. The record is **traceability-only**: it does NOT gate on or mutate inventory stock. Recording lab reality (which lot touched which embryo) is the authoritative patient-safety fact and must never be blocked by stock bookkeeping; coupling to stock deduction is deferred pending the lab's confirmed unit-of-use mapping (media is drawn in sub-vial volumes that do not map cleanly to inventory issue units).
- **Consequences:** `mediaRecall(itemId, lotNo)` enumerates every embryo/oocyte/cycle exposed to a recalled lot, and an embryo's life history now lists the lots it (and its originating oocyte) saw. Stock-consumption reconciliation is a future, separately-scoped enhancement — logged so it is not silently dropped.

## ADR-0032 — Controlled-drugs register: independent witnessed ledger, reconciled by physical count
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** docs/01 §E8 P0 requires a legal-grade, witnessed, **reconcilable** controlled-drugs register (PR 4.5). Two design questions: (a) should the CD register *be* the stock, or its own ledger; (b) what makes a movement legal-grade.
- **Decision:** the CD register is its **own append-only ledger** keyed to catalogue items flagged `controlled`, carrying a **running book balance** that can never go negative — it is NOT auto-derived from the inventory stock lots. Reconciliation is meaningful precisely because the two are independent: a **physical count** is reconciled against the book balance and any discrepancy posts a **witnessed `adjustment`** (the discrepancy is audited, never silently absorbed). Every movement is **two-person witnessed** (the witness must be a distinct, named second person) — enforced in the service as a hard invariant, not by RBAC. Ledger order is a monotonic **`seq`** (insertion order), since a running balance must be reconstructed in the order entries were recorded (timestamps can tie/backdate). The safety gate is the **explicit per-item `controlled` flag**, not a derived schedule, so nothing escapes the register on an empty/unconfirmed Kuwaiti schedule. The Kuwaiti schedule classification and the MOH report format are config/hook (AMD-0005), not encoded.
- **Consequences:** controlled-drug movements reconcile (the Phase-4 exit-gate criterion); discrepancies are caught and witnessed; 100% coverage on the balance/witness/reconcile logic (drug-safety). Coupling the register to automatic stock deduction is deliberately deferred (would make reconciliation vacuous and risks double-counting) — revisited with the E8 pharmacy build.

## ADR-0033 — Asset module + `assertUsable` gate; missing calibration also blocks a critical asset
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** implementing ADR-0029 (PR 4.6). Two refinements needed: where assets live, and how a **never-calibrated** critical asset is treated (ADR-0029 spoke of *overdue*).
- **Decision:** assets are a **new `@oxford/assets` domain module** (register + PPM/calibration + fault/downtime), separate from `@oxford/inventory` (consumable stock) — fine-grained module convention, boundaries clean. The use-blocking gate is `AssetService.assertUsable(assetId, asOf)`, a **server-side** decision keyed off the per-asset `critical` flag (config). A critical asset is usable **only when its latest calibration's next-due date is in the future**; calibration that is **overdue OR never recorded ("missing")** both **block** use (`calibration_overdue` / `calibration_missing`) — a never-calibrated critical device is at least as unsafe as a lapsed one, so the conservative path blocks it. Non-critical assets are **alert-only** (never blocked). Alerts sort the fleet into blocking / non-blocking / due-soon. The gate is queryable now; wiring it into specific lab/theatre use-paths (embryology incubation, etc.) is a later cross-cutting integration.
- **Consequences:** "overdue calibration on an incubator raises a blocking alert visible in the lab" (the §E10 exit-gate) holds, and a critical asset can't be used unvalidated; 100% coverage on the calibration/usability/validation logic (patient-safety). The earlier open item "which asset classes are use-blocking" is closed: it's the `critical` flag, not a hardcoded class list.

## ADR-0034 — No cash: cash payments are structurally absent (KNET + card only)
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director / product owner)
- **Context:** under the new Kuwait rules the clinic takes **no cash**. Payments are **KNET or credit card** only. (Supersedes the earlier `PaymentMethod = "cash" | "card" | "knet"`.)
- **Decision:** cash is **structurally absent** (same posture as donor/surrogacy): `PaymentMethod` is **`"knet" | "card"`** — there is no `cash` member, no cash-handling code, drawer, or UI, anywhere. A request to post a cash payment cannot type-check, and the server rejects any unknown method. Adversarially tested.
- **Consequences:** the system cannot represent or record a cash transaction; reconciliation and receipts are KNET/card only; removing the member is a one-time refactor of `@oxford/billing` (PR 5.1).

## ADR-0035 — No tax: the billing money model carries no tax field/line/calculation
- **Date:** 2026-06-13
- **Status:** accepted (Medical Director / product owner)
- **Context:** there is **no sales/VAT tax in Kuwait**. The earlier model kept a `taxRateBps`/`taxFils` "for regulatory fitness"; the product owner has confirmed no tax applies.
- **Decision:** **remove tax from the money model** — no `taxRateBps` on invoices, no `taxFils` in totals, no `taxAmount()` in `money.ts`; an invoice **total = subtotal**. Money stays integer fils, 100% covered. (Supersedes docs/01 §E11 "tax/regulatory fields per Kuwait".)
- **Consequences:** simpler, correct invoices/statements; no dormant tax surface to misuse. If Kuwait ever introduces a tax, it returns as an explicit ADR + migration, not a dormant field.

## ADR-0036 — KNET + card via a residency-reviewed PaymentGatewayPort
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** docs/01 §E11 requires KNET + card payments on Gulf rails; payment processing touches PHI-adjacent + PCI data and residency rules (docs/03, ADR-0006/0007).
- **Decision:** payments go through a **`PaymentGatewayPort`** seam (authorize/capture/refund + receipt reference). A **dev/test stub** stands in until the **in-region, residency-reviewed** gateway is selected; the real adapter lands behind the port with a residency review logged as an ADR. The billing domain never embeds a gateway SDK.
- **Consequences:** billing logic (balances, instalments, receipts, refunds) is testable now without a live gateway; the real KNET/card processor is a config/adapter swap, residency-gated.

## ADR-0037 — Packages & cycle bundles as versioned config with per-component recognition
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** IVF is sold as packages (e.g. "ICSI package": consult + monitoring + retrieval + lab + transfer, drugs optional) with inclusions/exclusions (docs/01 §E11).
- **Decision:** a **package is a versioned config bundle** of components (charge codes + quantities + inclusion flags) in a config table, not code. Selling a package **instantiates** it on a patient with **per-component recognition**, and charge capture **maps clinical/lab/theatre events to package components** (consuming an inclusion) vs billing extra. Configuration is data (CLAUDE.md).
- **Consequences:** packages/pricing change without code; component recognition supports margin analysis (E12) and correct over-/under-inclusion billing.

## ADR-0038 — Deposits & instalment plans gate cycle progression (block/allow rule is config)
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** self-pay IVF runs on deposits + instalments, and cycle steps are gated on payment status (docs/01 §E11 acceptance: "outstanding-balance rules correctly gate the next cycle step").
- **Decision:** an **instalment plan** has scheduled instalments, balance tracking, and payment-due notifications. Cycle-step progression is gated via a **`FinanceGate` seam** the fertility/embryology flow consults: a step is **blocked when the plan is in arrears beyond the configured rule** (e.g. deposit unpaid, or an instalment overdue past a grace window). The rule is **configuration** (thresholds/grace), defaulting conservative (block on deposit-unpaid). No permissive default. Money 100% covered.
- **Consequences:** progression-gating is enforced server-side (not advisory) and adversarially tested; clinics tune the rule without code; the gate is injected (no billing→fertility import).

## ADR-0039 — KPIs, dashboards & reporting as read models; MOH/accreditation formats are config
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** docs/01 §E12 needs Vienna-consensus lab KPIs, clinical-outcome and operational/financial dashboards, MOH/accreditation outputs, and one-click audit export.
- **Decision:** KPIs/dashboards are **read models computed from domain data + the event/audit logs** (no new source of truth; no cross-module table access — aggregate via published reads/events). Outcome reporting is **de-identifiable**. **One-click audit-trail export per entity** reuses the hash-chained audit log. The exact **MOH/accreditation report formats are config** (like the CD/MOH item, AMD-0005) — pending confirmation; the data/queries ship, the regulatory file shape drops in later.
- **Consequences:** reporting never forks the data model; formats are confirmable without rebuild; audit export is a first-class compliance feature.

## ADR-0040 — Light HR: staff registry + licence/competency expiry + rota → scheduling; payroll external
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** docs/01 §E14 wants light HR — MOH licence/competency expiry tracking (esp. witnessing-qualified embryologists) and rota feeding scheduling; full payroll stays external.
- **Decision:** a **staff registry** with **credential/licence + competency records carrying expiry**, with due/overdue alerting; **rota/shift planning feeds resource availability** in scheduling (via the existing scheduling seam, not a direct table reach). **Full payroll is out of scope** (external). Competency expiry MAY inform (not silently block) witnessing eligibility — any hard gate is an explicit, configured rule.
- **Consequences:** licence lapses are visible/alertable; rota integrates with scheduling; HR stays "light" and bounded.

## ADR-0041 — Patient experience delivered as a bilingual PWA over the tRPC API
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** docs/01 §E13 leaves the patient app as "PWA vs React Native, decided by ADR." The clinic needs a bilingual (en/ar, RTL) mobile-first experience; the team already ships a TypeScript/tRPC monorepo with an `@oxford/ui` token set.
- **Decision:** build the patient experience as a **bilingual mobile-first PWA** consuming the **same tRPC API** (one type-safe contract, one codebase, instant updates, installable, push-capable via web-push). React Native is **not** adopted now (it would fork the client, the build, and the i18n/RTL work for marginal benefit pre-launch). The server stays the enforcement point; the PWA never decides access. Revisit RN only if a native-only capability becomes required.
- **Consequences:** the portal is server-driven and reuses i18n/RTL + the design tokens; this phase focuses on the **patient-facing API surface + read models** (the PWA shell/build is a thin client over them). All patient routes go through `patientProcedure` + `assertOwnData`.

## ADR-0042 — Portal data exposure: own-data-only, clinician-released results, no PHI in notifications
- **Date:** 2026-06-13
- **Status:** accepted
- **Context:** the portal exposes clinical/financial data directly to patients — the highest-risk surface. docs/01 §E13 requires released results, balances, consents, messaging; docs/03 governs privacy.
- **Decision:** (1) **Own-data only** — every patient route is scoped by `PatientPrincipal` + `assertOwnData` (already adversarially tested); cross-patient access is structurally impossible. (2) **Results are clinician-released** — a result is invisible in the portal until a clinician explicitly releases it (a release gate; unreleased results never appear). (3) **No PHI in notifications** — push/SMS/email carry only discreet, non-clinical prompts ("a new result is available", "an instalment is due"), never content (reuses the Phase-1 notification discretion). (4) **Consent-gated partner access** — a second person sees a patient's data only with an explicit, revocable, audited consent grant (own-data-only by default). (5) Portal **payments are KNET/card via the gateway**, own invoices only (no cash, ADR-0034).
- **Consequences:** the patient surface is least-privilege by construction; release-gating and consent grants are server-enforced and audited; notifications stay safe to receive on a shared device.

## ADR-0044 — Coded cancellation reasons + cycle conversion (P1)
- **Status:** accepted (2026-06-14)
- **Context:** `cycle.cancellationReason` was free text, so the Phase-5 KPI layer could not aggregate cancellation rate, and IVF→IUI conversion (a core IVF metric) was not modelled. docs/01 §E3 P1 calls for "cancellation/conversion handling with reason coding for KPIs"; CLAUDE.md requires configuration-as-data and no free-text clinical config.
- **Decision:** (1) **Cancellation reasons are coded config** — a versioned, bilingual `fertility.cancellation_reason` table (code → KPI `category`); `cancel()` requires a valid active code (free text rejected) plus an optional non-clinical free-text note. The reason's `category` is **snapshotted** onto the cycle at cancel time (config can change later). (2) **Conversion** — `convertCycle()` cancels the source with a reserved `converted`-category reason and creates a NEW linked cycle (`convertedFromId`) of the new type carrying owner + signed consents; allowed only pre-retrieval, between treatment types (never to/from person-scoped preservation), to a different type. (3) **KPIs** — the fertility read-model emits disposition counts (own tables only); `@oxford/analytics.cycleDisposition` computes cancellation rate (conversions excluded) by category + conversion rate (counts-in, no cross-module access). The legacy free-text column is left in place (forward-only, additive migration; never dropped).
- **Consequences:** cancellation/conversion are now KPI-aggregable and audited; the structural rules (no preservation conversion, pre-retrieval only) are enforced + adversarially tested; module boundaries preserved (analytics stays counts-in).

## ADR-0045 — Cycle templates + clinician cohort view (P1)
- **Status:** accepted (2026-06-14)
- **Context:** docs/01 §E3 P1 calls for "cycle templates per consultant" and a "bulk cohort view (all patients stimulating this week)". Starting a cycle meant supplying type + protocol each time; clinicians had no roster of cycles by status.
- **Decision:** (1) **Cycle templates are versioned config** — a bilingual `fertility.cycle_template` table (type + protocol; `ownerStaffId` per-consultant or null = clinic-wide). `CycleService.createCycleFromTemplate(templateId, owner)` applies the template's type+protocol and routes through the existing create paths, so the **marriage hard-gate and consent gating still apply** (a template is a convenience, not a bypass); owner scope is validated against the template type (person for preservation, couple otherwise). (2) **Cohort view** — `CycleService.cohort({status?, createdAfter?, createdBefore?})` over the fertility table only (no cross-module access), backing the "stimulating this week" roster. Additive migration `0005`; seed templates; config-as-data (no code change to add/edit).
- **Consequences:** one-step cycle starts without weakening any safety gate; a clinician roster by status/window; module boundaries preserved.

## ADR-0046 — Lab QC log (P1)
- **Status:** accepted (2026-06-14)
- **Context:** docs/01 §E5 P1 calls for a "lab QC log: incubator gas/temperature, media lot tracking, pH/osmolality checks." The assets module already schedules PPM/calibration and blocks CRITICAL equipment with overdue calibration; what was missing is the **measured readings** themselves and their evaluation against acceptable ranges.
- **Decision:** add a self-contained Lab QC capability **inside `@oxford/embryology`** (lab-process quality): (1) **QC parameters are versioned config** — a bilingual `embryology.qc_parameter` table (unit + acceptable `[min, max]`); seeded with incubator CO₂/O₂/temperature and media pH/osmolality. (2) **`LabQcService.record()`** evaluates a reading against its parameter, stores it with a `pass`/`fail` status, audits it, and emits `LabQcBreached` on an out-of-range reading (vs `LabQcRecorded`). (3) **`list()`** serves the QC log filtered by parameter / equipment / lot / time. Equipment (`assetRef`) and media lots (`lotNo`) are referenced **by id only** — no cross-module table access (complements, not duplicates, the assets calibration gate and the existing media-lot→embryo recall reachability). Additive migration `0004`; config-as-data.
- **Consequences:** the lab has a persisted, auditable QC record with automatic out-of-range flagging; ranges are tuned as config; module boundaries preserved (assets still owns equipment lifecycle; inventory still owns lots).

## ADR-0047 — Practitioner leave / capacity (P1)
- **Status:** accepted (2026-06-14)
- **Context:** docs/01 §E2 P1 calls for "practitioner leave / capacity management." Light HR (ADR-0040) already feeds scheduling availability from rota shifts, but a rostered practitioner on leave was still counted as available.
- **Decision:** extend `@oxford/hr` (it already owns the rota→availability feed): (1) **Leave records** — `hr.leave` (type annual/sick/study/unpaid/other + window), recorded via `HrService.recordLeave()`, audited, emitting `LeaveRecorded`. (2) **Leave overrides the rota** — `availability(resourceId, from, to)` now EXCLUDES shifts whose staff is on leave for the window; `isOnLeave()` / `leaveFor()` expose the lookups. (3) **Capacity** — `capacity(resourceId, from, to)` returns the count of distinct available (rostered, not on leave) practitioners. Additive migration `0002`; no scheduling-module change needed (it consumes the same HR availability seam, which now nets out leave).
- **Consequences:** scheduling availability and capacity automatically account for leave; HR remains the single owner of staff time; module boundaries preserved.

## ADR-0048 — Clinical pathways / order sets (P1)
- **Status:** accepted (2026-06-14)
- **Context:** docs/01 §E13 P1 calls for "clinical pathways / order sets (e.g. 'early pregnancy' set, 'recurrent miscarriage workup')." Clinicians placed orders one at a time; common scenarios repeat the same bundle.
- **Decision:** add order sets to `@oxford/clinical` as **versioned config** — a bilingual `clinical.order_set` table (items stored as JSON: `{kind, code, label}`), seeded with "early pregnancy" and "recurrent miscarriage workup". `ClinicalService.applyOrderSet(encounterId, patientId, orderSetId)` validates the set is active and **places each item as a normal `Order`** (reusing `placeOrder`, so each order is audited + emits `OrderPlaced`), then records an `OrderSetApplied` event. `listOrderSets()` serves the picker. Order sets are pure config (add/edit without code); applying one produces ordinary orders that flow through the existing results/acknowledge/release pipeline unchanged.
- **Consequences:** faster, consistent ordering for common pathways; sets are clinic-tunable config; no new order lifecycle (sets are a convenience over `placeOrder`); boundaries unchanged.

## ADR-0049 — Advanced sperm tests / DNA fragmentation (P1)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E5 P1 calls for "DNA fragmentation and advanced sperm tests capture." The andrology module captured WHO semen analysis but not DFI/ROS/aneuploidy/HBA, which need their own reference cut-offs and (unlike WHO lower limits) can be higher-is-worse or higher-is-better.
- **Decision:** add advanced sperm tests to `@oxford/andrology` as **versioned config + capture**: (1) an `andrology.advanced_test_spec` table (bilingual; `unit`, `direction` higher_worse|higher_better, two thresholds), seeded with **DFI, ROS, sperm aneuploidy (FISH), and HBA**; (2) `interpret(spec, value)` → normal/borderline/abnormal honouring direction; (3) `AndrologyService.recordAdvancedTest()` interprets, stores an `andrology.advanced_sperm_test` row, audits it, and emits `AdvancedSpermTestAbnormal` on an abnormal result (`AdvancedSpermTestRecorded` otherwise); `advancedTests()` / `listAdvancedTestSpecs()` read. Additive migration `0002`; thresholds are clinic-tunable config.
- **Consequences:** DFI and other advanced assays are captured + interpreted + auditable; cut-offs are config; consistent with the WHO-analysis pattern; boundaries unchanged.

## ADR-0050 — Antenatal record / obstetric continuum (P1)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E2 P1 calls for the "antenatal record proper — the obstetric continuum (booking bloods, growth charts, visit schedule, risk flags)", noted as Oxford-unique because it carries fertility patients into delivery.
- **Decision:** add the antenatal record to `@oxford/clinical` (it owns patient clinical records — no new package): (1) **`Pregnancy`** booking dates by **Naegele's rule** (EDD = LMP + 280 days), stores gravida/para + coded risk factors; one active pregnancy per patient. (2) **Visit schedule** is config (`DEFAULT_VISIT_SCHEDULE_WEEKS`) — `plannedVisits(lmp)` generates due dates. (3) **`AntenatalVisit`** captures vitals/growth; `assessVisit()` derives **risk flags** (hypertension, proteinuria, pre-eclampsia risk ≥20w, fundal-height discrepancy ≥24w). `AntenatalService.recordVisit()` computes gestation, derives flags, audits, and emits `AntenatalVisitRecorded` (+ `AntenatalRiskFlagged` when flagged). Additive migration `0004` (pregnancy + antenatal_visit). Growth "charts" are the serial visit measurements (a UI concern over the data). Pure dating/flagging logic is 100% covered.
- **Consequences:** the fertility→delivery continuum is captured + risk-flagged + auditable in the same module as the rest of the EMR; schedule + (later) thresholds are config; boundaries unchanged.

## ADR-0051 — Time-lapse morphokinetic analytics (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E4 P2 calls for "time-lapse morphokinetic analytics surfaced to embryologists" (the P0 already has time-lapse incubator annotation-import hooks). Morphokinetic timings (t2…tB, hpi) feed derived intervals and known optimal-range scoring; this is decision *support*, not an automated embryo selection.
- **Decision:** add morphokinetics to `@oxford/embryology` as **config + import + analytics** (mirrors the lab-QC pattern): (1) `embryology.morphokinetic_range` — versioned, bilingual optimal ranges (t2/t3/t5/cc2/s2/t5−t2), config-as-data. (2) Pure logic: `computeIntervals` (cc2/s2/cc3/t5−t2), `validateEventOrder` (positive + strictly increasing in canonical order), `assessMorphokinetics` → per-variable in-range, a **score** (count of monitored variables in range) and **flags** (direct cleavage when cc2 < 5h). (3) `MorphokineticsService.recordAnnotation()` validates the embryo exists (via an `EmbryoLookup` port satisfied by `EmbryologyStore` — no cross-module access), validates timings, scores, persists an `embryology.morphokinetic_annotation`, audits, and emits `MorphokineticAnnotationRecorded` (+ `MorphokineticFlagged` when flagged). Additive migration `0005`. **Analytics are surfaced, never auto-selecting an embryo** (CLAUDE.md: don't build the permissive clinical path). 100% coverage on the module.
- **Consequences:** embryologists get scored morphokinetic analytics + exclusion flags per embryo, auditable; ranges/thresholds are config; the first P2 lands without touching module boundaries. The concrete time-lapse platform (EmbryoScope vs Geri) remains an open integration choice (docs/01 open questions) — `source` is captured per annotation.

## ADR-0052 — Implant/device registry reporting (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E7 P2 calls for "implant/device registry reporting." The §E7 P0 already captures consumables & implants at point of use with a mandatory lot/serial (`ConsumableUse`), but those lines stored only `encounterId` — a device registry and (critically) **recall traceability** need the patient and a way to know which codes are registrable devices.
- **Decision:** add the registry to `@oxford/perioperative` as **config + reporting over existing capture**: (1) add `patientId` to `ConsumableUse` (additive migration `0008`: `ADD COLUMN … NOT NULL DEFAULT ''`, plus `(patient_id)` and `(code, lot_no)` indexes) so every implant line is patient-traceable. (2) `perioperative.device_catalogue` — versioned, bilingual config of registrable implantable devices (code, deviceType, manufacturer). (3) `DeviceRegistryService` reads the lot-traced lines and reports only registrable ones, enriched: `implantsForPatient`, **`recallLookup(code, lot?)`** (every recipient — patient-safety critical), and `registryExport(since, until)`. Recall + export are sensitive reads, audited as `READ_EXPORT`. No cross-module access — it reads its own `consumable_use` lines; patient/device IDs are reported, not joined demographics.
- **Consequences:** implant recalls and registry submissions are answerable from captured data, auditable; the registrable-device set + metadata are config; the seed catalogue (adhesion barrier, surgical mesh, tubal clip) is illustrative and clinic-editable. The `''` patient_id default is a migration-safety sentinel only (no prod rows exist); all new writes set the real patient.

## ADR-0053 — LN₂ consumption + tank PPM linkage to asset module (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E6 P2 calls for "liquid-nitrogen consumption and tank PPM linkage to asset module." Cryostore already logs tank readings (level/temp/fill) and the assets module owns PPM/calibration schedules (`MaintenanceRecord`, type `ppm`). Two gaps: no LN₂ consumption tracking, and cryotanks weren't linked to their asset record.
- **Decision:** add both to `@oxford/cryostore`: (1) **LN₂ consumption** — log `LnFill` top-ups (litres added) per tank (additive table `cryostore.ln_fill`); `lnConsumption(tankId, since, until)` sums litres in a window (litres refilled ≈ LN₂ consumed). (2) **Tank↔asset PPM linkage** — `Tank.assetRef` (additive `ALTER … ADD COLUMN asset_ref`) links a tank to its Asset; a new `AssetPpmPort` seam (cryostore depends on no other module) surfaces the tank's PPM due/overdue via `tankPpmStatus(tankId)`. Wired in the app to a new `AssetService.ppmStatus(assetId, asOf)` (the asset module stays authoritative for maintenance; PPM is **not** a use-blocking gate, unlike calibration). Migration `0003`.
- **Consequences:** LN₂ burn is trackable per tank/window and a tank's preventive-maintenance status is visible from the cryostore without duplicating schedule logic; the asset module remains the single source of maintenance truth. Consumption is inferred from refills (the standard practical proxy); a future enhancement could derive it from level-drop readings.

## ADR-0054 — Bed-occupancy forecast from the booked theatre list (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E1 P2 calls for "bed-occupancy forecasting from the booked theatre list (will the six L2 beds cover tomorrow's list?)." Theatre scheduling already computes a single day's provisional L2 reservation; the gap is a forward, multi-day view.
- **Decision:** add `TheatreSchedulingService.bedOccupancyForecast(fromDate, days)` (read-only; no schema change). For each day in a 1–90-day horizon it counts scheduled (non-cancelled) cases — each provisionally reserves one L2 bed — and reports `{ date, reserved, capacity, exceedsBeds }` plus `daysExceeding`, reusing the existing `bedReservationStatus` rule and the configured L2 capacity (6). A pure `addDaysIso` does the UTC calendar-day math. The horizon is validated (integer 1–90). Like the per-case flag, exceeding capacity is a **warning surfaced to the coordinator, not a block**.
- **Consequences:** coordinators get a forward bed-occupancy view to rebalance lists before a day blows past the six L2 beds; built entirely on existing data (no migration), boundaries unchanged. The "demand forecasting from the cycle pipeline" half of §E1 P2 (and §E9 media/consumable burn) remains future work.

## ADR-0055 — Revenue-cycle leakage detection (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E11 P2 calls for "revenue-cycle analytics, ageing, leakage detection." Ageing buckets, revenue-by-line, and instalment-risk already exist (P0 financial dashboards). The gap is **leakage detection** — billable work that was recorded but never billed.
- **Decision:** add **revenue-leakage detection** as pure analytics + a billing accessor. A `Charge` already carries `recognised` (package-covered → not separately billable) and `invoiceId` (set once invoiced); a charge with `recognised=false && invoiceId=null` is billable work that slipped through. `ChargeStore.uninvoicedBillable()` (clinic-wide) + `ChargeService.uninvoicedBillable()` surface the candidates; `analytics.revenueLeakage(charges, agedOverDays=30)` filters to leaked charges and reports `{ leakedCount, totalFils, bySource[], agedFils }` (the aged subset is the older, likelier-lost value). Analytics stays pure (no domain imports) — the app maps `Charge → LeakageCharge` (computing age). No schema change.
- **Consequences:** the clinic can see un-billed billable work by source and how much is aged (lost-revenue risk), closing the revenue-cycle dashboard set; built on existing data with no migration and no new cross-module access. Deeper revenue-cycle metrics (collection rate / DSO) remain future work.

## ADR-0056 — Research / registry export pipeline (de-identified) (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E11 P2 calls for a "research/registry export pipeline (de-identified, ESHRE/registry-shaped)" — the Medical Director's AMH/outcome-prediction interest (line 229: "de-identifiable for research"). The hard constraint (CLAUDE.md privacy) is that the export must carry **no PHI**.
- **Decision:** add a **de-identified-by-construction** export to `@oxford/outcomes`. The input type `RegistryCycleInput` accepts only non-PHI: clinical counts, an **age in years** (reduced to an ESHRE-style band), `cycleType`/`protocol`, and pseudonymisable refs — never name/civil-id/DOB/free-text. `toRegistryRow`/`buildRegistryExport` (pure) emit banded age + **salted-sha256 pseudonyms** (16-hex) for cycle and patient keys (sibling cycles share a patientKey; nothing links back without the salt) + clinical fields. `OutcomesService.researchExport(actorId, inputs, salt)` audits the export as `READ_EXPORT`. The salt is a residency-controlled secret supplied by the app; the app assembles the per-cycle facts from the modules (no cross-module access inside outcomes).
- **Consequences:** the centre can produce a registry/research extract with no identifiers, age banded, and a stable pseudonymous key for sibling-cycle linkage — auditable. No schema change. The concrete ESHRE field dictionary/CSV serialisation and the production salt-management remain config/integration work (the row shape is in place).

## ADR-0057 — Predictive prompts: oocyte-yield range + OHSS risk (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E3 P2 calls for "predictive prompts (expected oocyte yield ranges, OHSS risk flags) surfaced from structured inputs." The stimulation chart already captures per-ovary follicle sizes + endocrine values (E2 …) per monitoring day.
- **Decision:** add **advisory** predictive prompts to `@oxford/fertility`. Pure `predictFromDay(inputs, yieldThresholds?, ohssThresholds?)`: the leading follicle cohort (≥11 mm, config) gives an expected oocyte-yield **range** (low/high factors, config); total follicle count + E2 give an **OHSS risk** tier (low/moderate/high) with explicit flags (`high_follicle_count`, `high_e2`, …) against config thresholds (moderate ≥15 follicles / ≥2500 E2; high ≥20 / ≥3500). `StimulationService.predict(cycleId)` surfaces the prompt from the **latest** charted day. **ADVISORY ONLY** — shown to the clinician, never an automated trigger/cancel/dose action (CLAUDE.md: drugs/identity never take the permissive auto path). Thresholds are configuration; no schema change.
- **Consequences:** clinicians get a point-of-care yield estimate + OHSS early-warning from data they already chart, with clinic-tunable thresholds; nothing acts on it automatically. The AMH/weight follitropin-delta dosing calculator and the AMH-nomogram counselling hook (§E3 P2 line 97) remain separate follow-ons.

## ADR-0058 — AMH-nomogram decision-support hook (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E3 P2 line 97 calls for "decision support hooks (e.g. AMH-nomogram-informed counselling surfaced at point of care)" — the Medical Director's AMH/outcome-prediction interest. This is the **pre-treatment** counterpart to the mid-stim predictive prompts (ADR-0057).
- **Decision:** add a pure `amhNomogram(amhNgMl, ageYears, bands?)` to `@oxford/fertility` mapping AMH to an ovarian-response **category** (poor/reduced/normal/high) + expected oocyte-yield **band** + **counselling flags** (`ohss_precaution` for high, `low_prognosis_counselling` for poor, `advanced_maternal_age_counselling` at ≥40). Bands are configuration (descending AMH cut-offs). `CycleService.amhCounselling(amhNgMl, ageYears)` surfaces it (sync `Result`; guards non-negative AMH + positive age). **ADVISORY ONLY** — informs the conversation; never selects a protocol, dose, or any cycle decision (CLAUDE.md). No schema change.
- **Consequences:** clinicians get AMH-informed counselling at the planning conversation with clinic-tunable bands; nothing acts on it. With this the §E3 decision-support / predictive P2s are both delivered. The follitropin-delta AMH/weight dosing *calculator* (a P0 charting aid noted as a follow-on) remains separate.

## ADR-0059 — Demand planning from the cycle pipeline (P2)
- **Status:** accepted (2026-06-16)
- **Context:** docs/01 §E9 P2 calls for "demand planning from cycle pipeline (forecast media/consumable burn from booked cycles)." The inventory module already tracks on-hand stock + par-level alerts; the gap is a forward forecast driven by the booked cycle mix.
- **Decision:** add demand planning to `@oxford/inventory`. A per-cycle-type **consumption profile** (a bill-of-materials: `itemId` × `quantityPerCycle`) is versioned config (`inventory.cycle_consumption_profile`, additive migration `0005`). Pure `forecastDemand(profiles, countsByType, onHandByItem)` aggregates required quantities across the booked cycle mix and nets against on-hand → `{ itemId, required, onHand, shortfall }` per item. `DemandPlanningService.forecast(countsByType)` reads the profile config and queries on-hand via an `OnHandPort` (wired to `InventoryService.onHand` — no cross-module access), only for items with booked demand. Read-only planning. The app supplies booked cycle counts by type (from the cycle pipeline).
- **Consequences:** procurement can see expected media/consumable shortfall from the booked cycle mix and turn it into requisitions; profiles are clinic-tunable config; built on existing stock data with one additive config table. Auto-raising a requisition from the forecast (vs the existing par-level auto-requisition) is a future hook.

## ADR-0060 — Prescribe-time drug-allergy advisory (P0, §E8 acceptance gap)
- **Status:** accepted (2026-06-19)
- **Context:** docs/01 §E8 acceptance requires that prescribing a gonadotrophin "checks allergies." The traceability matrix (docs/TESTING_TRACEABILITY.md) surfaced this as a real miss: `allergy` existed only as free text in clinical note bodies (a documented "Phase-1 follow-on" in `clinical/types.ts`) and was never checked at prescribe time. Allergies are clinical PHI; the prescribing path (`StimulationService.recordDay`) is in the fertility module, which must not read clinical's tables (module boundaries). Decision on behaviour confirmed with the product owner: **advise, never block** (a clinician may knowingly prescribe despite a recorded allergy), and **match on drug class** (the formulary's natural axis).
- **Decision:** add a **coded drug-allergy list** to `@oxford/clinical` (`DrugAllergy`: patient, `drugClass` code, bilingual substance label, severity, reaction; append-only / **soft-delete** via `active`; additive migration `0005_clinical_allergy.sql`). `ClinicalService` gains `recordAllergy` / `retireAllergy` / `allergiesForPatient` / `allergicClasses` (audited + events). Fertility defines an injected **`AllergyPort`** (`allergicClasses(patientId)`) — wired in the app layer to `clinical.allergicClasses`, so the boundary holds; the canonical `DrugClass` enum stays in the fertility formulary and the seam passes opaque class strings. Pure `screenDrugs(drugs, allergicClasses)` matches each prescribed formulary item by class. `recordDay` takes an optional `patientId` (a cycle's couple has two persons, so the prescriber names the patient), runs the screen, records `allergyWarnings` on the `StimulationDay` (additive jsonb column, fertility migration `0006`), and audits a `DrugAllergyAdvisoryRaised` event when non-empty. **ADVISORY ONLY** — `recordDay` always succeeds. Router: `clinical.recordAllergy` / `retireAllergy` / `patientAllergies` under new `clinical:allergy.write` / `.read` permissions.
- **Consequences:** the §E8 "checks allergies" acceptance is now proven end-to-end (clinical + fertility 100% domain coverage; PG e2e `allergy-advisory.e2e.test.ts`). Allergy capture is structured and matchable for the first time; the broader coded problem-list/medication entities remain the separate Phase-1 follow-on. Matching is class-level only (per product decision); item-level precision and a prescribe-time **acknowledgement** workflow (clinician reason-for-override) are future hooks. The pharmacy formulary (Phase 4) will reuse the same `AllergyPort` for non-stim prescribing.

## ADR-0061 — Bounded retry for concurrent audit appends (complete the intended contract)
- **Status:** accepted (2026-06-20)
- **Context:** while building the audit-chain-concurrency baseline, a real latent defect surfaced. `PgAuditChainStore.append` serialises on a per-chain advisory lock and rejects any record that no longer extends the head — its comment already says *"caller retries on the resulting conflict."* But the caller, `HashChainLog.append`, read the head, linked a record, appended **once**, and never retried. A probe firing 50 concurrent `audit.record()` calls had **~48 fail** with "concurrent append — retry" (only 2 landed). Because every clinical/financial mutation appends to the audit log, two concurrent mutations meant one's audit write — and thus the whole mutation — would throw under load. The chain was never corrupted (losers roll back), so this was a **liveness/availability** gap, not an integrity one.
- **Decision:** implement the retry the store's contract already assumed. Introduce a typed, retryable `ChainConflictError` (thrown by `PgAuditChainStore` on a lost race; a `ChainConflictError` is the *only* thing `HashChainLog` retries — any other error fails fast). `HashChainLog.append` now loops up to `maxAppendRetries` (default 128, generous — appends serialise on one lock so this only caps a pathological burst): each attempt re-reads the now-advanced head, re-links (new seq/prevHash/hash), and re-appends, with a short jittered backoff so the lock queue drains instead of hot-spinning. No change to the immutability, hash-linkage, or single-chain guarantees; `InMemoryChainStore` (single-threaded) never conflicts, so the event log is unaffected.
- **Consequences:** concurrent mutations no longer lose audit entries — N concurrent `record()` calls all persist, gapless (seq 1..N) and verifiable. Proven by `packages/audit/src/concurrency.integration.test.ts` (50 concurrent → intact chain, real Postgres) plus deterministic retry unit tests (a flaky fake store) keeping the audit package at 100% coverage. The audit append remains intentionally **serial** (one advisory lock) — the tightest write bottleneck; at this centre's scale that is ample, and if a future high-write workload needs more the lever is batching/partitioning the chain (a design change preserving invariant 6), documented in `perf/README.md`. HTTP-level k6 load (`perf/k6-api-load.js`) is a ready template that activates once the tRPC HTTP host is mounted (ADR-0009).

## ADR-0062 — Mount the tRPC HTTP host with a staging-only identity seam
- **Status:** accepted (2026-07-03)
- **Context:** Phases 0–6 proved the entire API surface via in-process e2e tests, but the router was never mounted on a socket: `serve` did not exist, k6 load was "awaits HTTP host" (ADR-0061), the UI shells and any deployed testing were blocked, and the deploy Makefile targets were placeholders. Real staff provisioning (identity tables + the in-region OIDC provider, ADR-0011) is a go-live blocker that must not block a synthetic staging.
- **Decision:** add `apps/api/src/http-host.ts` (+ boot entry `serve.ts`): the one `appRouter` mounted on plain `node:http` via the tRPC standalone adapter under `/trpc`, with `GET /health` doing a real DB ping. Auth stays server-side and deny-by-default: a bearer token is authenticated through the real `AuthService`; sessions are cached briefly (5 min, bounded) so a stable token does not re-audit a LOGIN per request. **Staging-only identity:** `DevOidcProvider` (`dev:<claims>` tokens) + a fixed synthetic `devStaffDirectory` mirroring the role shapes the e2e suite proves; patient principals via `devpatient:<personId>` bearers. Every one of these seams refuses production — and `serve.ts` itself **refuses to boot with `NODE_ENV=production`** — so a synthetic-identity server can structurally never front real PHI (mirrors DevOidcProvider/LocalKeyProvider guards, ADR-0012). Runtime artefact is an esbuild bundle (`apps/api/dist/serve.js`, `migrate.js`), which is what the Makefile already referenced. Also fixed the one flake in the full-workspace run: with a shared `DATABASE_URL`, vitest scheduled DB-backed files from different workspace projects concurrently and one project's TRUNCATE could wipe another's seeded rows — `scripts/run-tests.mjs` now serialises all test files whenever `DATABASE_URL` is set (pure-unit runs keep full parallelism).
- **Consequences:** the system is runnable and deployable (`node dist/serve.js`), `/health` gives deploys a probe, k6 can mount, and the UI shells and simulator have a real target. Proven over real HTTP by `http-host.e2e.test.ts` (deny-by-default, wrong-domain FORBIDDEN, own-data-only patient reads, health probe). Production boot stays refused until the real OIDC provider + staff provisioning land (tracked in docs/CUTOVER_CONFIG.md); tRPC dev error responses include stack traces (paths, never PHI) — acceptable on a synthetic-only staging, to be stripped when the real host config lands.

## ADR-0063 — Whole-EMR synthetic-patient simulation harness + staging-only dev router
- **Status:** accepted (2026-07-03)
- **Context:** the product owner's direction for this stage: deploy the build and *test the whole EMR* by simulating patients in loops until every error is corrected. The e2e suite proves each flow in-process; what's missing is a repeatable, randomised, whole-journey exerciser over the deployed HTTP stack. Some journey steps depend on stub providers that in-process tests feed directly (RI Witness records, pharmacy fulfilment) — an HTTP client needs a controlled way to do the same on staging.
- **Decision:** (1) a **`dev` tRPC router** exposing exactly the stub seams the simulator needs — `seedWitnessRecord` (feeds the `RiWitnessStubProvider`, i.e. the stub's data source, never an override of witnessing: the reconcile/block logic runs unchanged), `markPharmacyFulfilled`, `verifyAuditChain` — every procedure FORBIDDEN unless the host sets `devTools`, which is `!isProduction` and therefore never true on a production host (which refuses to boot anyway, ADR-0062). (2) a **simulator** (`apps/api/src/simulator/`, bundled to `dist/simulate.js`) driving deterministic (seeded PRNG) couple journeys over real HTTP through the same client surface the UIs will use: registration → marriage verification → booking → encounter/orders/results → ICSI cycle + consents → stimulation (formulary-only) → witnessed embryology chain → transfer/freeze (with coded cancellations mixed in) → outcome → package/instalments/KNET payment → portal journey (incl. partner access) → audit-chain verify every loop. Per-step errors are captured (never aborting the run) into a JSON report; exit 1 on any error. `simulator.e2e.test.ts` runs a full journey in CI so the simulation itself can never rot.
- **Consequences:** "simulate with patients, loop until zero errors" is now a command (`node apps/api/dist/simulate.js --url … --couples N --loops N --seed N`) usable locally, in CI, and against the staging VPS; defects it finds get pinning tests before fixes (Phase 7 standing rule). The dev router is the only new API surface and is structurally inert in production. Journey coverage grows per docs/PHASE7_PLAN.md §7.3 (IUI/FET, perioperative day lists, chaos/concurrency drills).

## ADR-0064 — Staging deploy wiring: systemd + nginx + nightly backup on the existing VPS pipeline
- **Status:** accepted (2026-07-03)
- **Context:** `.github/workflows/deploy.yml` (approval-gated, path-selective, mirroring the om-software pattern) already ships to `/opt/oxford-his` on the DO VPS, but the Makefile targets it invokes were placeholders. The VPS is staging/synthetic-only (ADR-0007). om-software (`/opt/oxmedkw`) is in daily clinical use and must not be touched (product-owner instruction, 2026-07-03).
- **Decision:** implement `make deploy-api` for the VPS: `check-migrations-safe` gate → `pnpm install --frozen-lockfile` → `build:server` bundle → **additive** `migrate` (env from `/etc/oxford-his/api.env`) → restart the `oxford-his-api` systemd unit. Ship templates under `deploy/`: `oxford-his-api.service` (Node 20 bundle, `NODE_ENV` deliberately NOT `production` on staging so the host boots in staging mode, per ADR-0062) and `nginx-oxford-his.conf` (TLS-terminated reverse proxy for `/trpc` + `/health` on its own hostname/port — fully separate from the om-software nginx sites). Nightly `pg_dump` backups via `scripts/backup-staging-db.sh` + cron (PATIENT-DATA §5; 14-day retention on staging). `deploy-web`/`deploy-portal` stay guarded no-ops until the UI shells exist (Phase 7.4/7.5).
- **Consequences:** merging to `main` (after the human approval gate) produces a running, migrated, health-checked staging API without touching om-software; the DB lives outside the deploy path (different directories, additive rsync-free git pull), preserving every PATIENT-DATA invariant. The in-region production host remains a go-live blocker and is a secrets/target swap when selected (ADR-0007/0014).

## ADR-0065 — `@oxford/records`: medical records numbers, physical-file tracking, labels
- **Status:** accepted (2026-07-03)
- **Context:** the clinic runs paper files alongside the EMR and will keep doing so (product owner, 2026-07-03). Nothing in the PRD or the build covers the paper layer: no clinic file number (MRN), no registry of the physical file, no tracking of where a file is across Ground/L1/L2/L3, no label printing. This is the physical backbone of running the whole building.
- **Decision:** a new `@oxford/records` module. (1) **MRN**: a human-friendly, unique, never-reused clinic file number on a person (config format, default `OM-<year>-<seq>`, DB-sequence-backed); allocation at registration via router, plus an **import path** so existing patients keep their current (Cliniko-era) file numbers; the person's civil ID is never the MRN (PHI in barcodes/labels is minimised). (2) **Physical file registry**: file (+ volumes) with home location + status (active/archived/missing); archive tracked, destruction structurally absent (retention is an open legal item, docs/03 §3). (3) **Movements**: audited check-out/check-in to a location/staff member, keyed by scanning the file's barcode; "where is this file", overdue + missing alerts. (4) **Pull list**: tomorrow's clinic files derived from scheduling via an injected `AppointmentsPort` (no cross-module table access). (5) **Labels as data + pure rendering**: a pure Code 128 encoder (tested against known vectors), bilingual label templates (file spine, patient ID sheet, single thermal) rendered as print-CSS HTML and as **ZPL** strings for Zebra-class printers — renderer output is deterministic and snapshot-tested in en+ar. Permissions: `clinical:records.read`/`.write` (MFA-gated clinical domain; no new permission domain).
- **Consequences:** the paper file becomes a first-class, audited entity that the EMR schedules (pull lists), locates (movements), and prints for (labels); the UI shells and front desk get an API-first surface; hardware (Zebra/A4 printers, scanners) is an ops purchase decoupled from the software.

## ADR-0066 — `@oxford/pharmacy`: real dispensing behind the existing PharmacyPort
- **Status:** accepted (2026-07-03)
- **Context:** E8 P0 promises dispensing + the ward→Ground-pharmacy discharge loop, but only `StubPharmacyProvider` exists; the L2 discharge gate is proven against the stub. Inventory already owns FEFO issue logic, lots/expiry, and the controlled-drugs register; the formulary is the only prescribable source (hard rule); allergy screening exists behind `AllergyPort` (ADR-0060).
- **Decision:** a new `@oxford/pharmacy` module: `Prescription` (formulary-only items — validated via a `FormularyPort`; free text structurally impossible) raised from the ward/clinic → the Ground-pharmacy **dispensing queue** → `dispense` decrements stock **through inventory's published interface** (FEFO/lot/expiry; cold-chain flagged; a controlled item also posts to the controlled-drugs register via its service seam) → `markReady` → `PharmacyService` implements the existing `PharmacyPort`, so the **L2 discharge gate now consumes real fulfilment** (the stub remains for unit tests; the simulator's `dev.markPharmacyFulfilled` stays as a fallback for journeys that skip pharmacy). Dispensing/drug quantity logic carries the **100% coverage** drugs bar. Permissions: prescribing under `clinical:prescription.write`; pharmacy queue/dispense under `clinical:dispense.*` (pharmacist roles).
- **Consequences:** the ward→pharmacy→door loop is real end-to-end (prescription raised on L2 reaches the Ground queue; fulfilment gates discharge); stock and controlled-drug books move with dispensing; E8 P0 acceptance is provable through the API; the allergy advisory reuses the existing port at prescribe time.

## ADR-0067 — Wire `@oxford/documents`: blob storage port + API surface (scanned paper)
- **Status:** accepted (2026-07-03)
- **Context:** `@oxford/documents` (versioned, access-controlled, OCR-seamed document store, PRD E0) was built in Phase 0 but never wired: no storage adapter, no router, no callers. Scanning paper (consents, marriage certificates, IDs, external reports) into the patient record is the other half of the paper-file integration.
- **Decision:** add a `BlobStorePort` with a staging `LocalDiskBlobStore` (store-root outside the deploy path, mirroring the DB rule; refuses production like the other dev providers) — the in-region object-storage adapter is a later config swap behind the same port (+ residency ADR, per hard rule). Router: `documents.upload` (size-capped base64 over tRPC for the staging scanner flow; presigned upload lands with the real object store), `documents.list`/`documents.read` — content reads are audited sensitive reads via the existing `AccessGuard`. Wire `DocumentService` into the composition root; scanned artefacts link by `subjectRef` (person/couple/cycle).
- **Consequences:** scanned paper lands on the record, versioned and access-gated; marriage-certificate and consent `documentRef`s can point at real stored documents; OCR remains a pluggable seam. Base64-over-tRPC is explicitly a staging-scale choice, capped and replaced by presigned upload with the production store.

## ADR-0068 — Server-rendered bilingual print pack
- **Status:** accepted (2026-07-03)
- **Context:** running the clinic needs paper outputs daily (prescriptions, receipts, appointment slips, letters, theatre lists, pull lists, labels). Rendering must be consistent, bilingual/RTL-correct, and testable — not scattered across future UI code.
- **Decision:** a small pure print-rendering layer (with `@oxford/records`' label renderer as the pattern): each artefact is a **pure function** from an existing read model to print-ready HTML (A4 / label-sheet / thermal / receipt CSS, `dir`-correct en+ar) exposed under `print.*` routes gated by the domain permission of the underlying data; deterministic output, snapshot-tested in both locales. No PDF library — browsers print the HTML; ZPL covers thermal label printers.
- **Consequences:** every printed artefact has one tested source of truth the UI shells just open-and-print; adding an artefact is a pure renderer + snapshot; no new runtime dependencies.

## ADR-0069 — External pharmacy: issued prescriptions + external fulfilment; in-house stock is theatre-only
- **Status:** accepted (2026-07-04) — **supersedes the dispensing model of ADR-0066** (queue, gate, formulary-only, allergy advisory, and 100% drugs bar all stand)
- **Context:** product-owner correction (2026-07-04): **the clinic does not own the Ground-floor pharmacy** — it is an external party. The clinic *issues* prescriptions which the external pharmacy fulfils (including discharge prescriptions, which still gate L2 discharge); the drugs the clinic itself stocks and uses are the **theatre anaesthetic + controlled drugs** (L1). ADR-0066 wrongly modelled retail dispensing as decrementing clinic stock.
- **Decision:** rework `@oxford/pharmacy` into two distinct flows. **(1) Prescriptions (external fulfilment, NO clinic stock movement):** `raisePrescription` (formulary-only + allergy advisory, unchanged) → status `pending → issued` (printed/handed over; the print.prescription artefact is the instrument) `→ fulfilled` (an audited **handover confirmation** recorded by ward/reception staff when the external pharmacy has supplied — optional external reference; no inventory or controlled-register writes) `| cancelled`. `isPrescriptionFulfilled` (the L2 discharge gate) now reads the confirmation state — same gate, corrected meaning. The dispensing-queue read stays as the ward's "sent/outstanding scripts" tracker. **(2) Theatre drug administration (in-house stock):** the FEFO/lot/controlled machinery built in ADR-0066 moves behind `administerTheatreDrugs(actorId, {encounterId, patientId, drugs, witnessStaffId?, locationId})` — decrements **theatre** stock through inventory's published interface, requires a witness and posts witnessed movements to the controlled-drugs register for controlled items, flags cold-chain — invoked at the app layer when intra-op/anaesthesia drugs are recorded (perioperative stays boundary-clean; drugs validate against the **composite formulary**: anaesthesia + stim). The theatre stock location is config (`theatre-l1`).
- **Consequences:** the system now matches reality: no phantom decrements of stock the clinic never held; discharge still hard-gates on the external pharmacy's fulfilment being confirmed; anaesthetic/controlled drugs used in theatre hit clinic stock and the legal register at the moment of administration, witnessed. PRD §E8's "dispensing & stock decrement" line is superseded for retail (AMD-0009); the 100% coverage bar continues to apply to the administration/allocation logic. The `clinical:dispense.*` permission now means "record external fulfilment / administer theatre drugs".

_(Claude Code: continue numbering from ADR-0069.)_
