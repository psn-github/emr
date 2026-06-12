# Oxford HIS — Technical Architecture

**Audience:** Claude Code and any engineer (human or AI) building Oxford HIS.
**Precedence:** subordinate to document 03 (regulatory/clinical) and document 01 (PRD); governs *how*, not *what*.

---

## 1. Architectural principles

1. **Modular monolith first, service-extractable later.** One deployable application with hard internal module boundaries (clear public interfaces, no cross-module table access). This gives a small clinic operational simplicity now and a clean path to extract services (e.g. the lab, billing) under load later. Do not start with microservices — that is premature complexity for one site.
2. **Domain-driven boundaries.** Modules map to PRD domains: `identity`, `registry`, `scheduling`, `facility` (floors, beds, patient-flow/location), `clinical`, `fertility`, `embryology`, `andrology`, `cryostore`, `theatre`, `pharmacy`, `procurement`, `inventory`, `assets`, `billing`, `reporting`, `portal`, `hr`, plus platform: `audit`, `i18n`, `notifications`, `documents`. A module may depend on another only through its published interface and emitted events.
3. **Event-driven where it matters.** Clinically and financially significant actions emit domain events (e.g. `OocyteRetrieved`, `EmbryoFrozen`, `InvoiceSettled`, `StockReceived`). The audit subsystem, reporting, notifications, and inventory react to events rather than being called inline — this keeps the audit trail complete and decouples modules.
4. **Append-only at the core.** Clinical and financial truth is event-sourced or at minimum journaled: state is derived, history is never overwritten. The audit log is the spine, not an afterthought.
5. **Configuration is data.** Protocols, appointment types, consent sets, packages, formulary, KPI thresholds, par levels live in versioned configuration tables with their own audit, editable by authorised users without code changes.
6. **Bilingual and RTL from the first commit.** i18n is infrastructure, not a feature.
7. **Tenant-aware, single-tenant deployed.** Carry a tenant boundary in the data layer so multi-site is *possible* without retrofitting, but deploy one tenant. Do not build tenant management UI in v1.

## 2. Recommended stack

> Defaults below optimise for: type safety end-to-end, strong audit/transactional guarantees, Claude-Code-friendliness, GCC-region hostability, and a small team. Substitutions are allowed but must be logged as ADRs with rationale, and must not violate the data-residency rules in document 03.

- **Language:** TypeScript everywhere, strict mode, no `any` in domain code.
- **Runtime:** Node.js LTS.
- **Monorepo:** pnpm workspaces (or Nx/Turborepo) — `apps/*` (api, web, portal) and `packages/*` (one package per domain module + shared `core`, `i18n`, `audit`, `ui`).
- **API:** a typed RPC/contract layer (tRPC for internal web/portal clients) **plus** a versioned REST/FHIR-flavoured surface for external/integration consumers and future apps. Define API contracts in shared packages so client and server share types.
- **Database:** PostgreSQL (primary). Strong transactional integrity, row-level security available, JSONB for flexible structured clinical data, excellent for audit/event journaling. **One database, schema-per-module-domain** for boundary clarity.
- **ORM/migrations:** Prisma or Drizzle (type-safe, migration-first). Forward-only migrations in production; every migration reviewed against append-only rules.
- **Audit/event store:** append-only `events` and `audit_log` tables, hash-chained (each row stores hash of previous + canonical payload). Consider a dedicated event table per aggregate for high-volume areas (embryology, inventory).
- **Cache/queue:** Redis for sessions, rate-limits, and a lightweight job/queue (BullMQ) for notifications, reminders, reconciliation jobs, scheduled reports.
- **Web frontend:** React + TypeScript, a component library themed to the **canonical om-software design system** (`PALETTE.md`, ADR-0016): **Satoshi** (display) / **Plus Jakarta Sans** (body/UI) / **Geist** (data) / **Noto Sans Arabic**; warm-neutral canvas + single teal-green accent; fixed semantic/clinical/drug-class colours. With **first-class RTL** (logical CSS properties, dir-aware layout) and the clinical LTR exception (drug names, lab values, embryo grades stay LTR). Server-state via TanStack Query. _(Supersedes the earlier Cormorant Garamond / DM Sans reference — AMD-0001.)_
- **Patient portal/app:** same React stack as a separate app; React Native or PWA for mobile — decide via ADR based on push-notification and offline needs.
- **Auth:** OIDC-capable identity (self-hostable, e.g. an open-source IdP) with MFA; never roll your own crypto. Field-level encryption for Civil ID and payment refs via a KMS/managed key service in-region.
- **Search:** PostgreSQL full-text first; add OpenSearch only if/when justified (ADR).
- **Observability:** structured logging (no PHI in logs), metrics, tracing; audit logging is separate from operational logging.
- **Hosting:** cloud region within the GCC / approved data-residency zone (document 03). Infrastructure-as-code (Terraform). Encrypted storage, automated encrypted backups with tested restore, point-in-time recovery.

## 3. Data model — core entities (illustrative, not exhaustive)

Keep clinical truth normalised and append-only; derive read models for UI.

**Identity & registry**
- `Person` (id, names_ar, names_en, civil_id [encrypted], dob, sex, nationality, language_pref, photo_ref, contacts)
- `Couple` (id, partner_a_person_id, partner_b_person_id, marriage_verification_id, status) — **the fertility clinical unit**
- `MarriageVerification` (id, couple_id, document_ref, verified_by, verified_at, method) — **hard gate**
- `Staff` (id, person_id, role, moh_licence, licence_expiry, competencies[]) — competencies include `embryo_witness`

**Access & audit**
- `Permission`, `Role`, `RoleAssignment` (deny-by-default; permission domains)
- `AuditLog` (id, actor_id, entity_type, entity_id, action, before_json, after_json, occurred_at, prev_hash, hash) — immutable, hash-chained
- `DomainEvent` (id, type, aggregate_type, aggregate_id, payload_json, occurred_at, prev_hash, hash)

**Clinical**
- `Encounter`, `ClinicalNote` (versioned), `ProblemList`, `Allergy`, `MedicationOrder`, `Order` (lab/imaging/referral), `Result`, `Letter`
- `ObstetricHistory`, `AntenatalRecord` (the continuum into pregnancy)

**Fertility & lab**
- `Cycle` (id, couple_id, type, protocol_id, status, planned/actual dates, cancellation_reason)
- `Protocol` (config), `StimulationDay` (cycle_id, day, drugs[], follicles[], endo_thickness, endocrine{})
- `Procedure` (retrieval/transfer/etc., theatre_booking_id)
- `Oocyte` (cycle_id, maturity, dish, position)
- `InseminationEvent` (oocyte_id|cohort, method, operator_id, sperm_source_id, occurred_at, **ri_witness_event_ref**, **witness_status**)
- `Embryo` (id, oocyte_id, cycle_id) with `EmbryoAssessment` (day, grade, morphokinetics) and `EmbryoDisposition` (transfer/freeze/discard/biopsy, operator_id, **ri_witness_event_ref**, **witness_status**)
- `SemenAnalysis` (WHO-6th fields), `SpermPreparation`, `SpermFreeze` (**ri_witness_event_ref**, **witness_status**)
- `CryoLocation` (tank→canister→cane→position), `CryoSpecimen` (type, owner couple_id, source_event_id, location_id, consent_id, storage_expiry, **ri_witness_event_ref**), `CryoMovement` (specimen_id, from, to, action, operator_id, occurred_at, **ri_witness_event_ref**, **witness_status**)
- `WitnessReconciliation` (oxford_event_type, oxford_event_id, ri_witness_event_ref, status [matched / pending-sync / divergent], resolved_by, resolved_at) — the reconciliation ledger between Oxford HIS handling records and RI Witness; a `divergent` row blocks cycle-step sign-off
- `Consent` (couple_id|person_id, type, signed_at, document_ref, status) — cycle progression checks these

> **Witnessing provenance note:** `witness_status` and `ri_witness_event_ref` are populated from RI Witness via the `RiWitnessProvider` adapter (architecture §4), not from an in-app witness step. `witness_status` ∈ {witnessed, pending-sync, divergent}. Oxford HIS reflects RI Witness; it does not author witness decisions.

**Theatre & surgery**
**Facility, beds & patient flow**
- `Floor` (level: Ground/L1/L2/L3, name) and `LocationNode` (id, floor_id, type [consult_room, scan_room, theatre, recovery_bed, inpatient_bed, holding, pharmacy, waiting], name, capacity) — the building modelled as addressable locations: 2 theatres + 3 recovery beds on L1, 6 inpatient beds on L2, consult/scan rooms + lab on L3, pharmacy on Ground.
- `Bed` (location_node_id, label, status [free, occupied, cleaning, blocked]) — the 3 L1 recovery beds and 6 L2 inpatient beds.
- `SurgicalEncounter` (id, patient_id, couple_id?, planned_procedure, theatre_booking_id, admission_at, discharge_at, status) — ties the whole perioperative journey together.
- `PatientLocation` (encounter_id|patient_id, location_node_id, bed_id?, from_at, to_at) — current and historical location; the *current* row is what the flow board reads.
- `LocationMovement` (patient_id, encounter_id, from_node_id, to_node_id, moved_by, occurred_at, reason) — every floor/bed transfer as an audited event (L3 admit → L2 bed → L1 recovery → theatre → L1 recovery → L2 bed → discharge).
- `BedAllocation` (bed_id, encounter_id, reserved_from, occupied_from, released_at) — capacity-aware reservation against the 6 L2 / 3 L1 beds.

**Theatre & surgery**
- `TheatreBooking`, `PreOpAssessment`, `WhoChecklist` (signin/timeout/signout flags + actors), `AnaesthesiaRecord`, `IntraOpRecord`, `RecoveryRecord`, `PostOpWardRecord` (L2 observations/nursing), `DischargeRecord` (criteria met, instructions, discharge_prescription_id, follow_up_booking_id), `InstrumentSet`, `SterilisationCycle`, `ConsumableUsage` (→ inventory + billing)

**Pharmacy / inventory / procurement / assets**
- `FormularyItem`, `Prescription` (incl. `is_discharge`, `pharmacy_queue_status`), `DispenseEvent`, `ControlledDrugRegister`
- `Item`, `Supplier`, `Requisition`, `PurchaseOrder`, `GoodsReceipt`, `StockLot` (item, lot, expiry, location_node_id, qty, cold_chain), `StockMovement` (FEFO)
- `Asset`, `PpmSchedule`, `CalibrationRecord`, `FaultLog`, `EquipmentReadingLog` (incubator/fridge temps)

**Billing & finance**
- `ChargeItem`, `Package` (inclusions/exclusions), `Invoice`, `InvoiceLine`, `PaymentPlan`, `Instalment`, `Payment` (KNET/card), `Refund`, `InsuranceClaim`

**Platform**
- `TranslationKey`/`Translation`, `NotificationTemplate`, `NotificationEvent`, `Document` (versioned, access-controlled, OCR-indexed)

## 4. Witnessing — integration with RI Witness (architectural spotlight)

**Oxford Medical's IVF lab uses CooperSurgical RI Witness (RFID).** RI Witness is the **authoritative electronic witnessing system** and the **system of record for witnessing and specimen traceability**. Oxford HIS does **not** reimplement witnessing — reinventing a software double-witness alongside a deployed, validated RFID system would be duplicative, less robust, and a source of dangerous divergence. Instead, Oxford HIS is the **demographic master** that feeds RI Witness and the **consumer of traceability data** that flows back. Specify the boundary explicitly:

**How RI Witness works (constraints that shape the integration):**
- RFID tags on all plasticware and patient ID cards; readers built into heated/unheated worktop plates and workstations, active continuously, so a witness check cannot be skipped or overlooked. Witnessing is automatic and contactless — it does not depend on an embryologist remembering to scan.
- RI Witness runs its own server, tablets, and database, and **performs the mismatch-avoidance enforcement in its RFID layer.** This is where "no unwitnessed handling" is *physically* enforced — stronger than any application-level gate.
- RI provides **one-directional demographic sync tools** that pull basic patient demographics from third-party EMRs *into* RI Witness (RI's "Database Synchronisation Tools"). There is **no generic open write-API**; integration capability depends on configuration and an optional EMR-integration licence. **RI must be engaged directly to confirm the exact integration path for Oxford HIS** — this is an integration-scoping task, not an assumption.

**Oxford HIS responsibilities (the integration design):**
1. **Demographic master → RI Witness.** Oxford HIS is the single source of truth for patient/couple identity. On registration and on any demographic change, the canonical record (with a stable Oxford HIS patient/couple key) is made available to RI Witness via RI's supported sync mechanism. Identity is created once, in Oxford HIS, and never re-keyed in the lab — eliminating transcription divergence.
2. **Consume traceability back from RI Witness.** Witnessing events, procedure timings (denudation, insemination, fertilisation check, media change, etc.), and traceability records produced by RI Witness are ingested into Oxford HIS as **read-side records linked to the corresponding `Cycle`, `Oocyte`, `Embryo`, `InseminationEvent`, `EmbryoDisposition`, and `CryoMovement`** entities. These populate the audit trail and the lab worklist's "witnessed" status.
3. **Reconciliation, not re-enforcement.** Oxford HIS reconciles its clinical/lab records against RI Witness's witnessing record and **flags any handling event in Oxford HIS that lacks a corresponding RI Witness witness record** (and vice-versa). The lab worklist shows witness status sourced from RI Witness; a divergence is a blocking exception surfaced to the embryology lead, not something Oxford HIS silently overrides in either direction.
4. **No competing witness UI.** Oxford HIS must not present its own "confirm witness" button for steps that RI Witness covers — two competing witnessing UIs is exactly the kind of ambiguity that causes error. The embryologist witnesses *in RI Witness*; Oxford HIS reflects the result.

**Integration boundary as a driver:**
- Implement a `WitnessingProvider` interface with a `RiWitnessProvider` implementation. Even though RI is the only provider today, the interface keeps the integration mechanism (sync tool, file exchange, DB view, or licensed API — TBC with RI) isolated behind one seam, so a change in RI's integration method, or a second-site system later, touches one adapter, not the lab module.
- The adapter handles: outbound demographic push, inbound witnessing/traceability ingest, an idempotent matching layer keyed on the Oxford HIS patient/couple key, and a **reconciliation report**.

**Resilience:** if the RI Witness link is temporarily down, Oxford HIS continues to run the *clinical* lab worklist but marks affected handling events `witness_status = pending-sync` and blocks final cycle-step sign-off in Oxford HIS until the witnessing record is reconciled from RI Witness. Witness enforcement itself never depends on Oxford HIS connectivity — it lives in the RFID layer regardless.

**Open integration questions (resolve with RI / CooperSurgical before Phase 2 lab build):**
- Exact integration path and licence for Oxford HIS ↔ RI Witness (sync tool version, EMR-integration licence, supported direction, data fields, image transfer). RI sync tools require specific versions matched to the RI Witness release — confirm current versions on site.
- Whether traceability/witnessing events can be pulled back programmatically (DB view / export / API) or only viewed in RI reporting — this determines how rich the reconciliation can be.
- Data-residency review of the RI Witness server deployment and any RI cloud component against document 03 (the RI server and Oxford HIS PHI handling must both satisfy the CITRA/residency posture).

## 5. Security & privacy architecture

- **Deny-by-default RBAC** with permission domains (clinical, embryology, financial, HR, admin); every API route declares required permissions; UI hides what the user cannot access but the **server is the enforcement point**.
- **Encryption:** TLS in transit; AES at rest; field-level encryption for Civil ID and payment references with keys in an in-region KMS. PHI never in URLs, logs, or analytics events.
- **Audit:** every login, failed login, permission denial, data export, and clinical/financial mutation logged immutably. Exports (especially bulk/research) require elevated permission and are themselves audited.
- **Data residency:** all PHI storage and processing in approved GCC region(s); any third-party API (SMS/WhatsApp/payments/translation/AI) is reviewed against document 03 before integration — some convenient global SaaS will be disallowed.
- **Backup/DR:** automated encrypted backups, tested restores, documented RTO/RPO; backups inherit residency rules.
- **Secrets:** in a managed secret store, never in the repo; the repo's CLAUDE.md forbids committing secrets and CI scans for them.

## 6. Integration patterns

- **Lab analysers / endocrine results:** HL7 v2 (or vendor API) inbound to `Result`; map to structured cycle endocrine fields where applicable.
- **Imaging/PACS:** DICOM/HL7 worklist out, report in; ultrasound structured reporting can be native with images referenced.
- **Time-lapse incubators (EmbryoScope/Geri):** import morphokinetic annotations to `EmbryoAssessment` via vendor export/API (confirm platform — PRD open question).
- **Electronic witnessing (RI Witness):** `WitnessingProvider`/`RiWitnessProvider` adapter (§4). Outbound demographic sync to RI Witness via RI's supported sync tool/licence; inbound witnessing & traceability ingest into the reconciliation ledger. Exact mechanism (sync tool version / EMR-integration licence / DB view / export) to be confirmed with CooperSurgical.
- **Payments (KNET/card):** via approved in-region gateway; tokenised; no PAN storage.
- **Messaging (SMS/WhatsApp/email):** provider-abstracted notification service; residency-reviewed providers only.
- **Accounting:** export-first (journals/invoices) to whatever finance package the clinic uses; deep ERP integration is P2.
- **External genetics lab (PGT):** order out / result in interface; structured result capture.
- **FHIR posture:** model clinical resources in a FHIR-compatible shape where reasonable (Patient, Encounter, Observation, DiagnosticReport, MedicationRequest) to ease future interoperability and any national-health-system integration, without becoming a full FHIR server in v1.

## 7. Non-functional requirements

- **Performance:** core clinical screens < 1.5s p95; lab worklist updates near-real-time.
- **Availability:** clinic-hours target 99.9%; lab worklist degrades gracefully offline.
- **Scalability:** sized for one busy four-level centre (2 theatres, 3 recovery + 6 inpatient beds) with headroom; module extraction path documented for future load.
- **Testability:** ≥80% domain-logic coverage; **100% on money, drug-dose, and witnessing logic**; integration tests on every API route; e2e on each module's core happy path.
- **Maintainability:** strict module boundaries enforced in CI (no illegal cross-module imports); ADRs kept current; `/docs` never stale.
- **Observability:** dashboards for error rates, queue depth, job failures (reminders, reconciliation), and audit-chain integrity checks (a scheduled job verifies the hash chain).

## 8. Environments & delivery

- **Environments:** local → staging (in-region, de-identified data) → production (in-region). No real PHI outside production.
- **CI/CD:** typecheck, lint, unit, integration, e2e, secret-scan, migration-safety check; green required to merge to main; staging auto-deploy; production deploy gated by manual approval.
- **Migrations:** forward-only in prod; data migrations from Cliniko handled by dedicated, audited, re-runnable import jobs with reconciliation reports (PRD open question on full vs cut-over).
- **Seed data:** every module ships realistic bilingual seed data so the system is demonstrable and testable end-to-end at all times.

## 9. Repository layout (target)

```
oxford-his/
  apps/
    api/            # Node API host (tRPC + REST/FHIR surface)
    web/            # staff-facing React app (RTL-first)
    portal/         # patient app (PWA/React Native)
  packages/
    core/           # shared domain primitives, result types, errors
    audit/          # append-only, hash-chained audit + event store
    i18n/            # translation infra, en/ar, RTL helpers
    ui/             # themed component library (Oxford design system)
    identity/  registry/  scheduling/  facility/  clinical/  fertility/
    embryology/  andrology/  cryostore/  theatre/  pharmacy/
    procurement/  inventory/  assets/  billing/  reporting/
    notifications/  documents/  hr/
  docs/
    00_MASTER_ORCHESTRATION_PROMPT.md
    01_PRODUCT_REQUIREMENTS.md
    02_TECHNICAL_ARCHITECTURE.md
    03_KUWAIT_REGULATORY_AND_CLINICAL_CONTEXT.md
    04_DATA_MODEL_AND_GLOSSARY.md
    05_DELIVERY_ROADMAP.md
    STATE.md          # living build journal
    DECISIONS.md      # ADR log
    AMENDMENTS.md     # proposed requirement changes + conflicts
  infra/              # Terraform, CI config
  CLAUDE.md
```

## 10. Decisions deliberately deferred (resolve via ADR at the right phase)

- PWA vs React Native for the patient app (Phase 6 trigger).
- Event-sourcing depth: full ES vs journaled state — start journaled, escalate per-aggregate where history complexity demands (embryology, cryostore, inventory likely candidates).
- Search engine beyond Postgres FTS (only if justified).
- Self-hosted IdP vs in-region managed identity (depends on residency review of managed options).
- Reporting: in-app query layer vs a separate read-replica/warehouse (escalate when dashboards strain OLTP).
