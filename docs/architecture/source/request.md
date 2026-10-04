You are the principal architecture and product-engineering team responsible for designing a production-grade, multi-vendor, B2B/B2C digital insurance platform.

You must operate simultaneously through the perspectives of:

- Chief Product Architect
- Insurance Product Manager
- Insurance Business Analyst
- Insurance Operations Specialist
- Actuary
- Pricing Actuary
- Underwriter
- Claims Specialist
- Policy Administration Specialist
- Property & Casualty Insurance Specialist
- Health Insurance Specialist
- Life Insurance Specialist
- Auto Insurance Specialist
- Commercial Insurance Specialist
- Reinsurance Specialist
- Agent/Broker Distribution Specialist
- Insurance Fraud Specialist
- Enterprise Risk Manager
- Regulatory Compliance Specialist
- Insurance Legal Specialist
- Finance Specialist
- Insurance Accounting Specialist
- Payment Specialist
- Enterprise Architect
- Solution Architect
- Domain-Driven Design Architect
- Software Architect
- Next.js Architect
- NestJS Architect
- API Architect
- Integration Architect
- Event-Driven Architecture Specialist
- Workflow Orchestration Engineer
- Database Architect
- PostgreSQL Specialist
- Search Architect
- Data Architect
- Analytics Engineer
- DevOps Engineer
- Platform Engineer
- Site Reliability Engineer
- Performance Engineer
- Security Architect
- Application Security Engineer
- IAM Architect
- Privacy Engineer
- Container Security Engineer
- Penetration Tester
- Payment Security/PCI Specialist
- UX Researcher
- Service Designer
- Product Designer
- UI/UX Designer
- Design System Engineer
- Accessibility Specialist
- Content Designer
- Localization/i18n Specialist
- PWA Engineer
- AI Architect
- Machine Learning Engineer
- Recommendation Systems Engineer
- Fraud ML Specialist
- OCR/Document Intelligence Engineer
- Healthcare Interoperability Specialist
- GIS/Geospatial Engineer
- Telematics Specialist
- QA Architect
- Test Automation Engineer
- Contract Testing Engineer
- Performance Testing Engineer
- Technical Writer
- Program Manager
- Prompt Engineer

The responsibility of this virtual team is to challenge one another's assumptions and jointly produce a coherent, secure, auditable, scalable and implementation-ready design.

# 1. Mission

Design a complete production-grade digital insurance ecosystem supporting:

1. B2C insurance marketplace and customer self-service.
2. B2B insurance-company participation.
3. Multi-vendor insurance distribution.
4. Agents and brokers.
5. Corporate customers.
6. Healthcare providers.
7. Repair providers.
8. Roadside and assistance providers.
9. Claims assessors and surveyors.
10. Affiliates.
11. Embedded-insurance partners.
12. Future insurance ecosystem participants.

The system must support the complete lifecycle:

Discover
→ Needs Assessment
→ Compare
→ Quote
→ RFQ
→ Risk Assessment
→ Underwriting
→ Coverage Customization
→ Purchase
→ Payment
→ Policy Issuance
→ Policy Administration
→ Endorsement
→ Assistance
→ FNOL
→ Claim
→ Assessment
→ Settlement
→ Payment
→ Renewal
→ Retention

For insurers:

Onboarding
→ Product Configuration
→ Product Versioning
→ Pricing
→ Rating
→ Distribution
→ Underwriting
→ Policy Administration
→ Claims
→ Finance
→ Commission
→ Settlement
→ Analytics
→ Compliance

# 2. Non-negotiable technology requirements

Use:

Frontend:
- Next.js
- React
- TypeScript

Backend:
- NestJS
- TypeScript

Database:
- PostgreSQL

Containerization:
- Docker
- Docker Compose

All first-party application components MUST run in containers.

The entire local development, integration-test and reference deployment environment must be startable using Docker Compose.

Use the latest stable mutually compatible versions available when implementation begins. Pin exact versions after verifying compatibility.

Do not blindly use "latest" Docker tags.

# 3. Architectural philosophy

Use:

- Domain-Driven Design
- Bounded Contexts
- Clean Architecture
- Hexagonal Architecture
- SOLID
- Dependency Inversion
- Composition over inheritance
- Explicit domain models
- Rich domain behavior where appropriate
- Repository abstractions
- Ports and adapters
- CQRS where complexity justifies it
- Event-driven architecture for meaningful domain events
- Durable workflows for long-running processes
- Transactional Outbox
- Inbox/Deduplication
- Idempotency
- Optimistic concurrency
- API-first architecture
- Contract-first integrations
- Security by design
- Privacy by design
- Observability by design
- Accessibility by design

Do NOT create microservices merely to claim that the architecture is microservice-based.

Begin with an extraction-ready modular monolith supplemented by independently deployable workers and integration processes.

Only recommend extraction into independent services when there is a concrete reason involving:

- scaling
- isolation
- ownership
- security boundaries
- workload characteristics
- release independence
- regulatory isolation
- failure containment

Document every proposed extraction as an ADR.

# 4. Required frontend applications

Design at least:

apps/customer-web
apps/partner-web
apps/admin-web
apps/developer-web

customer-web must be a PWA.

customer-web is used by consumers/policyholders.

partner-web supports:

- insurers
- branches
- brokers
- agents
- corporate customers
- healthcare providers
- repair providers
- assessors
- assistance providers
- other vendors

admin-web is the platform operations console.

developer-web provides:

- API documentation
- API credentials
- sandbox
- webhook configuration
- integration logs
- SDK documentation
- usage information

Do not place authoritative insurance-domain logic inside Next.js applications.

NestJS must remain the authoritative domain/business layer.

# 5. Multi-tenancy

Design a robust multi-tenant model.

Support:

Platform
Organization
Insurance Company
Branch
Department
Team
Broker Organization
Agency
Healthcare Provider
Repair Provider
Corporate Customer
Other partner organizations

Explicitly model:

tenant_id
organization_id
branch_id

where relevant.

Use defense in depth:

application authorization
+
repository-level tenant scoping
+
PostgreSQL Row-Level Security where appropriate

Never trust tenant identifiers supplied directly by clients without deriving/validating them from authorization context.

Prevent:

- cross-tenant reads
- cross-tenant writes
- IDOR
- tenant enumeration
- insecure exports
- cross-tenant cache leakage
- cross-tenant search leakage
- cross-tenant websocket leakage
- cross-tenant background-job leakage

Define tests specifically targeting tenant isolation.

# 6. Identity and Party architecture

Do not duplicate the same human in separate customer, policyholder, beneficiary, driver and claimant tables.

Design a canonical Party model:

Party

subtypes:
- Person
- Organization

Relationship/role models should express:

- Customer
- Policyholder
- Insured
- Beneficiary
- Driver
- Claimant
- Agent
- Broker
- Employee
- Adjuster
- Healthcare Practitioner
- Corporate Representative

Support deduplication without unsafe automatic merging.

Create explicit golden-record/data-governance rules.

# 7. Authentication

Design:

- email authentication
- phone authentication where appropriate
- password authentication
- WebAuthn/passkeys
- TOTP MFA
- recovery codes
- enterprise SSO
- OIDC federation
- SAML federation where necessary
- device/session management
- step-up authentication
- suspicious-login detection
- account recovery
- service accounts
- machine-to-machine authentication

Align the identity design with the current NIST Digital Identity Guidelines where appropriate.

Separate authentication from authorization.

# 8. Authorization

Create hybrid:

RBAC
+
ABAC
+
tenant boundaries
+
resource ownership
+
contextual policies

Support permissions such as:

claim.read
claim.update
claim.approve
policy.issue
policy.cancel
pricing.publish
underwriting.decide
settlement.approve
user.invite
api-key.rotate

Support constraints such as:

- region
- branch
- insurance product
- claim assignment
- transaction threshold
- country
- data classification

Implement separation of duties.

High-risk operations may require four-eyes approval.

# 9. Insurance products

Create a dynamic insurance product platform.

A product must support:

- identity
- category
- insurer
- jurisdiction
- distribution channels
- product version
- effective dates
- eligibility rules
- coverages
- optional coverages
- benefits
- coverage limits
- deductibles
- franchises
- exclusions
- waiting periods
- geographic scope
- insured-object types
- required questions
- required documents
- rating model
- underwriting rules
- cancellation rules
- renewal rules
- commission rules
- tax treatment
- terms and conditions
- localized descriptions
- regulatory disclosures

Support product families including but not limited to:

- motor third-party
- motor comprehensive
- motorcycle
- fleet
- telematics/usage-based
- health
- supplemental health
- dental
- critical illness
- accident
- life
- investment-linked life
- disability
- travel
- trip cancellation
- home
- property
- fire
- earthquake
- flood
- theft
- professional liability
- medical malpractice
- engineering liability
- D&O
- general liability
- product liability
- employer liability
- construction
- CAR
- EAR
- machinery
- electronic equipment
- business interruption
- cyber
- cargo
- marine
- aviation
- agriculture
- livestock
- pet
- device
- extended warranty
- credit
- loan protection
- event
- sports
- student
- immigration
- freelancer
- microinsurance
- embedded insurance
- on-demand insurance
- parametric insurance

The architecture must allow future product types without changing core platform assumptions.

# 10. Product versioning

Published product definitions must be immutable.

Design:

Product
ProductVersion
CoverageVersion
TermsVersion
RatingVersion
UnderwritingVersion

Policies and quotes must reference the exact versions used when they were created.

Never reinterpret an old policy using today's product rules.

# 11. Rating and pricing engine

Design an extensible rating engine supporting:

- base premium
- rating factors
- lookup tables
- decision tables
- age factors
- location factors
- occupation
- asset factors
- claims history
- driver factors
- health factors where legally permitted
- deductibles
- coverage limits
- surcharges
- discounts
- promotions
- loyalty discounts
- no-claim discounts
- channel-specific adjustments
- taxes
- regulatory fees
- insurer fees
- platform fees

Provide simulation capability.

Provide effective dating and versioning.

Provide pricing explainability.

Every premium calculation must be reproducible.

Never use floating-point arithmetic for money.

# 12. Underwriting

Design underwriting with:

- straight-through acceptance
- straight-through rejection where legally permissible
- refer-to-underwriter
- additional-document request
- medical review where relevant
- inspection
- manual override
- reason codes
- approval authority
- escalation
- four-eyes approval
- underwriting notes
- audit trail

Create underwriting decision state machines.

Maintain full provenance of inputs and rules.

# 13. Quotes

Support:

- instant quotes
- indicative quotes
- firm quotes
- manual RFQs
- multi-insurer quote aggregation
- quote comparison
- quote expiration
- quote revisions
- quote acceptance
- abandoned quotes
- quote recovery

Every quote must retain the exact:

- questions
- responses
- rating version
- product version
- coverage configuration
- pricing breakdown
- taxes
- fees
- discounts
- expiry

# 14. Marketplace comparison

Support comparison by:

- total premium
- installment amount
- coverage
- limit
- deductible
- exclusions
- insurer
- insurer rating
- claim satisfaction
- settlement speed
- provider network
- policy terms
- payment options
- additional services

Prevent misleading comparisons.

Clearly separate:

price
coverage
quality
insurer service metrics

# 15. Policy administration

Design the complete policy lifecycle.

States should cover concepts such as:

draft
pending-payment
pending-underwriting
bound
issued
active
suspended
cancelled
expired
renewed

Do not treat state names as final until domain experts validate them.

Support:

- binding
- issuance
- effective periods
- policy documents
- certificates
- insured objects
- insured parties
- beneficiaries
- endorsements
- cancellations
- reinstatement
- lapse
- renewal
- policy replacement
- history
- versioning

# 16. Endorsements

Create an endorsement engine supporting:

- address changes
- vehicle changes
- insured-party changes
- beneficiary changes
- coverage additions
- coverage removals
- limit changes
- deductible changes
- corrections

Calculate premium impact and refund/additional premium.

Maintain immutable historical policy versions.

# 17. Renewals

Support:

- renewal eligibility
- renewal quotation
- repricing
- re-underwriting
- customer consent
- auto-renewal where allowed
- payment retry
- renewal reminders
- alternative marketplace quotations
- retention offers
- non-renewal
- renewal notices

# 18. Claims

Create a full claims platform.

Support:

FNOL
→ Validation
→ Coverage Check
→ Evidence Collection
→ Fraud Screening
→ Assignment
→ Investigation
→ Assessment
→ Reserve
→ Decision
→ Settlement
→ Payment
→ Recovery
→ Closure

Also support:

- partial approval
- partial payment
- multiple claim items
- multiple payees
- reopening
- appeals
- disputes
- subrogation
- salvage
- recoveries
- third-party claims
- claim withdrawal
- duplicate detection

# 19. FNOL UX

FNOL must be optimized for stressful situations.

Design:

- progressive disclosure
- minimal first-step information
- save/resume
- camera capture
- video
- voice notes
- geolocation with consent
- offline drafts where appropriate
- emergency contact
- police report
- third-party details
- witnesses
- document upload

# 20. Provider networks

Support:

- hospitals
- clinics
- doctors
- pharmacies
- laboratories
- repair shops
- roadside providers
- tow trucks
- home-repair services
- surveyors
- adjusters
- legal providers

Model:

- service areas
- availability
- contracts
- prices
- specialties
- insurer networks
- appointment/booking availability
- ratings
- SLAs

# 21. Assistance

Design:

- roadside assistance
- emergency medical assistance
- travel assistance
- home assistance

Support:

request
→ dispatch
→ provider acceptance
→ tracking
→ completion
→ rating
→ settlement

# 22. Payments

Create payment-provider abstraction.

Support:

- card
- bank transfer
- direct debit
- wallet
- local payment methods
- installments
- recurring payment
- refund
- partial refund
- chargeback
- payout

Use payment-provider tokenization.

Avoid storing raw payment-card credentials.

# 23. Financial ledger

Create an append-only double-entry ledger.

Every financial mutation must generate balanced journal entries.

Support:

- premium
- commission
- platform fee
- tax
- refund
- chargeback
- payout
- claim payment
- wallet movement
- adjustment
- settlement
- recovery

Define:

LedgerAccount
JournalEntry
Posting
Balance
Reconciliation

Do not derive authoritative financial state from mutable transaction rows.

# 24. Commission

Support:

- percentage commission
- fixed commission
- tiered commission
- product-specific commission
- insurer-specific commission
- broker commission
- agent commission
- affiliate commission
- platform commission
- provider commission
- commission clawbacks
- commission adjustments

Commission configuration must be versioned.

# 25. Settlement

Support:

- insurer settlement
- broker settlement
- agent payout
- provider payout
- affiliate payout

Provide:

- settlement periods
- reconciliation
- statements
- invoices
- withholding/tax adjustments
- disputes
- corrections
- reserves/holds
- approval workflow

# 26. Corporate B2B

Corporate insurance customers should support:

- organization management
- employee enrollment
- dependent enrollment
- fleet import
- asset import
- bulk policies
- bulk claims
- employee benefits
- cost centers
- departments
- reporting
- approval chains

# 27. Agent and broker platform

Support:

- licensing
- appointment
- carrier relationships
- territories
- products
- leads
- customers
- quotes
- policies
- renewals
- commissions
- targets
- performance
- compliance
- documents

# 28. Affiliate platform

Support:

- campaigns
- referral URLs
- referral codes
- attribution
- conversions
- commissions
- fraud checks
- payouts

# 29. Embedded insurance

Create APIs allowing third parties to:

- retrieve product eligibility
- request quotes
- present offers
- purchase policies
- check policy status
- initiate claims

Support embedded widgets where appropriate.

# 30. Developer platform

Provide:

- API keys
- OAuth clients
- client credentials
- sandbox
- test data
- request logs
- webhook configuration
- signing secrets
- credential rotation
- rate limits
- quotas
- OpenAPI documentation
- SDK generation
- API changelog

# 31. Integration platform

Use anti-corruption layers.

External insurer formats must never leak into core domain objects.

Create provider abstractions for:

- insurers
- payment processors
- banks
- KYC
- KYB
- AML
- sanctions
- identity verification
- digital signatures
- notifications
- maps
- telematics
- healthcare
- OCR
- currency conversion
- regulators where appropriate

Consider ACORD-compatible adapters for relevant insurance integrations.

Consider FHIR-compatible adapters for health-insurance interoperability.

# 32. API design

Use REST/OpenAPI as the primary external API.

Version public APIs.

Design:

/api/v1/public
/api/v1/customer
/api/v1/partner
/api/v1/admin
/api/v1/integrations

Exact routing may differ if architecture analysis recommends a superior scheme.

Generate typed API clients.

Design pagination, filtering, sorting and sparse responses consistently.

Use machine-readable errors.

Create a standardized error envelope.

# 33. Idempotency

Implement idempotency for all operations that could cause duplicate business side effects.

Examples:

- payment
- refund
- policy issue
- endorsement
- claim submission
- settlement
- payout
- webhook processing

Specify key storage, retention, replay semantics and response behavior.

# 34. Event-driven architecture

Define meaningful domain events.

Use a durable message system such as NATS JetStream unless analysis justifies another technology.

Implement:

Transactional Outbox
Inbox
Consumer deduplication
Retries
Dead-letter strategy
Schema versioning
Correlation IDs
Causation IDs
Trace IDs

Do not attempt distributed ACID transactions.

Use eventual consistency deliberately.

Document consistency boundaries.

# 35. Durable workflows

Use Temporal or a demonstrably superior equivalent compatible with the Docker requirement.

Use durable workflows for long-running operations including:

- insurer onboarding
- KYC
- KYB
- quote-to-policy
- underwriting
- document collection
- policy issuance
- claims
- endorsement
- renewal
- installment collection
- settlement
- dispute resolution
- corporate onboarding

Design compensation, retries, timeouts, human tasks and SLA escalation.

# 36. Caching

Use Valkey/Redis where suitable.

Cache only when there is a demonstrated purpose.

Never allow tenant leakage through cache keys.

Define:

- TTL
- invalidation
- namespaces
- stampede protection
- sensitive-data restrictions

# 37. Document architecture

Store files in S3-compatible object storage such as MinIO.

Use:

temporary upload
→ quarantine
→ validation
→ malware scan
→ metadata extraction
→ optional OCR
→ classification
→ encryption
→ permanent storage

Validate actual file content, not only extension or client-provided MIME type.

Use signed URLs.

Design strict access control.

# 38. Search

Use PostgreSQL search where sufficient.

Use OpenSearch for advanced marketplace/provider/search workloads where justified.

Search indexes are projections, never the authoritative database.

Design reindexing.

Design tenant isolation in search.

# 39. Analytics

Do not run heavy business-intelligence workloads against OLTP PostgreSQL.

Design an analytics pipeline using events/CDC as appropriate.

Use ClickHouse or another justified analytical store.

Metrics must include insurance KPIs such as:

- written premium
- earned premium
- loss ratio
- expense ratio
- combined ratio
- claim frequency
- claim severity
- renewal rate
- retention
- conversion
- average premium
- outstanding claims
- insurer performance
- settlement time
- claim cycle time
- fraud rate

Every metric must contain a precise mathematical definition.

# 40. Fraud

Design fraud architecture using:

rules
+
graph/network signals
+
behavior
+
device information
+
document signals
+
statistical/ML models where justified

Support:

FraudSignal
FraudScore
FraudCase
Investigation
Evidence
Disposition

Do not allow opaque ML to become the only basis for consequential decisions.

# 41. AI

Create an AI Gateway.

Potential functions:

- insurance assistant
- policy explanation
- policy comparison
- recommendation
- coverage-gap analysis
- insurance-needs assessment
- document extraction
- claim assistance
- support-agent assistance
- fraud signals

For every AI feature identify:

- purpose
- permitted inputs
- prohibited inputs
- PII handling
- retention
- model/provider
- prompt/version
- confidence
- evidence
- fallback
- human review
- monitoring

Do not allow LLM output directly to modify authoritative insurance or financial records.

Use deterministic validated commands between AI systems and domain systems.

# 42. Recommendation engine

Recommendations must be explainable.

Output examples:

Best Value
Lowest Price
Best Coverage
Best for Family
Best for Frequent Travelers

Clearly distinguish algorithmic recommendation from regulated financial/insurance advice.

Provide reasons for ranking.

Avoid discriminatory protected-attribute use unless explicitly lawful and required.

# 43. OCR/document intelligence

Support:

- identity documents
- passport
- driver's license
- vehicle documents
- invoice
- receipts
- medical documents
- existing insurance policies

Store:

raw extraction
normalized extraction
confidence
source positions
human corrections
model/version

Never overwrite raw evidence.

# 44. Privacy

Implement:

- consent
- purpose
- legal basis where required
- data classification
- retention
- deletion/anonymization where lawful
- export
- access history
- sensitive-data segregation

Treat health information as highly sensitive.

Do not assume GDPR is the only applicable privacy regime.

Create jurisdiction-specific compliance policies.

# 45. Security baseline

Design against current versions of applicable standards including:

- OWASP ASVS
- OWASP API Security guidance
- NIST Digital Identity Guidelines
- PCI DSS when card data is in scope

Verify current versions when executing this prompt.

Perform formal threat modeling.

Use STRIDE or an equivalent methodology.

Address:

- authentication bypass
- authorization bypass
- IDOR
- broken object-level authorization
- privilege escalation
- tenant breakout
- XSS
- CSRF
- injection
- SSRF
- request smuggling
- deserialization
- file upload attacks
- webhook forgery
- replay
- race conditions
- duplicate payments
- business logic abuse
- enumeration
- credential stuffing
- bot attacks
- API scraping
- secret leakage
- supply-chain attacks
- dependency compromise
- malicious containers
- insider risk

# 46. Audit

Create immutable, searchable audit trails.

Record:

actor
tenant
organization
action
resource
resource ID
timestamp
request ID
IP where legally appropriate
device/session
before/after references
reason
delegation/impersonation
approval context

Audit sensitive reads where required, not only writes.

Never allow application administrators to silently alter audit history.

# 47. Observability

Design distributed observability.

Use:

OpenTelemetry
Prometheus
Grafana
Tempo or equivalent
Loki or equivalent

Implement:

structured logs
metrics
traces
correlation IDs
workflow IDs
business IDs

Never place secrets or sensitive health/identity information into logs.

Create dashboards for:

API
database
queues
workflows
integrations
payments
claims
policy issuance
background workers

# 48. Reliability

Define explicit SLOs.

Cover:

- availability
- latency
- error rate
- queue delay
- workflow delay
- third-party failures

Design:

- retries
- jitter
- exponential backoff
- circuit breakers
- bulkheads
- graceful degradation
- timeout budgets
- dead-letter handling
- health checks
- readiness checks
- liveness checks

# 49. Backup and disaster recovery

Design:

- database backups
- point-in-time recovery
- object-storage backup
- configuration backup
- encryption-key recovery strategy
- workflow-state recovery
- recovery exercises

Define:

RPO
RTO

for each major service class.

Do not invent universal RPO/RTO values; propose initial targets and identify which require business approval.

# 50. Docker

Everything must be containerized.

Provide production-quality multi-stage Dockerfiles.

Containers must:

- run as non-root
- use minimal base images
- expose health checks
- handle SIGTERM
- support graceful shutdown
- avoid secrets in images
- avoid unnecessary packages
- have reproducible builds

Create:

compose.yaml
compose.dev.yaml
compose.test.yaml
compose.prod.yaml

Use Docker Compose profiles where useful:

core
observability
full
testing

Expected services may include:

reverse-proxy
customer-web
partner-web
admin-web
developer-web
api
worker
workflow-worker
integration-worker
postgres
valkey
nats
temporal
temporal-ui
minio
opensearch
clickhouse
clamav
identity-provider
otel-collector
prometheus
grafana
tempo
loki

Do not include infrastructure without explaining why it is necessary.

# 51. Development experience

A new developer should be able to run:

docker compose up

or an equivalently simple documented command.

Provide:

- `.env.example`
- seed data
- mock integrations
- local mail server
- mock insurer
- mock KYC
- mock payment service
- predictable demo accounts

Never commit secrets.

# 52. Database design

Produce a conceptual ER model.

Identify aggregates and ownership.

Avoid a single gigantic interconnected schema.

Each bounded context owns its data.

Cross-context writes are prohibited.

Use migrations.

Design indexes intentionally.

Use:

- UUIDv7 or similarly appropriate identifiers
- timestamps
- effective periods
- concurrency/version fields
- audit metadata

Justify identifier strategy.

# 53. Time

Insurance is extremely time-sensitive.

Explicitly distinguish:

- event timestamp
- created timestamp
- effective date
- expiration date
- accounting date
- settlement date
- timezone

Store absolute timestamps appropriately.

Handle jurisdictional/local date concepts correctly.

# 54. Money

Represent money using explicit:

amount
currency

Never use JavaScript binary floating-point for authoritative financial calculations.

Define rounding rules.

Define tax rounding.

Define currency conversion behavior.

Historical transactions must preserve the exchange rate used.

# 55. Localization

Architect for multilingual operation from day one.

Separate:

message translation
insurance terminology
legal text
product content
document templates

Support:

RTL
LTR
locale-sensitive dates
currencies
numbers
addresses
names

Do not assume every person has a Western name/address format.

# 56. Accessibility

Target WCAG 2.2 AA or a newer applicable stable equivalent after verification.

Pay special attention to:

- complex forms
- quote comparison
- claim submission
- document upload
- tables
- dialogs
- charts
- error messages
- keyboard use
- screen readers

# 57. UX

Design distinct journeys for:

Consumer
Corporate Administrator
Insurer Product Manager
Underwriter
Claims Adjuster
Finance User
Agent/Broker
Healthcare Provider
Repair Provider
Platform Administrator

Do not merely reuse the same dashboard with different permissions.

Each role requires task-oriented UX.

# 58. Design system

Create a common design system.

Define:

- typography
- spacing
- tokens
- forms
- tables
- cards
- status indicators
- notifications
- dialogs
- navigation
- responsive rules
- accessibility behavior

Insurance status must never depend on color alone.

# 59. Real-time communication

Use WebSocket or SSE where appropriate for:

- claim updates
- assistance tracking
- chat
- workflow status

Do not use WebSockets for simple CRUD unnecessarily.

# 60. Notifications

Create a notification orchestration subsystem.

Channels:

- email
- SMS
- push
- in-app
- WhatsApp adapters
- Telegram adapters
- other country-specific messaging

Support:

templates
localization
user preferences
transactional vs marketing
delivery reports
retry
fallback
quiet hours
consent
deduplication

# 61. CRM and communication

Support Customer 360.

Include:

- policies
- quotes
- claims
- payments
- communications
- tickets
- complaints
- notes
- tasks
- documents
- risk information subject to authorization
- consent

# 62. Complaints/disputes

Design:

complaint
→ acknowledgement
→ investigation
→ resolution
→ appeal/escalation
→ closure

Support SLA timers and regulatory reporting.

# 63. Reviews and reputation

Support review of:

- insurer
- product
- claims experience
- provider
- repair shop

Implement anti-abuse controls.

Do not permit reviews from users with no relevant relationship where verification is required.

# 64. Marketing

Design:

- campaigns
- coupons
- referral
- cashback
- loyalty
- bundles
- cross-sell
- upsell
- retention

Marketing permissions must respect consent.

# 65. Parametric insurance

Support event-driven automatic claims where appropriate.

Example:

Verified external event
→ Contract condition met
→ Claim automatically created
→ Verification
→ Payout

All external event sources require provenance and dispute mechanisms.

# 66. Telematics/usage-based insurance

Create optional telematics architecture supporting:

- mileage
- driving events
- trip summaries
- harsh braking
- acceleration
- time of use

Apply privacy controls.

Do not assume raw location history should be retained indefinitely.

# 67. Reinsurance/co-insurance

Architect extension points for:

- facultative reinsurance
- treaties
- cessions
- recoverables
- risk sharing
- multiple insurers

These may initially be disabled by feature flags but architecture must not make them impossible.

# 68. Feature flags

Support flags scoped by:

platform
country
tenant
organization
product
user cohort

Security-sensitive functionality must not rely solely on frontend feature flags.

# 69. Configuration

Separate:

code
configuration
business rules
secrets

Version business configuration.

Audit configuration changes.

# 70. Testing strategy

Define the complete test pyramid.

Require:

- unit tests
- domain tests
- property-based tests where valuable
- integration tests
- repository tests
- API tests
- contract tests
- workflow tests
- event tests
- end-to-end tests
- tenant-isolation tests
- security tests
- accessibility tests
- visual-regression tests
- performance tests
- load tests
- stress tests
- soak tests
- chaos/failure tests where justified
- migration tests
- backup/restore tests

Financial calculations require deterministic test vectors.

Pricing and actuarial formulas require independent verification.

# 71. Contract testing

External insurer/provider integrations must use contract tests.

Include mock provider implementations.

Do not allow an external carrier's temporary outage to corrupt core state.

# 72. Performance

Define performance budgets for:

- customer pages
- quote retrieval
- product search
- API latency
- payment flows
- claims
- insurer portal
- asynchronous queues

Use load models based on realistic user behavior.

Do not optimize blindly.

# 73. CI/CD

Design pipelines for:

lint
type check
unit tests
integration tests
contract tests
security scanning
dependency scanning
container scanning
SBOM generation
build
sign
deploy
smoke testing
migration verification
rollback

Use immutable images.

# 74. Monorepo

Design a TypeScript monorepo.

A reasonable starting structure is:

apps/
  customer-web/
  partner-web/
  admin-web/
  developer-web/
  api/
  worker/
  workflow-worker/
  integration-worker/

packages/
  ui/
  design-system/
  api-client/
  contracts/
  localization/
  config/
  observability/
  testing/

domains/
  identity/
  tenant/
  party/
  customer/
  vendor/
  product/
  pricing/
  quote/
  underwriting/
  risk/
  policy/
  claims/
  providers/
  billing/
  payments/
  ledger/
  commission/
  settlement/
  distribution/
  documents/
  compliance/
  fraud/
  notifications/
  integrations/
  analytics/

infrastructure/
docs/
tests/

You may refine this structure if your reasoning produces a cleaner result.

# 75. Dependency rules

Create enforceable architectural boundaries.

Examples:

domain
must not depend on infrastructure.

application
may depend on domain.

infrastructure
implements application/domain ports.

presentation
depends on application services.

No controller should contain business logic.

No ORM model should automatically become a domain entity.

No domain object should import NestJS.

No domain object should import database packages.

# 76. Coding standards

Require:

- strict TypeScript
- no `any` without explicit justification
- small cohesive classes
- descriptive naming
- no God services
- no circular dependencies
- no hidden side effects
- explicit error handling
- explicit business invariants
- immutable value objects where appropriate

Avoid premature abstractions.

Avoid generic BaseRepository/BaseService architectures that erase domain meaning.

# 77. Architecture Decision Records

Create ADRs for at least:

- modular monolith vs microservices
- REST vs GraphQL
- PostgreSQL
- ORM/query strategy
- event broker
- Temporal/workflow engine
- authentication provider
- authorization architecture
- tenant model
- object storage
- search
- analytics store
- observability
- AI provider abstraction
- monorepo tooling
- financial ledger

For each ADR state:

context
decision
alternatives
advantages
disadvantages
consequences
migration path

# 78. Required diagrams

Produce Mermaid or PlantUML source for:

1. C4 System Context
2. C4 Container
3. C4 Component
4. Tenant model
5. Domain/bounded-context map
6. Quote sequence
7. Underwriting sequence
8. Purchase/policy issuance sequence
9. Claim sequence
10. Payment sequence
11. Settlement sequence
12. Renewal sequence
13. Integration architecture
14. Event architecture
15. Docker architecture
16. Security trust boundaries
17. Deployment topology

# 79. State machines

Explicitly design state machines for:

Quote
Underwriting Case
Policy
Endorsement
Claim
Payment
Refund
Settlement
KYC
Vendor Onboarding
Complaint
Assistance Request

For each state machine specify:

states
transitions
guards
side effects
events
timeouts
terminal states
invalid transitions

# 80. Data classification

Define at least:

Public
Internal
Confidential
Restricted
Highly Restricted

Classify:

identity data
health data
financial data
claims data
authentication secrets
documents
payment data
audit data

Map classifications to security controls.

# 81. Regulatory architecture

Do not hard-code a single country's laws into core modules.

Create jurisdiction configuration.

Separate:

global platform rules
country rules
insurer rules
product rules

Explicitly mark every requirement that requires country-specific legal validation.

# 82. Scalability

Define scaling dimensions separately:

customers
tenants
insurance products
quotes
policies
claims
files
webhook traffic
events
analytics
provider network

Identify likely hotspots.

Explain which components may eventually become independent services.

Do not prematurely extract them.

# 83. Failure analysis

Perform failure-mode analysis for:

- insurer unavailable
- payment provider unavailable
- KYC unavailable
- event broker unavailable
- workflow engine unavailable
- database unavailable
- object storage unavailable
- duplicate webhook
- webhook out of order
- payment succeeds but callback fails
- policy issues but response is lost
- insurer accepts quote but platform times out
- claim documents partially upload
- settlement partially succeeds

For every scenario specify recovery.

# 84. Concurrency

Identify race conditions involving:

- quote acceptance
- policy issuance
- claim decisions
- payment
- refund
- inventory/capacity where relevant
- settlement
- endorsement
- renewal

Specify concurrency-control mechanisms.

# 85. Auditability and explainability

The system must answer questions such as:

"Why was this premium calculated?"

"Which rules were applied?"

"Which version of those rules?"

"Who approved this policy?"

"Why was this claim rejected?"

"Which evidence was considered?"

"Who changed this coverage?"

"What commission rule generated this amount?"

"Which model generated this recommendation?"

Design data structures that make these answers possible.

# 86. Production readiness

The final architecture must address:

security
privacy
performance
scalability
maintainability
availability
observability
operability
recoverability
internationalization
accessibility
auditability
compliance
developer experience
testing

Do not call the design production-ready unless each category has been addressed.

# 87. Execution method

Work in explicit phases.

PHASE 1 — Requirement normalization

Reconstruct all requirements into a traceable requirement catalogue.

Give every requirement an ID.

Example:

INS-POL-001
INS-CLM-001
SEC-IAM-001
FIN-LEDGER-001

Identify conflicts and missing dependencies.

Do not silently discard requirements.

PHASE 2 — Domain discovery

Identify:

- domains
- subdomains
- bounded contexts
- aggregates
- entities
- value objects
- domain services
- domain events
- invariants
- policies

PHASE 3 — Actor analysis

Identify every actor and permission relationship.

PHASE 4 — Process modeling

Model all critical workflows.

PHASE 5 — Architecture

Produce logical, application, data, integration, security and deployment architectures.

PHASE 6 — Data design

Design conceptual ERDs and ownership.

PHASE 7 — API design

Design resources, contracts, errors, idempotency and versioning.

PHASE 8 — Event design

Create event catalogue and schema conventions.

PHASE 9 — Security/privacy

Perform threat model and privacy analysis.

PHASE 10 — Infrastructure

Design Docker topology, networking, volumes, secrets, observability and environment profiles.

PHASE 11 — UX architecture

Map role-specific journeys and frontend architecture.

PHASE 12 — Testing

Create comprehensive quality strategy.

PHASE 13 — Review

Every specialist persona must review architecture relevant to their expertise.

Record findings.

PHASE 14 — Cross-disciplinary review

Specifically search for conflicts between:

insurance correctness
security
UX
performance
financial correctness
compliance
maintainability

PHASE 15 — Final architecture

Resolve findings and produce final implementation-ready architecture.

# 88. Mandatory cross-review

Before finalizing, perform the following review passes:

Insurance SME review

Actuarial review

Underwriting review

Claims review

Financial/ledger review

Security review

Privacy review

Architecture review

Database review

Integration review

UX review

Accessibility review

SRE review

QA review

Compliance review

Each review must identify:

critical defects
high-risk omissions
medium issues
improvements

Resolve critical and high issues before presenting the final design.

# 89. Traceability

Build a matrix:

Requirement
→ Domain
→ Component
→ API
→ Database owner
→ Workflow
→ Test
→ Security controls

No major feature may be left without ownership.

# 90. Required final output

Deliver the final result in this exact high-level order:

1. Executive Architecture Summary
2. Assumptions
3. Functional Requirement Catalogue
4. Non-Functional Requirements
5. Actor Catalogue
6. Roles and Permissions
7. Domain Map
8. Bounded Contexts
9. Context Relationships
10. Aggregate Catalogue
11. Domain Event Catalogue
12. Product Architecture
13. Rating Architecture
14. Underwriting Architecture
15. Quote Architecture
16. Policy Architecture
17. Claims Architecture
18. Finance/Ledger Architecture
19. Commission Architecture
20. Settlement Architecture
21. Provider Architecture
22. Distribution Architecture
23. Integration Architecture
24. AI Architecture
25. Fraud Architecture
26. Security Architecture
27. Privacy Architecture
28. Data Architecture
29. API Architecture
30. Event Architecture
31. Workflow Architecture
32. Frontend Architecture
33. UX Architecture
34. PWA Architecture
35. Docker Architecture
36. Network Architecture
37. Observability Architecture
38. Analytics Architecture
39. Backup and Disaster Recovery
40. Repository Structure
41. Dependency Rules
42. State Machines
43. C4 Diagrams
44. Sequence Diagrams
45. ER Diagrams
46. ADRs
47. Testing Strategy
48. CI/CD Architecture
49. Performance Strategy
50. Scaling Strategy
51. Threat Model
52. Failure-Mode Analysis
53. Compliance Matrix
54. Requirement Traceability Matrix
55. Implementation Roadmap
56. Risk Register
57. Open Decisions Requiring Jurisdiction-Specific Input
58. Final Architecture Review

# 91. Implementation roadmap

Although the task is architecture/design, provide a realistic dependency-aware implementation roadmap.

Do NOT group work merely by UI page.

Organize around vertical domain slices.

Suggested progression to evaluate:

Foundation
→ Identity/Tenant
→ Party/Organization
→ Product
→ Pricing
→ Quote
→ Underwriting
→ Payments/Ledger
→ Policy
→ Documents
→ Claims
→ Settlement
→ Distribution
→ Integrations
→ Analytics
→ AI
→ Advanced insurance features

You may alter this after analyzing dependencies.

For each phase provide:

deliverables
dependencies
architecture changes
database changes
APIs
tests
security requirements
definition of done

# 92. Anti-patterns to explicitly prevent

Reject:

- gigantic `AppService`
- controllers containing business logic
- database tables accessed by every module
- shared mutable entities across domains
- generic CRUD architecture for complex insurance operations
- `any` everywhere
- financial floats
- authorization only in the frontend
- trusting tenant IDs from request bodies
- storing raw card data unnecessarily
- synchronous coupling to every external insurer
- distributed transactions
- event-driven everything
- premature microservices
- giant generic BaseService
- undocumented magic rules
- destructive policy edits
- unversioned product/pricing rules
- opaque AI decisions
- AI directly changing financial records
- sensitive information in logs
- public object-storage buckets
- long-lived signed URLs
- silent admin impersonation
- unaudited privileged actions
- global database queries without tenant scope

# 93. Decision quality

Never select technology merely because it is popular.

For every significant technology choice explain:

Why?
What problem does it solve?
What alternatives exist?
What complexity does it introduce?
What would trigger replacing it?

Favor the simplest architecture that satisfies the actual requirements.

# 94. Research requirement

Before locking decisions involving evolving technology or standards, verify current authoritative documentation.

Prefer:

official framework documentation
official standards bodies
official security standards
primary technical specifications

Do not rely on stale assumptions.

Examples include:

Next.js
NestJS
Docker
PostgreSQL
OpenTelemetry
Temporal
OWASP
NIST
PCI SSC
ACORD
HL7 FHIR

# 95. No superficial output

Do not produce a generic SaaS architecture decorated with insurance terminology.

Domain behavior must be explicit.

Financial accounting must be mathematically sound.

State transitions must be explicit.

Multi-tenancy must be enforceable.

Authorization must be resource-aware.

Claims must model real operational complexity.

Products and pricing must be versioned.

Policy history must be reproducible.

All consequential decisions must be auditable.

# 96. Handling uncertainty

If jurisdiction-specific rules are unknown:

1. Do not fabricate them.
2. Create an abstraction point.
3. Label the requirement as jurisdiction-dependent.
4. Explain exactly what legal/domain input is required.
5. Continue designing everything that does not depend on that answer.

Do not stop the overall architecture because a jurisdiction-specific detail is unresolved.

# 97. Final quality gate

Before completing the response, verify:

Can multiple insurers safely coexist?

Can one insurer access another insurer's private data?

Can one customer hold policies from multiple insurers?

Can one person have multiple insurance roles?

Can pricing from five years ago be reproduced?

Can an old policy still be interpreted correctly?

Can a payment safely be retried?

Can policy issuance safely be retried?

Can webhooks safely be replayed?

Can claims remain open for months?

Can workflows survive process restarts?

Can insurer integrations fail without corrupting core data?

Can tenant isolation be tested?

Can every consequential action be audited?

Can commissions be reconciled?

Can financial balances be reconstructed from the ledger?

Can a vendor be onboarded without code changes?

Can product rules change without rewriting historical policies?

Can a new country be introduced without contaminating core domain logic?

Can another payment provider be introduced through an adapter?

Can another insurer be added through an anti-corruption layer?

Can advanced modules later be extracted into services?

Can the entire system start using Docker?

Can the system be operated and observed in production?

If the answer to any of these is "no", revise the design before finalizing it.

# 98. Final instruction

Produce an architecture that a senior engineering organization could actually implement.

Be rigorous rather than verbose for its own sake.

Every abstraction must solve a concrete problem.

Every domain must have clear ownership.

Every integration must have a failure strategy.

Every financial action must be traceable.

Every sensitive operation must be authorized and audited.

Every long-running workflow must be durable.

Every tenant boundary must be defensible.

Every historical insurance decision must remain reproducible.

The final deliverable should constitute the authoritative technical blueprint for implementing this multi-vendor B2B/B2C insurance platform using Next.js, NestJS and Docker.