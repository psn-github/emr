# Oxford HIS — om-software replacement map

**Purpose:** Oxford HIS **absorbs** the functionality of the first-generation
om-software clinical point tools (`github.com/psn-github/om-software`) into the
corresponding EMR modules as they are built — but the tools themselves are
**never decommissioned** (product owner, 2026-08-07: ADR-0072 / AMD-0010,
attached to the AMD-0007 ratification). The end-state per tool is the **EMR
becoming the primary record** after a proven parallel run; the om-software tool
remains deployed, maintained, and usable. This file maps every tool → its target
module → the data that must migrate → the roadmap phase → the
parallel-run/primary-switch gate. **Binding principles in ADR-0020 as corrected
by ADR-0072.**

## Binding principles (ADR-0020, corrected by ADR-0072)
1. **Tool-by-tool absorption, never big-bang.** Each om-software tool's workflow
   moves to its EMR module individually, behind a **parallel-run gate**: the EMR
   module runs alongside the live tool, a reconciliation report proves they agree,
   then — and only then — the EMR becomes the **primary** record for that
   workflow. **The tool is not switched off** (ADR-0072); retiring any tool would
   require a new explicit product-owner decision.
2. **No primary-switch without proven data migration.** The EMR does not become
   primary for a workflow until all the tool's data (embryo records, semen
   analyses, documents, patient history) is **provably migrated** into the EMR
   (the tool remains a readable surface regardless). The Document Ledger's
   "history never lost" promise extends across the move. Each tool's migration
   ships a **reconciliation report** (as with the Cliniko migration, ADR-0017).
   The long-term data flow after the switch (one-way mirror into the EMR,
   dual-entry, or read-only tool) is a product-owner decision at each gate.
3. **Map, don't fork.** Read om-software to (a) match the design system exactly
   (already done — ADR-0016) and (b) map each tool's data model + features to the
   target module so the EMR is a faithful **superset** before it goes primary. **Do not**
   copy om-software's architecture (vanilla HTML / Flask / SQLite) — reimplement
   on the EMR's audited, RBAC'd, in-region foundation.

## The map

| om-software tool | Target EMR module | Key data to migrate | Phase | Parallel-run → primary-switch gate |
|---|---|---|---|---|
| **Cliniko-backed patient context** (demographics, appointments, balances) | `registry` + `scheduling` (E1) | active patients + demographics, upcoming appointments, open balances | **Phase 1** (done: ADR-0017 Cliniko cutover, Option B) | active-slice reconciliation clean → EMR runs the outpatient day (Phase 1 exit gate) → EMR is primary for patient context (wrapper stays available) |
| **Document Ledger / patient timeline** ("history never lost") | `documents` (E0) + audit timeline + `clinical` core (E2) | every stored document (consents, ID scans, marriage certs, reports) + the ledger's history/timeline entries | **Phase 2** (migration sequenced) | per-document reconciliation report; the EMR becomes the primary document record **only** when every document is migrated — the Ledger stays readable/in service and the "history never lost" promise must hold across the move |
| **HTML clinical tools** (notes/forms) | `clinical` core (E2) | structured + free-text clinical entries captured by the HTML tools | **Phase 2** (migration sequenced) | reconcile entries → E2 captures the same workflows + data migrated → E2 primary; tools stay in service |
| **Semen-analysis tool** | `andrology` (E5) | semen analyses (WHO 6th-ed params), sperm prep/freeze records | **Phase 2** (with E5) | reconcile analyses → E5 live + analyses migrated → E5 primary (MD sign-off); tool stays in service |
| **Embryo follow-up tool** | `embryology` (E4) | embryo records (oocyte/fertilisation/culture/grading/disposition) + witness provenance | **Phase 2** (with E4) | reconcile embryo life histories → E4 live (RI Witness reconciled) + records migrated → E4 primary (MD sign-off); tool stays in service |

## How each per-tool migration is built
For every tool, when its target module is built:
1. **Field-level data-model mapping** from om-software → EMR (requires om-software **read access** — see open items).
2. A **re-runnable, audited import job** + **reconciliation report** (zero unexplained discrepancies), exactly like the Cliniko migration tooling (`@oxford/migration`).
3. A **parallel-run** period (EMR module alongside the live tool; daily reconciliation).
4. **EMR goes primary** only after migration is proven and (for lab tools) the **Medical Director signs off**. The tool stays in service (ADR-0072).

## Open items (product owner / Medical Director — see STATE.md)
- **Order of primary-switches** (which workflow the EMR takes over first) and, at each gate, the **long-term data flow** (one-way mirror into the EMR, dual-entry, or read-only tool) — ADR-0072. (The former "retirement order" and "archive vs migrate" questions are superseded: nothing is retired, and all data migrates into the EMR with the tool staying readable.)
- **om-software read access** for this build (currently out of session scope) — needed for field-level mapping + the design-system fidelity check.
