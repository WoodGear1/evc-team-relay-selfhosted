# Agent Infra Runbook

This file is the agent-facing operational guide for `WoodGear1/evc-team-relay-selfhosted`.

## Canonical Repository

- Repository: `WoodGear1/evc-team-relay-selfhosted`
- Local workspace root: `f:\Development\ObsidianSinc\brat-repo`
- TrueNAS checkout: `/mnt/tank/docker-containers/obsidian-relay/code`

## Important Directories

- `apps/plugin` - Obsidian plugin assets and release flow
- `apps/control-plane` - FastAPI backend, Alembic migrations, workers
- `apps/web-publish` - SvelteKit public publishing frontend
- `apps/relay-server` - relay-server container source
- `infra` - base compose stack
- `deploy/docker-compose.override.yml` - normal image-first production override
- `deploy/docker-compose.fallback.yml` - break-glass fallback override

## Image And Release Contract

- Image namespace: `ghcr.io/woodgear1/evc-team-relay-selfhosted`
- Runtime image tag variable: `EVC_RELEASE_TAG`
- Normal deploy uses the same tag for:
  - `control-plane`
  - `web-publish`
  - `relay-server`
- Stable plugin release: tag matches `apps/plugin/manifest.json`
- Prerelease plugin release: tag does not match stable manifest version

## Normal Deploy Path

1. Verify repository state and target tag.
2. Sync the TrueNAS checkout with `git pull --ff-only`.
3. Export `EVC_RELEASE_TAG=<release-tag>`.
4. Run:
   - `docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml pull`
   - `docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d`
5. Inspect:
   - `docker compose ... ps`
   - `docker logs infra-control-plane-1 --tail 120`
   - `docker logs infra-web-publish-1 --tail 120`
   - `docker logs infra-relay-server-1 --tail 120`

## Fallback Path

Use only when image-first deploy is blocked and the operator explicitly needs patch mounts or local `web-publish` build.

Command:

- `docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d`

Fallback risks:

- Patch mounts can drift from git history if copied manually
- Fallback should be exited after the emergency is over

## Plugin Artifacts

- Built in `apps/plugin`
- Release assets come from GitHub Releases in the canonical repo
- Runtime mirror on TrueNAS:
  - `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/main.js`
  - `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/manifest.json`
  - `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/manifest-beta.json`
  - `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/styles.css`
  - `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/versions.json`

## Safe Agent Commands

- Safe without extra confirmation:
  - `git status`
  - `docker compose ... config`
  - `docker compose ... ps`
  - `docker logs ... --tail`
  - `curl` smoke checks
  - `pytest`
  - `npm run build:plugin`
  - `npm run check:web`
  - `npm run build:web`
- Require explicit confirmation if not already requested:
  - creating or pushing git tags
  - publishing releases
  - `docker compose up -d` on production
  - enabling fallback mode
  - copying manual patch files to TrueNAS
  - destructive docker or git commands

## Smoke Test Checklist

- `https://cp.obsidian.wgwg.ru/server/info`
- login works
- protected access works
- private and members access works
- folder share listing works
- comments on published links work
- `https://docs.wgwg.ru/` renders
- plugin assets are reachable from plugin-dist path or GitHub Release
- compose services are healthy

## Rollback Checklist

1. Set `EVC_RELEASE_TAG` to the previous good tag.
2. Re-run image-first `pull` and `up -d`.
3. Confirm `ps` and logs are healthy again.
4. If fallback was enabled, return to base + override only.
5. If plugin assets were updated, restore the previous release assets on TrueNAS.

## Notes For Agents

- Do not use old docs that reference `entire-vc/evc-team-relay`.
- Do not assume `latest` is the correct production target when a release tag is available.
- Do not leave the stack in fallback mode after recovery unless the operator explicitly wants that.
