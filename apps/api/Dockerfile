# syntax=docker/dockerfile:1
# Build context: repository root (npm workspaces share one lockfile).

FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Full deps to compile TypeScript.
FROM base AS build
RUN npm ci --workspace @dhaka-tesla/api
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npm run build --workspace @dhaka-tesla/api

# Runtime deps only (no tsx, drizzle-kit, vitest...).
FROM base AS prod-deps
RUN npm ci --workspace @dhaka-tesla/api --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
WORKDIR /app/apps/api
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
COPY --from=build /app/apps/api/docker-entrypoint.sh ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${API_PORT:-4000}/health" || exit 1
CMD ["./docker-entrypoint.sh"]
