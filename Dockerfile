# syntax=docker/dockerfile:1
#
# CampusVal production image — a plain Node process that serves the API and the
# built web app on one port. No cloud-provider dependency: point it at any
# PostgreSQL plus a private store for APR files (a persistent volume, or a
# private Cloud Storage bucket on Cloud Run). See docs/SCU_DEPLOYMENT.md and
# docs/migration/GCP_MIGRATION_CHECKLIST.md; cloudbuild.yaml builds and deploys it.
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
# The API bundle keeps ONE native package external: @napi-rs/canvas (draws PDF
# checksheet pages as images for the mobile app). Copy exactly the lockfile
# version, with its Linux binary, so that feature also works in the container.
RUN canvas_dir="$(readlink -f artifacts/api-server/node_modules/@napi-rs/canvas)" \
 && mkdir -p /runtime-deps/node_modules \
 && cp -rL "$(dirname "$canvas_dir")" /runtime-deps/node_modules/@napi-rs

# ---- runtime ----------------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0
WORKDIR /app
# The API bundle is self-contained (esbuild); the only node_modules shipped is
# the native package copied above. No dev dependencies, no source, no .env.
# Layout mirrors the repo because the server looks for the web build at
# ../../scu-advising/dist/public and the migration runner for ../../../lib/db/drizzle.
COPY --from=build /repo/artifacts/api-server/dist artifacts/api-server/dist
COPY --from=build /repo/artifacts/scu-advising/dist/public artifacts/scu-advising/dist/public
COPY --from=build /repo/lib/db/drizzle lib/db/drizzle
COPY --from=build /runtime-deps/node_modules node_modules

# Private APR storage when PRIVATE_STORAGE_PROVIDER=local — mount a persistent
# volume here. NOT used on Cloud Run, whose disk does not survive a restart:
# there, use PRIVATE_STORAGE_PROVIDER=gcs (a private Cloud Storage bucket).
# Owned by the unprivileged runtime user.
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
