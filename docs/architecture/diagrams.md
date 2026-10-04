# Architecture diagram sources

Mermaid sources. C4 views use flowcharts with actor/system/container/component labels to avoid dependence on renderer-specific C4 extensions. Reference and production topologies are different views of the same component contracts.

## 1. C4 System Context

```mermaid
flowchart LR
  customer[Person: Consumer and claimant]
  partner[Person: Insurer, broker, corporate and provider staff]
  ops[Person: Operations and auditors]
  embed[External system: Embedded partner]
  platform[System: Insurance marketplace and administration platform]
  carrier[External system: Insurer systems]
  pay[External system: PSP and banks]
  check[External system: KYC, signatures and regulators]
  services[External system: Healthcare, maps, telematics and notifications]
  customer --> platform
  partner --> platform
  ops --> platform
  embed -->|Scoped API and signed webhooks| platform
  platform -->|Anti-corruption adapters| carrier
  platform --> pay
  platform --> check
  platform --> services
```

## 2. C4 Container

```mermaid
flowchart TB
  browser[Browser]
  subgraph application[Platform containers]
    edge[Reverse proxy]
    web[Four Next.js web containers and thin BFFs]
    api[NestJS modular monolith API]
    worker[Event and document worker]
    workflow[Temporal workflow worker]
    integration[Integration worker]
  end
  subgraph state[Private state containers or production managed equivalents]
    pg[(PostgreSQL owned schemas)]
    idp[Keycloak]
    nats[NATS JetStream]
    temporal[Temporal and separate SQL database]
    objects[(Private S3 object storage)]
    scan[ClamAV]
    ch[(ClickHouse marts)]
  end
  browser --> edge --> web --> api
  edge -->|Public auth endpoints only| idp
  api --> pg
  worker --> pg
  worker --> nats
  worker --> scan
  worker --> objects
  workflow --> temporal
  workflow -->|Owned application command ports| pg
  workflow --> integration
  integration --> pg
  integration -->|Carrier and PSP ports| external[External providers]
  pg -.->|Outbox relay| nats
  nats --> worker
  worker --> ch
```

## 3. C4 Component

```mermaid
flowchart LR
  ctl[Component: audience controllers]
  guard[Component: authentication and resource policy]
  app[Component: command and query handlers]
  domain[Component: owned aggregates and domain services]
  port[Component: repository and provider ports]
  adapter[Component: SQL and integration adapters]
  owned[(Owned schema, RLS, audit and outbox)]
  fin[Component: explicit financial transaction coordinator]
  ledger[Component: ledger posting application port]
  ctl --> guard --> app --> domain
  app --> port
  adapter -.->|Implements| port
  adapter --> owned
  app -->|Monolith financial unit of work only| fin
  fin --> ledger
  ledger --> owned
  domain -.->|Never imports| forbidden[No NestJS, DB or carrier SDK]
```

## 4. Tenant Model

```mermaid
flowchart TB
  platform[Platform identity and Party vault]
  person[Canonical Person Party]
  subject[Login Subject]
  portfolio[Customer portfolio of explicit resource grants]
  ta[Tenant A insurer]
  tb[Tenant B insurer]
  broker[Broker organization membership and carrier appointments]
  org[Organization]
  branch[Branch]
  dept[Department and team]
  pa[Policy A with tenant Party alias]
  pb[Policy B with tenant Party alias]
  platform --> person
  subject -->|Verified account link| person
  subject --> portfolio
  portfolio -->|Own-resource grant| pa
  portfolio -->|Own-resource grant| pb
  ta --> org --> branch --> dept
  ta --> pa
  tb --> pb
  broker -->|Appointment plus per-resource grant| pa
  person -.->|Purpose-approved snapshots only| pa
  person -.->|Purpose-approved snapshots only| pb
  ta -.->|No private read grant| tb
```

## 5. Domain Map

```mermaid
flowchart LR
  foundation[Identity, tenant, Party and vendor]
  product[Product and risk]
  rate[Pricing]
  quote[Quote and comparison]
  uw[Underwriting]
  policy[Policy]
  claims[Claims and fraud]
  provider[Providers and assistance]
  finance[Billing, payments, ledger, commission and settlement]
  channels[Distribution, corporate, affiliate and embedded]
  support[Customer, compliance, notifications and documents]
  acl[Integration anti-corruption layer]
  derived[Analytics and AI proposals]
  foundation -->|Published scope and identity ports| channels
  channels --> quote
  product --> rate --> quote
  product --> uw
  quote -->|Accepted immutable offer| policy
  uw -->|Decision evidence| policy
  policy -->|Coverage at loss port| claims
  claims --> provider
  policy --> finance
  claims --> finance
  acl -->|Translated DTOs| quote
  acl --> policy
  acl --> finance
  support -.->|Cross-cutting authorized services| policy
  support -.-> claims
  policy -.->|Committed facts| derived
  claims -.-> derived
  finance -.-> derived
  derived -.->|Human-reviewed proposals only| channels
```

## 6. Quote Sequence

```mermaid
sequenceDiagram
  actor Customer
  participant Web as Customer web
  participant API as Quote application and authorization
  participant DB as Quote owner DB and outbox
  participant WF as Temporal quote workflow
  participant ACL as Carrier adapters
  Customer->>Web: Needs, risk answers and sharing consent
  Web->>API: POST quote request with idempotency key
  API->>API: Resolve Party, tenant grants and channel
  API->>DB: Commit immutable request revision and workflow intent
  API-->>Web: 202 operation resource
  DB-->>WF: Idempotent start via outbox dispatcher
  par Carrier A
    WF->>ACL: Minimal authorized risk snapshot A
    ACL-->>WF: Firm offer with exact versions and expiry
  and Carrier B
    WF->>ACL: Minimal authorized risk snapshot B
    ACL-->>WF: Timeout or indicative offer
  end
  WF->>API: Record validated offers using owner command
  API->>DB: Store offer evidence and event
  Web->>API: Poll or scoped SSE
  API-->>Web: Partial results, pending carrier and honest comparison
```

## 7. Underwriting Sequence

```mermaid
sequenceDiagram
  participant WF as Purchase workflow
  participant UW as Underwriting owner
  participant Rules as Pinned rules runtime
  participant Docs as Document owner
  actor Underwriter
  actor Approver
  WF->>UW: Open case with immutable risk and product versions
  UW->>Rules: Evaluate normalized evidence
  Rules-->>UW: Accept, decline or refer with trace
  alt Refer or additional evidence
    UW->>Docs: Create purpose-limited evidence task
    Docs-->>UW: Scanned verified evidence reference
    Underwriter->>UW: Propose reasoned decision with version
    UW->>UW: Validate assignment and authority, bind decision hash
    Approver->>UW: Independent approve if required
    UW->>UW: Revalidate hash, current grants and authority
  end
  UW-->>WF: Durable decision event plus evidence/validity reference
  Note over UW,WF: Risk change invalidates clearance; no hidden override
```

## 8. Purchase and Policy Issuance

```mermaid
sequenceDiagram
  actor Customer
  participant API as Quote and purchase API
  participant WF as Issuance workflow
  participant UW as Underwriting
  participant Pay as Payment and ledger ports
  participant Carrier as Carrier adapter
  participant Policy as Policy owner
  participant Docs as Documents
  Customer->>API: Accept firm offer, consent, If-Match and key
  API->>API: Lock acceptance and commit workflow intent
  API-->>Customer: Stable operation ID
  API-->>WF: Dispatch start idempotently
  WF->>UW: Obtain valid decision
  WF->>Pay: Authorize or collect under approved contract
  Pay-->>WF: Verified journal-linked prerequisite
  WF->>Carrier: Bind and issue with stable operation key
  alt Confirmed insurer result
    Carrier-->>WF: Binding and issue evidence
  else Timeout after possible issue
    Carrier-->>WF: Unknown outcome
    WF->>Carrier: Query by same issue key, then reconcile/manual task
    Carrier-->>WF: Existing policy reference or definitive no effect
  end
  WF->>Policy: Record issued immutable policy version
  Policy->>Docs: Render exact terms and certificate
  Docs-->>Policy: Signed document reference
  Policy-->>Customer: Authorized operation progress and portfolio
  Note over WF,Policy: Document failure cannot erase existing binding
```

## 9. Claim Sequence

```mermaid
sequenceDiagram
  actor Claimant
  participant Claims as Claim owner
  participant Policy as Coverage-at-loss port
  participant Docs as Evidence quarantine and scan
  participant Fraud as Fraud investigation
  actor Adjuster
  actor Approver
  participant Finance as Ledger and payout ports
  Claimant->>Claims: Minimal FNOL, stable draft key
  Claims-->>Claimant: Receipt and progressive evidence tasks
  Claims->>Policy: Exact incident/report time and authorized policy ref
  Policy-->>Claims: Historical coverage snapshot
  Claimant->>Docs: Multipart evidence upload
  Docs-->>Claims: Released evidence reference, never raw unscanned download
  Claims->>Fraud: Purpose-approved evidence signals
  Fraud-->>Claims: Human-reviewed disposition if referred
  Adjuster->>Claims: Assess items, reserve and propose decision
  Claims->>Claims: Lock shared policy-cover allocation and version
  Approver->>Claims: Separate approval of hash/payees/amounts
  Claims->>Finance: Create journaled obligations and idempotent partial payouts
  Finance-->>Claims: Verified paid allocations
  Claims-->>Claimant: Item decisions, reasons, paid status and appeal rights
  Note over Claims,Finance: Reopen/recovery preserves prior payments
```

## 10. Payment Sequence

```mermaid
sequenceDiagram
  actor Payer
  participant API as Payment application
  participant DB as Owned finance transaction
  participant PSP as Tokenized PSP adapter
  participant Inbox as Signed callback inbox
  participant Recon as Reconciliation worker
  Payer->>API: Create intent with obligation and key
  API->>DB: Reserve key, obligation allocation and attempt
  API->>PSP: Capture with stable provider key, outside DB transaction
  alt Definitive capture
    PSP-->>API: Capture reference
    API->>DB: Atomic journal posting plus confirmed attempt
  else Lost response
    API->>DB: Mark outcome unknown, retain allocation
    API-->>Payer: Pending, same operation URL
    PSP->>Inbox: Signed success callback, possibly duplicated
    Inbox->>DB: Verify secret-bound tenant, dedup receipt and semantic effect
    Recon->>PSP: Status query or statement matching
    Recon->>DB: Commit capture journal and confirmation once
  end
  API-->>Payer: Authorized current status
  Note over DB,Recon: Unique effect key protects callbacks, polling and restore replay
```

## 11. Settlement Sequence

```mermaid
sequenceDiagram
  actor Preparer
  actor Approver
  participant Set as Settlement owner
  participant Ledger as Ledger port
  participant WF as Settlement workflow
  participant Bank as Payout adapter
  Preparer->>Set: Prepare period with eligible obligations
  Set->>Ledger: Reconcile balances and allocate lines under lock
  Set-->>Approver: Immutable statement and payee/amount/version hash
  Approver->>Set: Independent step-up approval
  Set->>WF: Commit durable batch execution intent
  loop Each unpaid permitted line
    WF->>Set: Persist payout attempt and lock allocation
    WF->>Bank: Stable per-line payout key
    alt Verified success
      Bank-->>WF: Payout proof
      WF->>Set: Atomic finalize line plus ledger journal through ports
    else Unknown outcome
      WF->>Set: Hold line pending status/reconciliation
    end
  end
  WF->>Set: Complete only after all lines resolved and reconciled
  Set-->>Preparer: Final or partial statement; successful lines unchanged
```

## 12. Renewal Sequence

```mermaid
sequenceDiagram
  participant Clock as Durable term timer
  participant WF as Renewal workflow
  participant Quote as Quote and rating
  participant UW as Underwriting
  participant Notify as Notice orchestration
  actor Customer
  participant Pay as Payment and ledger
  participant Policy as Policy owner
  Clock->>WF: Start unique prior-term renewal cycle
  WF->>Quote: Fresh product/rating versions and eligible risk
  WF->>UW: Re-underwrite where required
  WF->>Notify: Jurisdiction notice, offer and consent/mandate task
  Notify-->>Customer: Transparent renewal total and terms
  Customer->>WF: Consent or valid lawful auto-renew mandate signal
  WF->>Pay: Collect under new cycle key
  alt Prerequisites confirmed
    WF->>Policy: Bind/issue new term and link prior term
    Policy-->>Customer: New-term documents
  else Definitive payment failure or refusal
    WF->>Notify: Retry/grace/non-renewal notice per versioned rule
  end
  Note over WF,Policy: Prior term expires independently; never rewrite its rules
```

## 13. Integration Architecture

```mermaid
flowchart LR
  ports[Owned application provider ports]
  reg[Adapter registry: carrier, tenant, environment and capability]
  config[Versioned config and secret references]
  queue[Integration worker bulkheads and bounded attempts]
  acl[Certified protocol translation and validation]
  ext[Insurer, PSP, bank, KYC, FHIR, maps and other providers]
  inbox[Raw signature verification and tenant-bound inbox]
  rec[Status query, reconciliation and manual exception tasks]
  ports --> reg --> queue --> acl --> ext
  config --> reg
  ext --> inbox -->|Canonical facts and verified refs| ports
  queue -->|Unknown write outcome| rec
  rec --> ext
  rec --> ports
```

## 14. Event Architecture

```mermaid
flowchart LR
  command[Authorized command]
  subgraph tx[One owner database transaction]
    aggregate[Aggregate mutation]
    audit[Append audit reference]
    outbox[(Outbox stable event ID)]
    aggregate --> audit --> outbox
  end
  command --> aggregate
  relay[Leased relay]
  stream[NATS JetStream durable stream]
  consumer[Durable pull consumer]
  subgraph ctx[Consumer transaction]
    inbox[(Unique consumer tenant event ID)]
    effect[Projection or process intent with semantic key]
    inbox --> effect
  end
  outbox --> relay --> stream --> consumer --> inbox
  effect -->|Commit before ACK| ack[Consumer ACK]
  consumer -->|Bounded retries exhausted| dlq[Quarantine and scoped audited replay]
  dlq -->|Original event ID| consumer
  relay -.->|Crash after publish may duplicate| stream
```

## 15. Docker Architecture

```mermaid
flowchart TB
  developer[Docker Compose invocation]
  lock[Verified image manifest, generated local secrets and config]
  developer --> lock
  subgraph core[Core containers]
    edge[Proxy and four web apps]
    api[API plus event, integration and workflow workers]
    boot[One-shot migrations, bootstrap and seed]
    state[Postgres, Keycloak, Temporal, NATS, S3 and ClamAV]
  end
  lock --> boot
  boot -->|Schema readiness| api
  edge --> api --> state
  subgraph optional[Optional profiles]
    obs[OTel, Prometheus, Grafana, Tempo and Loki]
    data[ClickHouse, optional Valkey and advanced OpenSearch]
    test[Container test runner, mail and fault-injecting mocks]
  end
  api --> obs
  api --> data
  test --> api
```

## 16. Security Trust Boundaries

```mermaid
flowchart LR
  subgraph untrusted[Untrusted browsers and partner systems]
    browser[Consumer and workforce browser]
    external[Carrier callbacks and partner clients]
  end
  subgraph edge[Public edge boundary]
    proxy[TLS proxy, request framing, quotas]
    bff[Session BFF and CSRF defenses]
    hook[Signature, replay and secret-bound tenant verification]
  end
  subgraph trusted[Application boundary]
    auth[Current actor, tenant, resource, purpose and duties]
    owner[Owner commands and scoped repositories]
    ai[AI gateway, no authoritative writes]
  end
  subgraph restricted[Restricted private data boundary]
    pg[(RLS owned tenant schemas)]
    vault[(Party and health vault with separate grants/keys)]
    obj[(Quarantine and clean private objects)]
    audit[(Immutable audit archive)]
  end
  browser --> proxy --> bff --> auth
  external --> proxy --> hook --> auth
  auth --> owner --> pg
  owner -->|Purpose-authorized minimal snapshot| vault
  owner --> obj
  owner --> audit
  owner -->|Approved proposals only| ai
```

## 17. Deployment Topology

```mermaid
flowchart TB
  subgraph ref[Reference environment: single Docker host]
    compose[All containers with persistent named volumes]
    note[Reproducible integration topology; no host-failure HA]
    compose --- note
  end
  subgraph prod[Production target: one residency region]
    ingress[HA ingress and identity authentication endpoints]
    az1[Failure domain A: stateless web, API and workers]
    az2[Failure domain B: stateless web, API and workers]
    db[(HA Postgres with fenced writer and PITR)]
    broker[Replicated JetStream]
    wf[HA Temporal plus separate durable SQL]
    object[(Resilient private object storage)]
    backup[(Isolated encrypted backups and key recovery)]
    ingress --> az1
    ingress --> az2
    az1 --> db
    az2 --> db
    az1 --> broker
    az2 --> broker
    az1 --> wf
    az2 --> wf
    az1 --> object
    az2 --> object
    db --> backup
    object --> backup
    wf --> backup
  end
```

## 18. ER Models

Owned schema groups shown separately. Cross-context links are published immutable references/snapshots, not permission to join or mutate another owner's private tables.

```mermaid
erDiagram
  TENANT ||--o{ TENANT_ORGANIZATION : contains
  TENANT_ORGANIZATION ||--o{ BRANCH : contains
  SUBJECT ||--o{ MEMBERSHIP : has
  TENANT ||--o{ MEMBERSHIP : scopes
  SUBJECT ||--o{ RESOURCE_GRANT : receives
  PARTY ||--o| PERSON : subtype
  PARTY ||--o| PARTY_ORGANIZATION : subtype
  PARTY ||--o{ PARTY_ALIAS : scoped_alias
  PARTY ||--o{ PARTY_ROLE : plays
  SUBJECT ||--o{ SUBJECT_PARTY_LINK : verified_link
  PARTY ||--o{ SUBJECT_PARTY_LINK : identifies
  PARTY_ROLE {
    uuid tenant_id
    uuid party_ref
    string resource_type
    uuid resource_id
    string role
    date effective_from
    date effective_to
  }
  RESOURCE_GRANT {
    uuid tenant_id
    uuid subject_id
    uuid resource_id
    string permission
    string purpose
    int permission_epoch
  }
```

```mermaid
erDiagram
  PRODUCT ||--o{ PRODUCT_VERSION : publishes
  PRODUCT_VERSION ||--o{ COVERAGE_VERSION_REF : pins
  PRODUCT_VERSION ||--o{ TERMS_VERSION_REF : pins
  RATING_VERSION ||--o{ RATING_CALCULATION : calculates
  QUOTE ||--o{ QUOTE_REVISION : retains
  QUOTE_REVISION ||--o{ OFFER_REVISION : contains
  OFFER_REVISION ||--o{ OFFER_VERSION_REF : pins
  OFFER_REVISION ||--o| QUOTE_ACCEPTANCE : accepts
  RATING_CALCULATION {
    uuid tenant_id
    uuid rating_version_id
    string engine_digest
    json input_snapshot
    json ordered_steps
    string amount_minor
    string currency
  }
```

```mermaid
erDiagram
  POLICY ||--o{ POLICY_VERSION : retains
  POLICY ||--o{ ENDORSEMENT : changes_by_revision
  POLICY_VERSION ||--o{ POLICY_PARTY_ROLE : snapshots
  POLICY_VERSION ||--o{ POLICY_COVERAGE : snapshots
  CLAIM ||--o{ CLAIM_ITEM : contains
  CLAIM ||--o{ DECISION_REVISION : retains
  CLAIM ||--o{ RESERVE_CHANGE : appends
  CLAIM_ITEM ||--o{ PAYEE_ALLOCATION : approves
  CLAIM_ITEM ||--o{ COVERAGE_ALLOCATION : consumes
  COVERAGE_BUCKET ||--o{ COVERAGE_ALLOCATION : serializes
  CLAIM ||--o{ RECOVERY_CASE : tracks
  POLICY_VERSION {
    uuid tenant_id
    uuid policy_id
    int revision
    timestamptz effective_at
    timestamptz expires_at
    timestamptz recorded_at
    json contract_snapshot
  }
```

```mermaid
erDiagram
  LEDGER_BOOK ||--o{ LEDGER_ACCOUNT : contains
  LEDGER_BOOK ||--o{ JOURNAL_ENTRY : posts
  JOURNAL_ENTRY ||--|{ POSTING : balances
  LEDGER_ACCOUNT ||--o{ POSTING : debits_or_credits
  JOURNAL_ENTRY ||--o{ JOURNAL_REVERSAL_REF : reversed_by
  PAYMENT_INTENT ||--o{ PAYMENT_ATTEMPT : attempts
  PAYMENT_INTENT ||--o{ REFUND : linked_aggregate
  PAYMENT_ATTEMPT ||--o{ FINANCIAL_EFFECT_REF : journals
  SETTLEMENT ||--o{ SETTLEMENT_LINE : allocates
  SETTLEMENT_LINE ||--o{ PAYOUT_ATTEMPT : pays
  RECONCILIATION ||--o{ RECONCILIATION_MATCH : matches
  POSTING {
    uuid tenant_id
    uuid book_id
    uuid journal_id
    uuid account_id
    string currency
    string amount_minor
    string debit_or_credit
  }
  JOURNAL_ENTRY {
    uuid tenant_id
    uuid book_id
    uuid id
    string source_effect_key
    date accounting_date
    timestamptz recorded_at
  }
```
