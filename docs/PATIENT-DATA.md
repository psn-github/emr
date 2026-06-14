# PATIENT-DATA.md — where patient data lives & the data-safety invariant

> Mirrors the proven `om-software` convention: a single doc that states where patient data lives, the schema posture, how to query it, and how it survives every deploy. This is the EMR’s equivalent of `om-software`’s `docs/PATIENT-DATA.md`. **Claude Code: treat the invariant below as law — it matches CLAUDE.md and docs/02.**

## The data-safety invariant (inherited from om-software, hardened for the EMR)

1. **The database lives outside the deployed code.** Deploying new code never touches the data store. The running app and its data are separate lifecycles.
1. **Deploys are additive. Destructive migrations are blocked** in the deploy pipeline (`make check-migrations-safe` runs before any deploy; forward-only migrations only).
1. **Clinical data is append-only / soft-delete only.** No hard deletes of clinical records except via the documented, audited retention job (docs/03 §3).
1. **Patient & clinical history survives every deploy** — provably, because of (1)–(3).
1. **Backups run nightly**, encrypted, with tested restore (docs/02 §5). Backups inherit the residency rules.
1. **Every mutation is in the immutable, hash-chained audit log** (docs/02 §3, ADR-0003).

## Where data lives

- **Production:** an **in-region (GCC/Kuwait-permissible) managed PostgreSQL**, selected before go-live (ADR-0007). **Not** the DigitalOcean VPS — DO has no GCC region, so the VPS is staging/synthetic only and **must never hold real PHI**.
- **Staging:** PostgreSQL on the DO VPS (or a managed DB), **synthetic seed data only**.
- **CI:** a throwaway Postgres service container, synthetic data, destroyed each run.

> Contrast with om-software, which uses SQLite on the VPS — fine for those tools, but the EMR’s PHI volume, audit requirements, and residency rules require managed in-region Postgres. This difference is deliberate (ADR-0007).

## How to read historical records

*(Populated as Phase 0/1 build the access routes. Expected, mirroring om-software’s four routes:)*

- the app’s patient/cycle **timeline** view,
- the **documents/audit export** API (one-click per-entity audit trail, docs/01 §E12),
- direct **read access to the production Postgres** (restricted, audited),
- the **nightly backups**.

## How to restore a backup

The restore is **tested mechanically** by the drill `apps/api/src/restore-drill.e2e.test.ts`
(GO_LIVE_CHECKLIST A5): it seeds audited data, `pg_dump`s the source, restores into a
**fresh** database, then proves the restored **audit hash-chain verifies intact**
(`AuditLog.verifyIntegrity`) and the clinical/financial rows survived.

Production procedure:
1. **Locate** the latest nightly backup (encrypted, in-region — inherits the residency rules).
2. **Restore to a fresh instance** — never over the live DB:
   `pg_restore -d "<fresh-in-region-db-url>" --no-owner <backup-file>`
3. **Verify audit-chain integrity** on the restored instance before trusting it — run the
   drill / `runChainIntegrityCheck` against it (a break means the backup is compromised — stop).
4. **Point the app at it** by swapping the connection string (the DB lives outside the
   deployed code — invariant 1 — so this is a config change, no redeploy of data).

To run the drill locally against a Postgres: `DATABASE_URL=… pnpm --filter @oxford/api test src/restore-drill.e2e.test.ts`
(skips if `pg_dump`/`pg_restore` are absent).

**Still infra (go-live blocker):** the *nightly encrypted backup job itself* on the in-region
host — the restore + verification path is proven; scheduling/encryption is provisioned with the production DB (ADR-0007).

## Hard rules that keep this safe

See `CLAUDE.md` → hard rules, and docs/02 §1/§5. Every module that persists clinical data inherits this invariant; a PR that violates it fails review.