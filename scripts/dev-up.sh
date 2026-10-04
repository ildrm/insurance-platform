#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
rtk proxy node scripts/bootstrap.mjs
# Existing local workers compete with builds for Docker VM memory.
rtk proxy docker compose -p insurance-platform stop api mock worker workflow-worker integration-worker temporal clamav storage
completed=false
trap 'if [ "$completed" != true ]; then rtk proxy docker compose -p insurance-platform start >/dev/null 2>&1 || true; fi' EXIT
for app in api customer-web partner-web admin-web developer-web; do
  rtk proxy docker compose -p insurance-platform build "$app"
done
rtk proxy docker compose -p insurance-platform up -d --no-build --wait --wait-timeout 600
completed=true
