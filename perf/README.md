# perf/ — load & concurrency baselines

Performance baselines for Oxford HIS. Two layers:

## 1. Audit-append concurrency (runnable today — the real bottleneck)

Every clinical/financial mutation appends to the single, hash-chained audit log,
which **serializes on one Postgres advisory lock** (`PgAuditChainStore`). That
lock is the system's tightest write bottleneck, so it is where a load test bites
first. It is proven directly, in CI, by:

- `packages/audit/src/concurrency.integration.test.ts` — fires N concurrent
  `audit.record()` calls against real Postgres and asserts **all N persist**, the
  chain is **gapless (seq 1..N) and verifies**, and no two records fork. This is
  the baseline that a load test would otherwise have to discover, and it caught
  the missing retry (ADR-0061): before the fix, ~48 of 50 concurrent appends
  *failed* with a conflict; after it, all land (serialized + bounded retry).

Run it (needs a Postgres):

```
DATABASE_URL=postgres://…  pnpm --filter @oxford/audit test -- concurrency
```

**What to watch as scale grows:** appends are intentionally serial, so audit
write throughput is bounded by lock hold time (one short transaction per
mutation). For this centre's scale (≤9 beds) that is ample; if a future
high-write workload needs more, the lever is batching appends or partitioning
the chain — a design change, not a tuning knob, and one that must preserve the
single verifiable chain (docs/PATIENT-DATA.md invariant 6).

## 2. HTTP load (k6) — activates with the tRPC HTTP host

`k6-api-load.js` is a ready k6 script for the hot read/write paths (portal read
model, KPI dashboard, a booking mutation). It is **not wired up yet**: the API
(`apps/api/src/index.ts`) is currently a composition root, and the tRPC/REST HTTP
host is deferred (ADR-0009). Once the host is mounted:

```
BASE_URL=https://staging.example  k6 run perf/k6-api-load.js
```

Fill in the procedure paths + input wire-format to match the mounted host
(tRPC `httpBatchLink` GET-for-queries / POST-for-mutations), and run it against
**staging only** (synthetic data — the DO VPS must never hold real PHI). The
thresholds in the script (p95 latency, error rate) are the pass/fail gate; treat
a rising audit-append conflict rate under load as the signal to revisit §1.
