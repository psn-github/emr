# Oxford HIS — Data Model & Glossary (living stub)

**Status:** seed document. Claude Code expands the entity list and relationships here as schemas are built, keeping it in sync with the actual migrations. Document 02 §3 holds the canonical illustrative entity list; this file is where the *as-built* model and the shared vocabulary live.

## How to maintain this file
- When a module's schema is created or changed, update the relevant entity section here in the same commit as the migration.
- Every entity entry: name, purpose, key fields, relationships, and any append-only/witness/audit notes.
- Keep the glossary alphabetised. If a term is ambiguous across UK/Gulf practice, note both.

## Glossary (seed — extend as needed)
- **Couple** — the fertility clinical unit: husband + wife with a verified marriage record. First-class entity. No **treatment/embryo-creation** workflow without one.
- **Cycle** — one assisted-reproduction episode (IUI/IVF/ICSI/FET/IVM/fertility-preservation/ovulation-induction) with a status lifecycle. Treatment cycles link to a **`Couple`** (marriage hard-gate); **fertility-preservation** cycles link to a **`Person`** — the only person-scoped cycle type (ADR-0015/AMD-0002).
- **CryoSpecimen** — cryopreserved gamete/embryo/tissue. `owner` is a **`person_id` OR a `couple_id`** (person-owned for preservation; couple-owned for treatment/embryos). A person-owned specimen may only enter treatment via the use-time re-gate (verified couple incl. that person + own-gametes). No posthumous-use pathway.
- **Witness / Witnessing** — confirmation that a gamete/embryo handling step involves only the correct couple's material. Performed by **RI Witness** (RFID) in Oxford Medical's lab — the authoritative system. Oxford HIS reflects and reconciles RI Witness records; it does not author witness decisions.
- **RI Witness** — CooperSurgical's RFID-based electronic witnessing and ART lab management system, deployed in the Oxford Medical IVF lab. System of record for witnessing and specimen traceability. Oxford HIS is its demographic master (identity flows in) and consumes its witnessing/traceability output. Integration via RI's supported sync tools / EMR-integration licence — confirm exact path with CooperSurgical.
- **Witness reconciliation** — the ledger matching Oxford HIS handling events to RI Witness witnessing events; status matched / pending-sync / divergent. A `divergent` record blocks cycle-step sign-off.
- **Chain of custody** — the complete, witnessed, audited history of a specimen's location and handling from creation to disposition.
- **Disposition** — the fate of an embryo/specimen: transfer / freeze / discard / biopsy. Each is a witnessed, audited event.
- **Vienna consensus** — the reference framework for IVF laboratory performance indicators (e.g. fertilisation rate, blastulation rate) used for KPI computation.
- **Formulary** — the controlled list of prescribable items; prescribing never uses free text.
- **HP-hMG / LH activity** — highly purified human menopausal gonadotrophin and its LH activity; first-class in stimulation charting (product-owner research domain).
- **Follitropin delta** — recombinant FSH dosed by an AMH/weight algorithm; supported natively in protocol/dosing logic.
- **FEFO** — First-Expiry-First-Out inventory issue discipline for lot/expiry-tracked stock.
- **3-way match** — reconciliation of purchase order, goods receipt note, and supplier invoice before payment.
- **PPM** — Planned Preventive Maintenance schedule for an asset.
- **CSSD** — Central Sterile Services Department; instrument-set sterilisation and traceability.
- **WHO checklist** — WHO Surgical Safety Checklist (sign-in / time-out / sign-out); blocking in theatre.
- **CITRA / DPPR** — Kuwait's Communication and Information Technology Regulatory Authority and its Data Privacy Protection Regulation (as amended by Decision No. 26 of 2024).
- **Civil ID** — Kuwaiti national identity number; field-level encrypted PHI.
- **The continuum** — Oxford's distinctive fertility → antenatal → delivery care pathway modelled on one couple record.
- **Surgical pathway / perioperative journey** — the standard flow for any operation: admit on Level 3 (clinic) → Level 2 bed → Level 1 (recovery bed → theatre → recovery bed) → back to Level 2 bed → discharge from Level 2 with prescriptions fulfilled by the Ground-floor pharmacy. Each transfer is an audited `LocationMovement`.
- **LocationNode / Bed** — the building modelled as addressable locations across four levels: Ground (pharmacy), L1 (2 theatres + 3 recovery beds), L2 (6 inpatient/short-stay beds), L3 (consult/scan rooms + IVF lab). A patient is always at a known location; the flow board reads current `PatientLocation`.
- **SurgicalEncounter** — the admission record tying one patient's whole perioperative journey together from L3 admission to L2 discharge.

## Entity index (populated as built)
_(Claude Code: add each entity here with a one-line purpose and a link to its schema package as it is implemented. Start from the illustrative list in document 02 §3.)_
