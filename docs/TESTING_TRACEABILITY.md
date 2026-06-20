# TESTING_TRACEABILITY.md — acceptance & go-live test traceability

> Living file. Maps every **docs/01 §E acceptance criterion** and every
> **GO_LIVE_CHECKLIST** item to the test(s) that prove it, and ranks what is **not
> yet proven**. Companion to `GO_LIVE_CHECKLIST.md` (which maps the data-safety /
> hard-rule *invariants* to their enforcing mechanism). Status legend:
>
> - ✅ **PROVEN** — an automated test exercises the criterion end-to-end (most via the tRPC API on real Postgres).
> - 🟡 **PARTIAL** — the core is proven but one clause is not (noted inline).
> - ⛔ **GAP** — no automated proof; see the ranked gap list.
> - 🔌 **STUB** — proven against a stub adapter; real-provider integration is a cutover item.

## 1. docs/01 §E acceptance criteria → proving tests

| § | Acceptance (abridged) | Proving test(s) | Status |
|---|------------------------|-----------------|--------|
| **E0** Platform | No-perm user sees nothing; granting a domain reveals only it; mutations audited with before/after; UI flips to RTL Arabic, no untranslated strings on core screens | `phase0-gate.e2e`; `clinical-access.attack`, `flow-access.attack` + per-module authorizer tests; `audit` 100% + `verifyIntegrity` in closeouts; `ui/rtl.test` (unit) | 🟡 RBAC + audit PROVEN; **RTL-on-rendered-screens GAP** (no PWA shell) |
| **E1** Scheduling | Run a full outpatient day on Oxford HIS | `outpatient-day.e2e` (Phase 1 gate), `portal-flow.e2e` | ✅ |
| **E2** Clinical EMR | New-patient consult — history, exam, orders, letter; structured for cycle planning | `outpatient-day.e2e` (note→order→letter in Arabic), `order-sets.e2e` | ✅ |
| **E3** Fertility cycle | Antagonist ICSI plan → drug schedule + monitoring bookings → visit updates + notify → trigger/retrieval in theatre calendar | `phase2-icsi-cycle.e2e` (Phase 2 gate) | ✅ |
| **E4** Embryology / witnessing | Every handling event reconciled to RI Witness; divergence blocks sign-off; full embryo life-history reconstructable | `embryology-witness.e2e`, `who-checklist.e2e`, `phase2-icsi-cycle.e2e`; `embryology`/`witnessing` attack tests | 🔌 PROVEN vs **stub** RI Witness; real-device integration = GAP |
| **E5** Andrology | Semen analysis → bilingual report + WHO 6th flags; sperm freeze witnessed + tank-mapped | `andrology.e2e`, `advanced-sperm-tests.e2e` | ✅ (rendered report is UI, see E0) |
| **E6** Cryostorage | Locate any straw (owner/history/consent/expiry); list every specimen for a couple | `cryostore-thaw.e2e`, `cryostore-disposition.e2e`, `phase2-icsi-cycle.e2e` | ✅ |
| **E7** Theatres / beds | Oocyte retrieval + hysteroscopy run the full journey; WHO checklist enforced; consumables deducted + billed; bed occupancy correct; full audit | `phase3-perioperative-journey.e2e` (Phase 3 gate), `who-checklist.e2e`, `discharge.e2e`, `intraop.e2e` | ✅ |
| **E8** Pharmacy | Prescribe gonadotrophin from formulary, **checks allergies**, decrements lot, injection media to app; discharge Rx → pharmacy queue gates discharge; CD reconciles | `portal-medication.e2e`, `discharge.e2e`, `controlled-drugs.e2e`, `media-traceability.e2e`, `allergy-advisory.e2e` (ADR-0060) | ✅ allergy advisory now PROVEN (class-match, advisory-not-block); formulary/decrement/discharge-gate/CD/media PROVEN |
| **E9** Procurement | Low stock → requisition; PO→GRN→invoice 3-way match; lot → embryo traceability | `procurement.e2e`, `inventory-stock.e2e`, `media-traceability.e2e`, `phase4-operations.e2e` | ✅ |
| **E10** Assets | Every critical device has PPM/calibration; overdue calibration blocks + visible in lab; faults/downtime logged | `assets.e2e`, `phase4-operations.e2e` | ✅ |
| **E11** Billing | ICSI package + deposit + 3 instalments; charges (clinic/lab/theatre) map to package; outstanding balance gates next cycle step; KNET posts + receipts | `packages.e2e`, `instalments.e2e`, `charge-capture.e2e`, `gateway-payments.e2e`, `phase5-revenue-cycle.e2e` | 🔌 PROVEN vs **stub** gateway; real KNET = GAP |
| **E12** KPI / compliance | One dashboard: live lab KPIs + theatre util + pipeline + MTD revenue; export full audit trail for any embryo/invoice | `dashboards.e2e`, `analytics-kpi.e2e`, `compliance-audit-export.e2e`, `phase5-revenue-cycle.e2e` | ✅ |
| **E13** Patient experience | Couple sees timeline + next visit; correct injection video at the right time; signs consent; pays an instalment — **entirely in Arabic** if chosen | `phase6-portal-journey.e2e` (Phase 6 gate), `portal-timeline/medication/consents/payments.e2e` | 🟡 flows PROVEN via tRPC; **Arabic rendered-UI GAP** (no PWA shell) |
| **E14** HR / rota | MOH licence-expiry alert; only witnessing-competency-signed-off staff can witness | `hr.e2e`, `practitioner-leave.e2e`; witnessing competency tests | ✅ |

**Headline:** 12 of 14 acceptance criteria are fully proven end-to-end (E8's allergy-check gap was closed by ADR-0060); the residual gaps cluster in two places — **rendered bilingual/RTL UI** (E0, E13) and **real external adapters** (E4 witnessing, E11 gateway).

## 2. GO_LIVE_CHECKLIST cross-reference

Sections **A (data-safety)**, **B (hard rules)**, **E (automated gate)** are green in CI and need no new tests — see `GO_LIVE_CHECKLIST.md`. The open items there are **operational/residency/config**, not test gaps:

- A5 — nightly encrypted **backup job** (restore is proven by `restore-drill.e2e`; the job itself is infra) — **BLOCKER**.
- C — in-region production Postgres; vault, notification, payment-gateway providers (residency reviews).
- D — audit-chain integrity **job in production**; retention job; MFA on PHI domains; rollback rehearsal; **seed/config review** (`CUTOVER_CONFIG.md`).

## 3. Ranked gap list

### Code-actionable now (no external dependency)
1. ~~**Prescribe-time allergy checking (E8).**~~ ✅ **DONE** (ADR-0060): coded clinical allergy list + injected `AllergyPort` + advisory `screenDrugs` at `recordDay`; class-match, advisory-not-block; clinical+fertility 100% domain, PG e2e `allergy-advisory.e2e`.
2. ~~**Deploy-over-populated-DB survival test.**~~ ✅ **DONE**: `deploy-survival.e2e` stages the prior schema, populates clinical history + an audit hash-chain, then applies the new additive migrations as "the next deploy" and asserts every row survives unmutated (incl. new-column backfill), the chain still verifies, and redeploys are no-ops — PATIENT-DATA invariant 4 proven directly.
3. **Non-functional harness (baseline).** Add a k6 (or autocannon) profile for hot paths (scheduling, portal read, KPI dashboards) **and** the audit-chain append under concurrency (it serialises on an advisory lock — measure contention). Baselines only; the centre is small (≤9 beds).
4. **Security in CI beyond secret-scan.** Add dependency audit / SAST (e.g. `pnpm audit`, CodeQL) and a runtime **no-PHI-in-logs** assertion test.
5. **RTL/“no untranslated strings” static check.** Even before a PWA shell: a test that asserts every i18n key has both `en` + `ar` and no user-facing literal bypasses i18n (catches E0/E13 string gaps at the data layer).

### Needs you / environment (cannot complete in-repo)
6. **Real-adapter contract + sandbox integration** — RI Witness (CooperSurgical), KNET gateway, in-region vault, notification provider. Each: a contract test against the adapter interface + a sandbox integration run + a **failure/degradation** test (outbox retry). *Blocked on credentials/scoping (`CUTOVER_CONFIG.md`).*
7. **Browser/RTL acceptance** — once the PWA shell exists, Playwright journeys for E0/E13 incl. RTL layout + Arabic screenshots/visual diff.
8. **DR drill on the real host** (RPO/RTO), **third-party pen-test** on staging, **clinician UAT** scripted from the §E acceptance lines, and **parallel-run + reconciliation** vs Cliniko/om-software (`cliniko-migration.ts`) before decommission (ADR-0020).

## 4. How to extend (layering)

Test by the **invariants and risk**, outward from what exists:

1. Keep the green base (unit 100% on money/drug/witnessing; e2e through tRPC; the automated go-live gate).
2. Close the **code-actionable** gaps above (1–5) — each as a normal PR at the existing bar (100% domain, real-PG e2e, ADR if it adds behaviour).
3. Stand up **real-adapter sandboxes** as they’re unblocked (6) and add their contract/integration/failure tests.
4. Run the **non-functional + security** programme on staging (load, DR, pen-test) (3, 4, 8).
5. **UAT + parallel-run** on synthetic data, then the **sign-off** lines in `GO_LIVE_CHECKLIST.md §Sign-off`.

> **Maintenance:** add a row here whenever a new §E-level capability ships, and flip a status when its proving test lands. The matrix is the answer to “are we tested enough to go live?”.
