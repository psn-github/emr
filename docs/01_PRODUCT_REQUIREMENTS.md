# Oxford HIS — Product Requirements Document

**Product owner:** Prof Scott Nelson, Medical Director, Oxford Medical Kuwait
**Document status:** v1 — foundation spec for Claude Code build
**Scope:** Full hospital/clinic information system for a four-level private fertility, O&G and surgical centre — Ground-floor pharmacy; Level 1 with two operating theatres and three recovery beds; Level 2 with six inpatient/short-stay beds; Level 3 clinic with consulting suites, ultrasound and a full IVF laboratory. Includes a first-class patient-flow and bed-management capability spanning the standard surgical pathway (admit on L3 → L2 bed → L1 recovery→theatre→recovery → L2 bed → discharge with pharmacy-fulfilled prescriptions).

---

## A. Problem statement

Oxford Medical Kuwait currently runs on Cliniko plus a constellation of spreadsheets, paper, and disconnected point solutions. Cliniko is excellent at outpatient practice management but has no concept of an IVF cycle, an embryo, a cryostorage tank, electronic witnessing, a theatre list, a consumable lot, or a calibrated asset. The dedicated IVF systems (IDEAS/Mellowood, Meditex/CRITEX, IVFqube, Babysentry, RI Witness) solve the lab problem but are generic, expensive per-seat, weakly bilingual, not built for Kuwaiti regulatory and cultural reality, and don't extend into the obstetric continuum that makes Oxford distinctive (fertility → pregnancy → delivery under one roof). No single product covers the whole centre. The cost of not solving this: clinical risk from manual witnessing and transcription, no unified audit trail for MOH inspection, leaked revenue from untracked consumables and uncodified packages, and an inability to report Vienna-consensus lab KPIs or month-end financials without heroic manual effort.

## B. Goals

1. **One system, whole centre.** A single source of truth from booking through embryo transfer, delivery follow-up, theatre, pharmacy, stores, and finance — eliminating the spreadsheet layer entirely.
2. **Cliniko parity, then beyond.** Match Cliniko's outpatient workflow quality so clinicians never feel they downgraded, then add the fertility and operational capability Cliniko lacks.
3. **Inspection-ready by design.** Any MOH or accreditation inspector can be given a complete, immutable audit trail for any patient, embryo, drug, or asset on demand.
4. **Bilingual and culturally exact.** Full English/Arabic RTL throughout; data model and workflows correct for Gulf fertility practice from the schema up, not bolted on.
5. **Measurably better operations.** Live Vienna-consensus laboratory KPIs, theatre utilisation, consumable burn, and month-end finance available without manual exports.

## C. Non-goals (v1)

1. **Multi-clinic / franchise tenancy.** Build clean module boundaries and a tenant-aware data layer so this is *possible* later, but v1 serves one centre. Rationale: premature generalisation slows delivery; Oxford is one site today.
2. **Donor gamete / surrogacy / sex-selection workflows.** These are structurally excluded per Kuwaiti law (document 03), not merely hidden. Rationale: legal prohibition; building them is wrong, not just out of scope.
3. **Hospital-scale inpatient management (large multi-ward census, multi-day medical inpatients, hospital bed-allocation algorithms).** Oxford HIS *does* manage the centre's actual beds — three Level 1 recovery beds and six Level 2 inpatient/short-stay beds — with occupancy, transfers, and a bed board (see E1). What it does **not** build is a hospital-scale inpatient system: large ward censuses, complex bed-pooling/optimisation, multi-day general-medicine admissions, or a 200-bed model. Rationale: the centre's bed footprint is small and procedure-driven; model exactly those nine beds and the surgical pathway well, not a general hospital.
4. **Replacing specialist lab analyser middleware or PACS.** Integrate with them (HL7/DICOM/results interfaces); do not rebuild them. Rationale: commodity, regulated, not our value-add.
5. **Native genetics/PGT laboratory LIMS.** Capture PGT-A/M orders, consent, and results; the genetics lab itself stays external. Rationale: specialist regulated domain.

## D. Users / personas

| Persona | Primary needs |
|---|---|
| **Consultant (fertility/O&G)** | Fast clinical notes, cycle overview, monitoring charts, results, e-prescribing, letters, theatre lists |
| **Fertility nurse / coordinator** | Cycle scheduling, drug teaching, monitoring bookings, patient comms, consent tracking |
| **Embryologist** | Lab worklists, fertilisation/culture/grading entry, witnessing, cryostorage map, KPIs |
| **Andrologist** | Semen analysis (WHO 6th ed), sperm prep, freeze, witnessing |
| **Sonographer** | Scan worklist, structured ultrasound reporting, follicle tracking |
| **Anaesthetist** | Pre-op assessment, anaesthesia record, recovery, discharge fitness |
| **Theatre / scrub nurse** | Theatre list, WHO checklist, instrument/consumable capture, CSSD |
| **Ward / recovery nurse (L1 recovery, L2 beds)** | Bed board, admissions, transfers, post-op observations, discharge prep, prescription handover |
| **Porter / patient transfer** | Live transfer tasks between floors (L3→L2→L1→L2), location updates |
| **Pharmacist (Ground floor)** | Formulary, dispensing, discharge-prescription queue, stock, controlled drugs register, cold chain |
| **Receptionist / patient services** | Registration, booking, payments, check-in, document collection |
| **Procurement / stores officer** | Requisitions, POs, goods receipt, inventory, expiry |
| **Biomedical engineer** | Asset register, PPM schedules, calibration, fault logging |
| **Finance manager** | Invoicing, packages, instalments, reconciliation, reporting |
| **Medical Director / management** | Dashboards, KPIs, audit, compliance, oversight across all domains |
| **Patient / couple** | Booking, results, cycle timeline, medication guidance, payments, messaging — bilingual, mobile-first |

---

## E. Module catalogue

Each module lists: purpose, the best-of-breed pattern it draws from, P0/P1/P2 requirements, and key acceptance criteria. Phasing is in document 05.

> **Replacing om-software (ADR-0020):** the EMR **supersedes** the first-generation om-software point tools — semen-analysis → andrology (E5), embryo follow-up → embryology (E4), Document Ledger/patient timeline + HTML clinical tools → clinical core (E2) + document store (E0), Cliniko-backed patient context → scheduling/registry (E1). Each tool is replaced **individually, behind a parallel-run gate, with proven data migration before decommission** — never big-bang. Full mapping in `docs/07_OM_SOFTWARE_REPLACEMENT_MAP.md`; per-tool migrations are sequenced in document 05.

### E0. Platform foundation (Phase 0)

**Purpose:** the spine every other module hangs on.

- **P0** — Identity & access: SSO-capable auth, MFA for clinical/financial roles, deny-by-default RBAC with permission domains (clinical, embryology, financial, HR, admin), per-route permission declarations.
- **P0** — Immutable audit subsystem: hash-chained, append-only log of every clinical/financial mutation (who, what, when, before, after); tamper-evident; queryable per-entity; export to PDF for inspection.
- **P0** — Patient & **couple** registry: the couple is a first-class clinical entity. Person record (Arabic + English name, Civil ID with field-level encryption, DOB, photo, contact, nationality, language preference), partner linkage, **marriage verification record as a hard gate** for any fertility workflow (document 03). Merge/de-duplication tooling with audit.
- **P0** — Document store: versioned, access-controlled, OCR-indexed; consent forms, ID scans, marriage certificates, external reports.
- **P0** — i18n/RTL framework: every string translatable; Arabic RTL first-class; Khaleeji-appropriate medical terminology; date/number/calendar handling (Gregorian + Hijri display).
- **P0** — Notification service: SMS, WhatsApp Business, email; templated, bilingual, audit-logged; pluggable provider (must respect data-residency rules in document 03).

*Acceptance:* a user with no permissions can see nothing; granting the "embryology" domain reveals lab data and nothing financial; every test mutation appears in the audit log with correct before/after; switching language flips the entire UI to RTL Arabic with no untranslated strings on core screens.

### E1. Scheduling & practice management (Phase 1 — Cliniko parity)

**Pattern source:** Cliniko (the gold standard to match), plus IVF-aware extensions.

- **P0** — Multi-resource, multi-practitioner calendar: rooms, scanners, theatres, practitioners, equipment as bookable resources across all four levels (Ground/L1/L2/L3); conflict detection; recurring availability. Every bookable resource carries its **floor/level** so the calendar and flow board are location-aware.
- **P0** — Appointment types with duration, required resources, prep instructions, default billing item.
- **P0** — Online booking (patient portal) with rules (new vs returning, deposit-to-book option).
- **P0** — Waitlist, cancellations, no-show tracking; automated bilingual reminders (configurable cadence) via notification service.
- **P0** — **Live patient-flow & bed board** spanning the building: a patient is always at a known **location node** — clinic consult/scan room (L3), a named **Level 2 bed** (6), a named **Level 1 recovery bed** (3), or a **theatre** (L1 ×2). The board shows, per level, who is where and each bed's occupancy (free/occupied/cleaning), with live status (waiting, in consult, in scan, admitted, pre-op holding, in recovery, in theatre, post-op, ready-for-discharge, discharged). Reception, nursing, and theatre coordinators each get the relevant view.
- **P1** — Group/series booking for monitoring cycles (a patient's whole stimulation monitoring schedule booked as a linked series).
- **P1** — Practitioner leave / capacity management.
- **P2** — Demand forecasting from cycle pipeline; bed-occupancy forecasting from the booked theatre list (will the six L2 beds cover tomorrow's list?).

*Acceptance:* the clinic can run a full outpatient day — booking, reminders, check-in, room allocation, billing trigger — entirely on Oxford HIS.

### E2. Clinical EMR core (Phase 1)

**Pattern source:** Cliniko notes + structured O&G specialisation.

- **P0** — Encounter notes with specialty templates (new patient fertility, follow-up, antenatal, gynae, post-op); structured + free text; amendable with full version history (append-only).
- **P0** — Problem list, allergies (coded), medications, past obstetric history (gravidity/parity structured), past surgical history, family history.
- **P0** — Results inbox: lab and imaging results routed to ordering clinician, acknowledge/action workflow, abnormal flagging.
- **P0** — Letters & reports: templated bilingual clinical letters and patient summaries; merge from structured data; e-sign; deliver to portal/email.
- **P0** — Ordering: lab tests, imaging, referrals — structured, status-tracked, results linked back.
- **P1** — Clinical pathways / order sets (e.g. "early pregnancy" set, "recurrent miscarriage workup").
- **P1** — Antenatal record proper: the obstetric continuum — booking bloods, growth charts, visit schedule, risk flags — because Oxford uniquely carries fertility patients into delivery.
- **P2** — Decision support hooks (e.g. AMH-nomogram-informed counselling surfaced at point of care).

*Acceptance:* a consultant completes a new-patient fertility consultation — history, exam, orders, letter — faster than in Cliniko, with structured data captured for downstream cycle planning.

### E3. Fertility cycle management (Phase 2)

**Pattern source:** IDEAS (Mellowood), Meditex/CRITEX, IVFqube — the cycle engine.

- **P0** — Cycle entity: type (IUI, IVF, ICSI, FET, IVM, fertility preservation, ovulation induction), with status lifecycle (planned → stimulating → triggered → retrieval → fertilisation → culture → transfer → luteal → outcome). **Treatment/embryo-creation cycles are linked to a verified `Couple` (marriage hard-gate); `fertility preservation` cycles are PERSON-scoped (linked to a `Person`) — the only person-scoped cycle type (ADR-0015/AMD-0002).**
- **P0** — Protocol library: configurable stimulation protocols (long agonist, antagonist, mild, PPOS, etc.) with default drug regimens drawn from the formulary; protocol applied to a cycle generates the planned drug and monitoring schedule.
- **P0** — Stimulation chart: day-by-day grid of drugs (dose/unit/route, from formulary), follicle measurements per ovary, endometrial thickness, endocrine values (E2, LH, P4, FSH), with trend visualisation. **Follitropin delta dosing** supported with its AMH/weight algorithm; **HP-hMG / LH-activity** regimens first-class (the Medical Director's research domain).
- **P0** — Monitoring visit workflow: scan + bloods → results → clinician decision (continue/adjust/trigger/cancel) → updated plan → patient notification with next steps, all in one flow.
- **P0** — Trigger and procedure scheduling: trigger timing calculator; oocyte retrieval and transfer auto-scheduled into theatre/procedure calendar with countdown.
- **P0** — Consent management per cycle: required consents enumerated by cycle type and Kuwaiti legal requirements (document 03), tracked to signature, blocking progression if missing.
- **P1** — Cycle templates per consultant; bulk cohort view ("all patients stimulating this week").
- **P1** — Cancellation/conversion handling (e.g. IVF→IUI conversion) with reason coding for KPIs.
- **P2** — Predictive prompts (expected oocyte yield ranges, OHSS risk flags) surfaced from structured inputs.

*Acceptance:* a coordinator plans an antagonist ICSI cycle; the system generates the drug schedule and monitoring bookings; each monitoring visit updates the chart and notifies the patient; trigger and retrieval land correctly in the theatre calendar — with no spreadsheet anywhere.

### E4. IVF laboratory — embryology (Phase 2)

**Pattern source:** IDEAS, IVFqube, Babysentry, RI Witness (witnessing).

- **P0** — Lab worklist driven by the cycle engine: today's retrievals, inseminations, check-fertilisation, day-3/5 assessments, transfers, freezes, thaws.
- **P0** — Oocyte record: count, maturity (MII/MI/GV), dish/position, linked to retrieval procedure.
- **P0** — Insemination/ICSI record: method, time, operator, **witness** (mandatory two-person), sperm source linkage.
- **P0** — Fertilisation check: 2PN/1PN/3PN/0PN per oocyte; abnormal handling.
- **P0** — Culture & grading: day-by-day morphology, blastocyst grading (Gardner), per-embryo timeline; **time-lapse incubator integration hooks** (EmbryoScope/Geri-class) for annotation import.
- **P0** — Embryo disposition: transfer / freeze / discard / PGT-biopsy, each an auditable, witnessed event.
- **P0** — **Electronic witnessing via RI Witness integration:** the lab uses CooperSurgical RI Witness (RFID), which is the authoritative witnessing system and system of record. Oxford HIS is the **demographic master** feeding patient/couple identity into RI Witness, and **consumes witnessing/traceability events back** to populate the audit trail and the worklist's witness status. Oxford HIS **reconciles** its handling records against RI Witness and **blocks final cycle-step sign-off on any divergence** (a handling event with no corresponding RI Witness witness record, or vice-versa). It does **not** present a competing witness UI — embryologists witness in RI Witness; Oxford HIS reflects the result. Integration is built behind a `WitnessingProvider`/`RiWitnessProvider` adapter (see architecture §4). Exact RI integration path to be scoped with CooperSurgical before the Phase 2 lab build.
- **P0** — Embryo transfer record: number, grade, catheter, difficulty, ultrasound guidance, linked to clinical procedure and to luteal protocol.
- **P1** — PGT order/consent/result capture (external genetics lab interface).
- **P1** — Lab QC log: incubator gas/temperature, media lot tracking (links to inventory lots), pH/osmolality checks.
- **P2** — Time-lapse morphokinetic analytics surfaced to embryologists.

*Acceptance:* every gamete/embryo handling event in Oxford HIS carries a reconciled RI Witness witnessing record; any divergence between Oxford HIS handling records and RI Witness blocks cycle-step sign-off and is surfaced to the embryology lead; every embryo's full life history (oocyte → disposition → tank position or transfer → outcome), with its witnessing provenance from RI Witness, is reconstructable from the audit trail.

### E5. IVF laboratory — andrology (Phase 2)

- **P0** — Semen analysis to **WHO 6th edition** reference values: volume, concentration, total count, progressive/total motility, morphology, vitality; structured with reference-range flagging.
- **P0** — Sperm preparation record (method, output) and **freeze record** with witnessing and cryostore linkage.
- **P0** — Surgical sperm retrieval (TESA/TESE/PESA) capture linked to theatre.
- **P1** — DNA fragmentation and advanced sperm tests capture.

*Acceptance:* a semen analysis produces a bilingual report with correct WHO 6th-ed flags; a sperm freeze creates a witnessed, tank-mapped cryo record.

### E6. Cryostorage management (Phase 2)

**Pattern source:** IVFqube/Babysentry tank topology + chain-of-custody.

- **P0** — Physical topology model: tank → canister → cane/goblet → straw/vial/device position; every storage location addressable and visualisable.
- **P0** — Inventory of cryopreserved material (oocytes, embryos, sperm, tissue). **`CryoSpecimen.owner` is a `person_id` OR a `couple_id`** — person-owned for preservation, couple-owned for treatment/embryos (ADR-0015/AMD-0002). Each linked to cycle, freeze event, witness. **Hard invariant:** a person-owned specimen may only be used in treatment after the use-time re-gate (verified couple incl. that person + own-gametes); **no posthumous-use pathway exists.**
- **P0** — Every move/thaw/discard is a witnessed, audited chain-of-custody event; "locate any specimen" and "list everything for this couple" in two clicks.
- **P0** — Consent-to-store and storage-period tracking with expiry/renewal alerts and configurable Kuwaiti legal storage limits (document 03).
- **P0** — Tank monitoring log (level/temperature/fill) with alerting hooks.
- **P0 (Phase 2, AMD-0003)** — **Annual storage billing** (recurring charge via billing) + a **graduated non-engagement/non-payment pathway**: reminders → overdue flag → escalation to a **clinical/legal review step** (never automated destruction). Terminal disposition is a reviewed human step, bounded by the pending legal confirms (storage max period, marital-status disposition).
- **P2** — Liquid-nitrogen consumption and tank PPM linkage to asset module.

*Acceptance:* given any straw position, the system shows whose it is, the full freeze/witness history, consent and storage-expiry status; given any couple, it lists every specimen and location.

### E7. Theatres, perioperative journey & beds (Phase 3)

**Pattern source:** surgical PAS + WHO safe-surgery standard + small-scale perioperative bed management.

- **P0** — **Surgical admission & the perioperative journey:** a `SurgicalEncounter` (admission) ties the whole pathway together: **admit on L3 → allocate an L2 bed → transfer to L1 recovery → theatre → L1 recovery → return to L2 bed → discharge from L2**. Each transfer is an auditable, timestamped **bed/location movement event**; the patient's current location is always known and shown on the flow board (E1). Bed allocation respects capacity (6 × L2, 3 × L1 recovery) and flags when the list exceeds beds.
- **P0** — Theatre scheduling for **two theatres** (L1): lists, case duration, staffing, equipment/implant requirements; conflict-aware against the shared resource calendar; scheduling a case provisionally reserves an L2 bed for the day.
- **P0** — Pre-operative assessment: anaesthetic history, airway, ASA grade, investigations, fasting, consent linkage.
- **P0** — **WHO Surgical Safety Checklist** enforced (sign-in / time-out / sign-out) — blocking, audited.
- **P0** — Intra-operative & anaesthesia record: procedure, findings, anaesthetic technique, drugs (from formulary), times, staff.
- **P0** — Consumables & implants capture at point of use → flows to inventory deduction and billing; **specimen/lot capture for traceability.**
- **P0** — **Recovery (L1) & post-op ward (L2):** observations and recovery scoring in the L1 recovery bed; transfer criteria back to the L2 bed; post-op observations and nursing notes on L2; **discharge from L2** with discharge criteria, instructions, and **discharge prescription routed to the Ground-floor pharmacy** (E8) — discharge is gated on prescription fulfilment/handover and follow-up booking.
- **P0** — **CSSD / instrument set tracking:** set composition, sterilisation cycle, traceability of which set was used on which patient.
- **P1** — Bed turnaround/cleaning status; expected-discharge view to free L2 beds for the next list.
- **P1** — Theatre utilisation & turnaround analytics.
- **P2** — Implant/device registry reporting.

*Acceptance:* an oocyte retrieval and a hysteroscopy both run the full journey end-to-end — admit on L3, L2 bed allocated, transferred to L1 recovery→theatre (WHO checklist enforced)→recovery, back to L2, discharged from L2 with a pharmacy-fulfilled prescription — with every floor transfer audited, consumables deducted from stock and billed, bed occupancy correct on the flow board throughout, and a complete audit trail.

### E8. Pharmacy & medication management (Phases 1→4)

- **P0** — Controlled formulary (no free-text prescribables); bilingual drug names; Kuwait MOH drug database alignment.
- **P0** — E-prescribing integrated with cycle drug schedules and clinical notes; interaction/allergy checks.
- **P0** — Dispensing & stock decrement; batch/lot and expiry on dispense; cold-chain flag.
- **P0** — **Discharge-prescription queue (Ground-floor pharmacy):** a discharge prescription raised on the L2 ward appears in the Ground-floor pharmacy's dispensing queue; pharmacy fulfils, marks ready, and the **discharge step on L2 is gated on prescription handover** (E7). Closes the loop from ward to pharmacy to the patient leaving the building.
- **P0** — **Controlled drugs register** (legal-grade, witnessed, reconcilable).
- **P1** — Patient medication teaching materials (injection technique videos) pushed to portal.
- **P1** — Reorder triggers to procurement at par levels.

*Acceptance:* prescribing a gonadotrophin pulls from formulary, checks allergies, decrements correct lot, and surfaces injection-teaching media to the patient app; a discharge prescription raised on L2 reaches the Ground-floor pharmacy queue and its fulfilment gates the patient's discharge; controlled-drug movements reconcile.

### E9. Procurement & supply chain (Phase 4)

**Pattern source:** lightweight healthcare ERP.

- **P0** — Catalogue of suppliers and items (consumables, media, drugs, lab kit, office) with units, pack sizes, cold-chain attributes.
- **P0** — Requisition → approval → purchase order → goods receipt note → **3-way match** (PO/GRN/invoice) → finance.
- **P0** — Multi-location inventory across all levels (Ground pharmacy / L1 theatres & recovery / L2 ward / L3 clinic & lab / stores); **lot & expiry tracking**, FEFO issue, cold-chain logging.
- **P0** — Critical-stock and expiry-imminent alerts; min/max/par levels; **IVF media lot linkage to lab QC** (a media lot used in culture is traceable to embryos).
- **P1** — Supplier performance, price history, blanket/standing orders.
- **P2** — Demand planning from cycle pipeline (forecast media/consumable burn from booked cycles).

*Acceptance:* a low media stock triggers a requisition; PO→GRN→invoice three-way matches; the lot received is later traceable to the embryos cultured in it.

### E10. Asset & biomedical equipment management (Phase 4)

- **P0** — Asset register: incubators, scanners, lasers, theatre equipment, cryotanks, analysers — with location, serial, supplier, warranty, criticality.
- **P0** — **Planned preventive maintenance (PPM)** schedules and **calibration** records with due-date alerting; blocking flags for overdue critical-equipment calibration.
- **P0** — Fault/incident logging, downtime tracking, service-visit records.
- **P1** — Equipment QC linkage (incubator readings, fridge/freezer temperature logs) and contract/AMC management.
- **P2** — Asset utilisation and replacement-planning analytics.

*Acceptance:* every critical device has a PPM/calibration schedule; overdue calibration on an incubator raises a blocking alert visible in the lab; faults and downtime are logged and reportable.

### E11. Billing, packages & finance (Phase 5)

**Pattern source:** Cliniko invoicing + IVF package economics + Gulf payment rails.

- **P0** — Item-level charge capture from clinical/lab/theatre/pharmacy events.
- **P0** — **Packages & cycle bundles** (e.g. "ICSI package" bundling consult, monitoring, retrieval, lab, transfer, drugs-optional) with inclusions/exclusions and per-component recognition.
- **P0** — **Deposits & instalment plans** (standard in self-pay IVF): scheduled payments, balance tracking, payment-due notifications, block/allow rules tied to cycle progression.
- **P0** — Payments: **KNET** and card integration (Gulf rails), receipts, refunds; multi-currency display where relevant.
- **P0** — Invoices/statements bilingual; tax/regulatory fields per Kuwait.
- **P1** — Insurance claim scaffolding (payer, pre-auth, claim, remittance) even if mostly self-pay today.
- **P1** — Referral/agent commission tracking.
- **P2** — Revenue-cycle analytics, ageing, leakage detection.

*Acceptance:* an ICSI package is sold with a deposit and three instalments; charges from clinic/lab/theatre map to the package; outstanding-balance rules correctly gate the next cycle step; KNET payment posts and receipts.

### E12. Management, KPI & compliance reporting (Phase 5)

- **P0** — **Vienna-consensus IVF laboratory KPIs** (fertilisation rate, blastulation, etc.) computed from lab data, with competency/benchmark bands.
- **P0** — Clinical outcome reporting: pregnancy, clinical pregnancy, live birth per cycle type/protocol/consultant (de-identifiable for research; the Medical Director's AMH/outcome-prediction interests).
- **P0** — Operational dashboards: theatre utilisation, no-show rates, cycle pipeline, consumable burn, stock/expiry risk, calibration compliance.
- **P0** — Financial dashboards: revenue by service line, package margin, ageing, instalment risk.
- **P0** — **MOH / accreditation reporting outputs** and one-click audit-trail export per entity (document 03).
- **P1** — Configurable report builder; scheduled emailed reports.
- **P2** — Research/registry export pipeline (de-identified, ESHRE/registry-shaped).

*Acceptance:* the Medical Director opens one dashboard and sees live lab KPIs, theatre utilisation, cycle pipeline, and month-to-date revenue, and can export a full audit trail for any embryo or invoice.

### E13. Patient experience (Phase 6)

- **P0** — Bilingual mobile-first portal/app: bookings, **cycle timeline** (where am I, what's next), results (clinician-released), medication schedule with injection-teaching videos, documents/consents to sign, payments and balances, secure messaging.
- **P1** — Push notifications for medication timing and next steps; partner shared access (consented).
- **P2** — Symptom/side-effect logging feeding the monitoring view.

*Acceptance:* a couple sees their cycle timeline and next monitoring visit, watches the correct injection video at the right time, signs an outstanding consent, and pays an instalment — entirely in Arabic if they choose.

### E14. HR / rota / staff (Phase 5, light)

- **P1** — Staff registry, credentials/licence expiry tracking (MOH licensing of clinicians), competency sign-off (esp. witnessing-qualified embryologists).
- **P1** — Rota/shift planning feeding resource availability in scheduling and theatres.
- **P2** — Leave, time, and basic HR workflow. (Full payroll stays external.)

*Acceptance:* a clinician whose MOH licence is expiring raises an alert; only witnessing-competency-signed-off staff can act as electronic witnesses.

---

## F. Cross-cutting requirements

- **Bilingual everywhere (en/ar, RTL):** P0, not a phase.
- **Audit & append-only:** P0, foundational.
- **Data residency & privacy (CITRA):** P0 — constrains all third-party integrations (document 03).
- **Accessibility:** WCAG 2.1 AA on patient-facing surfaces.
- **Offline tolerance for the lab:** embryology worklists must degrade gracefully if connectivity drops mid-procedure (local queue, sync on reconnect). Witness *enforcement* lives in the RI Witness RFID layer and does not depend on Oxford HIS connectivity; but Oxford HIS must never lose its own clinical lab records to a connectivity blip, and must mark events `witness_status = pending-sync` rather than silently treating them as witnessed.
- **Configurability over hardcoding:** protocols, appointment types, packages, consent sets, par levels, KPI thresholds are data, not code.

## G. Open questions (for product owner)

- **[legal]** Confirmed maximum cryostorage period and consent-renewal cadence under current Kuwaiti law and Oxford policy? (Drives E6 alerting.) → document 03 to be confirmed with clinic legal counsel.
- **[clinical]** Which time-lapse incubator platform (EmbryoScope vs Geri vs other) — determines the first integration target in E4.
- **[ops]** KNET integration: direct bank integration vs a payment gateway aggregator? Affects E11 and data-residency review.
- **[ops]** Existing Cliniko data: full historical migration vs cut-over with archive access? Affects Phase 1 exit and migration tooling.
- **[ops/clinical]** RI Witness integration scoping with CooperSurgical: confirm the exact integration path and licence (demographic sync tool version matched to the on-site RI Witness release; EMR-integration licence; whether witnessing/traceability can be pulled back programmatically via DB view/export/API or only viewed in RI reporting; image transfer). This determines how rich the reconciliation ledger can be and is a prerequisite for the Phase 2 embryology build. Software witnessing is NOT reimplemented — RI Witness is the system of record.
- **[data]** Lab analyser and PACS interfaces present on site — confirm HL7/DICOM availability for E2 results and E5 andrology imports.

## H. Success metrics

- **Adoption:** 100% of outpatient bookings on Oxford HIS within 30 days of Phase 1 cutover; zero parallel spreadsheets for cycle management within 30 days of Phase 2 cutover.
- **Safety:** 100% of gamete/embryo handling events carry a reconciled RI Witness witnessing record; any divergence blocks cycle-step sign-off.
- **Inspection-readiness:** full audit trail for any entity exportable in < 5 minutes.
- **Operations:** Vienna-consensus lab KPIs and month-to-date finance available live, replacing all manual KPI/finance exports.
- **Experience:** measurable reduction in no-shows after bilingual reminders; clinician notes-time per encounter ≤ Cliniko baseline.
