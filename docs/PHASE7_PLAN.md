# Phase 7 — Run it: staging deployment + whole-EMR simulation

> Proposed as a roadmap addition (see AMD-0007). Phases 0–6 delivered the feature-complete,
> test-proven HIS (766 tests, 199 files; every module 100%/≥80% per the CLAUDE.md bar). What does
> **not** yet exist is a *running system*: until this phase the tRPC router was only ever mounted
> in-process by tests, `apps/web`/`apps/portal` are stubs, and the deploy Makefile targets were
> placeholders. Phase 7 turns the proven codebase into a deployed, continuously-simulated system on
> the staging VPS (synthetic data ONLY — residency: ADR-0007) and drives an error-correction loop
> over it, ahead of UI build-out and any cutover work.

**Phase goal (exit gate):** a full simulated clinic runs against the deployed staging stack with
**zero errors**: N synthetic couples complete register → book → consult → ICSI cycle → lab (witness-
reconciled) → transfer/freeze → outcome → package/instalments/KNET payment → portal journey, in
loops, with the audit hash-chain verified intact every loop; dashboards read live; a deploy over the
populated staging DB loses nothing; and the bilingual UI shells render the same journey in Arabic
(RTL) and English.

## Stages

### 7.0 — HTTP host (ADR-0062) — **shipped this session**
Mount `appRouter` on `node:http` (`apps/api/src/http-host.ts`, boot entry `serve.ts`, esbuild bundle
to `apps/api/dist/`). Bearer-token auth through the real `AuthService`; **staging-only identity**
(`DevOidcProvider` + fixed synthetic staff directory) with a hard **production boot refusal** so a
synthetic-identity server can never front real PHI. `/health` probes the DB. Proven by
`http-host.e2e.test.ts` over real HTTP. Unblocks: the simulator, k6 (`perf/`), the UI shells, deploy.

### 7.1 — Whole-EMR simulation harness (ADR-0063) — **shipped this session**
`apps/api/src/simulator/` + a staging-only `dev` tRPC router (stub feeds: witness records, pharmacy
fulfilment, audit-chain verify — FORBIDDEN unless the host enables `devTools`, which production
never does). CLI: `node apps/api/dist/simulate.js --url … --couples N --loops N --seed N` —
deterministic journeys, per-step error capture (never aborts the run), JSON report + summary, exit
1 on any error. `simulator.e2e.test.ts` keeps one full simulated journey green in CI forever.

### 7.2 — Staging deploy wiring (ADR-0064) — **shipped this session (first cut)**
Replace the placeholder Makefile deploy targets with real ones: `deploy-api` = install → typecheck →
bundle → **additive migrate** (gated by `check-migrations-safe`) → restart the `oxford-his-api`
systemd unit; `deploy/oxford-his-api.service` + `deploy/nginx-oxford-his.conf` templates; nightly
`pg_dump` backup script + cron line (PATIENT-DATA §5). The existing gated GitHub Actions deploy
(`.github/workflows/deploy.yml`, approval-gated on the `staging` environment) drives it on merge to
`main`. **Separate stack from om-software** (`/opt/oxford-his`, own port/unit/DB) — the om-software
tools in production daily use are untouched (product-owner instruction, 2026-07-03).

**Operator setup (one-time, product owner/ops):** repo secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`;
`staging` environment reviewer; on the VPS: `/opt/oxford-his` clone, Node 20 + pnpm, Postgres 16
with an `oxford_staging` DB, `systemctl enable oxford-his-api`, nginx include. See
`docs/CICD_SETUP.md`.

### 7.3 — Simulation-at-scale error-correction loop (next)
- Scheduled simulation runs against staging (cron on the VPS or a scheduled GitHub Action):
  `simulate --couples 25 --loops 4`, fresh seed per run; report artifact retained.
- **Loop rule:** any simulator error ⇒ reproduce locally with the same seed ⇒ fix with a test that
  pins it ⇒ redeploy ⇒ re-run until zero. Track each round in `docs/STATE.md`.
- **Close the router gaps the first simulation run surfaced** (areas the e2e suite drives
  in-process via services but that have NO HTTP surface, so neither the simulator nor the coming
  UI shells can reach them — each is a thin router addition over an existing, fully-tested
  service, not a domain feature):
  1. scheduling config (appointment types / resources) — no define/create procedures;
  2. facility topology seed/read — blocks `flow.checkIn` and the perioperative admit/advance
     journey (and therefore the pharmacy-gated discharge) on a fresh staging DB;
  3. fertility cycle engine (`createTreatmentCycle`, staff consent recording, reason-coded
     cancel/convert) — until then `portal.cycleTimeline` / `medicationSchedule` /
     `outstandingConsents` / `signConsent` are un-drivable over HTTP;
  4. stimulation charting (`recordDay`) + formulary config surface;
  5. embryology micro-steps (`recordOocyte`, fertilisation check, grading);
  6. witnessing ingest/read surface (low priority — the sign-off gate already reconciles live);
  7. perioperative admission path (depends on 2).
- Then grow journey coverage until every router procedure is exercised (coverage table in the
  report): IUI + FET + preservation cycles, theatre day-list journeys, cryostore disposition,
  procurement/inventory cycles, HR rota→availability, dashboards reads, research export,
  antenatal continuation.
- Add a **chaos dimension** once green: concurrent couples (parallel journeys), mid-journey
  cancellations/conversions, arrears blocking, witness-divergence drills (must BLOCK sign-off),
  allergy advisories, controlled-drug reconciliation.
- k6 HTTP load baseline (`perf/k6-api-load.js`, now mountable) recorded in `perf/README.md`.

### 7.4 — Staff web app shell (`apps/web`)
Bilingual (en/ar, RTL-first) SPA/PWA over the same tRPC API — thin client, server stays the
enforcement point. First screens (mirror the P0/P2 acceptance): login (dev directory now, OIDC
later), patient search/registration + couple/marriage verification, day list + check-in (flow
board), encounter + orders/results, cycle board (cohort) + stimulation chart with predictive/AMH
advisories, embryology worklist with witness status, billing workspace (packages/instalments/KNET),
dashboards. Reuses `@oxford/ui` tokens + `@oxford/i18n`; **no hardcoded strings** (CLAUDE.md).
Playwright e2e per screen in both languages closes the rendered-RTL traceability gap (E0).

### 7.5 — Patient portal PWA (`apps/portal`)
The Phase-6 portal surface, rendered: timeline, medication schedule + teaching videos, released
results, consents e-sign, balances/KNET payment, secure messaging, partner access, discreet push.
Own-data enforcement is already server-side and adversarially tested; the PWA is presentation.
Playwright e2e of the §E13 couple journey in Arabic closes the E13 UI gap.

### 7.6 — Phase exit gate
One documented staging run: deploy from `main` (gated) → seeded config → simulation at scale green
(zero errors, chain intact every loop) → deploy-over-populated-DB drill on staging → both UI shells
drive one couple journey in Arabic → k6 baseline recorded. Sign-off, then HOLD.

## Explicitly out of scope for Phase 7 (unchanged go-live blockers)
In-region production host + managed Postgres; real RI Witness / KNET-gateway / vault / notification
/ OIDC providers behind their existing ports (need vendor scoping + sandbox credentials + residency
ADRs); the config/counsel values in `docs/CUTOVER_CONFIG.md`; Cliniko cutover execution. None of
these block Phase 7 — the stubs are the point of a synthetic staging.

## Standing rules for this phase
- The staging VPS holds **synthetic data only** — never real PHI (ADR-0007; docs/PATIENT-DATA.md).
- om-software (`/opt/oxmedkw`, psn-github/om-software) is in daily clinical use and is **not
  modified** by this phase; the replacement path stays governed by docs/07 + ADR-0020.
- Every simulator-found defect gets a pinning test before its fix ships (no fix without a test).
- All CLAUDE.md hard rules apply unchanged; the dev/staging seams (identity directory, dev router,
  stub providers) must each carry a production refusal or FORBIDDEN guard, verified by test.
