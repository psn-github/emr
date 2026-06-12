# Oxford HIS — Delivery Roadmap

**Purpose:** the order of build, the exit gate for each phase, and the parallel-run/cutover discipline. Subordinate to documents 01–03; governs sequencing.

**Sequencing philosophy:** build the spine before the organs. Nothing clinical ships until the audit subsystem, identity/RBAC, registry, and i18n/RTL foundation are proven. Each phase delivers something the clinic can *actually run on*, ends with a parallel-run gate against the incumbent process, and only cuts over after reconciliation passes. Resist the urge to build breadth-first across half-finished modules.

---

## Phase 0 — Foundation
**Goal:** the platform spine. **Build first, build well, do not rush.**

Deliver: monorepo scaffold + CI/CD; OIDC auth + MFA + deny-by-default RBAC with permission domains; the immutable hash-chained audit/event subsystem; i18n/RTL framework (en/ar) with the Oxford design system component library; patient & **couple** registry with marriage-verification gate and merge tooling; versioned document store; notification service (SMS/WhatsApp/email, provider-abstracted, residency-reviewed); seed data; the `/docs` living files (STATE, DECISIONS, AMENDMENTS).

**Exit gate (all must pass):**
- A no-permission user sees nothing; permission domains correctly gate visibility server-side.
- Every test mutation appears in the audit log with correct before/after and a verified hash chain; a scheduled job validates chain integrity.
- Language toggle flips the entire core UI to correct RTL Arabic with zero untranslated strings.
- A couple cannot enter any fertility workflow without a verified marriage record (the gate is enforced server-side, not just in UI).
- CI runs typecheck/lint/unit/integration/e2e/secret-scan green on every commit.

## Phase 1 — Cliniko parity (outpatient practice management)
**Goal:** the clinic can run a normal outpatient day on Oxford HIS alone.

Deliver: the `facility` model (floors/locations/beds — 2 theatres + 3 recovery on L1, 6 inpatient on L2, clinic+lab L3, pharmacy Ground); multi-resource/multi-practitioner scheduling across all four levels; **live patient-flow & bed board**; appointment types; online booking with deposit option; waitlist/cancellation/no-show; bilingual automated reminders; check-in; clinical EMR core (encounter notes with O&G templates, problem/allergy/meds, results inbox, bilingual letters, ordering); basic invoicing/payments; patient-portal booking. Plus the **Cliniko migration tooling** (decision pending: full history vs cutover+archive — PRD open question) with reconciliation reports.

**Exit gate:**
- A full simulated outpatient day runs end-to-end (book → remind → check-in → consult/note → order → letter → invoice → pay) on Oxford HIS.
- Reminder delivery, no-show capture, and room allocation verified bilingual.
- Migration reconciliation report shows zero unexplained discrepancies against Cliniko for the chosen scope.

**Parallel run:** run alongside Cliniko for an agreed period; reconcile bookings/invoices daily; cut over only when clean.

## Phase 2 — Fertility EMR & IVF laboratory
**Goal:** zero spreadsheets for cycle management; the lab runs on Oxford HIS with enforced witnessing.

Deliver (in this internal order):
1. Cycle engine + protocol library + stimulation charting (incl. follitropin-delta dosing, HP-hMG/LH-activity regimens) + monitoring-visit workflow + trigger/procedure scheduling + per-cycle consent gating.
2. Embryology: lab worklist, oocyte/insemination/fertilisation/culture/grading/disposition records, **RI Witness integration** (Oxford HIS as demographic master → RI Witness; witnessing/traceability ingested back; reconciliation with blocking divergence flags; no competing witness UI), embryo transfer record, time-lapse import hooks.
3. Andrology: WHO 6th-ed semen analysis, sperm prep/freeze with witnessing.
4. Cryostorage: full tank topology, witnessed chain-of-custody, consent/storage-expiry tracking with alerts, tank monitoring log.
5. Outcome tracking into pregnancy/live birth, linked back to the originating cycle (the continuum).

**Exit gate:**
- Every gamete/embryo handling event in Oxford HIS carries a reconciled RI Witness witnessing record; any divergence blocks cycle-step sign-off and is surfaced to the embryology lead (verified by simulating a divergence).
- Any embryo's full life history and any couple's complete specimen inventory reconstruct from the audit trail in < 5 minutes.
- A complete antagonist ICSI cycle runs end-to-end with no external spreadsheet.
- Vienna-consensus KPI inputs are being captured (KPIs computed in Phase 5, but data complete now).

**Parallel run:** run the lab in parallel with existing records for an agreed number of real cycles; reconcile every RI Witness witnessing record against Oxford HIS handling events and every specimen location before cutover. **Lab cutover requires explicit Medical Director sign-off.**

## Phase 3 — Theatres, perioperative journey & beds
**Goal:** both theatres and all nine beds run on the system; the full surgical pathway (admit→bed→recovery→theatre→recovery→bed→discharge) is tracked, audited, and capacity-aware, with enforced WHO checklist and consumable→billing flow.

Deliver: `SurgicalEncounter` admission tying the journey together; **bed allocation and movement** across the 3 L1 recovery beds and 6 L2 inpatient beds with audited floor transfers and the live bed board (building on the Phase 1 `facility` model); two-theatre scheduling (L1) against the shared resource calendar with provisional L2 bed reservation; pre-op assessment; **blocking WHO Surgical Safety Checklist**; anaesthesia/intra-op records; consumable & implant capture → inventory + billing; L1 recovery + L2 post-op ward records; **discharge from L2 gated on Ground-floor pharmacy prescription fulfilment** and follow-up booking; CSSD instrument-set tracking.

**Exit gate:** an oocyte retrieval and a hysteroscopy each run the full journey — admit on L3, L2 bed allocated, transferred L1 recovery→theatre→recovery, back to L2, discharged from L2 with a pharmacy-fulfilled prescription — every floor transfer audited, WHO checklist enforced, consumables deducted and billed, bed occupancy correct on the board throughout. Theatre utilisation and bed occupancy reportable; the system correctly flags when a day's list would exceed the 6 L2 beds.

## Phase 4 — Operations ERP (procurement, inventory, assets)
**Goal:** consumables, drugs, and equipment fully tracked with lot/expiry and PPM/calibration.

Deliver: supplier/item catalogue; requisition→PO→GRN→3-way match; multi-location inventory with lot/expiry/FEFO/cold-chain; **IVF media lot ↔ lab QC traceability** (media lot traceable to embryos cultured in it); critical-stock/expiry alerts; controlled-drugs register; asset register with PPM/calibration/fault logging and **blocking overdue-calibration alerts** for critical equipment.

**Exit gate:** low media stock auto-triggers requisition; a received lot is later traceable to embryos; an overdue incubator calibration raises a blocking alert visible in the lab; controlled-drug movements reconcile.

## Phase 5 — Money & management
**Goal:** package economics, Gulf payment rails, and live management/KPI dashboards.

Deliver: charge capture from all clinical/lab/theatre/pharmacy events; **packages & IVF cycle bundles**; **deposits & instalment plans** with progression-gating rules; **KNET + card** payments (approved in-region gateway); bilingual invoices/statements with Kuwait tax/regulatory fields; insurance-claim scaffolding; referral tracking; **Vienna-consensus lab KPIs**; clinical outcome reporting by protocol/consultant; operational + financial dashboards; **MOH/accreditation reporting outputs** and one-click audit export; light HR (licence/competency tracking, rota feeding scheduling).

**Exit gate:** an ICSI package sells with deposit + instalments, charges map correctly, balance rules gate the next cycle step, KNET payment posts and receipts; the Medical Director's single dashboard shows live lab KPIs, theatre utilisation, cycle pipeline, and month-to-date revenue; full audit export works for any embryo or invoice.

## Phase 6 — Patient experience
**Goal:** a genuinely good bilingual patient app.

Deliver: mobile-first portal/app (PWA vs React Native decided by ADR) — bookings, **cycle timeline**, released results, medication schedule with injection-teaching videos, documents/consents to sign, payments/balances, secure messaging; consent-gated partner shared access; discreet push notifications.

**Exit gate:** a couple completes a real cycle journey from the app in Arabic — sees the timeline, watches the right injection video at the right time, signs an outstanding consent, pays an instalment, messages the coordinator.

---

## Cross-phase discipline

- **Every phase ends with a parallel-run gate and reconciliation tooling that the build produces as part of the phase.** No "big bang" cutovers.
- **Lab and money cutovers require explicit product-owner sign-off.** (Witnessing and patient funds are the two highest-risk surfaces.)
- **The `/docs` living files are updated every session.** A phase is not "done" until STATE.md, DECISIONS.md, and the relevant acceptance criteria are reconciled.
- **Regulatory `[CONFIRM]` items in document 03 must be resolved with legal counsel before the dependent module cuts over to production** (especially: storage limits, hosting region/CSP, PGT scope, marital-status disposition, retention period).
- **Scope discipline:** anything not in a phase goes to `docs/AMENDMENTS.md` as a parking-lot item; adding scope to a phase requires removing scope or moving the gate, recorded as an ADR.

## Suggested parallelisation (where team capacity allows)
Phases are sequential in *dependency*, but some work can overlap once Phase 0 is solid: procurement/inventory (Phase 4) catalogue and asset register have few clinical dependencies and can begin during Phase 2/3; the patient-portal shell (Phase 6) can be scaffolded early since it reuses Phase 0/1 foundations. Keep clinical-safety modules (witnessing, theatre checklist, drug dosing) on the critical path and fully attended — never parallelised into thin coverage.
