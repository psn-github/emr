# STATE — Oxford HIS build journal

> Living file. Claude Code updates this **every session**: what was built, what changed, what's open. Newest entry at the top. This is the first thing to read when starting a session.

## Current status
- **Phase:** **Phase 2 — Fertility EMR & IVF laboratory — BUILD COMPLETE; awaiting exit-gate sign-off (HOLD).** PRs 2.0→2.9 all merged to `main`. Phases 0 + 1 also complete. A complete antagonist-ICSI cycle runs end-to-end through the stack with no spreadsheet (closeout e2e, PR 2.9). Decisions in force: RI Witness behind a stub (ADR-0018); no time-lapse device — vendor-neutral seam (ADR-0019); annual cryo-storage billing + non-engagement pathway (AMD-0003); om-software tool-by-tool replacement (ADR-0020). **Do not start Phase 3 until the Medical Director signs off the Phase 2 exit gate.**
- **Last updated:** 2026-06-13 — PR 2.10 (cryostore go-live wiring: clinician-attested death record → real thaw re-gate at the API; ADR-0021/0022, AMD-0004). MD answered the open items. Phase 2 still **HOLD for exit-gate sign-off** before Phase 3. **Still open (gates cutover, not the build):** marital-status-change disposition + permitted PGT indications (clinic counsel); numeric MOH storage ceiling (config when confirmed); CooperSurgical RI Witness scoping (MD emailing); om-software read access (stim-calculator port + per-tool migrations).

## How to use this file
Each session, prepend an entry in this format:

```
## YYYY-MM-DD — <session goal in one line>
**Shipped:** <what was built and merged>
**Changed:** <schema/contract/config changes; note any migrations>
**Decisions:** <new ADRs written to docs/DECISIONS.md, by number>
**Open / needs product owner:** <blocking questions, [CONFIRM] items hit>
**Next:** <the obvious next task>
```

## Outstanding before build cutover (from the spec pack)
These do **not** block starting Phase 0, but must be resolved before the dependent module goes to production. Tracked here so they aren't lost.

- **[legal]** Cryostorage maximum period + consent-renewal cadence (docs/03 §2). Blocks cryostore cutover.
- **[legal]** Hosting region / approved CSP under CITRA Cloud Framework (docs/03 §4). Blocks any production PHI hosting.
- **[ops]** Select + provision the in-region (GCC/Kuwait-permissible) production host + managed PostgreSQL to replace the DigitalOcean VPS, which is staging/synthetic-only (ADR-0007, docs/PATIENT-DATA.md). Blocks loading any real PHI / go-live; swapping the deploy target is a secrets change.
- **[legal]** Permitted PGT indications scope (docs/03 §1). Blocks PGT capture cutover.
- **[legal]** Marital-status-change specimen disposition handling (docs/03 §1). Blocks cryostore cutover.
- **[CLOSED — Medical Director, 2026-06-13]** Single-person fertility preservation is **legal in Kuwait and standard clinic practice** (ADR-0015, AMD-0002). No longer a legal gate. The medical-vs-elective indication is retained as a **configurable coded field captured for clinical governance**, not a restriction — to be built with the Phase 2 cryostore/cycle.
- **[ops, assigned: PO]** Clinic review of all 7 notification templates before go-live, **particular attention to the Khaleeji Arabic wording** (current wording is placeholder; templates are bilingual + discreet by test).
- **[legal]** Medical-record retention period (docs/03 §3). Blocks retention job.
- **[integration, in progress — ADR-0018]** RI Witness integration path with CooperSurgical (sync-tool version, EMR-integration licence, pull-back mechanism, image transfer, RI-server residency review). **PO initiating scoping;** Phase 2 builds the reconciliation/blocking behind a stub meanwhile. Gates real witnessing wiring + lab cutover.
- **[clinical — ADR-0019]** No time-lapse incubator today; vendor-neutral morphokinetic import seam built. Pick a platform if/when one is acquired.
- **[decision, assigned: PO/MD — ADR-0020]** om-software tool **retirement order** and **archive-vs-migrate per tool** (semen-analysis, embryo follow-up, Document Ledger/timeline, HTML clinical tools). See docs/07 replacement map.
- **[access, assigned: PO — ADR-0020/0016]** Grant **om-software read access** to this build (or supply the relevant logic/specs): needed for field-level data-model mapping per tool migration **and** the stimulation dosing-calculator port (PR 2.2 follow-on). Currently out of session scope.
- **[ops]** KNET integration: direct bank vs gateway aggregator (docs/01 §G). Affects billing + residency review.
- **[DECIDED — ADR-0017]** Cliniko migration: **Option B (cutover + archive)** chosen. Residency check still needed on Cliniko's hosting region before relying on it as the archive (docs/03 §4).
- **[ops]** L2 bed reservation coupling (auto-reserve on theatre booking vs assign-on-day) and pre-op holding location modelling (docs/01 §E7). Confirm against real clinic flow.
- **[clinical]** Whether any inpatient stay is overnight/multi-day (e.g. post-delivery) or all same-day — determines if the bed model needs a night-census concept (docs/01 §E7).
- **[data]** On-site HL7/DICOM availability for lab analyser + PACS interfaces (docs/01 §G).

## Build log

## 2026-06-13 — Cryostore go-live wiring: clinician-attested death record + thaw re-gate at the API (PR 2.10)
**Shipped (closes the deferred cryostore API-wiring open item from PR 2.7).** Medical Director answered the three exit-gate open items (AMD-0004); actioned the two buildable ones:
- **Vital status = clinician-attested death record (ADR-0021).** New `registry.death_record` (one per person: date of death, attesting clinician, certificate ref). `RegistryService.recordDeath` (restricted `clinical:vital_status.write`, audited, re-attestation rejected), `isPersonLiving`, plus `isCoupleVerified` / `coupleIncludes` accessors. Registry **100%** (forward-only additive migration 0002).
- **Cryostore wired to the app.** Composition root now builds the cryostore `UseGate` from the registry (couple verified + membership + `ownerAlive` from the death record — facts never trusted from the caller) and a `BillingPort` onto `@oxford/billing`. New **cryostore router**: `freeze` / `thaw` / `recordConsent` / `locate` (embryology domain) and `raiseAnnualCharge` / `advanceEngagement` (financial domain), all MFA-gated.
- **Storage period (ADR-0022):** annual while fees paid; MOH regulations otherwise — already implemented via configurable consent expiry + the never-auto-destroy non-engagement pathway. "Cryo storage max period" legal-confirm **resolved in principle** (only the numeric MOH ceiling remains, as config).
**Adversarial review (no-posthumous-use, end-to-end through the API on real Postgres) — all pass:**
- **A1:** owner with an **attested death record** → thaw **BLOCKED** (`posthumous_blocked`); specimen stays stored. *(The gate is now driven by the real registry death record, not a stub.)*
- **A2:** person-owned specimen thawed into a couple that **excludes the owner** → **BLOCKED** (`owner_not_in_couple`).
- **A3 (RBAC):** a reception role can neither **attest a death** nor **thaw** → **FORBIDDEN**.
- **A4:** the legitimate thaw (living owner, verified couple incl. them) → **flows**.
**Full suite green** (registry 100%; api 14 e2e/integration tests; 23 packages).
**Open / needs product owner:** specimen disposition on **marital-status change** and permitted **PGT indications** (clinic counsel); the numeric **MOH storage ceiling** (config when confirmed); CooperSurgical RI Witness scoping (MD emailing); om-software read access (stim calculator port + per-tool migrations).
**Next:** still HOLD on Phase 3 pending the Phase 2 exit-gate sign-off.

## 2026-06-13 — Phase 2 closeout: complete antagonist-ICSI cycle e2e + exit gate (PR 2.9)
**Shipped:** a cross-cutting **end-to-end e2e** (`apps/api/src/phase2-icsi-cycle.e2e.test.ts`) that runs a **complete antagonist ICSI cycle through the whole Phase 2 stack against a real Postgres**, with no external spreadsheet — proving the exit-gate invariants in one flow:
- **identity:** ICSI cycle creation **blocked before marriage verification** (`registry.marriage.unverified`), allowed after;
- **consent gate + lifecycle:** advancing out of `planned` blocked until ICSI consents signed; then the full status lifecycle planned→stimulating→triggered→retrieval→fertilisation→culture→transfer→luteal→outcome;
- **stim:** formulary-validated antagonist day (rFSH + GnRH antagonist);
- **monitoring:** trigger decision auto-schedules the retrieval procedure;
- **embryology:** oocyte → ICSI → 2PN → embryo → Gardner grading;
- **witnessing gate (THE exit-gate invariant):** the embryo **transfer is BLOCKED** (`witnessing.sign_off.blocked`) until RI Witness reconciles the ICSI handling event, then **flows once matched**;
- **outcome continuum:** β-hCG positive → clinical pregnancy → live birth; **Vienna KPI inputs** all captured;
- **traceability + integrity:** the embryo's **life history reconstructs**, and the **audit hash-chain verifies intact** after the whole cycle.
Wiring: added `@oxford/fertility` (cycle/stim/monitoring) to the api test surface, composed with the already-wired registry/embryology/witnessing/outcomes services on one audit+event chain. **Full suite green** (api 13 e2e/integration tests; workspace 23 packages, all 100% on their domains).
**Phase 2 exit-gate report delivered; HOLD for Medical Director sign-off before Phase 3.**
**Open / needs product owner:** none new (vital-status source, legal confirms, CooperSurgical scoping, om-software access all tracked above — they gate cutover, not the build).
**Next:** await sign-off, then propose Phase 3 (theatres, perioperative journey & beds).

## 2026-06-13 — Outcome tracking: the fertility → pregnancy → live-birth continuum (PR 2.8)
**Shipped:** new **`@oxford/outcomes`** domain module (docs/01 §E3 outcome stage; reporting line 229). Captures the continuum **linked back to the originating cycle**: **β-hCG pregnancy test** (positive/negative against a configurable threshold, default 25 mIU/mL; value validated), **clinical-pregnancy assessment** (gestational sacs / fetal heartbeats; clinical pregnancy = ≥1 sac vs biochemical-only), and the **terminal pregnancy outcome** (live_birth / miscarriage / ectopic / stillbirth / termination / ongoing; a live birth requires a count ≥ 1). `outcomeForCycle` reconstructs the continuum; `kpiInputs` derives the **Vienna-consensus KPI inputs** (biochemical / clinical pregnancy / live birth / ongoing) — KPI *computation* is Phase 5, the *inputs are captured now*. App wiring: `OutcomesService` in the composition root; MFA-gated `outcomes` router (`recordTest`/`recordAssessment`/`recordOutcome`/`summary`) under the **clinical** permission domain. **100% coverage** (outcomes 12 tests; +3 API e2e).
**Review (RBAC + continuum integrity) — through the API on real Postgres, all pass:**
- **RBAC:** a reception (scheduling) role recording a clinical outcome → **FORBIDDEN**.
- **Continuum:** test → clinical assessment → live birth records and **reconstructs linked to the cycle**, with correct KPI inputs.
- **Validation:** a live birth recorded without a count → **rejected**.
**Open / needs product owner:** none new.
**Next:** PR 2.9 — Phase 2 closeout: a full **antagonist ICSI cycle end-to-end** e2e (cycle → stim → trigger → retrieval → fertilisation → embryo → witnessed transfer → outcome) proving the exit gate, then the Phase 2 exit-gate report + HOLD.

## 2026-06-13 — Cryostore (topology + custody + thaw re-gate + AMD-0003 billing) (PR 2.7)
**Shipped:** new **`@oxford/cryostore`** domain module (docs/01 §E6; ADR-0015/AMD-0002 ownership; AMD-0003 billing). Addressable **tank → canister → cane → position** topology with occupancy enforcement; **`CryoSpecimen.owner` = person OR couple**; **witnessed, audited chain-of-custody** (freeze/move/thaw/discard each register a handling event via the WitnessPort seam); "**locate any specimen**" + "**list everything for an owner**"; **consent-to-store + storage-expiry/renewal alerts** (legal max period is configuration, not hardcoded). Two hard invariants enforced as pure, 100%-tested logic:
- **Thaw-for-treatment re-gate** (`assertThawForTreatmentAllowed`): a person-owned specimen may be thawed for treatment only into a **verified couple that includes the living owner**, using **own gametes**; **no posthumous-use pathway**; a couple-owned specimen cannot be used by another couple. Single chokepoint, no override.
- **Non-engagement pathway (AMD-0003)**: a graduated state machine `current → reminded → overdue → in_legal_review` (+ `renew_paid` → current from any state). There is **no state or action that destroys** a specimen — terminal disposition is a reviewed human step, bounded by the pending legal confirms. Annual storage charge raised via the **BillingPort** seam (money math stays in `@oxford/billing`).
Tank monitoring log + threshold alerts. **100% coverage** (31 tests).
**Adversarial review (identity + money + gametes/embryos) — real Postgres + real WitnessingService, all pass:**
- **A1** person-owned → couple excluding owner: **BLOCKED** (`owner_not_in_couple`); specimen stays stored.
- **A2** posthumous use: **BLOCKED** (`posthumous_blocked`).
- **A3** couple-owned used by another couple: **BLOCKED** (`couple_mismatch`).
- **A4** non-engagement escalates to legal review with the specimen **STILL stored** — never auto-destroyed.
- **A5** legitimate thaw flows once the re-gate passes, and the thaw is a witnessed custody event.
**Open / needs product owner (NEW — gates person-owned thaw at the API, not the build):**
- **[identity/law] No vital-status (death-record) source exists** in the registry yet. The no-posthumous-use gate requires an authoritative `ownerAlive` fact; until a death-record source is added I will **not** wire a permissive `ownerAlive=true` default. Person-owned thaw therefore stays **module-only** (invariant proven at the service level) and is **not exposed via the API** in this PR.
- **[wiring] Registry must expose couple-membership + vital-status accessors** for the app `UseGate` adapter; cryostore composition-root + router wiring deferred until then (mirrors how `@oxford/witnessing` shipped as a seam before its consumers wired it).
- Still bounded by the pending legal confirms: storage max period, marital-status-change disposition (built configurable; cutover blocked).
**Next:** PR 2.8 — outcome tracking (cycle → pregnancy → live birth, linked back to the originating cycle — the continuum).

## 2026-06-13 — Andrology (WHO 6th-ed semen analysis + witnessed sperm freeze) (PR 2.6)
**Shipped:** new **`@oxford/andrology`** domain module (docs/01 §E5). **Semen analysis flagged to WHO 6th-edition (2021) lower reference limits** — volume 1.4 mL, concentration 16 M/mL, total count 39 M, progressive motility 30%, total motility 42%, normal morphology 4%, vitality 54% — limits are **configuration** (the WHO 6th constant is the default; a clinic may pass its own), inclusive lower bounds, with per-parameter `normal`/`below_reference` flags + `allWithinReference`; inputs validated (no negatives, percentages 0–100). **Sperm preparation** record (method/output), **witnessed sperm freeze** with a cryostore link (`cryoSpecimenRef`, registered as a handling event via the `WitnessPort` seam for RI reconciliation), and **surgical retrieval** (TESA/TESE/PESA, theatre-linked). App wiring: `AndrologyService` in the composition root (shares the witnessing seam); andrology router `recordSemenAnalysis`/`recordFreeze` (MFA-gated, embryology permission domain). **100% coverage** (andrology 14 tests; +3 API e2e).
**Adversarial review (WHO flag integrity + witnessed-freeze provenance) — all pass:**
- **WHO boundary (pure):** every parameter exactly **at** its limit flags `normal`; **one step below** flags `below_reference` — no off-by-one that could mask an oligo/astheno/terato diagnosis.
- **Freeze provenance (real Postgres + real WitnessingService):** an RI-confirmed freeze reconciles **matched**; a divergent RI record (different patient) reconciles **divergent / patient_mismatch** (never silently "witnessed") and **blocks sign-off**.
- **RBAC (API):** a clinical-domain role recording andrology lab data → **FORBIDDEN** (lab data is the embryology permission domain).
**Open / needs product owner:** none new. (DNA-fragmentation / advanced sperm tests are P1 — deferred; om-software semen-analysis migration (E5) still gated on om-software access, tracked above.)
**Next:** PR 2.7 — cryostore (tank topology + witnessed chain-of-custody + consent/storage-expiry alerts + **AMD-0003** annual storage billing & non-engagement pathway + thaw-for-treatment re-gate invariant); adversarial review (identity/ownership + money).

## 2026-06-13 — Embryology (IVF lab) + witnessing gate wired into terminal acts (PR 2.5)
**Shipped:** new **`@oxford/embryology`** domain module (docs/01 §E4). Records the lab chain — **oocyte** (count/maturity MII·MI·GV·degenerate/dish/position, linked to retrieval), **insemination/ICSI** (method/operator/sperm-source, a witnessed handling event), **fertilisation check** (0PN/1PN/2PN/3PN — only **2PN** creates a culture embryo; abnormal PN never silently becomes a transferable embryo), **culture grading** (day-by-day morphology + **Gardner** blastocyst grade, validated 1–6 / A–C), **disposition** (freeze/discard/PGT-biopsy) and **embryo transfer** (count/catheter/difficulty/US-guidance) — each audited + event-emitting, and **embryo life-history reconstruction** (oocyte → checks → gradings → dispositions). Integrates witnessing through a **`WitnessPort` seam** (dependency-inverted; wired to `@oxford/witnessing` in the app — embryology never witnesses). **The terminal acts (transfer, disposition) are BLOCKED unless the cycle's handling chain reconciles `matched` with RI Witness** — the E4 acceptance invariant, enforced at the domain level (no override). App wiring: `WitnessingService`+`EmbryologyService` in the composition root (RI stub provider per ADR-0018); embryology router gains MFA-gated `recordInsemination`/`recordTransfer`/`recordDisposition`. **100% coverage** (embryology 18 tests; +4 API e2e).
**Adversarial review (embryology RBAC + witnessing) — through the tRPC API on real Postgres, all pass:**
- **RBAC:** a clinical-domain role calling `embryology.read`/`recordInsemination` → **FORBIDDEN** (deny-by-default; embryology is its own permission domain).
- **Witnessing A1:** transfer attempted while RI has not confirmed the insemination → **PRECONDITION_FAILED** (blocked, not recorded).
- **Witnessing A2:** divergent RI record (different patient) after ingest → transfer **BLOCKED**.
- **Legit path:** RI confirms the matching handling record → transfer **succeeds** (count returned).
- Package-level: same three proofs against real Postgres with the real `WitnessingService` wired as the port.
**Open / needs product owner:** none new. (PGT order/result, lab QC log, time-lapse morphokinetics are P1/P2 — deferred behind the vendor-neutral seam, ADR-0019; om-software embryo-follow-up migration (E4) still gated on om-software access, tracked above.)
**Next:** PR 2.6 — andrology (WHO 6th-ed semen analysis + sperm prep/freeze with witnessing); adversarial review (andrology).

## 2026-06-13 — Witnessing seam + RI reconciliation + blocking sign-off (PR 2.4)
**Shipped:** new **`@oxford/witnessing`** platform package (the RI-Witness reconciliation seam, CLAUDE.md hard rule + ADR-0018). RI Witness (RFID) stays **authoritative**; Oxford never witnesses. The package: records the **handling events** Oxford observed and **pushes demographics out** (Oxford = demographic master); ingests RI records **back** behind a `WitnessingProvider`/`RiWitnessStubProvider` adapter (no real device, no PHI); maintains an **append-only reconciliation ledger** (`matched` / `pending_sync` / `divergent`, with non-PHI reasons `no_ri_record`/`ri_flagged_mismatch`/`patient_mismatch`/`sample_mismatch`/`orphan_ri_record`); and **blocks cycle-step sign-off on ANY non-matched event** via `assertCycleStepSignOff`. Pure core (`reconcile.ts`) + service + in-memory & Postgres stores + Drizzle schema/migration. **No competing witness UI; structurally no override path** (`assertSignOffAllowed` takes only the ledger — no force flag/branch can flip a divergent event to matched). **100% coverage** (26 tests). Sign-off enforcement is wired into the cycle-step flow in PR 2.5 (embryology).
**Adversarial review (witnessing) — run against real Postgres, all pass:**
- **A1 pending:** RI not yet confirmed → sign-off **BLOCKED** (`witnessing.sign_off.blocked`).
- **A2 wrong patient:** RI reports a different patient → `patient_mismatch` divergent → **BLOCKED**.
- **A3 RI mismatch flag:** RI electronically flagged mismatch → divergent → **BLOCKED**.
- **A4 orphan:** RI witnessed a handling Oxford never recorded → `orphan_ri_record` divergent → **BLOCKED**.
- **A5 override attempt:** no API path forces "matched"; only a genuine RI confirmation flips a step to matched → then **ALLOWED**.
**Open / needs product owner:** none new (real `RiWitnessProvider` wiring still gated on CooperSurgical scoping per ADR-0018, already tracked above).
**Next:** PR 2.5 — embryology (development tracking + grading), wiring `assertCycleStepSignOff` into lab-step sign-off; adversarial review (embryology RBAC).

## 2026-06-13 — Monitoring-visit workflow + trigger calculator + procedures (PR 2.3)
**Shipped:** `@oxford/fertility` monitoring — `MonitoringService.recordVisit` (clinician decision continue/adjust/**trigger**/cancel; audited + event), the **trigger-timing calculator** (`computeRetrievalTime` = trigger + 36h default, configurable; `countdownHours`) — a `trigger` decision **auto-creates the retrieval `Procedure`** at the computed time; `scheduleProcedure` + `linkTheatreBooking` (the theatre slot itself is booked in the app layer via scheduling — logical `theatreBookingRef`). Drizzle schema + migration; Postgres store, integration-tested. **100% coverage** (35 tests).
**Open / needs product owner:** none new.
**Next:** PR 2.4 — **witnessing seam + reconciliation** (WitnessingProvider stub per ADR-0018; blocking-on-divergence; 100%; no competing witness UI); adversarial review (witnessing).

## 2026-06-13 — om-software replacement strategy + map (ADR-0020, docs/07)
**Shipped (docs):** **ADR-0020** — the EMR **replaces** the om-software first-gen tools **tool-by-tool, never big-bang**: (1) parallel-run gate per tool, (2) no decommission without proven data migration (+ reconciliation report; "history never lost" holds), (3) map-don't-fork (reimplement on the EMR foundation, don't copy HTML/Flask/SQLite). New **docs/07** replacement map (each tool → target module → data to migrate → phase → parallel-run/decommission gate). docs/01 §E note; docs/05 Phase 2 gains per-tool migration sequencing (embryo follow-up→E4, semen-analysis→E5, Document Ledger/HTML tools→E2/E0; Cliniko patient-context→E1 already Phase 1). Phase 0/1 plan unchanged.
**Open / needs product owner:** om-software **retirement order** + **archive-vs-migrate per tool**; **om-software read access** for field-level mapping (and the stim dosing-calculator port).
**Next:** PR 2.3 — monitoring-visit workflow + trigger calculator + procedure scheduling.

## 2026-06-13 — Stimulation charting + controlled formulary (PR 2.2)
**Shipped:** `@oxford/fertility` stimulation charting — controlled **formulary** of stim drugs (no free-text prescribing; bilingual; fixed unit per item), `StimulationDay` (day-by-day grid: formulary drug doses, per-ovary follicle measurements, endometrium, endocrine E2/LH/P4/FSH), `StimulationService.recordDay` (validates every drug against the formulary + positive dose + matching unit; audited; upserts per day) and `chart` (ordered, for trend). Drizzle schema + migration; Postgres store, integration-tested. **100% coverage** (the dose-affecting validation logic) (26 tests total).
**Drug-dose decision (Medical Director):** **follitropin-delta is NOT used in Kuwait — dropped.** Stimulation **dosing calculator** is to be ported from the **om-software** tool/logic. **I cannot access `om-software` from this session** (scope = psn-github/emr only), so I did **not** invent a dosing algorithm. This PR ships the safe part — controlled formulary + clinician-entered dose **validation** (no free text, positive, unit-matched) + the chart. The dosing **calculator** is deferred.
**Adversarial self-review (drugs):** `[validate]` free-text/unknown drug → REJECTED (`fertility.stim.unknown_drug`); non-positive dose → REJECTED; unit mismatch → REJECTED. No invented dose maths shipped.
**Open / needs product owner [assigned: PO/MD]:** **provide om-software access (or the stim dosing-tool logic/spec)** so I can port the stimulation **dosing calculator** faithfully (the formulary + manual-entry validation are in place; only the auto-calculator is pending).
**Next:** PR 2.3 — monitoring-visit workflow + trigger calculator + procedure scheduling (retrieval/transfer into the theatre calendar).

## 2026-06-13 — Cycle engine + protocol library + consent gating (PR 2.1)
**Shipped:** `@oxford/fertility` — `Cycle` (IUI/IVF/ICSI/FET/IVM/preservation/ovulation-induction) with **couple-scoped treatment vs person-scoped preservation** owner; status lifecycle (planned→…→outcome, + preservation's retrieval→outcome, + cancel); protocol library (config seed); **per-cycle consent gating** (progression out of `planned` blocked until required consents signed). `CycleService` (createTreatmentCycle/createPreservationCycle/recordConsent/advanceStatus/cancel), all audited + events. The **marriage hard-gate** is enforced via an injected `FertilityGate` seam (wired to `registry.canStartFertility` in the app layer — keeps `fertility` decoupled from `registry`). Drizzle schema + migration; Postgres store, integration-tested. **100% coverage** (17 tests).
**Adversarial self-review (identity / Kuwaiti law):** `[attack] ICSI cycle, unverified couple → REJECTED (registry.marriage.unverified)`; preservation cycle for a single person → CREATED (person-scoped). The gate holds at cycle creation; preservation is the only person-scoped path (ADR-0015/AMD-0002).
**Open / needs product owner:** none new.
**Next:** PR 2.2 — stimulation charting + drug-dose (formulary-driven; follitropin-delta weight/AMH algorithm; HP-hMG); adversarial review (drug-dose, 100%).

## 2026-06-13 — Phase 2 kickoff: spec/data-model alignment + decisions (PR 2.0)
**Shipped (docs):** folded AMD-0002 into docs/01 §E3 (fertility-preservation = the only person-scoped cycle type; treatment cycles couple-gated), §E6 (`CryoSpecimen.owner` = person_id OR couple_id; thaw-for-treatment invariant; no posthumous use; **annual storage billing + non-engagement pathway elevated to Phase 2 P0**), and docs/04 (Cycle/CryoSpecimen glossary).
**Decisions:** **ADR-0018** RI Witness — build reconciliation + blocking-on-divergence behind a `WitnessingProvider` stub now; real `RiWitnessProvider` wired after CooperSurgical scoping + RI-server residency review (PO initiating scoping). **ADR-0019** time-lapse — none deployed; vendor-neutral morphokinetic import seam only. **AMD-0003** annual cryostorage billing + graduated non-engagement/non-payment pathway (reminders → overdue → clinical/legal review; never auto-destroy), build in PR 2.7.
**Open / needs product owner (BLOCK cryostore/PGT cutover, not the build — all built configurable):** [legal] cryo storage max period + consent-renewal cadence; [legal] marital-status-change specimen disposition; [legal] permitted PGT indications — all **deferred to clinic legal counsel**. [integration] CooperSurgical RI Witness scoping (PO). [clinical] time-lapse platform if/when acquired.
**Next:** PR 2.1 — cycle engine + protocol library + per-cycle consent gating (marriage gate at treatment-cycle creation; preservation person-scoped); adversarial review (identity).

## 2026-06-13 — Phase 1 closeout: full outpatient-day e2e (PR 1.8)
**Shipped:** the remaining tRPC surface — staff `scheduling.book`, `clinical.*` (encounter / note / order / e-signed letter, MFA-gated) and `billing.*` (invoice / payment, MFA-gated) — all behind the deny-by-default auth middleware; clinical service wired into the composition root. **The Phase 1 exit-gate e2e**: a full simulated outpatient day through the API against real Postgres — register → **book → remind → check-in → consult/note → order → letter → invoice → pay** — ending paid, on the flow board, audit-chain verified; plus a deny-by-default check (reception cannot write clinical notes or post payments). **232 tests, all gates green.**
**Decisions:** none new.
**Open / needs product owner:** thin REST/FHIR surface + real HTTP server + the actual web/portal UIs are layered on next (Phase 1 had no UI requirement beyond portal booking; the React app is Phase 6 foundations). Parallel-run reconciliation uses the generic `reconcile` engine (PR 1.7).
**Next:** await go-ahead, then propose Phase 2 (Fertility EMR & IVF laboratory) — including the AMD-0002 person-scoped preservation cycle + cryostore thaw-for-treatment invariant + RI Witness integration.

## 2026-06-13 — Cliniko migration tooling — Option B cutover + reconciliation (PR 1.7)
**Shipped:** `@oxford/migration` (leaf package — pure shapes, no domain imports): Cliniko export model, **active-slice** filters (non-archived patients, open-balance invoices), pure mappers (bilingual name fallback), a generic **reconciliation** engine (`clean` = every source record imported, nothing extra = "zero unexplained discrepancies"), and an idempotency **`ImportLedger`** (in-memory + Postgres) making the migration **re-runnable**. Schema + migration `0001_migration` (the ledger). **100% coverage** (8 tests). App-layer `ClinikoMigrationRunner` (`apps/api`) orchestrates the import into registry (patients) + billing (open balances), audited; cross-cutting e2e against real Postgres.
**Adversarial self-review (migration PHI):** import is **idempotent** (re-run → person count stays 2, no duplicates); `[attack] invoice for non-migrated patient → reconciliation: FLAGGED (missing i9)`; `[attack] migrated civil_id at rest: v1.…` (AES-GCM envelope, **no plaintext**). Cliniko stays the read-only archive (ADR-0017).
**Open / needs product owner:** appointment import reuses the same runner/ledger/reconcile pattern (mappers ready) — wired when the historical/active appointment scope is confirmed; **Cliniko hosting-region residency check** before relying on it as the archive (ADR-0017).
**Next:** PR 1.8 — Phase 1 closeout: the full simulated outpatient day e2e (book → remind → check-in → consult/note → order → letter → invoice → pay) + parallel-run reconciliation = the Phase 1 exit gate.

## 2026-06-13 — Portal booking + bilingual reminders + check-in (PR 1.6)
**Shipped (app layer, `apps/api`):** patient self-service **booking** via tRPC (`portal.book`) — orchestrates scheduling, **scoped to the patient's own record** (`assertOwnData`); **bilingual reminders** (`reminders.ts`: plan at T-48h/T-3h, idempotent due-selection, dispatch via the **stubbed** notification provider — discreet template, no clinical content); front-desk **check-in** (`flow.checkIn`) advancing the appointment and placing the patient on the flow board. Wired scheduling/facility/flow/notifications into the composition root; added a `PatientPrincipal` + `patientProcedure` to the tRPC layer. Orchestration lives in the app layer because it spans domain modules (boundaries forbid domain→domain). Cross-cutting e2e (real Postgres): book → reminder → check-in onto the board.
**Adversarial self-review (patient identity/access):** `[attack] patient pat-1 → pat-2 data: DENIED` (own-data only); proven again via the API (`portal.book` for another patient → FORBIDDEN). Reminders carry no clinical content (asserted).
**Changed:** `apps/api` vitest `fileParallelism:false` (e2e files share Postgres). No new migrations (app-layer).
**Open / needs product owner:** the full patient app UI is Phase 6; deposit-to-book payment hook lands with the portal app. Reminder cadence is configurable (default T-48h/T-3h).
**Next:** PR 1.7 — Cliniko migration tooling (Option B: active-slice cutover + reconciliation report); adversarial review (migration PHI).

## 2026-06-13 — Basic invoicing & payments (PR 1.5)
**Shipped:** `@oxford/billing` — money as **integer fils** (1 KWD = 1000 fils; no float drift), pure `money` math (line/subtotal/tax-bps/total/balance/format) at **100%**; `Invoice` (bilingual lines, Kuwait tax-rate field defaulting 0) + `Payment` (cash/card/knet) with receipts; `BillingService.createInvoice/totals/postPayment` — partial payments, marks paid at zero balance, **rejects overpayment / zero / non-integer amounts / already-paid**. Drizzle schema + migration; Postgres-backed store (exact fils round-trip), integration-tested. Packages/instalments/KNET-gateway/refunds/discounts are Phase 5. **100% coverage** (13 tests).
**Adversarial self-review (money):** `[attack] reception → financial:payment.post: DENIED`; financial role also requires **MFA**; `[attack] pay 10001 against 10000 balance: REJECTED`; money is exact integer fils (no float drift across many small lines).
**Open / needs product owner:** none new.
**Next:** PR 1.6 — patient-portal booking + bilingual reminders (wired to the stubbed notification provider) + check-in; adversarial review (patient identity/access).

## 2026-06-13 — Clinical EMR core (PR 1.4)
**Shipped:** `@oxford/clinical` — `Encounter` (O&G types), **append-only versioned `ClinicalNote`** (amendments add a version, never overwrite; full history retained), ordering (`Order` lab/imaging/referral, status-tracked) + **results inbox** (`Result` with abnormal flag, acknowledge/action loop), and **bilingual letters** (draft → e-sign). `ClinicalService` ties it together; every mutation audited + emits events. Drizzle schema + migration `0001_clinical.sql`; Postgres-backed `PgClinicalStore` (note version history persisted as jsonb), integration-tested. **100% coverage** (11 tests). Problem list / coded allergies / meds / obstetric history are captured as structured note-body fields for now; dedicated coded entities are a documented Phase-1 follow-on.
**Adversarial self-review (clinical PHI):** `[attack] reception → clinical:note.read: DENIED`; clinical reads also require **MFA** (`auth.mfa_required`) even with the permission; and an amendment **cannot erase the original** — `[attack] amend keeps original v1` proven (v1 body intact, amendment attributed to its author). Deny-by-default + append-only both hold.
**Open / needs product owner:** none new.
**Next:** PR 1.5 — basic invoicing & payments (charge capture → invoice → payment/receipt); adversarial review (money), 100% on money logic.

## 2026-06-13 — Live patient-flow & bed board (PR 1.3)
**Shipped:** extended `@oxford/facility` with the flow board (docs/02 §2: facility owns patient-flow/location). `PatientLocation` (current whereabouts) + append-only `LocationMovement` history; `FlowService.moveTo` (admit/transfer, **capacity-safe** bed allocation via the audited bed-status machine — a bed must be FREE before allocation, so no double-occupancy), `discharge` (frees the bed), `currentLocation`, `movements` (the patient's journey), and `board()` (per-location patients + bed occupancy + per-level capacity — **location/status only, no clinical content**). Drizzle schema + migration `0002_facility_flow.sql`; Postgres-backed `PgFlowStore` (integration-tested). **100% coverage** (20 tests).
**Adversarial self-review (PHI location):** `[attack] no-permission user → flow board: DENIED`; reception (`scheduling:*`) allowed. The board is structurally clinical-free (asserted: serialized board has no note/result/diagnosis/cycle/embryo/medication vocabulary; entries carry only `{patientId, status, bedId}`).
**Changed:** CI test step now runs packages serially (`--workspace-concurrency=1`) and facility uses `fileParallelism:false` — integration tests share one Postgres, so this removes DB races (a real bug this caught: double-booked bed + a seed/truncate race).
**Open / needs product owner:** none new.
**Next:** PR 1.4 — clinical EMR core (versioned notes, results inbox, bilingual letters, ordering); adversarial review (clinical PHI).

## 2026-06-13 — Scheduling: resources, appointment types, conflict detection (PR 1.2)
**Shipped:** `@oxford/scheduling` — bookable `Resource`s across all 4 levels (practitioner/room/scanner/theatre/equipment; rooms carry a logical `locationRef` into facility, no cross-module import); `AppointmentType` as config (duration, required resource kinds); multi-resource **conflict detection** (half-open interval overlap on shared resources); appointment lifecycle (booked→checked_in→in_progress→completed, plus cancel + **no-show capture**); `SchedulingService.book/checkIn/start/complete/cancel/markNoShow` — all audited + emit events; instants normalised to canonical ISO so conflict math is identical in-memory and in Postgres. Drizzle schema + migration; Postgres-backed store (jsonb `resource_ids` conflict query, integration-tested). **100% coverage** (20 tests).
**Adversarial self-review (PHI access):** appointments carry `patientId` (PHI). `[attack] clinical-only role → scheduling:appointment.read: DENIED`; reception (`scheduling:*`) allowed. Deny-by-default holds for the new domain; route-level enforcement wired when the scheduling routes are added.
**Open / needs product owner:** none new.
**Next:** PR 1.3 — live patient-flow & bed board (PatientLocation/LocationMovement/BedAllocation; reception sees location/status only); adversarial review (PHI location).

## 2026-06-13 — Phase 1 kickoff: facility/building model (PR 1.1)
**Shipped:** `@oxford/facility` — the four-level building as addressable locations (`Floor`/`LocationNode`/`Bed`) with bilingual config names; bed-status state machine (free/occupied/cleaning/blocked with legal transitions); `FacilityService.setBedStatus` (audited + emits `BedStatusChanged` for the flow board); `seedFacility` builds the real layout (Ground pharmacy; L1 2 theatres + 3 recovery beds; L2 6 inpatient beds; L3 4 consult + 2 scan rooms + IVF lab = **9 beds, 19 locations**); Drizzle schema + forward-only migration; Postgres-backed store (integration-tested). **100% coverage** on domain logic.
**Decisions:** **ADR-0017** Cliniko migration = Option B (cutover + archive). Phase 1 approved by product owner.
**Open / needs product owner:** Cliniko archive residency check (ADR-0017).
**Next:** PR 1.2 — scheduling (bookable resources across all levels, appointment types as config, conflict detection, waitlist/cancellation/no-show); adversarial review (PHI access).

## 2026-06-12 — Phase 0 closeout: integration wiring + cross-cutting e2e (PR 0.7)
**Shipped:** `apps/api` composition — Postgres pool + **forward-only migration runner** (`runMigrations` applies every `packages/*/migrations/*.sql` once, recorded in `_meta.migrations`) + `migrate` CLI; `buildServices` wiring the **Postgres-backed** AuditLog (`PgAuditChainStore`) + RegistryService (`PgRegistryStore` + `LocalKeyProvider`) + Authorizer + i18n; **tRPC API behind the deny-by-default auth middleware** (`protectedProcedure(permission)` runs the Authorizer, audits denials) with `registry.*`, `fertility.startIntake` (the marriage gate at the API), and `embryology.read`; **chain-integrity scheduler** (`IntervalScheduler` + `chainIntegrityJob` — the seam; BullMQ/Redis is the production transport, ADR-0010); **`scripts/check-migrations-safe.mjs` + `Makefile`** — the destructive-migration guard `deploy.yml` invokes (`make check-migrations-safe`), now also a CI step.
**Cross-cutting e2e (real Postgres, through the tRPC API):** in one flow — no-permission user denied + wrong-domain role denied; **fertility blocked without a verified marriage, allowed after** (the gate at the API, not the UI); audit chain records every mutation + denial and **verifies intact**; bilingual catalog complete (zero untranslated) + Arabic RTL. 149 tests green across the workspace.
**Changed:** `apps/api` now depends on the domain/platform modules + `@trpc/server` + `pg`; CI gains a Migration-safety step.
**Decisions:** implements ADR-0009 (tRPC surface) + ADR-0010 (scheduler seam).
**Open / needs product owner:** thin REST/FHIR surface + real HTTP server + BullMQ transport + Postgres-backed domain-event store are the next increments (Phase 1 foundations); no PHI until the residency review (ADR-0006/0007/0014).
**Next:** await go-ahead, then propose Phase 1 (Cliniko parity).

## 2026-06-12 — Notification service (provider-abstracted, bilingual, discreet) (PR 0.6)
**Shipped:** `@oxford/notifications` — `NotificationService` renders templated, **bilingual** messages from the i18n catalog (no hardcoded strings; previews **discreet** — no clinically explicit content, docs/03 §5), sends via a pluggable `NotificationProvider` (SMS/WhatsApp/email; `RecordingNotificationProvider` for dev — real providers residency-reviewed before wiring), and audit-logs each dispatch as a `NotificationEvent` with **metadata only — never the recipient or rendered body** (no PHI in logs). Bilingual `notificationMessages` seed (en/ar at parity); Drizzle `notifications` schema. **100% coverage** (6 tests), CI-enforced.
**Changed:** none to existing modules.
**Changed (templates):** seeded the 7-template starter set (bilingual en/ar, all discreet — no IVF/embryo or clinical values in any preview): appointment.reminder (T-48h/T-3h), monitoring.next_step, results.ready, payment.due, discharge.prescription_ready, consent.awaiting_signature, message.secure. A test scans every body in both locales for forbidden terms.
**Decisions:** implements PRD E0 notification requirement under ADR-0006 residency posture (provider abstraction).
**Open / needs product owner [assigned: PO]:** (1) **refine the template copy, especially the Khaleeji Arabic wording**, before go-live — current wording is placeholder. (2) real SMS/WhatsApp/email providers need a residency review (docs/03 §4) before any is wired.
**Next (Phase 0 closeout):** integration wiring — Postgres-backed stores + Drizzle migrations (incl. the advisory-lock audit append), tRPC/REST routes behind the auth middleware, the BullMQ chain-integrity cron, and the cross-cutting **e2e** proving the exit gate (no-permission user sees nothing; audit chain verified; RTL flip with zero untranslated strings; marriage gate blocks fertility server-side; CI green).

## 2026-06-12 — Versioned, access-controlled, OCR-indexed document store (PR 0.5)
**Shipped:** `@oxford/documents` — `DocumentService` with append-only versioning (consent forms, ID scans, marriage certificates, external reports), `OcrProvider` seam (+ `NoopOcrProvider`) feeding a searchable index, and an `AccessGuard` seam so reads are RBAC-gated **without** documents depending on the identity module (platform→domain forbidden). create / addVersion / access (audited READ_EXPORT, denial not audited as a read — the Authorizer audits it) / softDelete / search (OCR text, access-filtered). Blobs live in encrypted in-region storage — only refs are stored. **100% coverage** (11 tests), CI-enforced.
**Changed:** Drizzle `documents` schema (document, document_version — append-only versions, soft-delete).
**Decisions:** none new (the OcrProvider follows the seam pattern of ADR-0011/0012; real OCR provider is residency-reviewed before wiring).
**Open / needs product owner:** real OCR provider + object storage are residency-reviewed before wiring (docs/03 §4).
**Next:** PR 0.6 — notification service (SMS/WhatsApp/email, provider-abstracted, bilingual, discreet, audit-logged), then API/DB wiring (Postgres-backed stores, tRPC/REST routes, BullMQ chain-integrity cron) + the e2e proving the exit gate end-to-end.

## 2026-06-12 — Patient & couple registry + marriage-verification HARD GATE (PR 0.4)
**Shipped:** `@oxford/crypto` — `KeyProvider` seam + `LocalKeyProvider` (AES-256-GCM with AAD field-binding; refuses to run in production), so Civil-ID field-level encryption is built/tested now (ADR-0012). `@oxford/registry` — `Person` (Arabic+English names; **Civil ID held only as an encrypted envelope**, plaintext never stored/logged/audited), `Couple` as the first-class clinical unit with **explicit husband/wife → own-gametes-only by construction** (no donor/surrogate field exists — ADR-0005), `MarriageVerification`, and `assertMayStartFertility` — **THE HARD GATE**, enforced server-side. `RegistryService`: registerPerson / createCouple (validates own-gametes roles) / verifyMarriage / canStartFertility / revealCivilId (audited sensitive export, value never recorded) / mergePersons (audited de-dup with couple-reference repointing). All mutations audited + emit domain events. **100% coverage** (crypto 6 + registry 22 tests), CI-enforced.
**Changed:** added `crypto` to the platform tier in the boundary checker; boundary checker now skips test files (tests may legitimately span modules). Drizzle `registry` schema + forward-only migration `migrations/0001_registry.sql`; **Postgres-backed `PgRegistryStore`** (Civil ID persisted as encrypted envelope only; soft-delete only).
**Decisions:** implements ADR-0005 (donor/surrogacy structurally absent) + ADR-0012 (KeyProvider seam).
**Adversarial self-review (pre-merge, against real Postgres — attacks b, c, d):** actual test output:
- `[attack b] start fertility, NO marriage record → REJECTED (registry.marriage.unverified)`; verified couple → `ALLOWED`. The fertility gate holds at the server-side enforcement path (the API route is a thin wrapper over `canStartFertility`), not the UI.
- `[attack c] raw civil_id_enc at rest: v1.9lo1OEB/EVMVmPnC.g5Da…` · `contains plaintext Civil ID? NO (encrypted)`. Reading the column straight from Postgres yields only the AES-256-GCM envelope; the value is recoverable solely through the audited `revealCivilId` path.
- `[attack d] non-embryology role → embryology:lab.read: DENIED (auth.forbidden)`; embryologist → `ALLOWED`. Deny-by-default holds across permission domains.
- All attacks fail as required; module coverage remains 100% → cleared to merge.
**Open / needs product owner:** the real in-region KMS slots in behind `KeyProvider` after the residency review; marital-status-change → specimen disposition workflow is a docs/03 `[CONFIRM]` item for the cryostore phase (couple `dissolved` status is modelled, the disposition workflow is not — correctly deferred).
**Next:** PR 0.5 — versioned, access-controlled, OCR-indexed document store (consent forms, ID scans, marriage certificates, external reports); then PR 0.6 notifications.

## 2026-06-12 — i18n/RTL framework (en/ar) + design-system foundation (PR 0.3)
**Shipped:** `@oxford/i18n` — `I18n` translator (named-param interpolation; missing key throws rather than shipping an untranslated string), `directionFor`/`isRtl` (Arabic RTL, tested), Intl number + **dual-calendar Gregorian/Hijri (Umm al-Qura)** formatting (ar-KW / en-GB), catalog parity tools (`findMissingKeys`/`assertCatalogComplete`) that guarantee the "zero untranslated strings" exit-gate condition, bilingual `coreMessages` seed (en/ar at parity), Drizzle schema (`i18n`: translation_key, translation — versioned config). `@oxford/ui` — Oxford design tokens (Cormorant Garamond + DM Sans/Inter Tight, palette, spacing) and RTL helpers (`htmlDirAttributes` flips dir/lang; logical→physical side mapping). **100% coverage** (23 tests across both packages), CI-enforced.
**Changed:** none to existing modules.
**Decisions:** implements ADR-0004 (bilingual + RTL from commit one).
**Open / needs product owner:** palette now uses the **canonical om-software `PALETTE.md`** (Satoshi/Plus Jakarta Sans/Geist/Noto Sans Arabic; warm-neutral canvas + teal accent; fixed clinical/drug-class colours; clinical LTR exception) — this **conflicts with docs/02 §2** (Cormorant/DM Sans), logged as **AMD-0001**: confirm docs/02 §2 should be updated to match. React component library + the web shell that sets `<html dir/lang>` land in Phase 1 on this foundation.
**Next:** PR 0.4 — patient & **couple** registry with the **marriage-verification hard gate** (the second gating module; must pass its tests before downstream), Civil-ID field-level encryption via the `KeyProvider` seam (ADR-0012), audited merge tooling.

## 2026-06-12 — Auth (OIDC relying-party seam) + deny-by-default RBAC (PR 0.2)
**Shipped:** `@oxford/identity` — permission model namespaced by domain (clinical/embryology/financial/hr/admin) with `<domain>:<action>` + `<domain>:*` + `*:*` matching; `can()` deny-by-default authorization; `Authorizer` server-side enforcement point (MFA step-up required for clinical/financial by default, configurable) that writes every denial to the audit log; `AuthService` that verifies a token via the OIDC seam, maps claims→staff/roles, and audits LOGIN / LOGIN_FAILED; `OidcProvider` interface + `DevOidcProvider` (refuses to run in production); Drizzle schema (`identity`: staff, role, role_assignment — cross-module refs as logical ids, not DB FKs). **100% coverage** (24 tests), CI-enforced.
**Changed:** security events (LOGIN/LOGIN_FAILED/PERMISSION_DENIED) now flow into the PR 0.1 audit chain. Added non-PHI `scheduling` permission domain; MFA now required by default for all PHI domains (clinical/embryology/financial/hr/admin) via `DEFAULT_MFA_REQUIRED_DOMAINS`, sourced as configuration and injected (not hardcoded).
**Decisions:** ADR-0011 (OIDC RP seam); **ADR-0013** (MFA required for all PHI domains; reception password+device-trust on `scheduling` only, auto-escalates to MFA on any PHI permission; domain→MFA mapping is configuration); **ADR-0014** (Oracle Cloud Kuwait provisional production target + OCI Vault as production KeyProvider — provisional, gated on residency review; host-touching code is config-swappable).
**Open / needs product owner:** [CONFIRM] exact reception capability list (ADR-0013); OCI Kuwait + KMS pending the formal docs/03 residency review and sign-off (ADR-0014) — no real PHI until then.
**Next:** PR 0.3 — i18n/RTL framework (en/ar) + Oxford design-system UI shell; zero hardcoded strings, RTL tested.

## 2026-06-12 — Immutable, hash-chained audit + domain-event subsystem (PR 0.1)
**Shipped:** `@oxford/audit` — generic append-only `HashChainLog` with SHA-256 link hashing over canonical payloads (binds prevHash + seq + occurredAt + payload, so reorder/back-date/edit all break the chain); `AuditLog` (who/what/when/before/after; CREATE/UPDATE/SOFT_DELETE/RESTORE/READ_EXPORT/LOGIN/LOGIN_FAILED/PERMISSION_DENIED) and `DomainEventLog`; `ChainStore` interface + `InMemoryChainStore`; `verifyChain` tamper detector (seq-out-of-order / prev-hash-mismatch / hash-mismatch); `runChainIntegrityCheck` scheduled-job function. **100% coverage** (CI-enforced via the package's own threshold).
**Changed:** Drizzle schema (`audit`: `audit_log`, `domain_event` — append-only, hash-unique, prev-hash linked) + forward-only migration `migrations/0001_audit.sql`; **Postgres-backed `PgAuditChainStore`** with advisory-lock-serialised appends (no UPDATE/DELETE paths).
**Decisions:** no new ADRs (implements ADR-0003); follows ADR-0008 (Drizzle) for the schema.
**Adversarial self-review (pre-merge, against real Postgres — attack a):** actively attacked the audit log at rest in the database, bypassing the app, and confirmed the hash chain catches it. Actual test output:
- `[attack a1] chain intact before attack: true`
- `[attack a1] after tampering with seq 2 → verification: DETECTED (hash-mismatch @ seq 2)` — editing an invoice total directly in `audit.audit_log` is caught.
- `[attack a2] after deleting seq 2 → verification: DETECTED (seq-out-of-order @ seq 3)` — deleting a row to hide it is caught.
- No false positives: a genuinely intact chain still verifies. Pure-logic coverage remains 100%. Attacks fail as required → cleared to merge.
**Open / needs product owner:** none new.
**Next:** PR 0.2 — auth + deny-by-default RBAC (OIDC relying-party seam per ADR-0011), every audit-worthy security event flowing into this log.

## 2026-06-12 — Phase 0 kickoff: monorepo scaffold + locked stack ADRs (PR 0.0)
**Shipped:** pnpm-workspace monorepo (`apps/{api,web,portal}`, `packages/core` + placeholders), TypeScript strict (no `any`), ESLint flat config, Prettier, Vitest workspace; `@oxford/core` shared primitives (Result, typed AppError, branded ids, injectable Clock, canonical JSON for audit hashing) at **100% coverage**; deterministic module-boundary checker (`scripts/check-boundaries.mjs`) and dependency-free secret scan (`scripts/secret-scan.mjs`); CI activated (`pnpm -r typecheck/lint/test/build` + module-boundaries + secret-scan now run for real, no longer a no-op).
**Changed:** no DB/schema yet (Drizzle migrations land with the audit module). `.github/workflows/ci.yml` gained Module-boundaries + real secret-scan steps.
**Decisions:** ADR-0008 Drizzle (forward-only, reviewable migrations as a data-safety control); ADR-0009 tRPC + thin versioned REST/FHIR surface; ADR-0010 Redis + BullMQ; ADR-0011 self-hosted OIDC behind an OIDC-standard relying-party seam (managed in-region IdP swappable later; leaning Oracle Cloud Kuwait); ADR-0012 `KeyProvider` seam so Civil-ID field-level encryption is built/tested now with the real in-region KMS slotted in after the residency review.
**Open / needs product owner:** residency review (ADR-0006/0007) still gates the real IdP + KMS + Redis/Postgres hosting choice — building behind interfaces so it doesn't block; in-region production host selection (Oracle Cloud Kuwait leaning) outstanding.
**Next:** PR 0.1 — immutable, hash-chained audit/event subsystem (must pass its tests, incl. a chain-integrity verifier, before any downstream module builds on it).

_(first entry above this line; newest on top going forward)_
