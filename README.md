# Insurance platform

This repository contains a working TypeScript insurance platform: four Next.js portals, a NestJS API, PostgreSQL migrations, Temporal workflows, a NATS outbox, private S3 document storage, malware scanning, and container release builds.

Run the complete local stack with Docker Desktop/Engine and Compose:

```sh
rtk proxy sh scripts/dev-up.sh
```

The first run downloads pinned images and builds the applications. Secrets and a random demonstration password are generated under `.local/`, excluded from Git. That directory is restricted to the local user; mounted secret files are readable by the unprivileged container user. Re-running preserves both secrets and persistent data. The startup script does not delete volumes.

| Portal | URL | Local account |
|---|---|---|
| Customer | http://localhost:3100 | customer@example.test |
| Insurer/partner | http://localhost:3101 | underwriter@example.test, adjuster@example.test, finance@example.test, approver@example.test |
| Administration | http://localhost:3102 | admin@example.test |
| Developer | http://localhost:3103 | developer@example.test |

Read the password from `.local/demo-password`. The API is bound to localhost at port 3104. Database, messaging, workflow, scanner and storage ports are private to the Docker network.

The customer journey supports product comparison, exact premium calculation, underwriting referral, reviewed contract terms, purchase, asynchronous issuance, policy downloads, address endorsements, renewal quotes, cancellation requests, FNOL, and quarantined evidence uploads. Customers can also submit policy complaints, read the complete response/appeal timeline, and receive private in-app notifications. Partners assess claims within historical coverage and remaining policy limits, independently approve payment or decline decisions, pay approved claims, and prepare/approve/pay settlements. Administration creates product drafts for independent publication, handles complaint acknowledgements/investigations/resolutions/appeals, reports operational service targets, and reviews immutable audit records. Developers issue/revoke hashed credentials and register approved HTTPS webhooks with signed retries and delivery history.

Money is represented as integer minor-unit strings throughout. Issuance and payouts recover through stable provider operation keys and evidence queries; request timeouts remain pending rather than being treated as failure. Business changes, balanced append-only journals, audit records and outbox intents commit together. Runtime database roles cannot bypass forced row security or alter committed ledger records.

Verify a running stack:

```sh
rtk proxy npm ci --ignore-scripts
rtk proxy npm run build:backend
rtk proxy npm test
rtk proxy npm run lint
rtk proxy npm run test:integration
rtk proxy npm run test:service
rtk proxy node dist/tests/renewal.integration.js
rtk proxy docker compose -p insurance-platform exec -T api node dist/tests/database.js
rtk proxy node tests/credential-isolation.mjs
rtk proxy npm test --workspace=@insurance/ui
rtk proxy env PLAYWRIGHT_CHANNEL=chrome npm run test:e2e --workspace=@insurance/customer-web
rtk proxy node tests/readiness.mjs
rtk proxy node tests/recovery-roundtrip.mjs
rtk proxy node scripts/scan-release.mjs
```

The browser suite can use installed Chrome as shown, or `npx playwright install chromium` and the default Chromium channel. It exercises real UI/API workflows. Integration checks use the persistent sandbox; they create additional records and do not truncate data. `.github/workflows/release.yml` builds and verifies a fresh stack in CI.

The production build is [infrastructure/Dockerfile](infrastructure/Dockerfile). Its final images contain Node and five Debian runtime library packages with their scanner metadata/licences; they contain no shell, package manager or global npm. The separate [production Compose deployment](compose.production.yaml) adds automatic HTTPS ingress, requires tested release image references and externally managed services, excludes the sandbox provider and seed, and runs applications as UID/GID 65532 with read-only filesystems. Runtime secrets are mounted individually: API containers receive the API database credential, encryption key and S3 credentials; workers receive their additional credentials. Migration credentials are available only to the `operator` profile.

Use [the runtime configuration example](infrastructure/production-runtime.env.example) to supply `ops/runtime.env`, runtime files under `ops/secrets`, and migration credentials under `ops/operator-secrets`. Keep these host directories private and allow the container user to read the individual mounted files. Runtime and operator database URLs must use `sslmode=verify-full`; the migration owner needs administrative access to create roles and operate the security-definer functions behind forced RLS. Run the separate migration job with `docker compose -f compose.production.yaml --profile operator run --rm operator`. The same one-shot operator service runs `dist/apps/api/src/provision-tenant.js` to register insurers and `dist/apps/api/src/provision.js` to create accounts, with externally supplied parameters/password/TOTP file mounts. A person's additional accounts can use `PROVISION_PARTY_ID` to preserve canonical identity and independent approval checks. Never run the local Compose file as a live insurance deployment.

**Release boundary:** the default deployment is a fully executable sandbox. Its rating, tax, fee, carrier and payment rules are demonstration rules, and its policies do not bind legal coverage or move real funds. Production quotes fail closed unless the published product has explicit effective rating rules, approved terms, a certification reference and two independently approved adapter bindings; live carrier/payment adapter certification, approved product terms, jurisdiction-specific rules, payout beneficiary onboarding and operational launch approval remain required. Complaint time targets are configurable operational targets, not a claim of statutory compliance. Verified carrier-decline refund compensation is implemented. The reference blueprint describes a broader target than this initial implemented release. Multiple claim items/payees, confirmed policy cancellation/refund workflows, named live-provider connectors/certification, adapter credential rotation/revocation, advanced fraud/reinsurance, enterprise SSO and disaster-recovery certification remain outside this release.

Backups use authenticated encryption and restore into a new database only:

```sh
rtk proxy env BACKUP_KEY_FILE=/path/to/offline-key node scripts/backup.mjs
rtk proxy env BACKUP_KEY_FILE=/path/to/offline-key node scripts/restore.mjs .local/backups/backup.pg.aes restore_verification
```

Use at least 32 random bytes for the recovery key and keep it outside this repository and backup directory. These helper scripts back up and restore the local Compose PostgreSQL service; production operators should schedule PostgreSQL point-in-time recovery, object-store replication and Temporal backups with their managed services. A single local Docker host does not provide high availability.

Production scanner readiness and each scan require readable, current signature metadata. Configure the managed scanner for UTC, keep its `VERSION` command enabled and maintain its signature update path. `CLAMAV_MAX_SIGNATURE_AGE_HOURS` defaults to 72 and accepts 1–168; stale definitions keep documents quarantined. This is an operational target, not a statutory requirement.

The original [architecture blueprint](docs/architecture/blueprint.md), [requirements](docs/architecture/catalogues/README.md), [state machines](docs/architecture/state-machines.md), and [ADRs](docs/architecture/adrs.md) remain useful design references. `infrastructure/reference/` contains design templates; the executable deployment is the root `compose.yaml`.

The [release review](docs/releases/0.1.0-review.md) records fixes, additional implementation, actual verification and remaining scope. Local release evidence is under `artifacts/release/`; regenerate its integrity manifest after exporting and scanning the final images with `rtk proxy node scripts/release-manifest.mjs`.

Validate the design artifacts:

```sh
rtk proxy python3 docs/architecture/tools/build_catalogues.py
rtk proxy python3 docs/architecture/tools/validate.py
rtk proxy python3 docs/architecture/tools/validate_compose.py
```
