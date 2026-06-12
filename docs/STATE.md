# STATE — Oxford HIS build journal

> Living file. Claude Code updates this **every session**: what was built, what changed, what's open. Newest entry at the top. This is the first thing to read when starting a session.

## Current status
- **Phase:** Pre–Phase 0 (specification complete; build not yet started).
- **Last updated:** initial commit (spec pack only — no code yet).

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
- **[legal]** Permitted PGT indications scope (docs/03 §1). Blocks PGT capture cutover.
- **[legal]** Marital-status-change specimen disposition handling (docs/03 §1). Blocks cryostore cutover.
- **[legal]** Medical-record retention period (docs/03 §3). Blocks retention job.
- **[integration]** RI Witness integration path with CooperSurgical — sync-tool version, EMR-integration licence, programmatic pull-back of witnessing/traceability vs report-only (docs/02 §4, docs/01 §G). Prerequisite for Phase 2 embryology build.
- **[clinical]** Time-lapse incubator platform (EmbryoScope/Geri/other) — first integration target (docs/01 §G).
- **[ops]** KNET integration: direct bank vs gateway aggregator (docs/01 §G). Affects billing + residency review.
- **[ops]** Cliniko migration: full history vs cutover+archive (docs/01 §G). Affects Phase 1 exit.
- **[ops]** L2 bed reservation coupling (auto-reserve on theatre booking vs assign-on-day) and pre-op holding location modelling (docs/01 §E7). Confirm against real clinic flow.
- **[clinical]** Whether any inpatient stay is overnight/multi-day (e.g. post-delivery) or all same-day — determines if the bed model needs a night-census concept (docs/01 §E7).
- **[data]** On-site HL7/DICOM availability for lab analyser + PACS interfaces (docs/01 §G).

## Build log
_(empty — first code session will add the first entry above this line)_
