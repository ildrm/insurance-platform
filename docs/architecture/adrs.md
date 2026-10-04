# Architecture decision records

All records dated 2026-10-04. Status: accepted design unless conditional. Package releases remain subject to implementation compatibility gate in [research](research.md). Each record specifies the replacement/extraction trigger, not a popularity justification.

## ADR-001 — Modular monolith with workers

**Context:** Insurance invariants and financial consistency need explicit ownership; team size/load/residency are unknown. **Decision:** Nest modular monolith plus separately deployable workflow/event/integration workers, owner schemas and ports. **Alternatives:** generic layered monolith, domain microservices, serverless per action. **Advantages:** simple local transactions, consistent audit, fewer network failure modes. **Disadvantages:** shared release/runtime requires boundary discipline; shared DB operational blast radius. **Consequences:** enforce project/import/SQL ownership, bounded pools and processes; no domain-to-framework dependencies. **Migration path:** measured workload, release or security isolation triggers ADR-018; financial atomic group uses ADR-017 before separation.

## ADR-002 — REST/OpenAPI

**Context:** Carrier, broker and embedded clients need predictable contracts, retry semantics and SDKs. **Decision:** audience-scoped versioned REST, typed commands and OpenAPI; SSE for status. **Alternatives:** GraphQL primary, gRPC external, ad hoc Next endpoints. **Advantages:** ordinary HTTP operational tooling, public versioning and machine errors. **Disadvantages:** clients may need multiple reads; contract generation needs drift checks. **Consequences:** pagination/filter/sparse rules, operation resources, ETags and idempotency standardized. **Migration path:** add narrow GraphQL read aggregation only after demonstrated consumer need; no alternate authoritative mutation layer. Current 3.2.1 vs 3.1.1 tool support is a spike, not assumed compatibility.

## ADR-003 — PostgreSQL operational store

**Context:** Insurance contracts, scoped relations, concurrent claim limits and journals require transactional integrity. **Decision:** PostgreSQL with schema ownership, RLS and managed HA in production. **Alternatives:** MySQL, document DB, distributed SQL. **Advantages:** constraints, JSONB for validated snapshots, exact numeric and strong local transactions. **Disadvantages:** writer/lock hotspots and shared cluster blast radius; RLS requires correct roles. **Consequences:** no BI-heavy queries, composite tenant keys, separate IdP/Temporal databases. **Migration path:** optimize/partition/read projections first; tenant placement or distributed store only with measured geographic availability requirements and reverified financial semantics.

## ADR-004 — Typed SQL/query strategy

**Context:** RLS, exact finance transactions and historical snapshots should not be obscured by ORM entities. **Decision:** node-postgres plus Kysely candidate, SQL-owned migrations; explicit repositories and mapped domain entities. Compatibility spike pins exact supported versions. **Alternatives:** Prisma, TypeORM, handwritten SQL everywhere. **Advantages:** explicit transactions/queries, typed projections and tenant filters, easy advanced SQL. **Disadvantages:** more mapping/migration work; types cannot prove runtime RLS. **Consequences:** scoped repository ports, parameterized SQL and SQL ownership lint; no ORM inheritance/base repository. **Migration path:** query-builder replacement affects adapters only if tooling maintenance/support or typecheck performance fails; domain remains unchanged.

## ADR-005 — NATS JetStream

**Context:** Moderate meaningful domain events need durable fan-out/replay without a streaming platform for every operation. **Decision:** JetStream with owner outbox and consumer inbox; at-least-once. **Alternatives:** Kafka, RabbitMQ, PostgreSQL-only polling. **Advantages:** durable consumers, concise operational model and isolated streams. **Disadvantages:** another stateful service; ordering/retention/replay need explicit discipline. **Consequences:** stable IDs, DLQ/replay, broker credential separation, no end-to-end exactly-once assumption. **Migration path:** replace via event transport port if measured retention/partition/CDC scale makes Kafka justified; preserve envelope/effect keys and migration watermarks.

## ADR-006 — Temporal orchestration

**Context:** Months-long claims, human tasks, payment ambiguity and notices must survive restarts. **Decision:** Temporal TypeScript workers with deterministic code and idempotent activities. **Alternatives:** DB state machine scheduler, queue chains, Camunda/workflow suite. **Advantages:** durable timers/replay and human signal support. **Disadvantages:** versioning discipline, history privacy, additional SQL/runtime operations. **Consequences:** business state stays domain-owned, history stores minimal IDs, lifecycle replay in CI, continue-as-new, no arbitrary side effects in workflow code. **Migration path:** regional managed Temporal if operating cost dominates; replacement must prove timer/version/history and recovery semantics before switching open processes.

## ADR-007 — Standards-based IdP

**Context:** Passkeys, MFA, recovery and enterprise federation should not be custom insurance-domain auth. **Decision:** Keycloak reference, OIDC standards adapter; authentication separated from Nest authorization. **Alternatives:** custom credentials, managed IdP, self-hosted alternatives. **Advantages:** OIDC/SAML federation and portable application boundary. **Disadvantages:** realm/upgrade/security operations, phone flows/recovery need validation, not all demanded flows are assumed default features. **Consequences:** verify passkey/TOTP/recovery/session/phone flows and assurance mapping; credentials never in insurance DB. **Migration path:** managed provider when residency/SLA cost favors it; subject mapping and consented account linking migration with proof, no automatic email merge.

## ADR-008 — Hybrid resource-aware authorization

**Context:** Roles alone cannot express branch assignment, authority ceilings, ownership, purpose or separation of duties. **Decision:** typed in-process policy evaluator, RBAC+ABAC+tenant+grants+context; versioned bundles and decision audit. **Alternatives:** simple RBAC, ACL everywhere, external OPA/Cedar mandatory from day one. **Advantages:** auditable scoped decisions, low latency, easier local testing. **Disadvantages:** revocation freshness and consistent facts need discipline. **Consequences:** deny by default, per-action checks, approval command hashes, epoch/revocation tests. **Migration path:** external policy engine only if independently governed policy scale/teams require it; differential tests must match all existing decisions and failure behavior.

## ADR-009 — Tenant-owned data with explicit grants

**Context:** Private insurer records coexist with customers, brokers and providers spanning multiple organizations. **Decision:** insurer/legal partner data-plane tenants; organization/branch/team inside boundaries; platform Party/identity vault with scoped aliases and resource grants. **Alternatives:** one universal tenant, tenant per user, duplicate Party per insurer, blanket membership reads. **Advantages:** defensible isolation with multi-insurer customer portfolio and canonical roles. **Disadvantages:** grant/alias governance and multi-owner portfolio fan-out complexity. **Consequences:** app/repository/RLS defense, composite FKs, no global Party search for tenants. **Migration path:** tenant-specific database/residency deployment can preserve IDs/grants via tenant directory; cross-region Party sharing requires legal data-plane separation/approved purpose.

## ADR-010 — Private S3-compatible evidence storage

**Context:** Documents are large, sensitive and adversarial; history requires retained object versions. **Decision:** private S3 API, MinIO candidate for local reference, approved supported object service for production, quarantine and clean prefixes/buckets. **Alternatives:** DB blobs, public CDN files, filesystem shares. **Advantages:** scalable multipart/versioning, short signed access and lifecycle controls. **Disadvantages:** keys/metadata and object backup consistency, storage support/license review. **Consequences:** classify/encrypt, validate bytes and scan, separate scanner permissions, short URLs; no signature URL in logs. **Migration path:** portable storage adapter/inventory/checksums allow provider replacement; WORM/legal hold capabilities must be reverified, not inferred from API compatibility.

## ADR-011 — PostgreSQL search initially

**Context:** Approved product/provider catalogs can initially fit SQL full text/filtering. **Decision:** PostgreSQL FTS and intentional indexes; OpenSearch conditional advanced-search profile. **Alternatives:** OpenSearch immediately, hosted search, client-only filtering. **Advantages:** fewer operational dependencies and immediate consistency for initial read model. **Disadvantages:** relevance/semantic/faceted/geospatial scale limits. **Consequences:** search projection DTO/port, field allowlists, permission-scoped queries, no private health indexing. **Migration path:** measured p95/relevance/query complexity justifies OpenSearch; rebuild by watermark, scoped reindex and cutover with same grant filtering.

## ADR-012 — ClickHouse analytics

**Context:** Earned premium/loss ratios/cohort reports should not degrade policy/payment OLTP. **Decision:** governed ClickHouse marts from validated events, selective CDC later. **Alternatives:** PostgreSQL BI replica, warehouse provider, lakehouse. **Advantages:** columnar aggregate throughput and separate compute. **Disadvantages:** correction/idempotency/lag and tenant analytics governance complexity. **Consequences:** metric versions, fact IDs, no raw restricted fields, source-to-ledger reconciliation. **Migration path:** managed warehouse if operations/team cost dominates; semantic metric contracts and lineage stay portable. A BI replica can precede ClickHouse only with measured bounded workloads and explicit revised ADR.

## ADR-013 — OpenTelemetry signals, separate legal audit

**Context:** End-to-end HTTP/event/workflow visibility and immutable accountability are different needs. **Decision:** OTel→collector→Prometheus/Grafana/Tempo/Loki; owner audit→restricted immutable archive. **Alternatives:** proprietary agents, logs-only, mixing audit with log aggregation. **Advantages:** correlated portable telemetry, integrity/retention controls for audit. **Disadvantages:** cardinality/storage/PII leakage risk and stack operations. **Consequences:** redaction before export, low-cardinality metrics, sampled traces plus complete critical audit. **Migration path:** replace telemetry backends through OTLP/config; preserve evidence archive independently.

## ADR-014 — AI gateway and validated proposals

**Context:** Assistant/OCR/fraud/recommendation can help while hallucination/retention/discrimination risks remain. **Decision:** provider/model/prompt registry, purpose-authorized retrieval, evidence and human review; no authoritative direct writes. **Alternatives:** direct provider SDK in UI, one hardcoded model, fully automated agent. **Advantages:** controlled retention/residency, provider portability, monitored explainable outputs. **Disadvantages:** evaluation/governance costs and latency. **Consequences:** processor approval/kill switch per feature, deterministic command validation and no financial AI mutation. **Migration path:** provider switch only after comparative eval and privacy review; use deterministic/rules fallback or disable feature if no approved model passes.

## ADR-015 — pnpm workspace monorepo

**Context:** Four web apps and workers share typed contracts/design primitives but not mutable domain entities. **Decision:** pnpm workspaces and TypeScript references, dependency-cruiser/ESLint; Turbo optional after measured benefit. **Alternatives:** Nx, independent repos, unrestricted single package. **Advantages:** atomic contract changes and local reproducibility with low initial orchestration overhead. **Disadvantages:** graph/typecheck complexity and accidental boundary leakage. **Consequences:** strict package exports, owner migrations, generated clients, frozen lock. **Migration path:** Nx/Turbo when affected-build/cache need is measured; independent repos only for truly independent domain release ownership with published contract tests.

## ADR-016 — Append-only double-entry ledger

**Context:** Premiums/taxes/commissions/refunds/claims cannot rely on mutable transaction totals. **Decision:** balanced immutable journals per book/currency, exact minor-unit amounts, reversals, restricted posting port and rebuildable balances. **Alternatives:** payment rows as financial truth, outsourced ledger-only, full event sourcing everywhere. **Advantages:** reconstructable balances, corrections/lineage and accounting control. **Disadvantages:** mappings/period locks/reconciliation need accounting expertise. **Consequences:** every confirmed obligation/movement journaled atomically through owner ports; business events are not automatic financial rules; separate operational reserve estimates from booked provisions. **Migration path:** dedicated ledger service only through ADR-017; certified external ledger can replace adapter with immutable migration/reconciliation evidence.

## ADR-017 — Financial atomic group and extraction protocol (conditional extraction)

**Context:** Locally atomic financial state+journal cannot survive a naïve service split. **Decision:** initially a single Postgres transaction coordinator invokes owning finance/domain ports; no repositories cross context. If extraction is justified, command stores `pending-ledger`, ledger accepts unique effect key, domain finalizes only on durable journal acknowledgment and reconciliation. **Alternatives:** cross-service 2PC, eventual journals after marking paid, moving every domain into ledger. **Advantages:** current correctness, explicit future consistency semantics. **Disadvantages:** extraction changes externally visible pending states and operations burden. **Consequences:** finance critical-path ports constrain deploy boundaries; no extraction without model/contract/recovery tests. **Migration path:** dual reconciliation/shadow posting, no dual authoritative ledger writers; migrate book watermark/key history, freeze/fence cutover, prove available-funds/refund caps and pending-ack recovery. Trigger: regulated isolation or separate financial ownership/release needs that outweigh added complexity.

## ADR-018 — Conditional domain extraction candidates

**Context:** CPU/IO/privacy/release differences may eventually exceed worker isolation. **Decision:** no new services now; record per-candidate decision before extraction. **Alternatives:** immediate microservices or permanent monolith regardless of evidence. **Advantages:** preserves simple launch operations; grounds extra services in a measurable requirement. **Disadvantages:** teams must keep boundaries and revisit metrics. **Consequences:** extraction is a funded migration, not renaming folders. **Migration paths/triggers:**

| Candidate | Concrete trigger | Data/contract migration path |
|---|---|---|
| Documents/OCR/AI | Scan/ML CPU, hostile files or health processor isolation cannot meet SLA in existing workers | Preserve Document owner/version refs, quarantine grants, purpose boundary; separate storage credentials and contract test |
| Integration adapters | Carrier-specific releases/outages and separate partner ownership dominate platform cadence | Move adapter attempt/inbox data and credential boundary; retain status-query/effect-key contracts |
| Pricing | Deterministic simulation/rating CPU needs independent scale and actuarial release ownership | Signed rating runtime artifacts + immutable input/output contract; replay old versions before cutover |
| Assistance/telematics | High-rate location/feed processing or low-latency dispatch requires workload isolation | Purpose-limited summary events; migrate current assignments/consent/retention; fence dispatch writes |
| Analytics | Already separate store/process; independent data team and heavy query releases justify API separation | Governed metric contract/mart ownership and tenant scope; never gains OLTP writes |
| Ledger/settlement | Regulatory security boundary or independent book ownership | Mandatory ADR-017 plus account/book/key history cutover; never duplicate payouts |

Each future extraction ADR must specify owner, trigger measurements, outage budget, data custody, security, release plan, reconciliation, rollback/fencing and new cost. These candidates are not recommendations to deploy microservices at launch.
