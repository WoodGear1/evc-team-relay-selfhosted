# TrueNAS And Git Deploy Guide

Production runbook for `WoodGear1/evc-team-relay-selfhosted`.

## Canonical Paths

- Repo checkout on TrueNAS: `/mnt/tank/docker-containers/obsidian-relay/code`
- Base compose: `infra/docker-compose.yml`
- Normal image-first override: `deploy/docker-compose.override.yml`
- Break-glass fallback override: `deploy/docker-compose.fallback.yml`
- Patch directory: `/mnt/tank/docker-containers/obsidian-relay/patches`
- Plugin runtime files: `/mnt/tank/docker-containers/reverse-proxy/plugin-dist`

## Release Contract

- Image namespace: `ghcr.io/woodgear1/evc-team-relay-selfhosted`
- Deploy tag variable: `EVC_RELEASE_TAG`
- Normal path: pull ready-made images from `GHCR`
- Fallback path: enable `deploy/docker-compose.fallback.yml` only for emergency recovery

## Access Check

```powershell
ssh root@truenas "hostname && cd /mnt/tank/docker-containers/obsidian-relay/code && git status --short --branch"
```

## Normal TrueNAS Deploy

### 1. Sync repo on NAS

```powershell
ssh root@truenas "cd /mnt/tank/docker-containers/obsidian-relay/code && git pull --ff-only"
```

### 2. Validate compose contract

```powershell
ssh root@truenas "cd /mnt/tank/docker-containers/obsidian-relay/code && docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml config > /tmp/obsidian-relay.compose.yaml"
```

### 3. Pull and apply a release tag

```powershell
ssh root@truenas "cd /mnt/tank/docker-containers/obsidian-relay/code && export EVC_RELEASE_TAG=<release-tag> && docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml pull"
ssh root@truenas "cd /mnt/tank/docker-containers/obsidian-relay/code && export EVC_RELEASE_TAG=<release-tag> && docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d"
```

### 4. Check service state

```powershell
ssh root@truenas "cd /mnt/tank/docker-containers/obsidian-relay/code && export EVC_RELEASE_TAG=<release-tag> && docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml ps"
ssh root@truenas "docker logs infra-control-plane-1 --tail 120"
ssh root@truenas "docker logs infra-web-publish-1 --tail 120"
ssh root@truenas "docker logs infra-relay-server-1 --tail 120"
```

## Fallback Deploy

Use only as break-glass recovery.

```powershell
ssh root@truenas "cd /mnt/tank/docker-containers/obsidian-relay/code && export EVC_RELEASE_TAG=<release-tag> && docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d"
```

## Plugin Runtime Files

### 1. Build locally

```powershell
cd f:\Development\ObsidianSinc\brat-repo
npm run build:plugin
```

### 2. Copy files to TrueNAS

```powershell
scp "f:\Development\ObsidianSinc\brat-repo\apps\plugin\main.js" "root@truenas:/mnt/tank/docker-containers/reverse-proxy/plugin-dist/main.js"
scp "f:\Development\ObsidianSinc\brat-repo\apps\plugin\manifest.json" "root@truenas:/mnt/tank/docker-containers/reverse-proxy/plugin-dist/manifest.json"
scp "f:\Development\ObsidianSinc\brat-repo\apps\plugin\manifest-beta.json" "root@truenas:/mnt/tank/docker-containers/reverse-proxy/plugin-dist/manifest-beta.json"
scp "f:\Development\ObsidianSinc\brat-repo\apps\plugin\styles.css" "root@truenas:/mnt/tank/docker-containers/reverse-proxy/plugin-dist/styles.css"
scp "f:\Development\ObsidianSinc\brat-repo\apps\plugin\versions.json" "root@truenas:/mnt/tank/docker-containers/reverse-proxy/plugin-dist/versions.json"
```

## Smoke Checks

```powershell
curl.exe https://cp.obsidian.wgwg.ru/server/info
curl.exe https://docs.wgwg.ru/
curl.exe "https://docs.wgwg.ru/login?return=%2Ftestovaya-papka-s-papkami"
```

## Rollback

### Roll back to previous image tag

```powershell
ssh root@truenas "cd /mnt/tank/docker-containers/obsidian-relay/code && export EVC_RELEASE_TAG=<previous-tag> && docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml pull && docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d"
```

### Exit fallback mode

```powershell
ssh root@truenas "cd /mnt/tank/docker-containers/obsidian-relay/code && export EVC_RELEASE_TAG=<stable-tag> && docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d"
```
