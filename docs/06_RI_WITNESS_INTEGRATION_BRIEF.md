# Oxford HIS ↔ RI Witness — Integration Scoping Brief for CooperSurgical

**From:** Oxford Medical Kuwait (Prof Scott Nelson, Medical Director)
**Re:** Integrating a new in-house cloud EMR ("Oxford HIS") with the clinic's installed CooperSurgical **RI Witness** electronic witnessing system
**Purpose of this document:** to give your RI Witness technical/integration team the context they need and to get clear answers to the questions below, so we can scope and build the integration correctly. This is a requirements/scoping brief, not a procurement decision — we want to understand what is possible with our current RI Witness installation and licensing.

---

## 1. Context

Oxford Medical Kuwait is building a single cloud-based hospital information system (Oxford HIS) covering the whole centre — clinic, fertility cycle management, IVF laboratory, theatres, pharmacy, procurement, and billing. The IVF laboratory already runs **RI Witness (RFID)**, which we regard as the **authoritative electronic witnessing system and system of record for witnessing and specimen traceability**. We are deliberately **not** building any competing or parallel witnessing function in Oxford HIS.

Our intended division of responsibility:

- **Oxford HIS is the single source of truth for patient/couple identity** (demographics). Identity is created once, in Oxford HIS, and should flow *into* RI Witness so the lab never re-keys a patient — eliminating transcription divergence.
- **RI Witness performs and records witnessing** at the RFID layer, as today.
- **Oxford HIS consumes witnessing and traceability data back from RI Witness** to (a) populate its immutable clinical audit trail, (b) show witness status on the lab worklist, and (c) reconcile its own clinical/lab handling records against the RI Witness record, flagging any divergence.

We need to confirm exactly *how* each of those data flows can be achieved with our installation and licensing.

## 2. Our installation (to be completed by the clinic before sending)

> _Scott / lab team: fill these in so RI can answer precisely._

- RI Witness product/edition installed: __________ (e.g. RI Witness, RI Witness IQ)
- RI Witness software version: __________
- Number of workstations / reader areas: __________
- Existing EMR/database integration in use today (if any), and via what mechanism: __________
- Site / country (for data-residency relevance): **Kuwait City, Kuwait**
- Local CooperSurgical/RI representative or distributor: __________

## 3. What we need to integrate (the three data flows)

**Flow A — Demographics OUT (Oxford HIS → RI Witness).**
On patient/couple registration and on any demographic change, push the canonical identity record (names in Arabic and English, date of birth, a stable Oxford HIS patient/couple key, and whatever minimum fields RI Witness requires to create/match a patient) into RI Witness, so the embryologist selects an already-correct patient rather than typing one.

**Flow B — Witnessing & traceability IN (RI Witness → Oxford HIS).**
Ingest the witnessing events and traceability records RI Witness produces — which patient, which procedure/step (e.g. insemination, fertilisation check, embryo disposition, freeze, thaw, cryo-move), the operator(s)/witness, timestamps, and any procedure timings RI captures — and link them to the corresponding records in Oxford HIS (cycle, oocyte, embryo, specimen).

**Flow C — Reconciliation.**
Using A and B, Oxford HIS will continuously match its own handling records to RI Witness's witnessing records and flag any handling event that lacks a corresponding RI Witness record (or vice-versa) as a blocking exception for the embryology lead. This depends entirely on how much of Flow B is available programmatically.

## 4. Questions for the CooperSurgical / RI Witness team

### A. Demographic synchronisation (Flow A)
1. What is the supported mechanism for pushing patient demographics from a third-party EMR into our RI Witness version? (We understand RI offers **Database Synchronisation Tools** — please confirm availability, the exact tool/version compatible with our installation, and any version dependencies.)
2. Which RI Witness software version and **licence/component** is required to enable EMR-to-RI demographic sync? Is this an optional licensed component, and is it active on our installation?
3. What is the **minimum and full field set** RI Witness accepts for a patient (and, importantly, for a *couple* — husband and wife as a linked pair, which is the clinical unit in our jurisdiction)?
4. Can we pass and store a **stable external key** (our Oxford HIS patient/couple ID) on the RI Witness patient record, so the two systems can be reliably matched both ways? If so, which field?
5. Is the sync **one-directional (into RI Witness only)**, or can demographic updates also be reflected back? What is the trigger/cadence — real-time, polled, file-based, on-demand?
6. How are **updates and merges** handled (e.g. a corrected name, or two records merged in Oxford HIS)? How do we avoid creating duplicate patients in RI Witness?

### B. Witnessing & traceability extraction (Flow B) — the critical one
7. **Can witnessing and traceability data be extracted from RI Witness programmatically** — via an API, a documented database view/read access, a scheduled export (file/feed), or an HL7/other interface — or is this data only viewable inside RI Witness's own reporting UI? *(This single answer determines how automated our reconciliation and audit-trail population can be, so please be specific.)*
8. If programmatic extraction is available: what **events and fields** are exposed (event type/step, patient/couple reference, specimen/plasticware identifiers, operator and witness identities, timestamps, procedure timings such as denudation/insemination/fertilisation-check/media-change), and in what format/schema?
9. Can the extract include the **specimen/RFID tag identifiers** so we can link a witnessing event to a specific oocyte/embryo/straw in Oxford HIS and into our cryostorage chain-of-custody?
10. What is the **latency** of whatever extraction mechanism exists (near-real-time vs end-of-day batch)? Are there event hooks/notifications, or only pull?
11. Is there published **integration/API documentation** and a **test/sandbox environment** we can develop against?

### C. Cryostorage / chain-of-custody alignment
12. RI Witness covers handling and witnessing — to what extent does it also hold **cryostorage location/topology** (tank → canister → cane → position) and **storage chain-of-custody**? We are building cryostorage management in Oxford HIS; we need to understand the **boundary** so the two systems agree on where a specimen is and don't diverge. Which system should be authoritative for storage location, in your recommendation?
13. Can storage/movement events (freeze, thaw, move, discard) be extracted to Oxford HIS via the same mechanism as B?

### D. Commercial, licensing & support
14. What **licences/components and cost** are involved in enabling the integration capabilities above (demographic sync component, any API/integration licence, database-access licence)?
15. Are there **reference sites / existing EMR integrations** (e.g. with other ART EMRs) we can learn from or that establish a supported integration pattern?
16. What **support model** applies to the integration (who we contact, SLAs, version-upgrade implications — e.g. when RI Witness updates, what breaks on the sync tools)?

### E. Data residency & security (important for our jurisdiction)
17. Where does our RI Witness **server/database physically reside** (on-premises at the clinic, regional, or any cloud component)? Kuwait's data-protection regime (CITRA / DPPR) constrains where patient and health data may be stored and how it may be transferred, so we need to confirm the RI Witness deployment and any data flows satisfy in-region/residency requirements.
18. For any integration mechanism, **what data leaves the RI Witness server, and to where?** (We must ensure no patient/health data is transferred outside approved jurisdictions without the required basis.)
19. How is the integration **secured** (authentication, encryption in transit, access control on any database/API exposure)?

## 5. What we are NOT asking for
- We are not asking RI Witness to change its witnessing workflow — the embryologists will continue to witness in RI Witness exactly as they do today.
- We are not replacing or duplicating RI Witness's witnessing function in Oxford HIS.
- We are not asking RI Witness to consume our clinical/billing/theatre data — only the demographic identity it needs.

## 6. Desired outcome of this conversation
A clear, written statement from CooperSurgical/RI of: (a) the supported integration mechanism(s) for Flows A and B with our specific installation and licensing; (b) whether Flow B (witnessing/traceability extraction) is available programmatically and with what fields; (c) the cryostorage authority boundary; (d) the licences/costs involved; and (e) the data-residency position of our RI Witness deployment. With that, we can finalise the Oxford HIS embryology-module integration design (it is already specced behind a `RiWitnessProvider` adapter) and schedule the build.

---

**Internal note (not for CooperSurgical):** the answer to **Question 7** is the pivot. If witnessing/traceability can be pulled programmatically, Oxford HIS gets automated reconciliation and a complete audit trail with blocking divergence detection. If it is report-only, we fall back to a lighter-touch reconciliation (periodic export/manual import) and must design the worklist accordingly. Capture RI's answer in `docs/DECISIONS.md` as the RI-integration ADR before the Phase 2 embryology build, and update the relevant `[CONFIRM]` items in `docs/STATE.md`.
