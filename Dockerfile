# syntax=docker/dockerfile:1
#
# CampusVal production image — a plain Node process that serves the API and the
# built web app on one port. No cloud-provider dependency: point it at any
# PostgreSQL and (optionally) a persistent volume for private APR storage.
# See docs/SCU_DEPLOYMENT.md.
#
#   docker build -t campusval --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_... .
#   docker run --rm -p 8080:8080 --env-file campusval.env campusval
#   docker run --rm --env-file campusval.env campusval node artifacts/api-server/dist/migrate.mjs
#
# VITE_CLERK_PUBLISHABLE_KEY is a PUBLIC key and is baked into the web bundle at
# build time (it is not a secret). Every secret is supplied at RUN time.

# ---- build ----------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
# Install only what the API and web app need (skips the Expo mobile app,
# the design sandbox and the Playwright suite).
RUN pnpm install --frozen-lockfile \
      --filter "@workspace/api-server..." \
      --filter "@workspace/scu-advising..."
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PROXY_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY} \
    VITE_CLERK_PROXY_URL=${VITE_CLERK_PROXY_URL}
RUN pnpm --filter @workspace/scu-advising run build \
 && pnpm --filter @workspace/api-server run build

# ---- runtime ----------------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0
WORKDIR /app
# The API bundle is self-contained (esbuild), so no node_modules are shipped.
# Layout mirrors the repo because the server looks for the web build at
# ../../scu-advising/dist/public and the migration runner for ../../../lib/db/drizzle.
COPY --from=build /repo/artifacts/api-server/dist artifacts/api-server/dist
COPY --from=build /repo/artifacts/scu-advising/dist/public artifacts/scu-advising/dist/public
COPY --from=build /repo/lib/db/drizzle lib/db/drizzle

# Private APR storage (PRIVATE_STORAGE_PROVIDER=local) lives here — mount a
# persistent volume at this path. Owned by the unprivileged runtime user.
RUN useradd --system --uid 10001 --no-create-home campusval \
 && mkdir -p /var/lib/campusval/private \
 && chown -R campusval:campusval /var/lib/campusval
USER campusval
VOLUME ["/var/lib/campusval/private"]

EXPOSE 8080
# Liveness only (no database call): a database outage must not restart-loop a healthy web process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
