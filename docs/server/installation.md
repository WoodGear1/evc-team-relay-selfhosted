# Installation Guide

This guide covers the canonical self-hosted stack from `WoodGear1/evc-team-relay-selfhosted`.

## Requirements

- Docker Engine 24+
- Docker Compose 2.20+
- DNS for `cp.<domain>`, `relay.<domain>`, and optionally `docs.<domain>`
- A server with at least 2 CPU cores, 4 GB RAM, and enough persistent storage for Postgres, MinIO, uploads, and backups

## Clone The Canonical Repo

```bash
git clone https://github.com/WoodGear1/evc-team-relay-selfhosted.git
cd evc-team-relay-selfhosted
```

## Configure Environment

```bash
cd infra
cp env.example .env
```

Set at minimum:

```bash
DOMAIN_BASE=yourdomain.com
ACME_EMAIL=admin@yourdomain.com
JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
MINIO_ROOT_PASSWORD=$(openssl rand -hex 16)
BOOTSTRAP_ADMIN_EMAIL=admin@yourdomain.com
BOOTSTRAP_ADMIN_PASSWORD=your-secure-password
WEB_PUBLISH_DOMAIN=docs.yourdomain.com
RELAY_PUBLIC_URL=wss://relay.yourdomain.com
```

## Configure Relay Runtime

```bash
cp relay/relay.toml.example relay/relay.toml
```

Adjust `relay/relay.toml` to match the MinIO and domain settings from `infra/.env`.

## DNS And Reverse Proxy

Point these records to the server running the stack:

- `cp.yourdomain.com`
- `relay.yourdomain.com`
- `docs.yourdomain.com`

Keep the `Caddyfile` token-to-Authorization proxy for WebSocket relay traffic. Removing it will break browser/plugin relay authentication.

## Deployment Modes

### Normal Path: image-first

This is the default production path. Services pull prebuilt images from:

- `ghcr.io/woodgear1/evc-team-relay-selfhosted/control-plane`
- `ghcr.io/woodgear1/evc-team-relay-selfhosted/web-publish`
- `ghcr.io/woodgear1/evc-team-relay-selfhosted/relay-server`

Deploy a tagged release:

```bash
export EVC_RELEASE_TAG=<release-tag>
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml pull
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d
```

### Break-glass Path: fallback

Use only when image-first deploy is blocked and you must enable patch mounts or local web build:

```bash
export EVC_RELEASE_TAG=<release-tag>
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d
```

## First Start Verification

```bash
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml ps
curl https://cp.yourdomain.com/server/info
curl https://docs.yourdomain.com/
```

Then open `https://cp.yourdomain.com/admin-ui/` and sign in with the bootstrap admin account.

## Updating

### Code sync

```bash
git pull --ff-only
```

### Standard production update

```bash
export EVC_RELEASE_TAG=<new-release-tag>
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml pull
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d
```

### Rollback

```bash
export EVC_RELEASE_TAG=<previous-release-tag>
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml pull
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d
```

## Troubleshooting

- `docker compose logs control-plane`
- `docker compose logs relay-server`
- `docker compose logs web-publish`
- `docker compose exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"`

## Related Docs

- `TRUENAS_GIT_DEPLOY_GUIDE.md`
- `docs/agent-infra-runbook.md`
- `docs/legacy-archive.md`
