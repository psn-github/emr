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

_(Claude Code: continue numbering from ADR-0008.)_
