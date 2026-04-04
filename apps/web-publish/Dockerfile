FROM node:20-alpine AS builder

WORKDIR /repo

COPY package.json ./
COPY apps/web-publish/package.json ./apps/web-publish/package.json
COPY packages/ui-svelte/package.json ./packages/ui-svelte/package.json
COPY packages/tokens/package.json ./packages/tokens/package.json

RUN npm install --legacy-peer-deps

COPY apps/web-publish ./apps/web-publish
COPY packages/ui-svelte ./packages/ui-svelte
COPY packages/tokens ./packages/tokens

RUN npm --workspace apps/web-publish run build
RUN npm prune --omit=dev

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /repo/apps/web-publish/build ./build
COPY --from=builder /repo/apps/web-publish/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "build"]
