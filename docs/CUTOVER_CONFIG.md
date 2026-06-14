# CUTOVER_CONFIG.md — pending config & counsel values (go-live register)

> Every value the build deliberately left as **configuration / counsel-confirmed**,
> with its **safe default today**, **where it plugs in**, and **who must confirm**.
> The system is built so each drops in as data — **no code change** — but go-live is
> gated on the items marked **BLOCKING**. Conservative defaults never take the
> permissive path (CLAUDE.md): where a value is unset, the safe/closed behaviour
> applies.

## Clinical / Kuwaiti-law (counsel + Medical Director)

| Item | Safe default now | Plugs in at | Confirm | Gate |
|------|------------------|-------------|---------|------|
| **Permitted PGT indications** | **empty set → all PGT orders rejected** | `PGT_PERMITTED_INDICATIONS` (apps/api/context.ts) | clinic counsel (AMD-0004) | BLOCKING for PGT |
| **Marital-status-change disposition rule** | non-engagement pathway never auto-destroys; disposition is a reviewed human step | cryostore disposition flow | counsel (AMD-0004) | BLOCKING for that disposition path |
| **MOH cryo-storage max period** | annual billing + consent-expiry; lapse → review (no auto-destroy) | cryostore storage/consent config (ADR-0022) | MOH regs | non-blocking (review pathway safe) |
| **Kuwaiti controlled-drugs schedule (which drugs/classes)** | the per-item `controlled` flag (explicit; nothing slips through) | catalogue `controlled` + CD register (AMD-0005) | counsel/MOH | non-blocking (register works; schedule = reporting metadata) |
| **MOH controlled-drugs reporting format/channel** | `periodReport` produces structured data | CD register report hook (AMD-0005) | MOH | BLOCKING for MOH CD submission |
| **Vienna-consensus KPI thresholds (exact competency/benchmark values)** | documented defaults in `DEFAULT_LAB_KPI_THRESHOLDS` | `AnalyticsService` overrides (ADR-0039) | lab director | non-blocking (informational, not a gate) |
| **MOH / accreditation report formats** | one-click audit export + structured KPI/outcome data ship | reporting read models (ADR-0039) | MOH/accreditation | BLOCKING for those submissions |

## Integrations / residency (engineering + ADR)

| Item | Safe default now | Plugs in at | Confirm | Gate |
|------|------------------|-------------|---------|------|
| **In-region production Postgres** | CI/staging Postgres only; VPS = synthetic | `createPool` connection (ADR-0007) | infra | BLOCKING |
| **Payment gateway (KNET + card)** | `StubPaymentGateway` behind `PaymentGatewayPort` | context.ts `paymentGateway` (ADR-0036) | in-region processor + PCI/residency review | BLOCKING for live payments |
| **RI Witness (CooperSurgical) adapter** | `RiWitnessStubProvider` behind the seam | context.ts `witnessProvider` (ADR-0018) | CooperSurgical scoping + residency | BLOCKING for live witnessing |
| **Key provider (vault)** | `LocalKeyProvider` | context.ts `keys` (ADR-0014) | in-region vault | BLOCKING |
| **Notification + web-push providers** | recording stubs (`RecordingNotificationProvider`, `RecordingPushProvider`) | context.ts | residency review (ADR-0006) | BLOCKING for live notifications/push |
| **om-software read access** | n/a | external | product owner | non-blocking |

## Clinic configuration data (populate before go-live)

Protocols · appointment types · consent sets · packages & cycle bundles · charge master · drug formulary · par levels · KPI thresholds · asset criticality flags · staff/credentials. All are versioned config tables (CLAUDE.md "configuration is data") — seed with clinic-confirmed values; no code change.

## How to clear an item

1. Confirm the value with the named owner.
2. Set the config (env/config table/adapter swap) — **not** a code edit to logic.
3. For an adapter (gateway/witness/vault/notification), land the real implementation behind the existing port + log a **residency ADR**.
4. Re-run the go-live gate (`docs/GO_LIVE_CHECKLIST.md §E`) and tick the row.
