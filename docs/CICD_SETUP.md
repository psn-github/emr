# Cloud build & deploy — setup guide

This repo is configured so the **build, test, and deploy run in the cloud**, not on your Mac. Your laptop’s only optional role is authoring — and even that can move to the browser via Codespaces. Here’s the model and the one-time setup.

## The model

```
   author code            build + test            deploy
  (Codespaces OR     →   (GitHub Actions,    →   (DigitalOcean VPS = staging;
   local clone)          GitHub's servers)        in-region host = production later)
```

- **GitHub** stores the code (you have this: psn-github/emr).
- **GitHub Actions** (`.github/workflows/ci.yml`) builds and tests on GitHub’s own servers on every push. No PHI — synthetic data only.
- **Deploy** (`.github/workflows/deploy.yml`) ships to the VPS after CI passes, gated by manual approval.
- **Codespaces** (`.devcontainer/`) gives a full browser-based dev environment so code authoring needs no Mac setup.

> **Residency note (important):** DigitalOcean has no GCC/Kuwait region, so the VPS is for **staging / synthetic data only**. Production with real patient data must move to an in-region host (AWS Bahrain / Oracle Cloud Kuwait / equivalent) before go-live. See `docs/DECISIONS.md` ADR-0007. **Never load real PHI onto the DO VPS.**

## One-time setup

### 1. Repo secrets (Settings → Secrets and variables → Actions → New repository secret)

Add these so the deploy workflow can reach the VPS:

|Secret       |Value                                                                           |
|-------------|--------------------------------------------------------------------------------|
|`VPS_HOST`   |the VPS IP/hostname                                                             |
|`VPS_USER`   |the SSH user (e.g. `deploy` or `root`)                                          |
|`VPS_SSH_KEY`|a **private** SSH key whose public half is in the VPS’s `~/.ssh/authorized_keys`|

Generate a dedicated deploy key (don’t reuse a personal one):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key
# put deploy_key.pub on the VPS:
ssh-copy-id -i deploy_key.pub <user>@<vps-host>
# paste the contents of the PRIVATE file `deploy_key` into the VPS_SSH_KEY secret
```

### 2. Protect the deploy (Settings → Environments → New environment → `staging`)

- Add yourself as a **required reviewer** so deploys wait for your one-click approval.
- This is what makes deploy gated, not automatic.

### 3. One-time VPS prep

**Nothing to do manually (ADR-0070).** The deploy workflow self-bootstraps: on its first
run against a fresh VPS it clones the repo to `/opt/oxford-his` and runs
`scripts/vps-bootstrap.sh` — an idempotent script that installs Node 20 + pnpm (only if
absent), PostgreSQL (only if nothing is on :5432), creates the `oxford_staging` database with a
generated password in `/etc/oxford-his/api.env`, installs the `oxford-his-api` systemd unit, and
adds the nightly-backup cron line. Re-runs are no-ops. **Adding the three repo secrets above is
therefore the ONLY manual setup step.**

The API binds `127.0.0.1:8060` (dev bearer tokens are not internet-grade auth) — reach it via an
SSH tunnel (`ssh -L 8060:127.0.0.1:8060 <user>@<vps>`), or later via the optional nginx site
template (`deploy/nginx-oxford-his.conf`) with its own hostname + TLS.

> **om-software isolation:** the bootstrap and this stack touch only `/opt/oxford-his`,
> `/opt/oxford-his-data`, `/etc/oxford-his`, the `oxford-his-api` unit, the `oxford_staging`
> database and their backup cron line. `/opt/oxmedkw` and the om-software nginx sites — in daily
> clinical use — are never read or written.

### 4. (Optional) Codespaces — author without your Mac

On GitHub: **Code ▸ Codespaces ▸ Create codespace on main**. You get a browser VS Code with Node/pnpm/Docker ready. Edit, run, and push entirely in the cloud. The `.devcontainer/` config sets this up automatically.

## What runs when

- **Every push to `main` / every PR** → CI builds and tests (no-op until Phase 0 scaffolds the app, then full pipeline).
- **Push to `main`** → deploy workflow runs **path-based selective deploy** (each area — web/api/portal — redeploys only when its files change), waits for your approval on the `staging` environment, then ships to the VPS. Mirrors the `om-software` pattern.
- **Manual deploys** use the `Makefile` on the VPS (`make deploy`, `make deploy-api`, …), or trigger the workflow from the Actions tab with an `area` input.
- **Data-safety invariant** (database outside code, additive deploys, blocked destructive migrations, nightly backups, history survives every deploy) is enforced — see `docs/PATIENT-DATA.md`.

## Note on Claude Code

Claude Code authors code in a working copy (a Codespace or a local clone) and pushes to GitHub. The cloud pipeline above takes over from the push onward. There is no “Claude Code running inside GitHub” — but with Codespaces, the working copy lives in the cloud too, so your Mac is fully out of the loop.