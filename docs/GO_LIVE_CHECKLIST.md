# GO_LIVE_CHECKLIST.md — Oxford HIS production readiness

> The bridge from "feature-complete" (Phases 0–6) to go-live. Every data-safety
> invariant in `docs/PATIENT-DATA.md` and every hard rule in `CLAUDE.md` is mapped
> here to **its enforcing mechanism** and **the verification that proves it**, plus
> the residency/backup/deploy gates. A row is GREEN only when its verification is
> automated and passing. Sign-off lines at the bottom; cutover-blocking config in
> `docs/CUTOVER_CONFIG.md`.

## A. Data-safety invariants (docs/PATIENT-DATA.md — law)

| # | Invariant | Enforcing mechanism | Verification | Status |
|---|-----------|---------------------|--------------|--------|
| 1 | DB lives outside the deployed code | Deploys ship code only; DB is a separate managed instance (ADR-0007); `db.ts` connects, never provisions | `docs/CICD_SETUP.md` deploy job; manual: confirm deploy touches no data store | ✅ design / ⏳ confirm on real infra |
| 2 | Deploys additive; destructive migrations blocked | Forward-only `*.sql`; `scripts/check-migrations-safe.mjs` in CI before deploy | `pnpm` CI runs it (40+ migrations, all additive) | ✅ automated |
| 3 | Clinical data append-only / soft-delete only | Stores insert/soft-delete; no hard deletes in domain code; retention is a documented audited job | adversarial + integration tests per module; manual review of each migration | ✅ tests / ⏳ retention job (docs/03 §3) |
| 4 | Patient & clinical history survives every deploy | Follows from 1–3 | **proven directly** by `deploy-survival.e2e` (populate prior schema → apply new additive migrations → data + audit-chain survive, redeploy is a no-op); plus the additive-migrations gate + closeout e2es | ✅ automated |
| 5 | Backups nightly, encrypted, tested restore | **Restore proven** by the drill (`restore-drill.e2e.test.ts`: dump → fresh DB → audit-chain re-verify + data survival). Nightly encrypted backup *job* is infra | restore: ✅ automated drill (`docs/PATIENT-DATA.md §restore`). nightly job: ⏳ provision with the in-region DB | ⏳ restore ✅ / nightly job **BLOCKER** |
| 6 | Every mutation in the immutable hash-chained audit log | `@oxford/audit` (AuditLog.record on every mutation); `verifyIntegrity`; scheduled chain check | `audit` package 100%; closeout e2es assert `verifyIntegrity().ok`; `runChainIntegrityCheck` job | ✅ automated |

## B. Hard rules (CLAUDE.md) — structural guarantees

| Rule | Mechanism | Verification | Status |
|------|-----------|--------------|--------|
| Witnessing = RI Witness authoritative; no override; sign-off blocked on divergence | `WitnessPort`/`RiWitnessStubProvider`; embryology terminal acts gated | `embryology`/`witnessing` adversarial tests; Phase-2 exit-gate e2e | ✅ (stub until CooperSurgical scoping — `CUTOVER_CONFIG`) |
| No fertility cycle without a verified marriage | `FertilityGate` → `registry.canStartFertility` | `fertility`/`registry` attack tests | ✅ |
| No donor / surrogacy / social sex-selection — structurally absent | No such cycle types/owners/flows exist; gametes own-only | `registry` gametes/couple tests; `fertility` cycle types | ✅ (absence; enforced by tests) |
| No posthumous use | clinician-attested death record → cryostore `UseGate` blocks thaw | `cryostore` thaw adversarial e2e | ✅ |
| Drugs from the formulary, never free text; 100% on dose logic | `STIM_FORMULARY` + `validateDrugDose`; charge master (no free-text charges) | `fertility` stim + `billing` charge tests (100%) | ✅ |
| Money 100% covered; integer fils, no float | `@oxford/billing` money.ts; per-package 100% thresholds | `billing` vitest thresholds | ✅ |
| **No cash** — KNET/card only, structurally absent (ADR-0034) | `PaymentMethod = knet\|card`; runtime guard rejects any other | `scripts/check-cutover-invariants.mjs` + billing/api adversarial tests | ✅ automated |
| **No tax** — no field/line/calc (ADR-0035) | money model has no tax surface | `scripts/check-cutover-invariants.mjs` | ✅ automated |
| Module boundaries hard (no cross-module table access) | injected seams/ports; app-layer composition | `scripts/check-boundaries.mjs` (31 packages) | ✅ automated |
| No secrets in repo | `.gitignore`; CI secret scan | CI secret scanning | ✅ CI |
| No PHI in logs/URLs/analytics or notifications | discreet templates; push catalog has no PHI; no PHI logged | `notifications`/`push` tests (no-PHI assertions) | ✅ tests |
| Bilingual (en/ar), RTL, no hardcoded user strings | i18n catalog; bilingual fields throughout | per-module bilingual fields; UI RTL (when shell built) | ✅ data / ⏳ PWA shell |

## C. Residency & environment (ADR-0006/0007, docs/03)

- [ ] **Production DB is in-region** (GCC/Kuwait-permissible managed Postgres) — selected + provisioned. **The DO VPS must never hold real PHI** (staging/synthetic only).
- [ ] **Key provider** is the in-region vault (LocalKeyProvider → real provider; `isProduction` path, ADR-0014).
- [ ] **Notification provider** residency-reviewed before a real one is wired (ADR-0006).
- [ ] **Payment gateway** in-region + PCI/residency review (ADR-0036) — see `CUTOVER_CONFIG`.
- [ ] No new third-party PHI processor without a logged residency ADR.

## D. Operational readiness

- [ ] Nightly **backup job** live + a **tested restore** (invariant 5 — blocker).
- [ ] Scheduled **audit-chain integrity** job running in production.
- [ ] Deploy is **path-based selective + approval-gated** on the `staging` environment (`docs/CICD_SETUP.md`); rollback procedure documented + rehearsed.
- [ ] **Seed/config** review: every config table (protocols, consent sets, packages, formulary, par levels, KPI thresholds, charge master) populated with clinic-confirmed values — see `CUTOVER_CONFIG`.
- [ ] Roles/permissions provisioned; MFA enforced on all PHI domains.

## E. Automated go-live gate (run before any production deploy)

```
node scripts/check-migrations-safe.mjs       # deploys additive
node scripts/check-boundaries.mjs            # module isolation
node scripts/check-cutover-invariants.mjs    # no-cash / no-tax structural rules
pnpm -w lint && pnpm -r typecheck            # clean
DATABASE_URL=… pnpm -r --workspace-concurrency=1 test   # full suite incl. adversarial + closeout e2es
```

## Sign-off

- [ ] **Medical Director** — clinical safety + the cutover-gating clinical/legal items (`CUTOVER_CONFIG`).
- [ ] **Legal counsel** — Kuwaiti-law items (CD schedule + MOH reporting, marital-status disposition, PGT indications, storage ceiling).
- [ ] **Engineering** — sections A/B/E green; residency (C) + operational (D) complete.

> **Current build status:** Phases 0–6 delivered; sections A/B/E are green in CI. The open go-live blockers are **operational/residency** (backup+restore, in-region DB, real providers) and the **config/counsel** values in `docs/CUTOVER_CONFIG.md` — none are code-feature gaps.
