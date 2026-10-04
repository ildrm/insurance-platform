#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
rtk proxy npm run build:backend
rtk proxy npm test
rtk proxy npm run lint
rtk proxy npm audit --omit=dev
rtk proxy npm run test:integration
rtk proxy npm run test:service
rtk proxy node dist/tests/renewal.integration.js
rtk proxy docker compose -p insurance-platform exec -T api node dist/tests/database.js
rtk proxy node tests/credential-isolation.mjs
rtk proxy npm run test:e2e --workspace=@insurance/customer-web
rtk proxy node tests/readiness.mjs
rtk proxy node tests/recovery-roundtrip.mjs
