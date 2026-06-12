# Oxford HIS — Build Document Set

This is the specification pack for **Oxford HIS**, the cloud-based hospital/clinic information system for **Oxford Medical Kuwait** — a four-level centre (Ground pharmacy; L1: 2 theatres + 3 recovery beds; L2: 6 inpatient beds; L3: clinic + IVF laboratory) with a first-class surgical patient-flow pathway and the fertility → obstetrics → delivery continuum.

Hand this whole folder to Claude Code. Start it with `00_MASTER_ORCHESTRATION_PROMPT.md`. The documents are read in **precedence order** — if two conflict, the higher one wins and the conflict is logged in `docs/AMENDMENTS.md`.

## Read in this order
1. **`03_KUWAIT_REGULATORY_AND_CLINICAL_CONTEXT.md`** — highest precedence. Categorical legal/clinical constraints that shape the schema (married-couples-only, own-gametes-only, no donor/surrogacy, witnessing, CITRA/residency). Contains `[CONFIRM WITH CLINIC LEGAL COUNSEL]` flags that must be resolved before dependent modules go to production.
2. **`01_PRODUCT_REQUIREMENTS.md`** — what to build: the full module catalogue (E0–E14) synthesising Cliniko, IDEAS, Meditex, IVFqube/Babysentry, with P0/P1/P2 and acceptance criteria.
3. **`02_TECHNICAL_ARCHITECTURE.md`** — how to build it: modular-monolith stack, data model, witnessing engine, security/residency, integrations, repo layout.
4. **`04_DATA_MODEL_AND_GLOSSARY.md`** — living as-built model + shared vocabulary (seed; expanded during the build).
5. **`05_DELIVERY_ROADMAP.md`** — in what order: Phase 0 (foundation) → 1 (Cliniko parity) → 2 (fertility EMR & lab) → 3 (theatres) → 4 (operations ERP) → 5 (money & management) → 6 (patient experience), each with an exit gate and parallel-run discipline.
6. **`00_MASTER_ORCHESTRATION_PROMPT.md`** — how to work: the orchestrator role, session protocol, non-negotiable engineering rules.
7. **`CLAUDE.md`** — day-to-day repo conventions (subordinate copy of the rules).

## Reference / outbound documents in `/docs`
- `06_RI_WITNESS_INTEGRATION_BRIEF.md` — the scoping brief to hand to CooperSurgical to get the technical answers needed before the Phase 2 embryology build (demographic sync in, witnessing/traceability out, cryostorage boundary, licensing, residency). Not a build spec — a question set for the vendor. Its answers become an ADR in `DECISIONS.md`.

## Living files Claude Code maintains in `/docs`
- `STATE.md` — build journal (what's built, what's open).
- `DECISIONS.md` — ADR log (one record per consequential choice).
- `AMENDMENTS.md` — proposed requirement changes and logged conflicts.

## The shape of the thing in one paragraph
Replace Cliniko's outpatient core, then add what no single product gives a single Gulf clinic: a fertility-specific EMR (cycles, stimulation charting, embryology, andrology, cryostorage, software-enforced two-person witnessing) at IDEAS/Meditex/IVFqube level; theatres with the WHO checklist; an operations ERP (procurement, lot/expiry inventory, asset PPM/calibration); package-and-instalment billing on Gulf payment rails; and live Vienna-consensus lab KPIs and finance dashboards — all bilingual/RTL, CITRA-aware, in-region hosted, inspection-ready by design, and built phase-by-phase with parallel-run cutovers so the clinic is never running on a half-finished system.

## Before you start the build
Resolve (or schedule resolution of) the PRD §G open questions and the document 03 `[CONFIRM]` items with the clinic and legal counsel — especially: cryostorage limit & consent cadence, hosting region/CSP under the CITRA cloud framework, permitted PGT scope, marital-status disposition handling, record-retention period, time-lapse incubator platform, **the RI Witness integration path with CooperSurgical** (Oxford HIS integrates with RI Witness as the witnessing system of record — it does not reimplement witnessing), and Cliniko migration scope. The build can begin Phase 0 immediately regardless, since none of these block the foundation.
