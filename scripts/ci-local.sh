#!/usr/bin/env bash
# Runs the same checks as .github/workflows/ci.yml on this machine, against the committed code,
# and reports the result to GitHub as the commit status "ci/local" on HEAD.
#
#   pnpm run ci:local            run everything and report to GitHub
#   pnpm run ci:local -- --no-report   run everything, report nothing
#
# Why: GitHub Actions jobs for this repository are not started while the account's Actions
# billing is blocked, so the "test" check fails in seconds without running anything. This
# gives each commit a real result. It needs Docker (a throwaway Postgres 16), pnpm with the
# workspace already installed, and, to report, an authenticated GitHub CLI (`gh`).
#
# Differences from the workflow, on purpose: dependencies are not reinstalled (the existing
# install is used), and psql runs inside the Postgres container.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
REPORT=1
[ "${1:-}" = "--no-report" ] && REPORT=0

if [ -n "$(git status --porcelain)" ]; then
  echo "ci-local: the working tree has uncommitted changes; commit them first, so the result belongs to a commit." >&2
  exit 2
fi
SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
CONTEXT="ci/local"
PORT_DB=55470
CONTAINER="campusval-ci-local"
DB="postgresql://campusval:campusval@localhost:${PORT_DB}/campusval"
LOG_DIR=$(mktemp -d)
SERVER_PID=""

status() { # state description
  [ "$REPORT" = 1 ] || return 0
  gh api -X POST "repos/{owner}/{repo}/statuses/${SHA}" -f state="$1" -f context="$CONTEXT" -f description="$2" > /dev/null \
    || echo "ci-local: could not report the status to GitHub (is gh signed in?)" >&2
}
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2> /dev/null
  docker rm -f "$CONTAINER" > /dev/null 2>&1
}
trap cleanup EXIT

STEP_COUNT=0
step() { # name, then the command
  local name="$1"; shift
  STEP_COUNT=$((STEP_COUNT + 1))
  printf '\n== %s\n' "$name"
  if ! "$@" > "$LOG_DIR/step-$STEP_COUNT.log" 2>&1; then
    tail -40 "$LOG_DIR/step-$STEP_COUNT.log"
    echo "ci-local: FAILED at \"$name\" (full log: $LOG_DIR/step-$STEP_COUNT.log)"
    status failure "Failed: $name (local run of the CI workflow)"
    exit 1
  fi
  echo "   ok"
}

status pending "Running the CI workflow locally on ${SHORT}"
echo "ci-local: commit $SHORT; logs in $LOG_DIR"

docker rm -f "$CONTAINER" > /dev/null 2>&1
docker run -d --name "$CONTAINER" -e POSTGRES_USER=campusval -e POSTGRES_PASSWORD=campusval -e POSTGRES_DB=campusval \
  -p "${PORT_DB}:5432" postgres:16 > /dev/null || { status error "Could not start Postgres in Docker"; exit 1; }
for _ in $(seq 1 30); do docker exec "$CONTAINER" pg_isready -U campusval > /dev/null 2>&1 && break; sleep 1; done

export DATABASE_URL="$DB" NODE_ENV=test MSYS_NO_PATHCONV=1

schema_has_migration() {
  pnpm --filter @workspace/db run generate &&
    git diff --exit-code -- lib/db/drizzle &&
    test -z "$(git ls-files --others --exclude-standard -- lib/db/drizzle)"
}
migrations_on_empty_db() {
  pnpm --filter @workspace/api-server run build &&
    docker exec "$CONTAINER" psql -U campusval -d postgres -c "create database migration_check" &&
    DATABASE_URL="postgresql://campusval:campusval@localhost:${PORT_DB}/migration_check" node artifacts/api-server/dist/migrate.mjs
}
mobile_checks() {
  pnpm --filter @workspace/campusval-mobile run typecheck && pnpm --filter @workspace/campusval-mobile run test
}
boot_production_bundle() {
  NODE_ENV=production PORT=18090 CLERK_SECRET_KEY=sk_test_ci_placeholder \
    CLERK_PUBLISHABLE_KEY=pk_test_ZHVtbXkuY2xlcmsuYWNjb3VudHMuZGV2JA \
    node artifacts/api-server/dist/index.mjs > "$LOG_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:18090/api/healthz > /dev/null 2>&1 && break; sleep 1; done
  curl -fsS http://127.0.0.1:18090/api/healthz &&
    curl -fsS http://127.0.0.1:18090/api/readyz &&
    curl -fsS http://127.0.0.1:18090/ | grep -q 'id="root"' &&
    test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18090/api/progress-reports)" = "401"
  local ok=$?
  kill "$SERVER_PID" 2> /dev/null; SERVER_PID=""
  return $ok
}
misconfigured_server_refuses() {
  ! env -i PATH="$PATH" NODE_ENV=production node artifacts/api-server/dist/index.mjs 2> "$LOG_DIR/cfg.err" &&
    grep -q "DATABASE_URL" "$LOG_DIR/cfg.err"
}

step "Lint" pnpm run lint
step "Typecheck" pnpm run typecheck
step "Schema changes must ship with a migration" schema_has_migration
step "Push DB schema" pnpm --filter @workspace/db run push
step "Migrations apply cleanly to an empty database" migrations_on_empty_db
step "API server tests" pnpm --filter @workspace/api-server run test
step "Frontend tests" pnpm --filter @workspace/scu-advising run test
step "Mobile typecheck and tests" mobile_checks
step "Mobile app compiles for iOS and Android" pnpm --filter @workspace/campusval-mobile run bundle
step "Build frontend" pnpm --filter @workspace/scu-advising run build
step "Build API server" pnpm --filter @workspace/api-server run build
step "Boot the production bundle and check health/readiness" boot_production_bundle
step "A misconfigured server refuses to start, naming the variable" misconfigured_server_refuses

echo
echo "ci-local: all $STEP_COUNT steps passed on $SHORT"
status success "All $STEP_COUNT CI steps passed (local run of the CI workflow)"
