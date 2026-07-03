# Oxford HIS — operational targets. The deploy workflow (.github/workflows/
# deploy.yml) calls `make check-migrations-safe` before any deploy and
# `make deploy[-<area>]` to ship. Deploy targets run on the VPS.
#
# RESIDENCY (ADR-0007): the VPS is STAGING / SYNTHETIC DATA ONLY — never real PHI.
# The staging API runs as the `oxford-his-api` systemd unit (deploy/
# oxford-his-api.service) reading its environment (DATABASE_URL, PORT) from
# /etc/oxford-his/api.env. The database lives OUTSIDE the deployed code
# (docs/PATIENT-DATA.md): deploys are additive; migrations are gated + forward-only.

API_ENV := /etc/oxford-his/api.env

.PHONY: check-migrations-safe migrate deploy deploy-web deploy-api deploy-portal

# DATA-SAFETY GATE (docs/PATIENT-DATA.md): block destructive migrations.
check-migrations-safe:
	node scripts/check-migrations-safe.mjs

# Forward-only migrations. Applies every packages/*/migrations/*.sql in order
# (the runner records applied files). Requires DATABASE_URL (sourced from the
# unit env file on the VPS when present).
migrate:
	@if [ -f $(API_ENV) ] && [ -z "$$DATABASE_URL" ]; then set -a; . $(API_ENV); set +a; fi; \
	node apps/api/dist/migrate.js 2>/dev/null || node --experimental-strip-types apps/api/src/migrate.ts

# Full deploy = every area (each area is itself selective + safe to re-run).
deploy: deploy-api deploy-web deploy-portal

# Staging API deploy (ADR-0064): gate → install → bundle → additive migrate →
# restart the systemd unit → probe /health. Safe to re-run; never destructive.
deploy-api: check-migrations-safe
	pnpm install --frozen-lockfile
	pnpm --filter @oxford/api run build:server
	$(MAKE) migrate
	@if systemctl list-unit-files oxford-his-api.service --no-legend 2>/dev/null | grep -q oxford-his-api; then \
		sudo systemctl restart oxford-his-api && sleep 2 && \
		PORT=$$(grep -s '^PORT=' $(API_ENV) | cut -d= -f2); \
		curl -sf "http://127.0.0.1:$${PORT:-8060}/health" >/dev/null && echo "deploy-api: healthy" || { echo "deploy-api: HEALTH CHECK FAILED"; exit 1; }; \
	else \
		echo "deploy-api: built + migrated (systemd unit not installed — see deploy/oxford-his-api.service)"; \
	fi

# UI shells land in Phase 7.4/7.5 (docs/PHASE7_PLAN.md); guarded no-ops until then.
deploy-web: check-migrations-safe
	@echo "deploy-web: no web shell yet (Phase 7.4) — nothing to deploy"

deploy-portal: check-migrations-safe
	@echo "deploy-portal: no portal shell yet (Phase 7.5) — nothing to deploy"
