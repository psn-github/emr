# NEXT STEPS — working checklist to finish the build

> **Status as of 2026-08-06.** Phases 0–6 + the full P1/P2 backlog are complete and merged.
> Phases 7.0–7.2 and 8.0–8.3 shipped in PR #97 (4 July): the EMR runs over HTTP, has a
> whole-clinic simulator (last run 385/385 steps, audit chain intact, 919 tests green), and
> the staging deploy is wired. Nothing has merged since.
>
> What remains: **turn staging on → close the simulator's router gaps → build the two UIs →
> run the exit gates**, with a parallel track of decisions/procurement only the product owner
> can move. Work through the steps in order; the parallel track (Step 7) can start today.
>
> Tick items as you go (`[x]`). Items are tagged **[YOU]** (product owner / needs your
> account, hardware, or a decision) or **[CLAUDE]** (a Claude Code session does it — the
> suggested session prompt is given). Keep this file updated as things land.

---

## Step 1 — Turn staging on (unblocks everything)

The deploy pipeline exists but has never run against a real VPS. PR #98 makes the deploy
self-bootstrapping, which turns the manual VPS checklist into mostly one command.

- [x] **[YOU]** Review + merge **PR #98** — reviewed against `docs/PATIENT-DATA.md` +
      ADR-0064 and merged 2026-08-07 (`fc4f498`); all invariants hold, om-software untouched
- [x] **[YOU]** Add the three repo secrets (`VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`) —
      done 2026-08-07
- [x] **[YOU]** ~~Create the gated `staging` environment with a required reviewer~~ —
      **PO decision 2026-08-07: staging auto-deploys, no approval gate** (the `staging`
      environment carries no protection rules, so merges to `main` deploy unattended).
      To add gating later: Settings → Environments → `staging` → required reviewers.
- [x] **[YOU]** One-time VPS prep — automatic since PR #98: the first deploy run
      self-bootstraps (`scripts/vps-bootstrap.sh`, idempotent).
      ⚠️ Everything lives in `/opt/oxford-his`, its own port (8060) and database — it never
      touches `/opt/oxmedkw` (om-software is in daily clinical use) and the VPS holds
      **synthetic data only, never real PHI** (ADR-0007).
- [x] **[YOU]** Trigger the first deploy — done 2026-08-07: VPS self-bootstrapped on the
      first runs; a follow-up dispatched run confirmed steady state (`bootstrap` no-ops,
      59 additive migrations clean, `migrate: up to date`, **`deploy-api: healthy`**).
      Staging API is live on the VPS (loopback :8060, ADR-0070/0071).
- [ ] Run the simulator against staging once and confirm zero errors — **[CLAUDE]** *"Run
      the whole-EMR simulator against staging and report; fix nothing yet."* (Needs to run
      on the VPS — the sandbox has no SSH route; a small simulate workflow/cron per
      Phase 7.3 covers this.)

**Done when:** a merge to `main` auto-deploys to staging unattended (✅ confirmed
2026-08-07), and one simulation run against the deployed staging is green.

---

## Step 2 — Ratify the outstanding amendments + small config decisions

Ten minutes of decisions that are formally still "awaiting PO".

- [ ] **[YOU]** Ratify **AMD-0007** (adopt `docs/PHASE7_PLAN.md` as Phase 7)
- [ ] **[YOU]** Ratify **AMD-0008** (Phase 8 whole-clinic-operations addition)
      *(AMD-0009 — external pharmacy correction — is already approved & closed)*
- [ ] **[YOU]** Confirm the **MRN format** (current default `OM-<year>-<seq>`) and the
      **records-room location names** (config values, `@oxford/records`)
- [ ] **[YOU]** Decide: existing paper files **relabelled at import or on first pull** (ops)
- [ ] **[YOU]** Order the records hardware: Zebra-class ZPL label printer, A4 label sheets,
      barcode scanners, a document scanner
- [ ] **[CLAUDE]** After ratification: *"Mark AMD-0007/AMD-0008 ratified in
      docs/AMENDMENTS.md and record the MRN/records-room config values."*

**Done when:** `docs/AMENDMENTS.md` shows 0007/0008 closed and the config values are recorded.

---

## Step 3 — Phase 7.3: close the router gaps + simulation at scale

All build work — run as Claude sessions. Each gap is a **thin tRPC router over an existing,
fully-tested service** (no new domain logic). Full spec: `docs/PHASE7_PLAN.md` §7.3.

- [ ] **[CLAUDE]** Router gap 1 — scheduling config (define appointment types / resources)
- [ ] **[CLAUDE]** Router gap 2 — facility topology seed/read (unblocks `flow.checkIn` +
      perioperative admit on a fresh staging DB)
- [ ] **[CLAUDE]** Router gap 3 — fertility cycle engine over HTTP (`createTreatmentCycle`,
      staff consent recording, reason-coded cancel/convert)
- [ ] **[CLAUDE]** Router gap 4 — stimulation charting (`recordDay`) + formulary config surface
- [ ] **[CLAUDE]** Router gap 5 — embryology micro-steps (`recordOocyte`, fertilisation check, grading)
- [ ] **[CLAUDE]** Router gap 6 — witnessing ingest/read surface (low priority)
- [ ] **[CLAUDE]** Router gap 7 — perioperative admission path (depends on gap 2)
- [ ] **[CLAUDE]** Grow simulator journey coverage until **every router procedure is
      exercised** (coverage table in the report): IUI + FET + preservation cycles, theatre
      day-list, cryostore disposition, procurement/inventory, HR rota, dashboards,
      research export, antenatal continuation
- [ ] **[CLAUDE]** Add the chaos dimension: concurrent couples, mid-journey
      cancel/convert, arrears blocking, **witness-divergence drills (must BLOCK sign-off)**,
      allergy advisories, controlled-drug reconciliation
- [ ] **[CLAUDE]** Schedule recurring simulation against staging (cron/Action:
      `simulate --couples 25 --loops 4`, fresh seed, report retained). **Loop rule:** any
      error → reproduce with same seed → fix with a pinning test → redeploy → re-run to zero
- [ ] **[CLAUDE]** Record the k6 HTTP load baseline (`perf/k6-api-load.js` → `perf/README.md`)

Suggested session prompt to start: *"Phase 7.3 per docs/PHASE7_PLAN.md and
docs/NEXT_STEPS.md: close router gaps 1–3 with tests, run the full suite + simulator, update
STATE.md, push and PR."* (2–3 gaps per session is a comfortable size.)

**Done when:** scheduled simulation at scale runs green with zero errors, chain intact every
loop, and the k6 baseline is recorded.

---

## Step 4 — Phase 7.4: staff web app (`apps/web`)

The biggest visible gap — there is currently **no screen a clinician can use**. Bilingual
(en/ar, RTL-first) SPA over the same tRPC API; thin client, server stays the enforcement
point. Spec: `docs/PHASE7_PLAN.md` §7.4. PR **#95** (staff home mockup) is the starting
design conversation.

- [ ] **[YOU]** Look at PR #95's mockup — say what you like/hate (10 minutes; it steers
      every screen after it)
- [ ] **[CLAUDE]** App shell: login (dev directory), i18n/RTL frame, navigation, `@oxford/ui` tokens
- [ ] **[CLAUDE]** Patient search / registration + couple & marriage verification
- [ ] **[CLAUDE]** Day list + check-in (flow board)
- [ ] **[CLAUDE]** Encounter + orders/results
- [ ] **[CLAUDE]** Cycle board (cohort) + stimulation chart with predictive/AMH advisories
- [ ] **[CLAUDE]** Embryology worklist with witness status
- [ ] **[CLAUDE]** Billing workspace (packages / instalments / KNET)
- [ ] **[CLAUDE]** Dashboards
- [ ] **[CLAUDE]** Playwright e2e per screen **in both languages** (closes the rendered-RTL
      traceability gap, E0)

**Done when:** a staff member can drive one full couple journey through the browser in
Arabic, Playwright-proven.

---

## Step 5 — Phase 7.5: patient portal PWA (`apps/portal`)

The Phase-6 portal API rendered as a mobile-first PWA. Own-data enforcement is already
server-side and adversarially tested — this is presentation. Spec: `docs/PHASE7_PLAN.md` §7.5.

- [ ] **[CLAUDE]** PWA shell (bilingual, RTL-first, installable)
- [ ] **[CLAUDE]** Cycle timeline + medication schedule with teaching videos
- [ ] **[CLAUDE]** Released results, consents e-sign, balances + KNET payment
- [ ] **[CLAUDE]** Secure messaging, partner access, discreet push registration
- [ ] **[CLAUDE]** Playwright e2e of the §E13 couple journey **in Arabic** (closes E13 UI gap)

**Done when:** the Phase-6 exit-gate journey is repeatable by a patient in a browser in Arabic.

---

## Step 6 — Exit gates (7.6 + 8.4), then HOLD

- [ ] **[CLAUDE]** One documented staging run: gated deploy from `main` → seeded config →
      simulation at scale green (zero errors, chain intact every loop) →
      deploy-over-populated-DB drill on staging → both UI shells drive one couple journey
      in Arabic → k6 baseline recorded
- [ ] **[YOU]** Sign off Phase 7 + Phase 8 in `docs/STATE.md`; then HOLD for go-live workstream

---

## Step 7 — PARALLEL TRACK: long-lead go-live blockers (start these NOW)

None of these block Steps 1–6, but **all block real patients**, and each has weeks-to-months
of external lead time. Full register with safe defaults: `docs/CUTOVER_CONFIG.md`.

### Vendors / procurement
- [ ] **[YOU]** **CooperSurgical — RI Witness scoping** (ADR-0018): sync-tool version,
      EMR-integration licence, pull-back mechanism, image transfer, RI-server residency.
      Gates live witnessing + lab cutover. *Longest lead item — chase first.*
- [ ] **[YOU]** **In-region production host + managed Postgres** (ADR-0007): AWS Bahrain /
      Oracle Kuwait / equivalent under the CITRA framework. Swapping the deploy target is a
      secrets change once selected. BLOCKING.
- [ ] **[YOU]** **Payment gateway (KNET + card)**: direct bank vs aggregator; needs in-region
      processor + PCI/residency review as an ADR (ADR-0036). BLOCKING for live payments.
- [ ] **[YOU]** In-region **key vault** provider (ADR-0014) and **notification/web-push**
      providers + residency review (ADR-0006). BLOCKING.

### Counsel / MOH (send as one letter to counsel)
- [ ] **[YOU]** Permitted **PGT indications** (safe default: all PGT rejected) — BLOCKING for PGT
- [ ] **[YOU]** **Marital-status-change specimen disposition** rule — BLOCKING for that pathway
- [ ] **[YOU]** MOH **cryo-storage maximum period** + consent-renewal cadence
- [ ] **[YOU]** Kuwaiti **controlled-drugs schedule** + MOH CD **reporting format/channel** (AMD-0005)
- [ ] **[YOU]** **Medical-record retention period** (blocks the retention job)
- [ ] **[YOU]** Cliniko **hosting-region check** before relying on it as the archive (ADR-0017)

### Clinic / clinical
- [ ] **[YOU]** Review the **7 notification templates** — especially the Khaleeji Arabic
      wording (current text is placeholder)
- [ ] **[YOU]** Lab director: confirm exact **Vienna-consensus KPI threshold values** (ADR-0039)
- [ ] **[YOU]** Confirm L2 **bed-reservation coupling** (auto-reserve on theatre booking vs
      assign-on-day) + whether any stay is overnight (night-census question, docs/01 §E7)
- [ ] **[YOU]** Decide **om-software tool retirement order** + archive-vs-migrate per tool
      (docs/07, ADR-0020), and grant this build om-software read access for field mapping
- [ ] **[YOU]** Confirm on-site **HL7/DICOM availability** for lab analyser + PACS interfaces

---

## Side items (not on the critical path)

- [ ] om-software PR **#207** — price-list PDF export from the Cost Estimator (draft, 31 Jul):
      review + merge or close
- [ ] om-software PR **#196** — IVF Pre-Cycle Pack fixes (draft, 18 Jul): review + merge or close
- [ ] emr PR **#95** — staff home mockup: folds into Step 4; close once the real shell lands

---

*Keep this file honest: tick items as they complete, and strike through anything overtaken by
events with a one-line note. `docs/STATE.md` remains the session-by-session journal; this file
is the map.*
