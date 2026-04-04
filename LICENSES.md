# License Notes

Этот репозиторий после миграции стал монорепозиторием, поэтому в нём присутствуют компоненты с разными лицензиями.

## Components

- `apps/plugin` - MIT
- `packages/ui-svelte` - MIT
- `packages/tokens` - MIT
- `apps/control-plane` - Apache-2.0
- `apps/web-publish` - Apache-2.0 как часть server stack
- `infra`, `docs/server` - Apache-2.0 provenance from `evc-team-relay`
- `apps/relay-server` - external relay-server template provenance, смотреть `apps/relay-server/LICENSE`

## Rule

- При выносе кода наружу или повторном использовании ориентироваться на лицензию конкретного каталога.
- Root README и release docs не должны утверждать, что весь монорепозиторий находится только под одной лицензией.
- Canonical release/deploy docs должны ссылаться на `WoodGear1/evc-team-relay-selfhosted`, но это не меняет лицензию конкретных подсистем.
