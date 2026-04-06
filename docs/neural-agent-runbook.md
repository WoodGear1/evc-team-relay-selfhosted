# Neural Agent Runbook

Подробный runbook для агента, который работает с текущей инфраструктурой `WoodGear1/evc-team-relay-selfhosted`.

Этот файл не про архитектуру "вообще", а про практическую работу с живой системой: как проверить текущее состояние, как безопасно деплоить, как не сломать прод, как действовать при fallback, как проверять published links, comments и plugin runtime.

## Назначение файла

Использовать этот документ, когда агенту нужно:

- понять, что сейчас является source of truth;
- обновить TrueNAS deploy;
- применить patch overlay;
- пересобрать `web-publish`;
- проверить живую систему после изменений;
- синхронизировать plugin runtime assets;
- понять, почему прод находится в fallback-режиме;
- выполнить rollback или подготовить выход из fallback обратно в чистый image-first.

Если есть расхождение между старыми локальными заметками и этим документом, доверять этому файлу и текущему monorepo.

## Source Of Truth

### Canonical repository

- Canonical repo: `WoodGear1/evc-team-relay-selfhosted`
- Локальный workspace: `f:\Development\ObsidianSinc\brat-repo`
- TrueNAS checkout: `/mnt/tank/docker-containers/obsidian-relay/code`

### Канонические compose-файлы

- База: `infra/docker-compose.yml`
- Нормальный production override: `deploy/docker-compose.override.yml`
- Break-glass / recovery override: `deploy/docker-compose.fallback.yml`

### Канонические runtime-пути на TrueNAS

- Корень проекта на NAS: `/mnt/tank/docker-containers/obsidian-relay`
- Checkout кода: `/mnt/tank/docker-containers/obsidian-relay/code`
- Patch overlay: `/mnt/tank/docker-containers/obsidian-relay/patches`
- Plugin runtime files: `/mnt/tank/docker-containers/reverse-proxy/plugin-dist`
- Runtime relay config: `/mnt/tank/docker-containers/obsidian-relay/code/infra/relay/relay.toml`
- Runtime env: `/mnt/tank/docker-containers/obsidian-relay/code/infra/.env`

## Текущее фактическое состояние прод-инфры

На момент последней проверки production работает так:

- `control-plane` работает из GHCR image `ghcr.io/woodgear1/evc-team-relay-selfhosted/control-plane:1.1.7-wgwg.11-test.2`
- `relay-server` работает из GHCR image `ghcr.io/woodgear1/evc-team-relay-selfhosted/relay-server:1.1.7-wgwg.11-test.2`
- `web-publish` работает как локально собранный fallback container `infra-web-publish`
- compose запускается через:
  - `infra/docker-compose.yml`
  - `deploy/docker-compose.override.yml`
  - `deploy/docker-compose.fallback.yml`

### Почему прод сейчас в fallback

Во время реального TrueNAS deploy были найдены и сняты такие блокеры:

1. В Postgres enum `auditaction` не хватало значений для новых событий:
  - `link_created`
  - `comment_thread_created`
  - и других web publish / comments событий
2. В backend не хватало публичных web endpoints для published link slug:
  - `/v1/web/links/{slug}`
  - `/v1/web/links/{slug}/auth`
  - `/v1/web/links/{slug}/validate`
3. GHCR `web-publish` image на проверенном теге ещё не содержал эти runtime-фиксы.

Итог:

- production сделан рабочим через fallback mode;
- пока новый tag и новые GHCR images не выпущены, fallback считать штатным рабочим состоянием;
- не выключать fallback "для чистоты" без нового image-first release cycle.

## Как агент должен мыслить перед любым изменением

Перед действием агент должен ответить себе на 4 вопроса:

1. Изменение уже попало в GitHub и есть ли для него image tag?
2. Достаточно ли normal image-first deploy, или код ещё только локально/в patch overlay?
3. Меняется только `web-publish`, только `control-plane`, только plugin или сразу несколько слоёв?
4. После изменений какой smoke подтвердит именно пользовательский сценарий, а не только health контейнера?

### Быстрая классификация изменений

- Изменился только GHCR-ready код и уже есть новый tag:
  - использовать normal image-first deploy
- Изменился `web-publish`, но образ ещё не выпущен:
  - использовать fallback build
- Изменился mounted patch `control-plane`:
  - синхронизировать patch-файл и пересоздать `control-plane`
- Изменился plugin:
  - синхронизировать release assets в `plugin-dist`
- Изменились enum/migrations/runtime DB expectations:
  - проверять реальный Postgres runtime отдельно

## Preflight Checklist

Перед деплоем всегда делать preflight.

### 1. Проверить текущий stack state

```bash
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml ps
```

### 2. Проверить ключевые логи

```bash
docker logs infra-control-plane-1 --tail 120
docker logs infra-web-publish-1 --tail 120
docker logs infra-relay-server-1 --tail 120
```

### 3. Проверить внешние endpoints

```bash
curl https://cp.obsidian.wgwg.ru/server/info
curl https://docs.wgwg.ru/
```

### 4. Проверить checkout на TrueNAS

Проверить:

- что checkout указывает на canonical repo;
- что в `code` лежит нужный commit;
- что runtime-файлы `.env` и `relay.toml` не потеряны;
- что patch overlay не рассинхронизирован со свежим кодом.

Команды:

```bash
git -C /mnt/tank/docker-containers/obsidian-relay/code remote -v
git -C /mnt/tank/docker-containers/obsidian-relay/code rev-parse HEAD
git -C /mnt/tank/docker-containers/obsidian-relay/code status --short
ls -lah /mnt/tank/docker-containers/obsidian-relay/code/infra
ls -R /mnt/tank/docker-containers/obsidian-relay/patches
```

## Image And Release Contract

### GHCR namespace

- `ghcr.io/woodgear1/evc-team-relay-selfhosted/control-plane`
- `ghcr.io/woodgear1/evc-team-relay-selfhosted/web-publish`
- `ghcr.io/woodgear1/evc-team-relay-selfhosted/relay-server`

### Runtime tag variable

- `EVC_RELEASE_TAG`

### Основное правило

Если есть валидный release tag, агент не должен использовать `latest` как production target "по привычке". Production target должен быть либо:

- конкретный tag через `EVC_RELEASE_TAG`, либо
- fallback build из актуального checkout, если tag ещё не включает нужные фиксы.

## Deploy Modes

### Mode A: Normal image-first deploy

Использовать, когда:

- нужные изменения уже попали в canonical repo;
- release tag уже существует;
- GHCR image уже содержит нужный код;
- нет необходимости в patch overlay или локальном build `web-publish`.

Команды:

```bash
export EVC_RELEASE_TAG=<release-tag>
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml config
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml pull
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml ps
```

### Mode B: Fallback deploy

Использовать, когда:

- GHCR image ещё не включает нужные фиксы;
- нужно собрать `web-publish` из текущего checkout;
- нужно подмонтировать patch overlay для `control-plane`;
- нужно быстро восстановить production без ожидания нового release cycle.

Команды:

```bash
export EVC_RELEASE_TAG=<release-tag>
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml config
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d --build
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml ps
```

### Mode C: Patch-only refresh for control-plane

Использовать, когда:

- изменился только patch-mounted backend код;
- rebuild `web-publish` не нужен;
- требуется быстро пересоздать `control-plane`.

Команда:

```bash
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d --force-recreate control-plane
```

## Patch Overlay Map

Ниже перечислены критичные patch-файлы, которые агент должен знать.

### Основные backend patch-файлы

- `/mnt/tank/docker-containers/obsidian-relay/patches/web.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/main.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/models.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/security.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/token_service.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/tokens.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/admin_ui.py`

### Published links / comments patch-файлы

- `/mnt/tank/docker-containers/obsidian-relay/patches/routers/published_links.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/routers/comments.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/services/published_link_service.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/services/comment_service.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/schemas/published_link.py`

### Миграционные patch-файлы

- `/mnt/tank/docker-containers/obsidian-relay/patches/migrations/202604020001_add_published_links_comments.py`
- `/mnt/tank/docker-containers/obsidian-relay/patches/migrations/202604020002_backfill_published_links.py`

### Что особенно важно

Если меняется логика доступа по published link slug, первым кандидатом на синхронизацию всегда является:

- `/mnt/tank/docker-containers/obsidian-relay/patches/web.py`

Если меняется lifecycle links/comments:

- сначала синхронизировать `published_link_service.py`, `comment_service.py`, `published_links.py`, `comments.py`, `published_link.py`;
- потом пересоздать `control-plane`.

## Как синхронизировать patch-файлы

### Подход

Нельзя считать, что локальная правка в repo автоматически оказалась в fallback overlay на NAS. Для patch-mounted файлов агент должен отдельно обеспечить sync.

### Пример sync одного patch-файла

```bash
scp "<local-file>" "root@truenas:/mnt/tank/docker-containers/obsidian-relay/patches/<target-file>"
```

### После sync patch-файла

Если изменился backend patch:

```bash
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d --force-recreate control-plane
```

Если изменился web layer и нужен rebuild:

```bash
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d --build
```

## Работа с web-publish

### Когда нужен rebuild `web-publish`

Пересобирать `web-publish`, если менялись:

- `apps/web-publish/src/**`
- `apps/web-publish/package.json`
- `apps/web-publish/Dockerfile`
- runtime логика SSR route loaders;
- `docs` frontend API proxy;
- behaviour password/member auth на клиенте.

### Команда для rebuild

```bash
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d --build web-publish
```

### После rebuild обязательно проверить

- `docker logs infra-web-publish-1 --tail 120`
- `curl https://docs.wgwg.ru/`
- конкретные published-link URLs

## Работа с control-plane

### Когда достаточно recreate

Если менялись patch-mounted Python-файлы и образ не пересобирался:

```bash
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml -f deploy/docker-compose.fallback.yml up -d --force-recreate control-plane
```

### Когда нужно отдельно проверить БД

Отдельно проверить Postgres runtime, если менялись:

- enum values;
- Alembic migrations;
- `models.py`;
- `audit_logs`;
- `published_links`;
- `comment_threads`;
- `comment_items`.

### Типичная ошибка

Если backend код уже пишет новые `AuditAction`, а Postgres enum не обновлён, можно получить ошибки вида:

- `invalid input value for enum auditaction: "link_created"`

В такой ситуации:

1. не спорить с runtime;
2. проверить enum в реальном Postgres;
3. применить корректное расширение enum;
4. добавить/проверить миграцию в repo;
5. повторить API flow.

## Plugin Runtime

### Источник plugin assets

Если нужен runtime sync плагина на NAS, брать assets из GitHub Release, а не из произвольной локальной build-папки.
Если нужен break-glass sync из локального дерева, canonical source только `apps/plugin` после `npm run build:plugin`.
Не использовать `.tmp-plugin-release` и другие ad-hoc каталоги как источник runtime assets.

### Команда для синхронизации и проверки

```powershell
cd f:\Development\ObsidianSinc\brat-repo
npm run build:plugin
npm run sync:plugin-dist
```

### Нужные файлы

- `main.js`
- `manifest.json`
- `manifest-beta.json`
- `styles.css`
- `versions.json`

### Куда копировать

- `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/main.js`
- `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/evc-relay-main.js`
- `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/manifest.json`
- `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/manifest-beta.json`
- `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/styles.css`
- `/mnt/tank/docker-containers/reverse-proxy/plugin-dist/versions.json`

### Как проверять plugin runtime

Проверить:

- что файлы реально обновились на NAS;
- что размер и timestamp изменились;
- что release tag соответствует ожидаемому asset-набору;
- что агент не залил "левый" локальный `main.js`, не совпадающий с GitHub Release.

## Обязательный Smoke Test

После изменений агент должен проверить не только health контейнера, но и пользовательские сценарии.

### Минимальный smoke

- `https://cp.obsidian.wgwg.ru/server/info` -> `200`
- `https://docs.wgwg.ru/` -> `200`
- `docker compose ... ps` -> ключевые сервисы healthy

### Access smoke

- private share без логина -> `401`
- protected link без auth -> password modal или pre-auth `200` page с password form
- protected link после `POST /api/auth` -> открывается
- members link без логина -> `401`
- members link после `POST /api/auth/login` -> открывается

### Published links smoke

- `GET /v1/web/links/{slug}` -> `200`
- `POST /v1/web/links/{slug}/auth` для protected link -> `200`
- `GET /v1/web/links/{slug}/validate` -> корректный ответ

### Comments smoke

- `POST /api/comments` через `docs` proxy -> `201`
- `GET /api/comments?link_id=...` -> `200`
- в ответе видно созданный comment thread/item

### Plugin smoke

- файлы в `plugin-dist` существуют;
- `main.js` и `manifest*.json` соответствуют ожидаемому release;
- если нужно, plugin asset доступен с runtime mirror.

## Практический smoke workflow для агента

Если нужно быстро проверить end-to-end published links, безопасный шаблон такой:

1. Логин админом в `control-plane`
2. Создать отдельный smoke user
3. Создать отдельный smoke share
4. Добавить smoke user как member
5. Создать:
  - protected published link
  - members published link
6. Проверить:
  - protected page до auth
  - protected auth через `docs` proxy
  - members page до login
  - members login через `docs` proxy
  - comments create/read через `docs` proxy

Если smoke fixture больше не нужен, удалить его только если это не разрушит расследование и не помешает дальнейшей проверке.

## Rollback

### Rollback image-first

Если есть предыдущий хороший tag:

```bash
export EVC_RELEASE_TAG=<previous-good-tag>
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml pull
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml up -d
docker compose -f infra/docker-compose.yml -f deploy/docker-compose.override.yml ps
```

### Rollback plugin runtime

Восстановить предыдущие release assets в `plugin-dist`.

### Rollback после fallback

Если включён fallback и нужно вернуться обратно:

1. убедиться, что новый GHCR image уже содержит все критичные фиксы;
2. отключить fallback override;
3. запустить stack только через `base + override`;
4. повторить полный smoke.

## Что нужно сделать, чтобы вернуться в чистый image-first режим

1. Закоммитить и запушить последние правки `control-plane`
2. Убедиться, что в repo есть миграция для новых `auditaction` enum values
3. Выпустить новый tag
4. Дождаться новых GHCR images
5. Переключить TrueNAS на `base + override` без fallback
6. Повторить smoke:
  - `server/info`
  - `docs root`
  - protected link
  - members link
  - comments flow
  - plugin runtime assets

## Анти-футганы

- Не использовать старый repo `entire-vc/evc-team-relay` как source of truth
- Не считать `latest` production target, если есть конкретный tag
- Не выключать fallback просто потому, что "так красивее", пока новый image реально не включает нужные фиксы
- Не предполагать, что GHCR image уже содержит локальные незакоммиченные правки
- Не ограничиваться изменением файла без применения его в контейнере
- Не считать зелёный `docker ps` достаточным признаком успешного deploy
- Не забывать проверять именно published link flow, а не только legacy share slug flow
- Не забывать про Postgres runtime при изменениях enum и migrations
- Не синхронизировать plugin runtime из случайной локальной сборки, если уже есть проверенный GitHub Release

## Когда нужно остановиться и доложить, а не продолжать вслепую

Агент должен остановиться и явно сформулировать блокер, если:

- требуется destructive действие по git или docker;
- на NAS checkout обнаружены неожиданные чужие изменения;
- production runtime расходится с документацией и это нельзя безопасно исправить одной операцией;
- для продолжения нужен новый GitHub release/tag;
- внешний сервис или домен недоступен и причина вне текущего репозитория.

## Связанные файлы

- `docs/agent-infra-runbook.md`
- `TRUENAS_GIT_DEPLOY_GUIDE.md`
- `docs/server/installation.md`

## Короткий итог для агента

Если нужно запомнить только одно:

- source of truth находится в `WoodGear1/evc-team-relay-selfhosted`;
- production сейчас рабочий, но в fallback mode;
- published links и comments уже проверены end-to-end;
- before touching prod, always check `ps`, logs, `server/info`, `docs root`, and one real protected/member link flow;
- после любых изменений доводи их до реального контейнера и повторяй smoke.

