# Phase 8 — Whole-clinic operations: paper-file integration, pharmacy, documents, printing

> Proposed roadmap addition (AMD-0008), commissioned by the product owner 2026-07-03: *"knowing
> what we have to build to be able to run the whole clinic across the floors, what is missing? We
> will still have paper files but need to develop the filing system that integrates with this and
> we can print labels etc."* This document is the gap analysis **and** the build plan. Phase 7
> (docs/PHASE7_PLAN.md — HTTP host ✅, simulator ✅, staging deploy ✅, router gaps, UI shells)
> continues in parallel; Phase 8 adds the physical-operations layer the building needs.

## The building (docs/02 §data-model, ADR-0023)
Ground: pharmacy · L1: 2 theatres + 3 recovery beds · L2: 6 inpatient beds · L3: consult/scan
rooms, IVF lab, clinic. Every location is an addressable `LocationNode`; every patient move is an
audited `LocationMovement`. The paper file must move through exactly this topology, trackably.

## Gap analysis — what is missing to run the whole clinic

### A. Paper medical records & filing (NEW scope — nothing exists today)
The clinic keeps paper files alongside the EMR. Missing entirely:
1. **Medical record number (MRN)** — a human-friendly clinic file number on every patient
   (barcode-able, unique, never reused), allocated at registration; existing patients keep their
   current (Cliniko-era) file numbers on import.
2. **Physical file registry** — the paper file (and later volumes) as a first-class entity with a
   home location in the records room and a status (active / archived / missing).
3. **File movement tracking** — audited check-out/check-in of a file to a floor/room/staff member
   ("where is this file *now*"), driven by scanning the file's barcode; overdue and missing alerts.
4. **Clinic-prep pull list** — tomorrow's appointment list per floor/session → the files to pull;
   a return checklist at day end. (This is what makes the filing system *integrate* with the EMR
   rather than sit beside it.)
5. **Label printing** — bilingual, barcode-carrying labels: file spine labels, patient ID label
   sheets (for paper forms, sample tubes outside the RI-witnessed chain, appointment slips),
   printable as A4 label sheets and single thermal labels; ZPL output for Zebra-class printers.
6. **Retention/archive** — archive status + archive-location tracking now; destruction is blocked
   (retention period is an open legal item, docs/03 §3 — append-only regardless).

### B. PRD P0s promised but not yet built (found by code audit, 2026-07-03)
7. **Pharmacy dispensing (E8 P0)** — the Ground-floor pharmacy is today only
   `StubPharmacyProvider`. Missing: prescription → pharmacy dispensing queue → dispense with
   **lot/FEFO stock decrement** (via the inventory module's published interface), cold-chain flag,
   controlled-drug register hook, mark-ready → the L2 **discharge gate consumes the real
   fulfilment**. Prescribables come from the formulary ONLY (hard rule); dispensing quantity logic
   carries the 100%-coverage drugs bar.
8. **Documents module wiring (E0 P0)** — `@oxford/documents` (versioned, access-controlled,
   OCR-seamed) exists but has **no storage adapter, no router, no callers**. Missing: a
   `BlobStorePort` (local disk on staging; in-region object storage in production behind the same
   port + residency ADR), upload/read/list routes, and linkage so scanned paper (consents, marriage
   certificates, IDs, external reports) lands on the patient record — the other half of "paper
   files integrate with this".
9. **Print pack** — the paper the clinic hands out daily, server-rendered as print-ready bilingual
   HTML (A4 / label / receipt CSS): prescription, invoice + receipt, appointment slip, clinical
   letter, theatre day list, file pull list, label sheets. (UI shells add the print buttons; the
   renderer is server-side so every artefact is consistent and testable.)

### C. Already planned in Phase 7 (not re-planned here)
10. The 7 **router gaps** (PHASE7_PLAN §7.3) — scheduling config, facility-topology seed (the
    floors themselves!), fertility cycle engine over HTTP, stim charting, embryology micro-steps,
    witnessing read, perioperative admission path.
11. **Staff web app + patient portal PWA** (7.4/7.5) — the largest remaining piece to operate
    day-to-day; every Phase 8 module lands API-first so the shells consume it.

### D. External/blocked (unchanged; not buildable now)
Real RI Witness, KNET gateway, OIDC/IdP, in-region production hosting, HL7 analyser + PACS/DICOM
interfaces, notification (SMS/WhatsApp) provider — all behind existing ports, awaiting vendor
scoping/credentials/residency review (docs/CUTOVER_CONFIG.md). Hardware procurement (label/wristband
printers, barcode scanners, document scanners) is an ops purchase; the software side ships in A/B.

### E. Noted, deliberately deferred (recorded so they aren't lost)
- Structured sonographer reporting beyond the stimulation chart (P1; order/result flow covers it).
- Porter task queue (flow board + movements cover v1; a task view is a UI concern).
- Wristband printing for theatre admissions (same label engine; add a wristband template with the
  perioperative UI).
- Insurance/payer billing — out of PRD scope (self-pay + packages only).

## Build plan

### 8.0 `@oxford/records` — medical records & filing (ADR-0065)
MRN allocation (config format `OM-<year>-<seq>`; import path for existing numbers; unique, never
reused) · physical file registry + volumes · audited check-out/check-in movements keyed by barcode
scan, under new `clinical:records.read`/`clinical:records.write` actions (clinical domain — the
file's whereabouts is PHI-adjacent, so it stays MFA-gated; no new permission domain) · pull list
from the scheduling module via a port · overdue/missing alerts · archive status. Labels as DATA + rendering: pure Code 128 encoder (100% tested against
known vectors), label templates (file spine / ID sheet / single thermal) as bilingual HTML and ZPL
strings. Migrations, seeds, unit + PG integration + API e2e, simulator step.

### 8.1 `@oxford/pharmacy` — dispensing (ADR-0066)
Prescription (formulary-only, allergy advisory via the existing port) → Ground-pharmacy queue →
`dispense` (FEFO lot decrement via inventory's published interface; cold-chain flagged; controlled
items also post to the controlled-drugs register via its service) → `markReady` → fulfilment
feeds the real `PharmacyPort` (the L2 discharge gate switches from the stub to this service;
the stub remains for unit tests). 100% coverage on dispensing/drug logic. Migrations, router
(`clinical:prescription.write`, `pharmacy` domain reads), e2e incl. the ward→pharmacy→discharge
loop, simulator step.

### 8.2 Documents wiring (ADR-0067)
`BlobStorePort` + `LocalDiskBlobStore` (staging; size-capped base64 upload over tRPC now, presigned
in-region object storage later behind the same port) · router: upload/list/read (content reads
audited as sensitive) · wire `DocumentService` in the composition root · link consents / marriage
certificate / ID scans by `subjectRef`. E2e: scan-upload → versioned → access-gated → audited.

### 8.3 Print pack (ADR-0068)
`@oxford/print` (or inside records if trivially small): server-rendered bilingual print-ready HTML
(A4, label-sheet, thermal, receipt CSS; RTL-correct) for: prescription, invoice/receipt,
appointment slip, clinical letter, theatre day list, pull list, label sheets — each a pure renderer
fed by existing read models, exposed under `print.*` routes, snapshot-tested in both locales.

### 8.4 Exit gate
Simulator grows a "paper day" loop: register (MRN allocated + labels rendered) → pull list for
tomorrow's clinic → file checked out to L3 → consult → prescription → pharmacy queue → FEFO
dispense → discharge gate passes on real fulfilment → file checked back in → scanned consent lands
in documents → invoice + receipt print render → audit chain intact. Zero errors, full suite green,
all gates clean, bilingual snapshots for every print artefact.

## Build execution
Opus-class builder agents implement 8.0 → 8.3 sequentially (shared files: router/context), each
delivering the full testing bar; the orchestrating session reviews every diff, re-runs the full
serialized suite + all CI gates after each stage, and owns docs/STATE/ADR updates. Every
simulator-found defect gets a pinning test before its fix (Phase 7 standing rule).
