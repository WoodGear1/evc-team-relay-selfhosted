# EVC Team Relay Self-Hosted Monorepo

Canonical repository: `WoodGear1/evc-team-relay-selfhosted`.

## What Lives Here

- `apps/plugin` - Obsidian plugin source and release assets
- `apps/control-plane` - FastAPI control-plane and workers
- `apps/web-publish` - SvelteKit web publishing frontend
- `apps/relay-server` - relay-server container source
- `infra` - base Docker Compose stack
- `deploy` - TrueNAS image-first override and break-glass fallback override
- `docs` - install, deploy, archive, and agent docs
- `packages` - local shared frontend packages

## Canonical Release Contract

- Plugin assets are released from this repository.
- Docker images are published to `ghcr.io/woodgear1/evc-team-relay-selfhosted`.
- Normal production deploy is image-first:
  - `ghcr.io/woodgear1/evc-team-relay-selfhosted/control-plane:${TAG}`
  - `ghcr.io/woodgear1/evc-team-relay-selfhosted/web-publish:${TAG}`
  - `ghcr.io/woodgear1/evc-team-relay-selfhosted/relay-server:${TAG}`
- `deploy/docker-compose.fallback.yml` is break-glass only and exists for patch/local-build recovery.

## Local Verification

```bash
npm run build:plugin
npm run check:web
npm run build:web
cd apps/control-plane && uv run --python 3.12 pytest
docker compose -f infra/docker-compose.yml config
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml config
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml config
```

## Deploy Entry Points

- Standard server install and image-first updates: `docs/server/installation.md`
- TrueNAS operational runbook: `TRUENAS_GIT_DEPLOY_GUIDE.md`
- Agent-facing infra runbook: `docs/agent-infra-runbook.md`
- Legacy repository policy: `docs/legacy-archive.md`
- License notes: `LICENSES.md`
