# EVC Team Relay Self-Hosted BRAT Build

Готовый репозиторий для установки через BRAT.

## Что делает этот репозиторий

- хранит self-hosted сборку `evc-team-relay`
- содержит BRAT-совместимые файлы: `manifest.json`, `main.js`, `styles.css`, `versions.json`
- ставится в Obsidian через ссылку на GitHub-репозиторий

## Как опубликовать

1. Создай **public GitHub repository** `WoodGear1/evc-team-relay-selfhosted`
2. Залей в корень репозитория содержимое этой папки
3. Создай release/tag с версией **`1.1.7-wgwg.1`**
4. Прикрепи к release файлы:
   - `main.js`
   - `manifest.json`
   - `styles.css`
5. После публикации пользователи в BRAT вставляют:

```text
https://github.com/WoodGear1/evc-team-relay-selfhosted
```

## Что вводит пользователь

В Obsidian:

1. `Settings`
2. `BRAT`
3. `Add Beta plugin`
4. Вставить URL репозитория
5. `Add Plugin`

## Важно

- BRAT работает с GitHub-репозиториями, а не с прямыми URL на `main.js`
- runtime-сервер остаётся `https://cp.obsidian.wgwg.ru`
- эта сборка нужна только для удобной установки и обновления плагина
