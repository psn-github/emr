# Oxford HIS — om-software replacement map

**Purpose:** Oxford HIS is intended to **replace** the first-generation om-software
clinical point tools (`github.com/psn-github/om-software`), not run permanently
alongside them. Each tool's functionality is absorbed into the corresponding EMR
module as that module is built. This file maps every tool → its target module →
the data that must migrate → the roadmap phase → the parallel-run/decommission
gate. **Binding principles in ADR-0020.**

## Binding principles (ADR-0020)
1. **Tool-by-tool replacement, never big-bang.** Each om-software tool is replaced
   by its EMR module individually, behind a **parallel-run gate**: the EMR module
   runs alongside the live tool, a reconciliation report proves they agree, then —
   and only then — the old tool is decommissioned.
2. **No decommissioning without proven data migration.** No tool is switched off
   until all its data (embryo records, semen analyses, documents, patient history)
   is **provably migrated** into the EMR **or archived with guaranteed read
   access**. The Document Ledger's "history never lost" promise extends across the
   replacement. Each tool's migration ships a **reconciliation report** (as with
   the Cliniko migration, ADR-0017).
3. **Map, don't fork.** Read om-software to (a) match the design system exactly
   (already done — ADR-0016) and (b) map each tool's data model + features to the
   target module so the EMR is a faithful **superset** before cutover. **Do not**
   copy om-software's architecture (vanilla HTML / Flask / SQLite) — reimplement
   on the EMR's audited, RBAC'd, in-region foundation.

## The map

| om-software tool | Target EMR module | Key data to migrate | Phase | Parallel-run → decommission gate |
|---|---|---|---|---|
| **Cliniko-backed patient context** (demographics, appointments, balances) | `registry` + `scheduling` (E1) | active patients + demographics, upcoming appointments, open balances | **Phase 1** (done: ADR-0017 Cliniko cutover, Option B) | active-slice reconciliation clean → EMR runs the outpatient day (Phase 1 exit gate) → retire the om-software patient-context wrapper |
| **Document Ledger / patient timeline** ("history never lost") | `documents` (E0) + audit timeline + `clinical` core (E2) | every stored document (consents, ID scans, marriage certs, reports) + the ledger's history/timeline entries | **Phase 2** (migration sequenced) | per-document reconciliation report; decommission **only** when every document is migrated **or** archived with guaranteed read access — the "history never lost" promise must hold across the move |
| **HTML clinical tools** (notes/forms) | `clinical` core (E2) | structured + free-text clinical entries captured by the HTML tools | **Phase 2** (migration sequenced) | reconcile entries → E2 captures the same workflows + data migrated → decommission |
| **Semen-analysis tool** | `andrology` (E5) | semen analyses (WHO 6th-ed params), sperm prep/freeze records | **Phase 2** (with E5) | reconcile analyses → E5 live + analyses migrated → decommission (lab cutover needs MD sign-off) |
| **Embryo follow-up tool** | `embryology` (E4) | embryo records (oocyte/fertilisation/culture/grading/disposition) + witness provenance | **Phase 2** (with E4) | reconcile embryo life histories → E4 live (RI Witness reconciled) + records migrated → decommission (MD sign-off) |

## How each per-tool migration is built
For every tool, when its target module is built:
1. **Field-level data-model mapping** from om-software → EMR (requires om-software **read access** — see open items).
2. A **re-runnable, audited import job** + **reconciliation report** (zero unexplained discrepancies), exactly like the Cliniko migration tooling (`@oxford/migration`).
3. A **parallel-run** period (EMR module alongside the live tool; daily reconciliation).
4. **Decommission** only after migration is proven and (for lab tools) the **Medical Director signs off**.

## Open items (product owner / Medical Director — see STATE.md)
- **Order of tool retirement** (which om-software tool is decommissioned first).
- **Archive vs migrate** per tool (full migration into the EMR vs archived-with-read-access), per the data category.
- **om-software read access** for this build (currently out of session scope) — needed for field-level mapping + the design-system fidelity check.
