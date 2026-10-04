# Authoritative research register

Checked 2026-10-04 (Asia/Tehran). These are observed documentation baselines, not a tested dependency lock. Architecture is the present scope; the implementation-start compatibility gate must refresh releases, select exact stable patches, verify peer dependencies and integration behavior, and pin packages plus container digests. Never infer compatibility merely from minimum Node requirements.

| Source | Verified observation | Design consequence |
|---|---|---|
| [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) | Node minimum documented as 20.9; App Router React integration has framework-specific behavior | Test stable Next, declared React/React DOM peers and UI libraries together; standalone container output |
| [NestJS migration guide](https://docs.nestjs.com/migration-guide) | Current guide covers v12, ESM packages, CLI/runtime distinctions and TypeScript 6 migration | ESM is the initial candidate; verify decorators, OpenAPI generator, test runner and Temporal SDK against selected TypeScript |
| [Node release schedule](https://nodejs.org/en/about/previous-releases) | Node 24 and 22 listed LTS; Node 26 Current | Prefer compatible latest LTS for production; record reason if latest Current is rejected by dependency/support gate |
| [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | Current stable docs resolve to 18; superusers/BYPASSRLS bypass policies; owners normally bypass; FORCE available | Distinct migration/runtime roles; FORCE tenant RLS; scope constraints; test runtime role |
| [Docker production Compose](https://docs.docker.com/compose/how-tos/production/) | Production overrides are supported | Separate dev/test/prod overrides; Compose reference is a single-host deployment, not multi-host HA |
| [Compose merge rules](https://docs.docker.com/reference/compose-file/merge/) | `!override` requires Compose 2.24.4 or later | Verify/pin compatible Compose; prod ingress replaces the dev binding rather than retaining both |
| [PostgreSQL official image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md) | PostgreSQL 18+ uses versioned PGDATA and parent `/var/lib/postgresql` volume; supported secret `_FILE` fields are limited | Match volume path to selected major; preserve data on recreation; verify non-root UID and initdb/volume ownership |
| [Temporal workflows](https://docs.temporal.io/workflows), [timeouts](https://docs.temporal.io/develop/typescript/workflows/timeouts), [versioning](https://docs.temporal.io/develop/typescript/workflows/versioning) | Durable workflow execution with explicit timeout and versioning facilities | Deterministic orchestrators, idempotent activities, replay tests and compatible worker upgrades |
| [NATS JetStream](https://docs.nats.io/concepts/jetstream) | Persistence, replay and at-least-once delivery | Outbox/inbox required; no end-to-end exactly-once claim |
| [Keycloak protocol overview](https://www.keycloak.org/securing-apps/overview) | OIDC, OAuth2 and SAML support | Standards-based IdP adapter; validate passkey, MFA, recovery and phone-auth flows in spike |
| [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/) | Official instrumentation and signal guidance | Pin compatible SDK/exporter set; initialize before framework imports; signal-specific compatibility tests |
| [NIST SP 800-63-4](https://pages.nist.gov/800-63-4/) | Final revision 4 released in 2025 | Risk-assess IAL/AAL/FAL separately; recovery cannot weaken authentication |
| [OWASP ASVS releases](https://github.com/OWASP/ASVS/releases) | Stable 5.0.0; development builds distinguished | ASVS 5.0.0 level 2 baseline; selected level 3 controls for critical data/admin functions |
| [OWASP API Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/) | Object authorization, authentication and business-flow risks explicitly covered | Negative resource authorization, SSRF and business-abuse tests |
| [PCI SSC library](https://www.pcisecuritystandards.org/document_library/?class=pcidss&doc=pci_dss) | PCI DSS 4.0.1 listed | Hosted/tokenized payments reduce exposure; assessor determines actual scope and applicable controls |
| [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Stable Recommendation | AA target; keyboard, screen reader, accessible authentication and stressful FNOL testing |
| [HL7 published versions](https://hl7.org/fhir/directory.html) | R5 5.0.0 published; R6 entries under work in progress | Negotiate carrier/provider version and implementation guide; no assumption every provider accepts R5 |
| [OpenAPI current specification](https://spec.openapis.org/oas/latest.html) | Current URL resolves to 3.2.1 | Compare with generator support; start contract dialect at 3.1.1 if 3.2.1 toolchain spike fails; document accepted lag |

ACORD public standards pages could not be retrieved in this session. ACORD adapter feasibility, licensed schemas, line-of-business version and certification must be confirmed directly with ACORD/carrier before claiming conformity. No ACORD schema has been invented.

## Implementation-start version lock procedure

1. In a containerized spike resolve stable package releases from official registries; capture release URLs, exact versions, engines and peers. Include Next, React, React DOM, Nest common/core/platform/testing/swagger, TypeScript, Node, pnpm, SQL driver/query builder, Temporal SDK, NATS client, decimal library and test tooling.
2. Test one quote-to-policy slice, RLS pooled transactions, OpenAPI code generation, workflow replay and four frontend production builds on arm64 and amd64. Reject prereleases; choose the newest mutually compatible stable tuple rather than independently newest versions.
3. Resolve OCI images to version plus digest; verify origin, license/support, signatures, SBOM and vulnerability policy. Include PostgreSQL version compatibility with Keycloak and Temporal SQL schema tooling. Record OS/libc compatibility for native modules.
4. Commit exact package manifests, frozen lockfile, `versions.lock.json`, image digest manifest and the compatibility results. CI rejects ranges, mutable tags and undocumented exceptions. Repeat on upgrades; never change published rule-engine versions by an application dependency update.

No exact application package or image pins are asserted here: implementation has not begun and no dependency compatibility spike has been executed.
