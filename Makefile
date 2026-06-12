# Oxford HIS — operational targets. The deploy workflow (.github/workflows/
# deploy.yml) calls `make check-migrations-safe` before any deploy and
# `make deploy[-<area>]` to ship. Deploy targets run on the VPS.

.PHONY: check-migrations-safe migrate deploy deploy-web deploy-api deploy-portal

# DATA-SAFETY GATE (docs/PATIENT-DATA.md): block destructive migrations.
check-migrations-safe:
	node scripts/check-migrations-safe.mjs

# Forward-only migrations. Applies every packages/*/migrations/*.sql in order
# (the runner records applied files). Requires DATABASE_URL.
migrate:
	node apps/api/dist/migrate.js 2>/dev/null || node --experimental-strip-types apps/api/src/migrate.ts

# Selective deploy targets (invoked by deploy.yml on the VPS). Real build/restart
# steps land with the deployment hardening; kept guarded so the pipeline is safe.
deploy: check-migrations-safe
	@echo "deploy: full deploy placeholder — wire build+restart on the VPS"

deploy-web: check-migrations-safe
	@echo "deploy-web: placeholder"

deploy-api: check-migrations-safe
	@echo "deploy-api: placeholder"

deploy-portal: check-migrations-safe
	@echo "deploy-portal: placeholder"
