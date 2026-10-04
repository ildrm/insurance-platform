# Multi-vendor B2B/B2C insurance architecture

Version 1.0 • 2026-10-04 • Design baseline for implementation. Normative design choices use **must**; proposed business targets use **target**. `JUR-*` denotes a decision requiring jurisdiction-specific legal/domain input. This design addresses production concerns; runtime production readiness requires implementation, independent actuarial/legal review and the evidence gates below.

The [execution record](execution.md) maps the requested 15 design phases to their evidence. The [verification record](verification.md) distinguishes completed artifact checks from future runtime acceptance.

## 1. Executive Architecture Summary

Build an extraction-ready TypeScript modular monolith in NestJS with separately deployed event, workflow and integration workers. Four Next.js applications serve consumers, partners, operators and developers. PostgreSQL is the authoritative operational store; each bounded context owns a schema and migrations. Financial journals, published insurance definitions, policy revisions and decision evidence are immutable. Domain objects have no framework/database imports.

Keycloak authenticates through OIDC; NestJS authorizes every command, query, export and stream using tenant boundary, resource relationship, role, attributes and current context. Insurer A cannot read insurer B's private records. A consumer can hold both insurers' policies because the platform maintains an identity/Party link and grants access to specifically related resources. Broker distribution uses explicit carrier appointments and resource grants, never blanket cross-insurer access.

Temporal coordinates long-running processes, human tasks and reconciliation. NATS JetStream distributes committed domain events through outbox/inbox. Neither external providers nor the event broker participate in distributed ACID transactions. Unknown external outcomes remain unresolved until queried or reconciled; timeout never means failure. Money uses integer minor units and exact decimal/rational intermediates. Every committed monetary obligation or movement is coupled to a balanced journal, not an eventually reconciled mutable transaction row.

Docker Compose describes all first-party applications and local infrastructure. PostgreSQL search is initial; OpenSearch is conditional. ClickHouse runs insurance analytics outside OLTP. Valkey only holds dispensable caches/rate-limit coordination. Quarantined files move to private S3-compatible storage after validation and scanning. AI may propose evidence-backed actions; only authorized deterministic commands change insurance records.

## 2. Assumptions

The platform initially distributes licensed insurers' products as an intermediary. It does not assume it is the risk carrier, an investment advisor, a bank or a payment institution. Insurers remain the risk bearers; delegated underwriting/binding authority must be contracted explicitly. Platform collection/custody and merchant-of-record choices are `JUR-01`, and materially change finance mappings and licenses.

Initial delivery: one legal jurisdiction, one data-residency region, one non-investment motor/property product, two insurers, one payment provider and modest launch traffic. All product families remain in the catalogue with line-specific extension contracts; their actuarial/medical/claims capabilities are staged rather than assumed equivalent. Launch volume and recovery budgets in sections 39/49 are proposals requiring business approval. No country-specific law is presumed from the user's timezone.

UTC instants use `timestamptz`; legal local dates use `date` plus IANA jurisdiction timezone/calendar. Coverage intervals are half-open `[effective_at, expires_at)` unless an explicitly versioned legal rule defines inclusive local boundaries. Store event time, recording time, effective date, accounting date, settlement date and timezone separately. Correct late information through new bitemporal revisions, never backdate audit creation. Calendar conversion is presentation/configuration, not a changed coverage instant.

Missing dependencies: carrier authority contracts, filed product/rate evidence, financial chart of accounts, reserve basis, tax rules, provider contracts, IdP phone/recovery spike, storage licenses/support and actual load profile. Exact package/image versions lock when implementation begins through [the research gate](research.md).

## 3. Functional Requirement Catalogue

The [source request](source/request.md) is retained without omissions. [Requirements CSV](catalogues/requirements.csv) assigns a stable section/line-based ID to every nonblank source clause, with its section and source line. Heading clauses are retained as scope parents; bullets, lifecycle stages, field lists and persona obligations have individual IDs. [Section ownership](catalogues/sections.csv) reconstructs all 98 numbered sections. This is a source-clause catalogue: it deliberately preserves named fields/features instead of falsely labeling every field an independently deployable feature.

Normalized capability groups: identity/tenancy/Party; versioned products/rating/risk; discovery/comparison/quotes/RFQ; underwriting; purchase/billing/payments; policy/endorsements/renewals; FNOL/claims/fraud; provider/assistance; finance/commission/settlement; distribution/corporate/affiliate/embedded; developer/integration; documents/consent/compliance/complaints; CRM/notifications/marketing/reviews; analytics/AI; advanced telematics/parametric/reinsurance/co-insurance. Cross-cutting obligations apply to every relevant capability, not only their source section's owner.

Conflict resolutions: canonical Party does not create insurer-wide discoverability (sections 26/28); append-only ledger remains correct under erasure through minimization and separate Party vault (27); offline FNOL stores only bounded opt-in drafts, never policy/health caches (34); AI-assisted recommendation must not become unauthorized advice or underwriting (24); single-host Compose proves topology, while production HA needs multi-host infrastructure (35/39). Future products extend typed rules and strategies, not arbitrary executable customer code (12).

## 4. Non-Functional Requirements

| ID | Measurable acceptance | Owner/evidence |
|---|---|---|
| NFR-SEC-01 | All protected routes, repositories, exports, jobs, search and streams deny unauthorized tenants/resources | Security; T-TENANT, T-AUTHZ |
| NFR-FIN-01 | Every posted journal balances per book/currency; retries never duplicate obligation or disbursement | Finance; T-LEDGER, T-RACE |
| NFR-HIST-01 | Any quote/policy/decision reproduces from pinned inputs, rules, code artifact and time basis | Product/actuary; T-RATING, T-HISTORY |
| NFR-REL-01 | Restarts at every workflow/activity/outbox boundary yield one business effect | Platform; T-WORKFLOW, T-EVENT |
| NFR-UX-01 | WCAG 2.2 AA; role journeys pass keyboard/screen reader/manual tests, RTL and mobile | UX; T-A11Y, T-I18N |
| NFR-OPS-01 | Section 37 SLOs, section 39 restore targets and section 49 load budgets proven | SRE; T-LOAD, T-RESTORE |
| NFR-PRIV-01 | No restricted payload in logs/cache/analytics; retention and legal holds verified | Privacy; T-PRIVACY |
| NFR-ARCH-01 | No cross-context table writes, cyclic dependencies, domain framework imports or unscoped DB access | Architecture; T-BOUNDARY |
| NFR-DEV-01 | Containerized clean checkout boots seeded reference slice with one documented command | Platform; T-COMPOSE |

Business availability and latency targets exclude neither application errors nor internal dependency faults; external carrier failures are reported separately rather than silently removed from journey metrics. Production launch is contingent on evidence, not this table's existence.

## 5. Actor Catalogue

| Actor | Goals/surface | Resource relationship |
|---|---|---|
| Prospect/customer/policyholder | Discover, compare, buy, administer, claim; customer-web | Self Party and explicit delegated family resources |
| Insured/beneficiary/driver/claimant | Limited policy/claim participation | Time-bounded legal/contractual role; no assumption of full policy access |
| Insurer administrator, branch/department/team manager | Organization, appointments, users; partner-web | Own tenant and subordinate authorized organizations |
| Product manager/pricing actuary | Draft, simulate, publish versions | Product/channel/jurisdiction authority; separate publisher |
| Underwriter/medical reviewer/risk surveyor | Evidence, referrals, decisions | Assignment, product authority, amount/risk threshold |
| Adjuster/assessor/claims supervisor | Investigation, reserves, decision, appeal | Claim assignment and delegated approval ceiling |
| Finance preparer/approver/reconciler | Books, commissions, payouts | Legal entity/book plus segregation of duties |
| Broker/agent/affiliate | Distribution, renewals, commissions | Appointment + consent + assigned resources; affiliate gets minimal attribution |
| Corporate administrator/representative/employee | Enroll dependents, assets, fleet, cost centers | Employer membership; medical details excluded from employer view |
| Healthcare practitioner/provider | Eligibility, preauthorization, invoices | Provider contract + encounter grant; restricted health purpose |
| Repair/roadside/tow/home/travel assistance provider | Dispatch, work order, evidence | Assigned request/service area; minimal contact/location |
| Embedded partner/developer/service account | Scoped sandbox and production APIs/webhooks | OAuth audience/scope + appointment + resource grants |
| Platform support/operator/security admin | Complaints, operations, incident response | Ticket and purpose-bound support grants; no permanent tenant bypass |
| Auditor/regulator/data steward | Audits, reporting, duplicate resolution | Approved scoped read/export mandate |
| Reinsurer/co-insurer | Cessions, risk share, recoverables | Explicit treaty/facultative sharing contract |

Party roles and login identities are separate: an insured minor or beneficiary need not have an account. A practitioner may be both a customer and partner employee. Robots, workflow workers and integration adapters are actors with dedicated identities. The specialist review personas are governance actors listed in [reviews](reviews.md).

## 6. Roles and Permissions

Permission is `allow = authenticated ∧ tenantEligible ∧ rolePermission ∧ resourceGrant ∧ attributePolicy ∧ purposeAllowed ∧ assuranceSufficient ∧ dutiesCompatible`. Default deny. Evaluate branch/region/country/product, assignment, data class, amounts, effective appointment and account status using server-side authoritative facts. No permission, tenant or approval authority is accepted from request JSON. Denials conceal resource existence with consistent 404 where appropriate.

| Role | Permissions | Constraints |
|---|---|---|
| Customer | quote.create, policy.read, claim.submit, document.upload | Party relation; product eligibility; only allowed document classes |
| Underwriter | underwriting.read/decide, policy.bind | Current assignment; delegated authority; immutable reason/evidence |
| Claims adjuster | claim.read/update, reserve.propose | Assigned claim; amount ceiling; cannot approve own settlement |
| Claims approver | claim.approve | Separate initiator; product/jurisdiction; step-up for threshold |
| Pricing drafter/publisher | pricing.draft/simulate vs pricing.publish | Different identities for publication; signed filed-rate evidence |
| Policy operator | policy.issue/cancel, endorsement.propose | Product delegation; refund does not bypass finance approval |
| Settlement preparer/approver | settlement.prepare vs settlement.approve | No self-approval; payee change invalidates prior approvals |
| Organization admin | user.invite, appointment.request | No role exceeding administrator's delegable authority |
| Integration developer | api-key.rotate, webhook.configure | Own client; step-up; production vs sandbox separation |
| Support operator | customer.support.read | Case-scoped temporary grant; visible impersonation and read audit |

Decision logs retain policy bundle version, resolved attributes, resource version and allow/deny reason. Revalidate authorization at execution of delayed privileged tasks; original intent is not indefinite authority. Approval binds command hash, aggregate version, amount, payee and scope; any change invalidates it. Break-glass requires case, duration, approver, read-only default and alert; it is never a broad DB superuser application role.

## 7. Domain Map

Core competitive domains: product configuration, reproducible pricing, multi-carrier quote comparison, underwriting, policy lifecycle, claims and distribution. Supporting domains: Party, provider networks, finance, documents, compliance, fraud, integrations and customer service. Generic capabilities: identity federation, notifications, workflow runtime, telemetry and feature delivery. Finance is supporting commercially but critical for correctness.

The [context map diagram](diagrams.md#5-domain-map) distinguishes synchronous published application ports from asynchronous events. No module accesses another module's repositories. Risk owns verified risk facts/inspection snapshots; pricing and underwriting consume purpose-limited versions rather than sharing a mutable risk object.

## 8. Bounded Contexts

| Context / PostgreSQL schema | Owns | Public application port |
|---|---|---|
| identity / identity | Subject mapping, memberships; credentials stay IdP | ResolveActor, ManageMembership |
| tenant / tenant | Tenant, organization tree, branch, team, appointment/grant policies | ResolveScope, ValidateAppointment |
| party / party | Canonical Party vault, Person/Organization, aliases, merge reviews, roles | ResolvePartyReference, SharePartySnapshot |
| customer / customer | CRM, tickets, communications, tasks, relationship summary | CustomerTimeline |
| vendor / vendor | License/contracts, onboarding/KYB, capability configuration | OnboardVendor |
| product / product | Immutable coverage/terms/product versions | GetProductVersion, PublishProduct |
| pricing / pricing | Rating models, tables, simulations, calculations | CalculatePremium |
| risk / risk | Risk profile, inspections, telematics summaries | GetRiskSnapshot |
| quote / quote | Requests, RFQs, offers, revisions, acceptance | RequestQuote, AcceptQuote |
| underwriting / underwriting | Cases, tasks, authority, evidence, decisions | DecideUnderwriting |
| policy / policy | Binding, issuance, policy versions, endorsement/renewal | BindPolicy, ApplyEndorsement |
| claims / claims | FNOL, items, limits, reserves, decisions, recoveries, disputes | SubmitClaim, ApproveClaim |
| providers / providers | Networks, contracts, appointments, service requests/assistance | DispatchAssistance |
| billing / billing | Invoice, installment schedule, arrears and obligations | CreateReceivable |
| payments / payments | Intents, attempts, provider state, refunds, mandates, payouts | InitiatePayment, ResolveAttempt |
| ledger / ledger | Books, accounts, journals, postings, reconciliations | PostJournal, QueryBalance |
| commission / commission | Agreements, rules, accrual/vesting/clawback | AccrueCommission |
| settlement / settlement | Batches, holds, lines, approvals, payout allocation/statements | PrepareSettlement |
| distribution / distribution | Broker/agent appointments, corporate enrollment/imports, affiliate attribution, embedded channels | ValidateSaleChannel |
| documents / documents | Uploads, scan status, object versions, signatures, OCR provenance | AuthorizeDocumentAccess |
| compliance / compliance | Consent, purpose, retention, KYC cases, complaints, jurisdiction releases, audit archive | CheckPurpose, OpenComplaint |
| fraud / fraud | Signals, scores, investigations, evidence, dispositions | ScreenRisk |
| notifications / notifications | Templates, preferences, delivery plans/receipts | NotifyParty |
| integrations / integrations | Adapter configuration, credential refs, attempts, webhook inbox/delivery, developer clients | InvokeCarrier, DeliverWebhook |
| analytics / analytics | Metric contracts, projections, marts | QueryMetric |
| ai / ai | Request policy, models/prompts, evidence and evaluation | ProposeAssistance |

CRM, marketing campaigns, loyalty, coupons, complaints and verified reviews are explicit application modules within customer/distribution/compliance/providers, with their own aggregates; they are not generic notes on Customer. Each owner has migration ownership, on-call runbook and a technical/product steward. [Ownership registry](catalogues/owners.json) maps traceability to these modules.

## 9. Context Relationships

Product supplies versioned published language to pricing/underwriting/quote/policy. Quote is a downstream customer of carrier anti-corruption adapters. Policy receives accepted-offer and underwriting-decision references and owns the insurance contract snapshot. Claims asks policy's published coverage-at-loss port for historical coverage, not today's eligibility. Claims sends approved obligations to billing/ledger and payout intents to payments through orchestration.

Party provides opaque references and purpose-specific snapshots; insurers cannot search the global vault. Finance consumes explicit financial commands and emits journal facts, not inferred accounting from arbitrary business events. Event consumers build read models and trigger processes. Immutable contract snapshots may be shared with legal authorization; sharing a snapshot does not transfer ownership.

Strong consistency: single aggregate invariant and local outbox/audit; finance posting and obligation mutation within one database unit of work through both owners' application ports. This carefully defined monolith transaction has no direct cross-schema repository writes. All other cross-context progression is a saga with explicit pending state. Extraction of finance would require command acceptance and ledger acknowledgment states (ADR-017), not preservation of an imaginary distributed transaction.

## 10. Aggregate Catalogue

| Aggregate | Entities/value objects/domain behavior | Invariant and event |
|---|---|---|
| TenantOrganization | Branch, Team, Membership, Grant, Appointment | A grant cannot exceed issuer authority; GrantRevoked |
| Party | Person or Organization details, RoleAssignment, Identifier, ContactPoint | One canonical reference in approved identity scope; merge is steward-approved and reversible via aliases; PartyLinked |
| ProductVersion | CoverageVersion, Benefits, Limit, Deductible, Franchise, WaitingPeriod, QuestionSet | Published immutable; effective intervals validated; ProductPublished |
| RatingDefinition/Calculation | TableVersion, RuleStep, Money, DecimalFactor, TaxBasis | Exact versioned deterministic calculation; PremiumCalculated |
| Quote | RequestRevision, OfferRevision, CoverageSelection, Expiry | One acceptance of a firm unexpired version by authorized party; QuoteAccepted |
| UnderwritingCase | EvidenceRef, Decision, ReasonCode, Authority, Approval | Override references original decision; proposer cannot approve; UnderwritingDecided |
| Policy | PolicyVersion, InsuredObject, PartyRole, CoveragePeriod, Endorsement, RenewalLink | Unique carrier issue reference; immutable revisions; PolicyIssued |
| Claim | ClaimItem, CoverageAllocation, ReserveChange, DecisionRevision, PayeeAllocation, RecoveryCase | Paid ≤ approved payable; limits account for other claims; ClaimDecisionRecorded |
| AssistanceRequest | DispatchOffer, Assignment, ServiceArea, SLA | One active provider assignment; AssistanceCompleted |
| PaymentIntent | Attempt, ProviderReference, Mandate, Money | One successful capture per obligation allocation; PaymentConfirmed |
| Refund | RefundAttempt, CaptureAllocation | Active refunds + successful refunds ≤ refundable capture; RefundConfirmed |
| JournalEntry | Posting, AccountRef, AccountingDate, Book, Currency | At least two nonzero postings; sum signed amounts=0 per currency/book; JournalPosted |
| CommissionAccrual | AgreementVersion, Basis, Allocation, Vesting, Clawback | Each earning trigger applied once; CommissionAccrued |
| Settlement | BatchLine, Hold, Approval, PayoutAllocation | Line settled once; payee/version bound approval; SettlementCompleted |
| Document | UploadPart, ObjectVersion, Scan, Extraction, Signature | Quarantined evidence not downloadable as clean; DocumentReleased |
| FraudCase | Signal, Score, Investigation, Disposition | Score alone cannot deny/pay; FraudReviewCompleted |
| KycCase/VendorOnboarding | CheckAttempt, Evidence, Review, Contract | No activation without applicable checks/license/contract; VendorActivated |
| Complaint/Consent | SLA, Resolution, Appeal; PurposeGrant | No marketing without applicable permission; ComplaintResolved / ConsentChanged |
| Campaign/Review/CorporateEnrollment | Attribution, Conversion; VerifiedRelationship; ImportJob/Row | Attribution is reproducible; review is verified; row errors do not corrupt whole import |

Cross-claim limits are enforced by a policy coverage allocation owner in claims, not by independently summing stale Claim snapshots. Balance is a rebuildable ledger projection rather than an aggregate that can overwrite financial truth. Very large corporate imports, policy fleets and settlements use child records/batches, not single in-memory graphs.

## 11. Domain Event Catalogue

See [event catalogue](catalogues/events.csv) for producer, consumers, schema, classification and consistency. Required facts cover identity grants; vendor onboarding; Party links; published product/rating versions; quote requested/ready/accepted/expired; underwriting tasks/decision; policy bound/issued/activated/endorsed/cancelled/renewed; document release; FNOL/claim decision/reserve/reopening/payment/recovery; assistance; invoice/installment; payment/refund/chargeback; journal/commission/settlement; consent/complaint; fraud and integration outcomes.

Event envelope: `id`, `type`, `schema_version`, `occurred_at`, `recorded_at`, `tenant_id`, `organization_id`, `aggregate_type/id/version`, `correlation_id`, `causation_id`, `traceparent`, `producer`, `classification`, `payload`. Examples carry opaque Party/evidence references, never health notes or provider tokens. Consumers resolve sensitive details through authorized owner ports. Events are integration facts, not the authoritative history of every domain; ledger/policy/version archives serve their separate purposes.

## 12. Product Architecture

Product identity is stable; ProductVersion references immutable CoverageVersion, TermsVersion, RatingVersion, UnderwritingVersion, CommissionAgreementVersion, question/document schemas, tax/cancellation/renewal rules, insurer/jurisdiction/channel and effective intervals. Localization and signed regulatory disclosures have versioned legal text checksums. Publish requires semantic validation, actuarial simulation, insurer authority, regulatory evidence where required and separate approval. New revisions become effective without changing prior quotes/policies; withdrawn offerings stop new sales, not existing coverage.

Required fields include mandatory/optional covers, benefits, limits/sub-limits, aggregate limits, deductible vs franchise semantics, exclusions, waiting periods, territory, risk-object schema, eligibility, fees/taxes and contractual services. A franchise is a threshold rule with explicitly configured full-loss or excess-loss treatment; it must not be silently treated as a deductible. Optional covers have dependency/incompatibility rules. Claims basis is typed: occurrence, claims-made (retroactive/reporting dates), indemnity, fixed benefit, reimbursement or parametric.

All requested families are retained in source-clause IDs. Delivery packs group motor/motorcycle/fleet/telematics; health/supplemental/dental/critical illness/accident/disability; term/investment-linked life; travel/cancellation; property/perils/home; liability/D&O/malpractice; engineering/CAR/EAR/machinery/electronics/business interruption/cyber; cargo/marine/aviation; agriculture/livestock/pet; device/warranty/credit/loan/event/sports/student/immigration/freelancer; micro/embedded/on-demand/parametric. Each pack supplies typed insured objects, risk questions, approved rating and claims strategies. Life adds benefit schedules, beneficiary shares, lapse/surrender and contractual cash-value mechanics; investment-linked products require a separately governed unit/fund valuation and investment-accounting extension before launch. Health adds eligibility, networks, authorization and service/invoice coding. Marine/cargo adds voyages and declarations; agriculture/parametric needs signed trigger feeds. None is sold using the motor implementation merely because its schema can be stored.

Rules use a restricted declarative AST/decision tables with validated inputs, finite operations, resource limits and no arbitrary JavaScript/SQL/network calls. Plugins are trusted reviewed code artifacts with ports, contract tests and version pins. A new vendor using an existing certified protocol/configuration needs no code; a new protocol needs an adapter. Future product types can add a strategy without redesigning core contract/version invariants.

## 13. Rating Architecture

`CalculatePremium(productVersion, ratingVersion, normalizedAnswers, riskSnapshot, channel, jurisdictionRelease, calculationTime)` returns base, cover premiums, factors, discounts/surcharges, fees, taxes, gross payable and a complete computation trace. Input normalization, lookup row IDs/checksums, formula/runtime artifact digest, currency exponent, calendar/time basis and order of operations are persisted. Decimal inputs are strings. Intermediate arithmetic uses exact rational factors or a pinned decimal library with documented precision; monetary outputs are integer minor-unit strings. No JS `number` performs financial math. Display formatting is not a calculation.

Example deterministic vector in currency exponent 2: base 100.00 × risk 1.25 = 125.00; coverage 20.00 gives 145.00; 10% approved discount gives 130.50; separately disclosed fee 5.00; tax 8% of taxable premium 130.50 = 10.44; payable 145.94. Journal amounts are 14594 minor units. Rounding mode in this example is half-up to cents at the tax line; jurisdiction/product defines actual rules. Independent actuary-approved vectors include boundary ages/timezones, deductibles, franchises, promotions, installment finance charges and negative endorsement/refund cases. Store raw unrounded basis plus rounded line amounts; allocate penny residues by deterministic largest remainder with stable tie-break.

Rating capabilities cover age/location/occupation/assets/claims history/driver and lawful health factors, tables, cover limits/deductibles, discounts, loyalty/no-claims/promotion/channel adjustments, insurer/platform fees and taxes. Eligibility and discrimination restrictions are evaluated before factors. Simulations use isolated datasets, shadow versions and approval comparisons, not production publication. Insurer-computed quotes store signed/external response provenance; they cannot be called internally reproducible unless the carrier supplies a reproducible model/evidence contract.

FX uses an immutable rate record (pair, base/quote direction, source, as-of timestamp, decimal rate, spread, rounding). Each leg stays in its original currency; exchange gains/losses post separately. No summing unrelated currencies.

## 14. Underwriting Architecture

Cases pin questionnaire, risk evidence, product/UW rules and insurer authority versions. Outputs are accept, decline only where permitted, or refer; requests for medical review, documents and inspections create assigned human tasks with SLA timers. Medical evidence is segregated. Manual override records original rule outcome, replacement reason, evidence, operator authority and independent approval when threshold/exception requires it. Never edit rule outputs to resemble straight-through acceptance.

Decision validity expires with risk changes, offer revision or authority expiry. Accepting a quote does not substitute for underwriting clearance. Rule traces include applied/not-applied reasons. Cases may resume after months through Temporal; task completion commands revalidate assignment/authority and resource version. Adverse decision explanations and appeal paths are `JUR-05`. Detailed guarded transitions appear in [state machines](state-machines.md).

## 15. Quote Architecture

QuoteRequest owns consented discovery/needs answers and immutable revisions. A fan-out workflow sends purpose-limited risk snapshots to authorized carriers with per-carrier bulkheads/deadlines. Each carrier Offer records indicative/firm/manual status, product/rating/UW versions, complete cover configuration, exact question/answer snapshot, price/tax/fee/installment schedule, terms, evidence, expiry and provider correlation. Partial results render honestly; no response is not a zero-price offer. Manual RFQ queues support corporate/fleet/commercial risks.

Acceptance checks authenticated Party/delegation, appointment, firm offer, expiry in server time, jurisdiction consent, unchanged risk and concurrency version. Unique `(tenant_id, offer_revision_id, acceptance_kind)` protects retries. A Quote has at most one current purchase acceptance; a marketplace request may produce separate purchases for distinct risks, each explicit. Revisions never overwrite old offers. Recovered abandoned quotes obtain fresh eligibility and consent; expired prices are not silently honored.

Comparison uses normalized per-cover semantic identifiers plus visible unmatched features. Separate price, coverage and service quality panels; label installment total/credit cost and tax/fee inclusion. Quality metrics show verified sample window, denominator, confidence/missingness and provenance. Sponsored results are labeled. Ranking reasons and algorithm version are stored; lowest price is not automatically best coverage. [Quote sequence](diagrams.md#6-quote-sequence) handles asynchronous partial responses.

## 16. Policy Architecture

Use separate dimensions for purchase orchestration, contract status and payment standing. The contract status (`draft`, `bound`, `issued`, `active`, `suspended`, `lapsed`, `cancelled`, `expired`) is not a generic checkout progress flag; pending payment/underwriting belongs to issuance workflow. Bound can create coverage before documents arrive only under explicit insurer/jurisdiction authority. Activation follows contract effective time; issue date, bind date and coverage start are distinct.

PolicyVersion stores full exact contractual snapshot: product/cover/terms/rating/UW/commission references, accepted quote, insured objects/Party roles, limits/deductibles/franchises/exclusions, dates, locale/legal content, approvals and carrier binding/issue evidence. Carrier reference uniqueness is scoped to carrier/environment. Issue activity uses stable issuance key; unknown carrier result enters reconciliation, never blindly reissues. Certificates and documents are deterministic renderings with digest/signature provenance. Failed rendering cannot undo already bound coverage.

Endorsement is a change proposal with effective date, old/new snapshot diff, eligibility/UW decision, additional premium or refund and applicable allocation rules. Address/vehicle/Party/beneficiary/cover/limit/deductible corrections all create new immutable policy versions. Backdated changes require explicit authority and recalculate affected claims/earned premium through approved corrections. Concurrent endorsements serialize on policy revision; stale proposals re-rate. Beneficiary shares sum to the required basis under contract rules; no unsafe deletion of prior beneficiaries.

Cancellation, reinstatement, lapse and replacement require notice/consent/authority and versioned short-rate/pro-rata rules. Cancelled policy can reinstate only by authorized new revision without rewriting historical gap. Renewal creates a new term linked to prior policy; `renewed` is an outcome/link, not evidence that the prior term is still active. Requote/re-underwrite, notice, consent, alternate marketplace offers, retention and mandate/payment retries are durable; non-renewal leaves required notices. Auto-renewal is disabled until `JUR-06` is resolved.

## 17. Claims Architecture

FNOL persists minimal claimant/contact, incident time/place, policy reference if known and immediate assistance need. Lack of documentation or uncertain coverage must not block notice intake; authenticate ownership or record third-party intake without exposing policy data. Progressive evidence collection supports police/witness/third-party details, photos/video/voice and consented location. Claim owns multiple items/perils/covers/payees and independent coverage/assessment/decision/payment/recovery states.

Coverage-at-loss checks exact policy effective revision, incident and report dates, waiting periods, retroactive/reporting dates for claims-made, exclusions, prior notice, jurisdiction and evidence. Policy currently cancelled does not automatically void an earlier covered loss. Limits may be per occurrence, item, insured, term or aggregate. An atomic coverage allocation record keyed by policy term/cover/limit bucket serializes reserves/payables across claims. Reopen and new evidence create decision revisions; appeal reviewers are independent.

Reserve changes are immutable assessments with basis, currency, expense/indemnity split and authorized reason. Reserve obligations post in insurer/admin books if delegated accounting exists; otherwise platform keeps operational estimates clearly distinguished from ledger provisions. Incurred estimates are not payable approvals. Fraud referral routes to investigation with human disposition, never opaque automatic denial. Assignment considers skill/region/conflict/authority; provider work orders disclose only task data.

ParametricTriggerVersion pins index/source contract, event geography/time, threshold, verification/quorum rule and benefit formula. Signed external EventObservation retains raw evidence digest, source/version, observed/received times and correction chain. `(policy_term, trigger_version, external_event_key)` deduplicates automatic claim creation; verified condition leads to authorized deterministic benefit/payment workflow, with disputed or missing source evidence held for review. Corrections never overwrite prior observations; wrongful paid trigger creates an approved recovery/dispute rather than deleting the payout. Sensor/oracle outages use alternative approved source or manual verification, never invented events. Telematics ingestion similarly verifies device/provider signatures, normalizes purpose-approved trip/mileage summaries, versions derived features, minimizes raw geolocation and applies explicit consent/expiry/access controls; location retention is a jurisdiction-configured bounded window, not indefinite default.

Approved items produce payee allocations, tax/withholding treatment and payment schedules; partial decisions/payments are first-class. Under lock: committed payouts + reserved in-flight payouts ≤ authorized payable less reversals. Closure requires settled approved obligations or documented nonpayable outcome and open recovery disposition. Subrogation/salvage/reinsurance recovery remain separate receivables and may outlive claim closure; reopening does not repay already settled items. Withdrawn/duplicate records remain linked and auditable. Claims-made, health preauthorization, cashless network payment, life beneficiary entitlement and parametric verification are distinct strategy extensions with specialist review.

## 18. Finance/Ledger Architecture

The platform ledger records the platform/legal entity's books; it is not automatically every insurer's statutory general ledger. Optional delegated carrier books are separated by `book_id`/legal entity, account authority, currency and accounting basis. Adoption of IFRS/local insurance accounting, premium recognition, reserves and investment accounting is `JUR-02` and requires finance/actuarial approval.

LedgerAccount has book, account type, normal balance, currency policy, owner/counterparty and lifecycle. JournalEntry has immutable ID, source command, idempotent business key, accounting/effective/recording dates, description/reason, reversal reference and approvals. Posting has positive integer minor units and explicit debit/credit sign. `Σ debits = Σ credits` per book/currency, at least two nonzero postings; no mixed-tenant accounts, wrong currencies or closed-period mutation. Post through a ledger application port and restricted database posting procedure; revoke runtime UPDATE/DELETE on posted entries/postings, add immutable triggers, and enforce balance as deferred transaction-wide validation. Unique `(book_id, source_type, source_id, purpose)` prevents duplicate journals. Open periods, account rows and funds allocations lock consistently; SERIALIZABLE with bounded retry where multi-row financial invariants require it.

Illustrative collection-agent book for section 13's 145.94 premium/fee/tax:

| Trigger | Debit | Credit |
|---|---|---|
| Receivable recognized | Customer receivable 145.94 | Insurer payable 130.50; tax payable 10.44; platform fee revenue 5.00 |
| Capture confirmed by provider | PSP clearing 145.94 | Customer receivable 145.94 |
| PSP transfers cash, keeps fee 2.00 | Bank cash 143.94; PSP expense 2.00 | PSP clearing 145.94 |
| Insurer remittance 130.50 | Insurer payable 130.50 | Bank cash 130.50 |
| Tax remittance 10.44 | Tax payable 10.44 | Bank cash 10.44 |

This mapping assumes the platform is obligated to remit tax; if the insurer owns tax, credit insurer payable 140.94 instead and change reporting accordingly. Commission offset is only permitted by contract: recognize commission receivable/revenue, agent expense/payable and offset insurer settlement with explicit journal rather than reducing unexplained gross receipts. Wallet liabilities require custody permission and safeguarding `JUR-01`; do not count customer funds as revenue.

Refund approval debits the legally liable insurer/tax/platform fee accounts and credits refund payable; disbursement debits refund payable/credits cash or PSP clearing. Exact mapping depends on refunds of already remitted taxes/insurer funds and creates recovery receivables when necessary. Chargebacks are separate disputes with fees/provisional allocations; they do not retroactively erase valid policies. Claims disbursements debit approved claim payable and credit cash/clearing in the authorized carrier/settlement book. Adjustments/recoveries/FX movements use explicit accounts and reverse-and-replace corrections.

Every final financial domain command and journal commit in one monolith transaction through owning ports. External capture/payout happens outside it: persist attempt first; on verified response atomically post and mark confirmed. Failure after provider success leaves an unresolved attempt; reconciliation discovers and commits one journal. Financial state never becomes final on a callback alone before its journal. Balance snapshots have journal watermarks and are rebuildable from postings; authoritative available funds derive booked balance minus locked allocations. Daily three-way reconciliation links obligations, ledger and provider/bank statement lines, with exception ownership and aging. Matching errors never auto-create unexplained money.

## 19. Commission Architecture

AgreementVersion pins effective period, product/carrier/channel/beneficiary roles, fixed/percentage/tier rules, eligible premium basis (gross/net/tax/fee excluded explicitly), rounding, earning trigger, vesting, clawback and tax. Tiers define marginal vs whole-volume treatment and period reset; reserve/cap allocations are atomic. A sale may allocate platform, broker, agent, affiliate and provider commissions without accidental double counting.

Accrual records source policy version, rule trace, party/channel attribution evidence and journal key. Cash collection, policy issuance or earned-premium milestones trigger contractual vesting, not a universal assumption. Cancellation/refund/clawback posts a new negative adjustment linked to original accrual; cannot silently lower historical statements. Four-eyes controls cover agreement publication and exceptional adjustments. Commission reports reconcile to journals by book/period/currency.

## 20. Settlement Architecture

Settlement period groups eligible insurer/broker/agent/provider/affiliate obligations into immutable prepared lines. Each line retains source journal/commission/payout references, gross amount, approved deductions/withholding, reserve/hold, net payable and payee account fingerprint. Rows under dispute remain held. Statement/invoice generation captures version and tax evidence; corrections create supplemental periods/credit notes.

Preparation locks/allocates obligations; approval signs batch hash/payee/amount/version with a different actor. Payout attempts use line keys and an allocation lock, not batch retry that pays successful lines again. Partial success is explicit; reconcile before completion. Payee bank changes require step-up, independent verification and invalidation of prior approvals. Settlement completed means all lines terminal and journals reconciled; frontend success screens are not confirmation.

Reinsurance extensions model TreatyVersion/FacultativePlacement, CessionAllocation, Recoverable and RecoveryStatement under authorized carrier books; policy/claims keep immutable risk-share references, while finance posts separate ceded premium/recoverable movements with approved gross/net basis. CoInsuranceParticipation snapshots lead/follower authority and cover/share allocations; contractual percentages, rounding residues, claim decision delegation and each carrier's settlement obligation are validated before activation. Optional features remain disabled until treaty/product/legal/accounting adapters and tests exist; core policy or ledger does not assume a single participant by irreversibly embedding one payee column.

## 21. Provider Architecture

Provider Party organizations and practitioner relationships attach contracts, insurer networks, specialties, price schedules, availability, appointment slots, service-area polygons, licensing, ratings and SLAs. Network membership and tariff versions are effective-dated; old encounter claims keep original evidence. PostGIS is conditional for complex dispatch geometry; simple bounding-box/coordinates suffice initially. Consent limits location access.

Assistance request separates urgent triage from coverage/billing resolution. Dispatch proposes offers to capable providers, then atomically awards one active assignment with timeout/reassignment/cancellation semantics. Tracking events are purpose-limited and short-lived. Service completion evidence, rating eligibility, invoice and provider settlement are separate approved steps. Hospitals/clinics/doctors/pharmacies/labs, repairs/towing/roadside/home services, surveyors/adjusters/legal providers share contract and network models but have specialized work orders. Health eligibility/preauthorization, coded services and FHIR adapters do not expose full medical records to repair/general network workflows.

## 22. Distribution Architecture

Carrier appointment/licensing checks constrain broker/agency/agent sales by region/channel/product/effective dates. Leads and customer consent govern risk sharing; broker CRM never gives access to unappointed insurers' data. Targets and performance reports are read models. Affiliates use expiring signed referral evidence, documented attribution model/window, conversion IDs and anti-self-referral/bot/device checks; commission is not generated from unverified clicks.

Corporate customers have employer organization/cost centers/department approval chains. Enrollment supports employees/dependents and life-event eligibility; medical information is restricted to authorized insurers/providers and individuals. Fleet/asset/bulk policy/claim imports use staged files, dry-run validation, row-level idempotency, error reports and resumable batches. Invalid rows do not roll back unrelated accepted rows or bypass quote/UW limits. Corporate approval does not replace individual consent when required.

Embedded partners get eligibility/quote/offer/purchase/status/FNOL APIs, distinct sandbox clients and usage quotas. Widgets are origin-allowlisted and use short-lived scoped tokens; no long-lived API secret in browsers. Reviews require verified policy/claim/service relation, abuse checks, moderation and appeal. Marketing/coupon/cashback/loyalty/bundles/cross-sell/retention are versioned distribution rules with consent and journaled monetary rewards; prices cannot silently differ from accepted offer evidence.

## 23. Integration Architecture

Ports: CarrierQuote/Bind/Issue/Status/Endorse/Cancel, PaymentCapture/Refund/Payout/Status, BankStatement, IdentityProof/KYC/KYB/AML/Sanctions, Signature, Notification, Map/Dispatch, TelematicsFeed, HealthcareEligibility/Claim, OCR, FxRate and RegulatorySubmission. Each adapter translates to stable domain DTOs, capability flags, typed errors and evidence; vendor statuses never become core policy states directly.

Adapter registry binds tenant/carrier/environment/jurisdiction to certified implementation and versioned configuration plus secret reference. Configure vendor without code for supported protocol; new protocols require reviewed adapters. Contract tests include success, decline, malformed schema, partial response, duplicate/out-of-order callback, throttling, authentication expiry and timeout-after-accept. Mock insurer/KYC/payment/bank services deliberately implement fault modes.

Per-adapter timeouts, bounded retries with jitter, circuit breakers, isolated concurrency quotas and operator recovery prevent outage contagion. Non-idempotent writes retry only if status query/contract proves safe. Incoming webhooks authenticate raw-body signature/mTLS, timestamp/replay window, endpoint secret and carrier-to-tenant binding; body tenant cannot select tenant. Store verified immutable receipt before acknowledgment; inbox deduplicates provider event ID and semantic business effect. Outbound webhooks sign raw body with key ID/timestamp, at-least-once retry, event IDs, secret overlap/rotation, delivery logs and replay controls. DNS/IP checks on every connection/redirect block SSRF/private metadata targets.

ACORD mappings are conditional on carrier licensed schema/version confirmation. FHIR adapter negotiates R4/R4B/R5 and implementation guide; preserves source resource/version, coding, consent and Provenance mapping, validates profiles, and never imports FHIR wire entities as core Claim objects. FX/regulator/provider feeds retain signed provenance and outage/reconciliation plans. See [integration diagram](diagrams.md#13-integration-architecture).

## 24. AI Architecture

AI Gateway enforces purpose/classification/tenant grants before retrieval and provider selection. Registry identifies model/provider region, contractual no-training/retention terms, model/prompt/tool/schema versions, evaluation set, safety thresholds, costs and kill switch. Store redacted request reference, retrieval evidence IDs/versions, output, confidence calibration, review and accepted command reference, not an unrestricted raw prompt log. Restricted data is excluded by default; health/identity extraction runs only on approved regional processor with explicit purpose and minimal input.

| Feature | Permitted input / prohibited input | Evidence, fallback and human gate |
|---|---|---|
| Assistant/policy explanation | Authorized exact terms and question; no other tenant policy/health dossier | Cite clause/version; abstain/escalate to support on no evidence; user confirms actions |
| Comparison/recommendation/needs/coverage gap | Consent-based preferences + offered covers; no protected attributes without approved lawful use | Deterministic price/coverage scores with reason weights; regulated-advice disclaimer where legally required; licensed review for advice |
| OCR/extraction | Approved scanned document; no credentials/card security codes | Raw/normalized fields, position, confidence, source digest, human corrections; low-confidence manual entry |
| Claim/support assistance | Redacted authorized claim excerpt; no unrestricted medical history | Draft guidance and evidence links; adjuster decides; deterministic workflow fallback |
| Fraud signal model | Purpose-approved features; no unexplained protected proxies | Model version/calibrated score/reasons; investigator review; rules fallback |

Retention for model inputs is zero provider retention where contract supports it; platform keeps only approved redacted artifacts for jurisdiction evidence period. Specific processor/model selection stays open until residency/security evaluation, not hardcoded to a popular vendor. Confidence thresholds are calibrated per task; do not use LLM self-reported certainty. Monitor hallucination/citation accuracy, extraction error, discriminatory outcomes, override rate, drift, prompt injection, latency/cost and provider retention compliance. Documents are untrusted instructions; retrieval filtering and tool allowlists prevent their contents from authorizing actions. AI never directly writes policy/UW/claim decisions or financial records. Proposed structured commands pass ordinary validation, resource authorization, idempotency, approvals and human consent.

## 25. Fraud Architecture

FraudSignal records typed source, timestamp, evidence reference, reliability and expiry. FraudScore records feature/rule/model version, reason vector and calibration. FraudCase/Investigation owns assignments, evidence, disposition, review and appeal. Rules, relationship graph projections, device/behavior, duplicate claim/payment/document signals and statistical models can support screening; start with explainable rules before collecting invasive telemetry.

Separate suspicious login, affiliate attribution abuse, underwriting misrepresentation, claim fraud and provider billing fraud policies. Freeze or additional verification requires delegated authority and customer/legal notices. No automatic consequential denial solely on ML. Track false positives/negatives, investigation capacity and protected-group outcomes where lawful. Graph joins stay within purpose-authorized scopes; linking two insurer records via Party vault is not a license to disclose them.

## 26. Security Architecture

Authenticate with OIDC authorization code + PKCE; BFF server sessions use Secure/HttpOnly/SameSite cookies, anti-CSRF token/origin checks, no access tokens in localStorage. Password/email authentication, passkeys, TOTP, hashed one-time recovery codes, device/session revoke and enterprise OIDC/SAML live in IdP. Email verifies a contact, not sufficient identity proof for every regulated action. Phone possession auth is risk/region-configured and never equivalent to phishing-resistant MFA; provider/recovery flow requires a spike. Encourage passkeys; staff privileged operations require phishing-resistant step-up. Customer risk assessment selects proofing/assurance levels. Recovery revokes sessions, rotates factors and uses cooldown/review/notification rather than weakening MFA. Rate-limit suspicious login, credential stuffing and enumeration with generic responses. M2M uses scoped OAuth clients/short-lived credentials or hashed API keys, rotation and dedicated service accounts.

Hybrid authorization in section 6 plus repository scope and FORCE RLS protects tenant-owned schemas. Tenant is the contractual security boundary; organization/branch/department/team are hierarchy/attributes inside it. A legal organization may participate in several tenants through separate Membership/Appointment records. Platform identity/Party vault is a separate platform scope with opaque tenant aliases and purpose-bound projections, not shared insurer tables. Public catalogue contains only published approved data. Customer portfolio is a derived index of resource grants; each card/detail is fetched under issuer tenant and subject ownership check.

Consumer queries: validate identity→Party link; obtain current owner/grant in authorization service; execute scoped owner-tenant transaction and enforce relationship. Broker/provider queries require current appointment + resource grant. No `tenant_id IN all_memberships` blanket access. Administrative support is explicit audited delegation. Repository signatures require `AuthorizedScope`, not a nullable tenant parameter. Background jobs bind signed internal scope, resource and actor/purpose and revalidate access. RLS policies use server-set transaction-local tenant and owner/grant context; missing scope denies. Runtime roles are not table owners/superuser/BYPASSRLS. PostgreSQL documentation explains these bypasses; see [verified RLS baseline](research.md).

TLS externally and service-to-service in production; mTLS/workload identity for infrastructure. Parameterized queries, strict schema validation/size limits, CSP/nonces, HTML sanitization, trusted proxy headers, consistent request framing, safe serialization, dependency integrity and restricted egress mitigate injection/XSS/smuggling/SSRF/supply chain. Files are scanned and isolated. Short-lived credentials, rotated encrypted secrets and no Docker socket/host mounts in apps. Container runtime is non-root/read-only/cap-drop with seccomp. Tenant/cache/search/stream/export tests exercise adversarial identifiers. [STRIDE threat model](#51-threat-model) includes insider and business-logic threats.

## 27. Privacy Architecture

| Classification | Examples | Controls |
|---|---|---|
| Public | Approved product descriptions, public provider directory | Publication review, integrity, versioning |
| Internal | Operational config, aggregate nonidentifying metrics | Workforce access, encrypted transport/storage |
| Confidential | Ordinary customer contact, quotes, claims summaries | Tenant/resource access, retention, redaction, read audit by policy |
| Restricted | Identity documents, financial details, precise location, claim evidence | Field/object encryption, purpose grants, limited exports, short URL lifetime |
| Highly Restricted | Health/genetic data, authentication secrets, critical claim medical files | Dedicated vault/keys, specialist grants, every sensitive read audit, no general analytics/cache |

Authentication secrets belong IdP/KMS, not Party. Card PAN/CVV is excluded; PSP token/reference remains restricted. Audit data is confidential/restricted metadata with no embedded health payload. Consent ledger records purpose/version/time/channel/withdrawal; consent is one possible legal basis, not a universal replacement for contract/statutory duties. Jurisdiction release defines purpose, controller/processor roles, lawful basis, children/guardian rules, residency/transfers, retention clocks, legal hold and deletion exceptions.

Data inventory tracks origin, owner, purpose, processor, class and retention. Erasure removes or anonymizes separable Party/document data where lawful; immutable journals keep opaque reference and minimum statutory evidence under restricted retention. No raw person details in journal descriptions or events. Legal hold blocks deletion with scope/reason/expiry/review. Crypto-shredding is permitted only when recovery/legal obligations allow; deletion propagates caches, indexes, analytics and vendor processors. Backups have expiry and deletion reapplication after restore; legal holds may require scoped preserved evidence rather than indefinite whole-backup retention. Subject export includes authorized data across carriers through explicit ownership grants, with step-up, manifest, watermark and expiring download.

## 28. Data Architecture

One OLTP PostgreSQL cluster initially, schema per context; separate databases/roles for IdP and Temporal, separated sensitive Party/health schemas and keys. Runtime per-context connection pools/users hold only owned schema privileges. Cross-context read projections are maintained via events; published ports return DTOs. Approved monolith transaction coordinator invokes multiple owners with an explicit unit of work; owners execute their own SQL. No public shared ORM entity or schema-wide write role.

Tenant-owned tables use composite key/unique constraint `(tenant_id, id)` and composite foreign keys; branch/organization references retain tenant integrity. UUIDv7 or equivalent time-sortable IDs reduce random index churn; opaque IDs are not authorization. Canonical Party ID never becomes a global search key for insurer users. Tenant aliases and `PartyRole(resource_type, resource_id, party_ref, role, effective_period, purpose)` prevent duplicate customer/driver/claimant tables. Person/Organization are mutually exclusive subtypes. A human can be in several roles without extra master records. Dedup candidates require proof and steward approval; never merge from name/email match alone, preserve aliases, source quality, conflicting fields and reversible linked identities. Golden fields have source priority, verification date, confidence, lineage and approved correction history.

Structured contractual invariants live in relational columns; extensible questionnaire/validated product AST snapshots use schema-versioned JSONB. No arbitrary JSON as substitute for money/keys/state. Index tenant + status + updated_at/id for work queues, tenant + Party alias for portfolio, partial outbox/inbox indexes, full text public product/provider fields and geographic indexes only as needed. Partition audit/events/telemetry by bounded time with tenant indexes; not premature per-tenant tables. Optimistic `version` with guarded UPDATE; financial/claim-limit hot rows use locks and bounded SERIALIZABLE retry. Migration expand/backfill/validate/contract avoids destructive history edits.

Conceptual [ER diagrams](diagrams.md#18-er-models) show per-context ownership. Reference [RLS and ledger SQL patterns](data-invariants.sql) make protection concrete; these are design patterns to incorporate into owned migrations, not a full production schema.

## 29. API Architecture

REST/OpenAPI primary: `/api/v1/public`, `/customer`, `/partner`, `/admin`, `/integrations`. Route audience is not authorization. Public APIs expose only curated public offers; private resources are authenticated. Contract files live in `packages/contracts/openapi`; generate TypeScript clients/docs/mock contracts and diff breaking changes. Initial OpenAPI dialect 3.1.1 is accepted only if current 3.2.1 generator spike fails; [research](research.md) documents current specification. Controller maps DTOs/AuthorizedScope to application commands only.

Core operations: product versions/eligibility/search, quote requests/offers/comparisons/acceptances; underwriting cases/tasks/decisions; purchases/payment-intents/status; policy bind/issue/revisions/endorsements/cancellations/renewals; FNOL/claim items/evidence/reserves/decisions/appeals/payouts/recoveries; provider networks/bookings/assistance; journals/balances/reconciliation; commissions/settlements; Parties/memberships/appointments; corporate imports; credentials/webhooks/logs; consent/complaints/notifications/reviews. [Resource catalogue](catalogues/apis.csv) maps methods, permissions and workflows.

List APIs use opaque signed keyset cursors scoped to tenant/filter/sort, default 25, maximum 100, stable `(updated_at,id)` order; allowlisted filters/sorts and sparse fields still respect field authorization. Immutable export snapshot watermark prevents inconsistent bulk reads. Return integer money as strings + currency/exponent. ISO instants and explicit date-only legal fields. ETag/If-Match for state changes; stale version 412, illegal transition 409. Async write 202 includes authorized operation URL; completed creation 201. 401/403, concealed 404, 422 field/invariant issues, 429 Retry-After, 503 typed provider uncertainty. Errors use RFC-style problem fields `type,title,status,code,detail,instance,request_id,field_errors,retryable`; no stack, existence hints or PII.

Idempotency storage is PostgreSQL, not cache: scope `(tenant,principal/client,operation,key)`, canonical payload hash, target, status, operation ID and encrypted/minimized response. Reserve key and intent atomically. Same payload returns saved result/operation; different payload gives 409; in-flight gives original 202; retryable execution failure resumes the same operation. Re-authorize on replay, so revoked users cannot recover private cached response. Proposed replay window 90 days for payments/policy/refund/settlement, 30 days for FNOL/endorsement; retain immutable semantic business-effect uniqueness for the statutory evidence period even after response expiry. Reuse an expired key for a new operation is rejected via compact tombstone. Privacy retention can remove response data without removing nonidentifying duplicate protection. Provider/webhook inbox retains effect keys per provider replay/evidence contract. See [contract examples](api-examples.md).

## 30. Event Architecture

Each owner transaction writes aggregate, append audit reference and outbox row. Relay uses leasing/`SKIP LOCKED`, publishes stable event ID, waits for JetStream acknowledgment then marks delivery. Crash after publish before marking can duplicate; inbox unique `(consumer,tenant,event_id)` and business semantic key commit with effects before acknowledgment. Durable pull consumers, bounded concurrency, exponential retry with jitter and dead-letter quarantine after configured attempts; poison messages never silently drop. DLQ replay is scoped/approved/audited with original event IDs.

Subjects partition by region/context/event type; broker accounts/credentials isolate producers/consumers, never expose broker subscriptions to tenants. Ordering is per aggregate version; late events cannot overwrite newer projections. Missing version triggers catch-up/read model rebuild, not endless assumptions about global ordering. Schema additive changes are compatible; breaking meanings require new schema/type and migration/upcasters with fixture tests. NATS retention covers operational replay (initial 30 days); authoritative evidence remains owners' archives. Backpressure caps outbox age/storage and alerts before critical capacity; DB commits can continue while broker is down only while durable capacity remains. SSE reads authorized projections, not raw broker topics.

## 31. Workflow Architecture

Temporal owns orchestration history, timers and activity scheduling; domain owners own business state. Workflow ID `region/tenant/process/resource` is deterministic, namespaced and unique. API stores process request in outbox; dispatcher starts/signals idempotently to avoid DB/start race. Workers consume only allowed task queues and current scope; activity receives resource IDs, not health content/secrets. Deterministic workflow code never performs direct DB/network/random-clock access; activities do it through owner ports. History keeps minimal references, uses appropriate payload encryption/codec and retention.

| Process | Durable stages / compensation / SLA |
|---|---|
| Vendor/corporate onboarding, KYC/KYB | Checks→review→license/contract→activate; failed checks freeze activation; SLA/legal notices per jurisdiction |
| Quote-to-policy/UW/docs/issuance | Fan-out→accept→UW→collect/auth→bind→issue→render; failed bind releases authorization or refunds captured funds after definitive reconciliation |
| Claim/assistance | Notice→coverage/evidence/fraud→assess/reserve→decide→pay→recover; deadlines escalate human tasks without inventing denial |
| Endorsement | Propose→rate/UW→collect/refund obligation→apply revision; cannot reverse bound change by deleting revision |
| Renewal/installments | Notice→fresh quote/UW→consent→collect→new term; grace/lapse notice policy controls retries |
| Settlement/dispute/complaint | Prepare→hold/review→approve→per-line pay→reconcile; unsuccessful lines retry only after status check; appeal deadlines preserved |

Set start-to-close/schedule-to-close and heartbeat timeouts for activities; no infinite uncontrolled provider retry. Human waits use signals and durable timers, with current authorization recheck. Unknown outcome activities go to reconciliation, not compensation that assumes no effect. Irreversible insurer binding/payout is compensated by legally authorized cancellation/refund/recovery, never deletion. Continue-as-new bounds multi-month histories while preserving business correlation. Worker deployment/versioning and replay fixtures keep open workflows compatible. Temporal outage queues intent; DB remains source of user-visible pending state. Recovery replays desired commands through idempotent owner ports.

## 32. Frontend Architecture

`customer-web`: discovery, guided risk questionnaire, transparent compare, checkout, portfolio, FNOL, assistance and renewals. `partner-web`: distinct workspaces for carrier product/pricing, UW, claims, finance, broker sales, corporate enrollment and provider work orders. `admin-web`: platform ops, scoped support, vendor onboarding, compliance, reconciliation queues and incident workflows. `developer-web`: OpenAPI, credential rotation, sandbox/test cases, webhook settings/replay, redacted integration logs, SDK docs, quota/usage and changelog.

Next App Router uses server rendering for public content and authorized initial views; thin BFF only translates session/API transport. Never rerate/authorize/approve in Next. Private fetches disable shared caching; cache/CDN vary by visibility and locale only for public content. Generated API client and reusable accessible design primitives are shared; business rules remain NestJS. Error boundaries, resumable forms, optimistic UI only for reversible local preference edits and explicit operation polling/SSE for durable commands. Frontend feature flags are presentation; backend capability/permission checks remain authoritative.

## 33. UX Architecture

Consumer: needs questions→fair comparison→cover adjustment→plain-language price/terms→consent→purchase progress→policy history. FNOL first screen prioritizes immediate safety/help, contact and incident basics; save and resume visibly, with documents later. Third-party claim intake has its own guarded pathway. Corporate admin sees enrollment/import validation/approvals/cost centers without employees' health dossier. Product manager sees draft/simulation/diff/publication approvals. Underwriter sees evidence/authority/task queue; adjuster sees coverage-at-loss, items/reserves/evidence/payments/appeals. Finance sees ledger-linked exceptions/batches/approvals. Broker sees lead→appointment→quote→renewal/commission. Healthcare provider sees network eligibility/preauth/invoice. Repair provider sees work order/parts/evidence. Platform admin sees operational cases and reasoned scoped access.

Design system: semantic color/token names, 4px spacing scale, responsive type and logical CSS properties, RTL/LTR, focus states, labeled inputs, inline + summary errors, keyboard tables/dialogs, status text/icons, accessible charts and live notifications. No color-only states, mouse-only comparison or disappearing operation feedback. Complex tables support alternative card/linear views; quotes compare semantic labels not positional columns. Legal text/product content/insurance terminology/message translations/document templates are independent versioned assets. Names and addresses support jurisdiction schema without assuming first/last names or Western postal format. All consequential screens show currency/total, effective time, evidence, authority, cancellation/refund effects and confirmation receipt.

Notification orchestration uses immutable DeliveryPlan referencing source event, template/legal-copy version, locale, purpose, recipient contact reference and preference snapshot. Channel adapters include email/SMS/push/in-app and opt-in jurisdiction-supported WhatsApp/Telegram/other messaging. Dedup key `(recipient,source-event,template-purpose,channel)` and provider delivery IDs protect retries. Marketing checks current permission immediately before dispatch; withdrawal cancels queued marketing. Transactional notices follow applicable legal basis and required channel/receipt deadlines, with quiet-hour/emergency exceptions expressly configured. Durable schedule uses recipient timezone; bounded retry/backoff and approved fallback record attempts/receipts and avoid double delivery after uncertain provider acceptance. In-app read state and delivery status remain separate. Sensitive health/financial details are omitted from SMS/push/chat previews; deep links require fresh authorization.

## 34. PWA Architecture

Customer PWA has manifest/icons/install experience, versioned static shell and public offline help/emergency contacts. Cache API denies authenticated responses, signed document URLs, tokens and health/identity evidence. Offline draft is opt-in, minimal incident/contact data with short local expiry and explicit shared-device warning/clear control; avoid health/document capture offline in baseline. Draft storage is untrusted device data and revalidated/reauthorized on reconnect. If encrypted drafts are enabled later, key management and device threat model require approval; browser encryption alone cannot protect against same-origin XSS.

Reconnect uses client draft UUID and idempotent submission with conflict UI. Service worker migrations preserve drafts or request export/re-entry safely, never silent resubmission. Push notifications contain neutral text and an authenticated deep link. Permission is contextual; geolocation and camera are optional with manual alternatives. Revocation/logout clears local private data. No offline binding, payment or claim approval. Background sync support is progressive enhancement; app offers explicit retry when unavailable.

## 35. Docker Architecture

[Reference container package](../../infrastructure/reference/README.md) includes multi-stage Next/Nest Dockerfile templates, Compose base/dev/test/prod templates and `.env.example`. All first-party web/API/workers/migrations/seed/mock/test runners execute in containers. Source/build contexts and contract-defined artifact paths become real in Foundation; these templates deliberately do not claim a working application before source exists. The documented final startup contract is `docker compose --env-file infrastructure/versions.env -f infrastructure/reference/compose.yaml -f infrastructure/reference/compose.dev.yaml --profile testing up --build --wait` after an idempotent development bootstrap generates local secrets and locks images.

Core services: reverse-proxy, four web apps, api, worker, workflow-worker, integration-worker, postgres, identity-provider, temporal, minio/object storage, nats, clamav. A migration/bootstrap/seed one-shot precedes readiness; app cannot run with a mismatched schema. Valkey optional measured cache/rate-limit profile; mock insurer/payment/KYC/bank + mail server development/testing; ClickHouse analytics profile; OpenSearch advanced search profile; OTel/Prometheus/Grafana/Tempo/Loki observability profile. `full` is documented union of optional profiles, not assumed dependency magic. Don't add Redis and Valkey simultaneously.

First-party containers non-root, minimal digest-pinned Node base, frozen installs, build-secret mounts, read-only filesystem, `/tmp` tmpfs, drop capabilities, limits, health endpoints, exec-form process, graceful SIGTERM (drain HTTP, workers stop polls, finish/checkpoint leases). No secrets in images/env examples. Each infrastructure image gets vendor-specific hardening (cannot blindly apply app UID). Dev bind mounts are dev-only; production pulls signed immutable built images. Single host Compose reference is not a multi-zone availability claim; topology ports and production HA requirements are separately defined.

## 36. Network Architecture

Edge network: reverse proxy only publishes 443 (loopback dev ingress port); routes audience-specific hosts, body/time limits, TLS/HSTS and websocket/SSE upgrades. App network: web/BFF→api only; neither browser nor web app accesses databases. Data network is internal: runtime DB, NATS, object storage, Temporal gRPC, IdP store; no database/broker/Temporal UI/minio console public ports. Management/telemetry network is restricted through VPN/SSO, never hidden only by URL. IdP authentication endpoints are proxied publicly; admin console stays restricted.

Integration worker has allowlisted egress proxy; webhook destinations/maps/carrier/PSP permit-list with DNS rebinding/redirect validation. Document scanner has no external egress; AI processor egress is per approved region/provider. Compose networks reduce exposure but are not per-service firewalls: production adds network policy/firewall, workload identity and least-privilege broker/object/DB credentials. Reference local plaintext/internal-only exceptions are explicitly dev-only; prod enables TLS/certificate validation and secure secret mounting. Browser signed uploads use proxy/object-storage origin policy and private quarantine prefix only.

## 37. Observability Architecture

OpenTelemetry initializes before Nest/Next/worker modules, propagates W3C context through HTTP/events/workflows and emits to collector with redaction/filtering. Prometheus metrics, Grafana dashboards, Tempo traces and Loki structured logs are separate from immutable legal audit. Logs carry request/correlation/workflow IDs and opaque business refs, no answers/health/bank secrets/tokens; tenant is controlled metadata, not unbounded metric label. Keep low-cardinality service/outcome/product-family labels; investigate tenants through scoped logs instead.

Initial targets: core authenticated API 99.9% monthly availability; reads p95 <300ms and local deterministic quote computation p95 <1s at launch load; committed event→consumer p99 <10s; workflow task pickup p95 <5s excluding deliberate human waits. Third-party quote outcomes: timely carrier result p95 <8s and visible partial progress by 2s. Error budget = 0.1% eligible API operations/month; multi-window burn alerts and deployment slowdown prevent chronic breach. These are business/SRE proposals, not measured properties.

Dashboards/runbooks cover API saturation, DB locks/pool/WAL, outbox age/inbox/DLQ, workflow failures/human SLA, carrier circuit status, unknown payment outcomes, issuance pending/bind evidence, claims aging/coverage allocations, document quarantine/scans and reconciliation imbalance. Alerts route to named role/on-call; business-failure alerts differ from liveness. Readiness verifies dependencies required for that service; liveness avoids restarting on third-party outage. Audit records actor/tenant/org/action/resource/time/request/session, lawful IP/device, before/after refs, reason, delegation and approval bundle. Sensitive reads are audited; application admins cannot alter archive. Outbox legal audit → restricted immutable/WORM archive with signed daily hashes/checkpoints, key separation, retention and integrity verification.

## 38. Analytics Architecture

Validated events initially populate ClickHouse through idempotent projections; selective CDC later fills reconciliation/backfill needs, never exports whole health/Party schemas by default. Fact keys include tenant, insurer/legal book, product version, term, currency, accident/report/accounting cohorts and event version. Corrections/upserts use stable fact IDs/revisions and explicit tombstones; sum projections must not double-count replay. Nightly reconciliation checks facts to ledger/policy/claims owner totals. Insurers only access scoped marts; external benchmark outputs require aggregation/privacy review. Heavy BI does not query OLTP; operational work queues use bounded local projections.

| Metric | Precise initial definition (currency/cohort/valuation basis explicit) |
|---|---|
| Written premium | Sum recognized premium excluding taxes/platform fees, including signed endorsements/cancellations in accounting period |
| Earned premium | Sum term written premium allocated by approved earning curve over covered exposure days in period; no default straight-line for all products |
| Loss ratio | Incurred indemnity + loss-adjustment expenses for selected accident/accounting cohort divided by earned premium on same basis; gross/net reinsurance basis labeled |
| Expense ratio | Approved acquisition + operating expenses allocated to cohort / earned premium; commission inclusion declared |
| Combined ratio | Loss ratio + expense ratio with matching premium and reinsurance bases |
| Claim frequency/severity | Count distinct covered loss occurrences / approved exposure units; incurred claim cost / covered occurrences respectively |
| Renewal rate/retention | Renewed eligible expiring terms / eligible expiring terms; customers retaining at least one qualifying policy / prior eligible customer cohort |
| Conversion/average premium | Issued purchases / eligible unique quote requests (window fixed); net written premium / policy-term count |
| Outstanding claims | Sum estimated ultimate + expense estimate − paid − recognized recoveries at valuation, split case reserves/IBNR where approved |
| Settlement/claim cycle time | Median/p95 completion time minus approval time; median/p95 close time minus FNOL time, reopened cohorts separately |
| Fraud rate | Confirmed fraud dispositions / investigated closed cases; separate estimated population fraud, never label referrals as fraud |
| Insurer performance | Published vector: issue success, claim cycle, paid/declined disposition, complaint rate, sample/window; no unexplained composite score |

Zero denominator yields undefined, not zero. Compare equal product/currency/cohort definitions. IBNR/IBNER, catastrophe exposures, earned premium, reserves and reinsurance recoverables require independently verified actuarial methods; operational claims estimates alone cannot produce statutory loss ratios. Analytics model/metric definitions are versioned and audited.

## 39. Backup and Disaster Recovery

| Class | Proposed RPO / RTO | Recovery design and approval |
|---|---|---|
| Financial/policy/claims OLTP | ≤5min / ≤60min | WAL PITR, encrypted base backups, warm failover; business accepts reconciliation/loss window or funds synchronous HA |
| Temporal history | ≤5min / ≤90min | Separate SQL backup/PITR, matching worker artifacts; reconcile externally completed activities before replay |
| Evidence/object storage | ≤15min / ≤4h | Versioned private buckets, regional replicas, checksum inventory; replication is not deletion-proof backup |
| IdP/Party/security config | ≤5min / ≤60min | DB + signed realm/config backup, signing-key/KMS recovery; rotate/revoke affected sessions |
| NATS stream | ≤5min / ≤60min | Durable replicas in HA production, snapshots; outbox replay/consumer inbox withstand restore duplicates |
| Analytics/search/cache | ≤24h / ≤24h | Rebuild projections from owners/event archives; cache no authoritative state |

Targets require underwriting/finance/SRE business approval; single-host Compose cannot provide host-failure HA. Production deploys applications across failure domains with HA PostgreSQL, replicated JetStream, durable workflow SQL and resilient object storage. One region initially; no active-active financial writers. Use controlled regional failover with fencing to prevent split-brain issuer/payout.

Restore sequence: isolate/fence traffic and outbound payouts→recover KMS/config→IdP/OLTP/Temporal consistent recovery point→object evidence checks→broker/consumers→reconcile provider operations since recovery watermark→rebuild projections→tenant and balance checks→controlled resume. Cross-store backups have explicit checkpoint manifests; cannot assume independently restored stores are consistent. Retain original external business keys/tombstones beyond RPO and query providers to prevent lost DB history causing duplicate payouts. Quarterly restore exercise and prelaunch total-region simulation verify actual RPO/RTO, key recovery, legal holds and privacy deletions. Keys backed up through KMS escrow/quorum process, never alongside plaintext data dumps.

## 40. Repository Structure

```text
apps/{customer-web,partner-web,admin-web,developer-web,api,worker,workflow-worker,integration-worker}
domains/{identity,tenant,party,customer,vendor,product,pricing,quote,underwriting,risk,policy,claims,
         providers,billing,payments,ledger,commission,settlement,distribution,documents,compliance,
         fraud,notifications,integrations,analytics,ai}/{domain,application,infrastructure,presentation}
packages/{ui,design-system,api-client,contracts,localization,config,observability,testing}
infrastructure/{reference,migrations,bootstrap,seed,mocks,observability,backup}
docs/architecture/{blueprint.md,adrs.md,state-machines.md,diagrams.md,catalogues,source,tools}
tests/{domain,integration,contracts,workflows,e2e,tenant,security,accessibility,load,restore}
```

pnpm workspaces + TypeScript project references initially, Turbo only if measured build graph savings justify it. Apps compose domain modules; contracts have DTO/schema versions, not shared mutable entities. Infrastructure-owned mocks/test runners are containers. Migration files live with owner domain and deployment bundle orchestrates their execution.

## 41. Dependency Rules

Domain→only own domain and minimal approved immutable value types. Application→own domain + published other-context application ports/contracts. Infrastructure→implements own ports; presentation→application command/query interfaces. Domain never imports Nest/ORM/driver/HTTP SDK. UI never imports backend domains. No cross-context repositories/ORM entities/table SQL, cyclic imports, giant AppService, generic BaseService/BaseRepository that erase invariants, controllers with business decisions, financial floats, arbitrary `any`, hidden side effects or magic rules.

Enforce ESLint import restrictions, dependency-cruiser graph/SQL ownership lint, project references and CODEOWNERS. Narrow ports per use case; rich aggregates for lifecycle invariants and straightforward application services for simple catalogs. Error types are explicit results/domain errors translated at boundary. Only approved transactional coordinator can invoke multi-owner financial unit of work, with integration tests; record ADR before extracting any participant. Flags/config/rules/secrets are separate: typed backend feature flags scoped platform/country/tenant/org/product/cohort; business configuration immutable/versioned/audited, secrets in vault, code in signed images. Security controls cannot be disabled by frontend flags.

## 42. State Machines

[State-machine specification](state-machines.md) is normative for transitions, guard, command side effect, domain event, timer and terminal behavior for Quote, Underwriting Case, Policy, Endorsement, Claim, Payment, Refund, Settlement, KYC, Vendor Onboarding, Complaint and Assistance Request. [Machine-readable JSON](catalogues/state-machines.json) produces the tables. Invalid/unlisted transitions fail with 409; guards run inside optimistic/locked owner transaction. Each transition appends history/audit/outbox; workers cannot mutate status directly. Names are proposed domain terms awaiting insurer/legal validation; safety invariants do not depend on cosmetic names. Payment and claim compound states are described explicitly.

## 43. C4 Diagrams

See [system context](diagrams.md#1-c4-system-context), [containers](diagrams.md#2-c4-container), [components](diagrams.md#3-c4-component), [tenant](diagrams.md#4-tenant-model), [context map](diagrams.md#5-domain-map), [Docker](diagrams.md#15-docker-architecture), [trust boundaries](diagrams.md#16-security-trust-boundaries) and [deployment](diagrams.md#17-deployment-topology). Mermaid sources are editable text; deployment differentiates single-host reference from HA target.

## 44. Sequence Diagrams

[Quote](diagrams.md#6-quote-sequence), [underwriting](diagrams.md#7-underwriting-sequence), [purchase/issuance](diagrams.md#8-purchase-and-policy-issuance), [claim](diagrams.md#9-claim-sequence), [payment](diagrams.md#10-payment-sequence), [settlement](diagrams.md#11-settlement-sequence), [renewal](diagrams.md#12-renewal-sequence), [integration](diagrams.md#13-integration-architecture) and [event](diagrams.md#14-event-architecture) sources show duplicate/unknown outcomes and transaction boundaries rather than a happy-path chain alone.

## 45. ER Diagrams

[ER models](diagrams.md#18-er-models) cover Party/tenant/grant, product/rating/quote, policy/claim and finance. Dashed cross-context references are logical published IDs; they grant no direct writes and do not imply one shared entity. Relational FKs inside a context include tenant where relevant. Historical snapshots allow evidence interpretation if external data changes. Current status projections never replace immutable revisions/journals.

## 46. ADRs

[ADR register](adrs.md) records context, decision, alternatives, advantages, disadvantages, consequences and migration path for modular monolith, REST, PostgreSQL, query strategy, broker, Temporal, IdP, authorization, tenant, storage, search, analytics, telemetry, AI gateway, monorepo and ledger. Additional decisions define financial extraction and conditional future service extraction. Status is accepted design or conditional, not proof of operational implementation.

## 47. Testing Strategy

See [test catalogue](catalogues/tests.csv). Domain/unit/property tests cover money, allocation, rule determinism, version immutability and state guards. Independent actuarial vectors verify rating outside the implementation; accounting approves golden journals. Repository/integration tests use real PostgreSQL RLS/runtime roles, transactions, migrations and finance concurrency. Contract mocks exercise every carrier/PSP/KYC error. Workflow/event tests replay long histories and crash before/after commits, provider calls and acknowledgments. API/E2E validate each role's vertical lifecycle and duplicate operations.

Tenant adversarial matrix tests A→B identifiers in URLs/body/cursors, exports/signed URLs/search/cache, Party linking, stale broker appointments, revoked human tasks, SSE resume tokens, jobs/webhooks and pooled connection reuse. Verify missing tenant, nonowner runtime permissions, composite FK leaks and denied writes. Security includes SAST/DAST, dependency/container scans, manual business logic and penetration testing. A11y automation + keyboard/screen readers, visual regression + RTL, performance/load/stress/soak and justified fault injection complete the pyramid. Backup/restore and expand/backfill/rollback migration tests are required before launch. Planned test IDs are acceptance specifications; no runtime tests are claimed passed in this design repository.

## 48. CI/CD Architecture

PR gate: generated contract/catalogue consistency→format/lint/boundaries→strict typecheck→unit/domain/property→containerized repository/API/contract/workflow/event→E2E/tenant/security/a11y→build. Security jobs check dependencies/secrets/SAST/containers and licenses with reviewed expiring exceptions. Generate SBOM/provenance and sign immutable images. Preview uses isolated tenant/database/PSP sandbox and synthetic data only. Main promotes the same digest through staging and production, never rebuilds a promoted image.

Deployment: migration compatibility dry run/backup checkpoint→expand migrations→canary API/workers with compatible workflow versions→smoke/tenant/journal checks→promote→bounded backfill→contract cleanup later. Human approval for high-risk rule/jurisdiction/financial schema release is separate from code pipeline. Rollback images only if schema backward compatible; prefer roll-forward for data migration. No automated destructive down migration or replay of financial commands to repair schema. Red/blue worker versions replay open histories before retirement. Release includes runbook, contract changelog, signed dependency/rule artifacts and risk assessment.

## 49. Performance Strategy

Proposed launch model: 100k registered consumers, 200 partner organizations, 20 carriers; 100 read requests/s steady, 500/s short peaks, 10 quote requests/s each 5 carriers, 2 purchases/s, 1 FNOL/s, bulk imports up to 100k rows chunked 500, 20MB ordinary document limit and separately bounded video. Validate business forecast before provisioning; this is a sizing scenario, not fabricated actual traffic.

Budget public page mobile LCP ≤2.5s/INP ≤200ms/CLS ≤0.1 at p75, read/search p95 ≤300ms/500ms, deterministic quote ≤1s, partial external comparison ≤2s, carrier result ≤8s. Payment intent creation ≤500ms excluding hosted PSP; status updates ≤10s after verified callback under normal load. Claim intake ≤1s excluding upload; insurer work queue ≤500ms; queue/event p99 ≤10s. Upload/OCR/medical/claims assessment are async with visible SLA. Cache public catalog 60s with publish invalidation; private resource authorization not cached broadly. Stampede protection, bounded negative cache, tenant/jurisdiction/locale/version/purpose key namespace. Sensitive/financial balances never authoritative cache; permission epoch invalidates authorized query caches.

Measure DB plans/locks/pools, quote fan-out saturation, object bandwidth, workflow backlog, frontend bundle/stream size. External request time budget cannot multiply sequentially across carriers; parallel bulkheads honor overall deadline. Load tests mix browsing/quotes/UW/claims/uploads/settlement/imports and partner peaks; stress finds safe rejection boundary, soak checks leaks/queue growth, burst callback tests duplicates. Capacity changes follow measured bottlenecks.

## 50. Scaling Strategy

Scale consumers through stateless web/API replicas; tenants through scoped indexing and fair queues; products through immutable catalogue caching; quotes through bounded fan-out/integration workers; policies through issuance queues and DB locks; claims through item/task batching and coverage allocation contention; files through direct private uploads/scanners; webhooks/events through partitioned consumers and outbox relays; analytics through ClickHouse partitioning; provider networks through conditional spatial/search indexing.

Hotspots: carrier rate limits, pricing CPU, global Party vault access, large fleet aggregates, coverage aggregate-limit locks, ledger reconciliation, document scan/OCR and analytics ingestion. Independently deployed workers already isolate workloads without turning domain boundaries into services. ADR-018 defines conditional extraction triggers/paths for document intelligence, integrations, pricing, assistance/telematics and analytics; ledger extraction additionally uses ADR-017. Do not extract identity/Party/policy/claims merely by table count. Tenant-specific database/data-plane deployment becomes an option for residency/isolation contracts, with routing/grants and schema deployment evidence; no multi-region active-active financial writes by default.

## 51. Threat Model

| STRIDE / threat | Boundary/assets | Required control and verification |
|---|---|---|
| Spoofing: bypass/credential stuffing/session theft | Browser/IdP/API/service identity | PKCE, passkeys/step-up, recovery safeguards, scoped OAuth, credential throttling; T-AUTHN |
| Tampering: IDOR/tenant breakout/privilege escalation | API→owner DB/search/job/stream | Resource-aware authorization, scoped repos/FORCE RLS/composite keys, no client tenant trust; T-TENANT/T-AUTHZ |
| Tampering: injection/XSS/CSRF/smuggling/unsafe deserialization | Edge/BFF/API/documents | Parameterization/schema bounds, CSP/sanitize/origin-CSRF, one proxy framing rule, safe parsers; T-SECURITY |
| Spoofing/tampering: forged/replayed callbacks | Carrier/PSP→integration worker | Signature/raw body, secret-bound tenant, time window, inbox/semantic dedup/status query; T-CONTRACT/T-EVENT |
| Repudiation: unaudited admin/approval manipulation | Support/finance/UW→audit | Bound approval hashes, separate identities, append archive/signed checkpoints/sensitive reads; T-AUDIT |
| Information disclosure: cache/search/export/socket/log/health leak | Read projections/telemetry/Party | Purpose/class filtering, scoped key/cursor/index/session, no raw telemetry, short URL; T-PRIVACY/T-TENANT |
| SSRF/data exfiltration/prompt injection | Webhook/AI/OCR/integration egress | DNS/IP/redirect allowlist, sandbox parser, gateway/tool limits, purpose-authorized retrieval; T-AI/T-SECURITY |
| DoS/bots/scraping/file bombs | Public search/quote/upload/provider | Quotas/concurrency/body/decompression bounds, fair tenant queues, scan isolation; T-LOAD |
| Business abuse/races/duplicate payments | Quote/issue/refund/claim/settlement | Version/lock/semantic keys, ledger invariants, status reconciliation, duty separation; T-RACE/T-LEDGER |
| Elevation/supply chain/malicious container/secret leak | Build/runtime/host | Frozen locks, signatures/SBOM/scans, non-root/seccomp/no socket, secret manager/workload identity; T-SUPPLY |
| Insider risk/unapproved bulk health access | Staff/analytics/support | Least privilege/purpose grants, scoped break-glass, sensitive-read alarms and independent review; T-AUDIT/T-PRIVACY |

Threat inventory updates with each adapter/product/jurisdiction and trust-boundary change. Penetration testing includes malicious insurer/partner, not only external anonymous attacker. Security acceptance is ASVS 5.0.0 level 2 plus risk-selected level 3, API Top 10 2023, and NIST revision 4 risk alignment; legal/PCI applicability is assessed separately.

## 52. Failure-Mode Analysis

| Scenario | Containment and recovery |
|---|---|
| Insurer unavailable | Circuit/bulkhead, partial quotes, accepted offers remain pending; reconcile unknown writes by stable key before retry |
| Payment provider unavailable | Preserve intent/attempt, show pending; retry read/idempotent write only; bank/provider reconciliation, no free issuance absent credit authority |
| KYC unavailable | Queue verification, do not activate regulated capabilities; preserve legally permitted limited intake |
| Broker unavailable | Owner commits outbox within storage budget; relay resumes, inbox handles replay; page on oldest outbox age |
| Workflow engine unavailable | Persist process commands/outbox, show waiting state; idempotent dispatcher restarts; no lost start/signal |
| Database unavailable | Reject new writes safely, no cache-based approval; restore/failover/fence then reconcile external attempts |
| Object storage unavailable | Draft/evidence pending; no false clean/released state; retry multipart parts and verify checksum |
| Duplicate webhook | Verify receipt then inbox + semantic key; repeat acknowledgment with one committed effect |
| Out-of-order webhook | Record all; provider sequence/current-status query controls state; no succeeded→pending regression |
| Payment succeeded/callback failed | Poll/statement reconcile unknown attempt; commit journal+confirmed once; original payer sees same operation |
| Policy issued/response lost | Query by issue key/carrier ref; attach existing evidence; never issue second contract |
| Carrier accepts quote/platform times out | Persist unknown external acceptance, query/request manual reconciliation; do not silently accept another carrier for same purchase |
| Partial claim upload | Part-level resumable keys/checksums, quarantine retained with TTL, missing evidence task; FNOL remains valid |
| Settlement partially succeeds | Completed lines stay posted; unresolved lines held/query; reapprove changed lines, never repay whole batch |
| Scan fails/engine stale | Keep quarantine, retry/update and alert; no bypass to public download |
| AI/analytics/search outage | Deterministic workflows/core OLTP continue; labeled unavailable/rebuilding derived features |

Race controls: quote acceptance guarded version + unique offer acceptance; policy issuance unique carrier key; claim decision version and coverage bucket lock; capture attempt/obligation unique key; refund cap lock counts in-flight; endorsement policy version lock; renewal unique prior-term/renewal cycle; settlement line/funds allocation locks; provider booking/dispatch capacity locks. Stable lock order, deadlock retry and tests are mandatory. Timeout is uncertainty, not permission to duplicate.

## 53. Compliance Matrix

| ID / jurisdiction-dependent obligation | Abstraction/evidence | Required reviewer |
|---|---|---|
| JUR-01 Distribution/custody/payment licenses, merchant/collector model, wallets | Legal entity/book configuration, PSP contracts/safeguarding | Insurance legal + finance/payment assessor |
| JUR-02 Accounting/recognition/reserves/taxes/FX/commissions | Approved chart/mapping/earning/tax rules and filings | Accounting + actuarial + tax counsel |
| JUR-03 Filed products/rates/territory/cover/disclosures | Signed publication evidence/effective jurisdiction release | Carrier compliance/product actuary |
| JUR-04 Privacy/health/minors/residency/transfers/retention | Purpose/legal-basis matrix, DPIA, processor contracts, holds | Local privacy counsel/medical privacy specialist |
| JUR-05 UW/fraud/adverse decisions/claims deadlines/appeal | Decision explanation, fairness review, SLA/notice policy | Insurance legal + UW/claims specialists |
| JUR-06 Binding/cancellation/reinstatement/auto-renewal/e-signature | Contract authority, consent/mandate/notice rules | Carrier policy administration/legal |
| JUR-07 KYC/KYB/AML/sanctions/licensing/beneficial owners | Check strategy, evidence period, escalations | Compliance/regulated entity |
| JUR-08 Advice/AI/marketing/affiliate/reviews/accessibility | Advice scope, model assessment, consent/attribution/a11y evidence | Legal/product/privacy/accessibility |
| JUR-09 Reinsurance/co-insurance/health exchange/telematics/parametric | Treaty/shares, data-source rights, FHIR profiles, trigger disputes | Carrier/reinsurance/medical/geospatial specialists |
| SEC-BASE | ASVS 5.0.0, API 2023, NIST 800-63-4 mapping | Security/IAM review; [research](research.md) |
| PAY-PCI | PCI DSS 4.0.1, hosted payment script controls and assessed scope | Qualified PCI/payment review; tokenization ≠ automatic exemption |
| UX-BASE | WCAG 2.2 AA evidence and local legal requirement | Accessibility lead/local counsel |

Global invariants (balanced ledger, immutable history, authorized access) cannot be relaxed by country/insurer overrides. Rule precedence is global invariant→country law→insurer authority→product→channel; effective interval resolves a signed jurisdiction bundle. Conflicting rules block publication and require a documented resolution. Regulatory exports are immutable schema-versioned datasets with source/journal provenance and scoped delivery receipt.

## 54. Requirement Traceability Matrix

[Traceability CSV](catalogues/traceability.csv) maps every source-clause ID→domain owner→component→API or design-control contract→database owner→workflow→planned acceptance test→security controls→blueprint sections. [Cross-cutting application matrix](catalogues/README.md) applies tenant/security/privacy/audit/idempotency to all protected domains regardless of catalogue primary owner. No major capability relies solely on a generic ownership row: API/events/state machines/tests below refine implementation acceptance. IDs are specs, not a fabricated test execution report.

Coverage checks require all 98 source sections, all source nonblank clauses, all 58 output headings, all named personas, 12 lifecycle machines, at least 17 diagrams and 16 required ADR subjects. The validator also checks referenced owner/API/test IDs and link targets. New implementation tickets carry requirement IDs, owner, threat/control IDs and test evidence; changing a requirement needs approved source/change record rather than regenerating unnoticed omissions.

## 55. Implementation Roadmap

Estimated ranges are team-weeks for a staffed cross-functional senior team, not a promised calendar. A 6–9 month first jurisdiction launch is plausible only after authority/vendor/legal discovery, narrow first product scope and parallel specialist availability; advanced breadth is multi-release. Each vertical slice includes UI + API + domain + DB + workers + evidence, not a list of UI pages.

| Slice / proposed effort | Dependencies and deliverables; architecture/DB/APIs | Tests/security/definition of done |
|---|---|---|
| 0 Foundation (3–5 weeks) | Registry compatibility lock, container monorepo/four app shells/API/workers, schema ownership, contracts, CI/OTel, mock carriers/PSP/KYC/bank/mail, migrations/seed, secret bootstrap | T-BOUNDARY/SUPPLY/COMPOSE; clean checkout boot, health/SIGTERM, image pins, synthetic demo roles, passing CI |
| 1 Identity/tenant/Party/vendor (4–6) | 0; IdP/password/passkey/MFA/SSO/recovery, memberships/appointments, Party vault/roles/dedup, KYC/KYB/onboarding; identity/tenant/party/vendor/compliance schemas + invitation/grant/onboarding APIs | T-AUTHN/AUTHZ/TENANT/PRIVACY; malicious tenant matrix, phone/recovery spike, approved JUR-04/07 |
| 2 Product/pricing/quote (5–8) | 1 + first approved product/rates; immutable versions/AST + rating trace/simulation + two-carrier fan-out/RFQ/compare; product/pricing/risk/quote schemas + publish/calculate/offer APIs | T-PRODUCT/RATING/CONTRACT/HISTORY; independent actuarial vectors and publication duties; no misleading comparison |
| 3 UW/purchase/payment-ledger/policy/documents (6–9) | 2 + JUR-01/02/03/06 and PSP/carrier binding contracts; referrals→approval→collect→bind/issue→document; UW/billing/payments/ledger/policy/document schemas/APIs/workflows | T-LEDGER/RACE/WORKFLOW/DOC/E2E; timeout-after-success reconciliation, four-eyes, reproducible policy; first sale end-to-end |
| 4 Endorsement/renewal/installments (3–5) | 3; revision/proration/UW, notices/consent/mandates/lapse; policy/billing refinements, endorsement/renewal APIs | T-HISTORY/RATING/WORKFLOW/RACE; lawful notices, no old-contract rewrite, reinstatement gap verified |
| 5 Claims/fraud/provider/assistance (5–8) | 3 + claims authority/JUR-05 + provider contracts; FNOL/evidence/coverage-at-loss/limits/reserves/partial pay/recovery/appeal/dispatch; claims/providers/fraud APIs/schema | T-CLAIM/TENANT/WORKFLOW/DOC/A11Y; multi-claim limit contention, stressful mobile UX, health/third-party access |
| 6 Commission/settlement/distribution/corporate (4–7) | 3/5 + commission/withholding agreements; accrue/vest/clawback→prepare/approve/per-line payout, broker/affiliate/enrollment/import; finance/distribution refinements/APIs | T-LEDGER/RACE/IMPORT/CONTRACT; reconcile statements, bank-change attack blocked, employer health segregation |
| 7 Developer/integration/CRM/notification/compliance (3–5, partial parallel) | 1/3; scoped clients/sandbox/webhooks/SDK/logs/quotas; customer 360/tickets/complaints/reviews/marketing; integration/customer/compliance schemas/APIs | T-CONTRACT/AUTHZ/PRIVACY/EVENT; secret rotation/SSRF/replays, consent/quiet-hour/fallback tests |
| 8 Analytics/operations/launch (4–6, continuous readiness) | All launch slices; ClickHouse metrics/reconciliation, HA sizing, restore drills, legal audit and prod rollout | T-ANALYTICS/LOAD/RESTORE/SECURITY/A11Y; signed business/legal/actuarial/security/SRE launch gates, actual RPO/RTO/SLO proof |
| 9 AI and advanced insurance (separate releases) | Stable audited core + purpose/privacy/model reviews; OCR/assistant/recommendation then health/life/commercial packs, telematics/parametric/reinsurance/co-insurance | T-AI/RATING/CLAIM/CONTRACT; per-pack independent financial/actuarial/legal validation; conditional ADR extraction only if measured |

Data/API changes always follow expand/contract with migration verification. No phase turns off tenant controls to accelerate delivery. Reinsurance treaties/facultative cessions/recoverables and co-insurance carrier shares use extension ports and immutable contract percentages now; initial feature flags may disable them. Shares must sum to contractual risk/settlement basis and each participant owns its book/decision; settlement allocation and consent/authority precede activation.

## 56. Risk Register

| ID | Risk / severity | Owner / mitigation / residual gate |
|---|---|---|
| R-01 | Unknown legal/collection authority / high | Legal/finance; resolve JUR-01 before moving real funds |
| R-02 | Product breadth hides line-specific accounting/claims gaps / high | Product/actuary; phased packs, independent approval, no generic launch |
| R-03 | Carrier lacks idempotency/status-query contract / high | Integrations; manual unknown-outcome reconciliation, block automatic issuance retry |
| R-04 | Global Party vault enables cross-carrier leakage / high | Privacy/security; aliases/grants/purpose projections and adversarial tests |
| R-05 | Ledger mapping/reserve/rounding mistake / high | Accounting/actuary; approved golden journals/vectors and reconstruction |
| R-06 | Financial monolith extraction breaks atomicity / high | Architecture; ADR-017 acknowledgment redesign, no casual service split |
| R-07 | Key loss or inconsistent multi-store restore / high | SRE; escrow/checkpoints/provider reconciliation and drill |
| R-08 | Offline drafts/health uploads leak on shared device / medium-high | UX/privacy; bounded opt-in draft, no sensitive caches, session clear |
| R-09 | AI hallucination/bias/provider retention / high if enabled | AI/privacy; evidence/human gate/no authoritative writes/evaluations |
| R-10 | Complex infra exceeds team operations capacity / medium-high | Platform; core/optional profiles, runbooks, managed production options |
| R-11 | Rule engines/dependencies cannot reproduce historic pricing / high | Pricing; signed runtime artifacts, input trace, permanent replay fixtures |
| R-12 | Forecast/HA targets unrealistic / medium-high | Business/SRE; load and recovery budget review before provisioning |

These are implementation/external risks, not claims that identified design defects remain unresolved. High launch risks require explicit evidence or launch scope exclusion; feature flags alone cannot excuse unsafe active workflows.

## 57. Open Decisions Requiring Jurisdiction-Specific Input

JUR-01: where funds flow, who owes taxes/premiums/claims, merchant/collector role, safeguarded wallets, installment credit licensing and local PSP rails. JUR-02: statutory/management books, premium earning, reserve/reinsurance basis, taxable fees/commission, withholding/FX/cash-value accounting. JUR-03: permitted product categories, filed rates/discounts, risk factors, limits/franchises and exact disclosures. JUR-04: controllers/processors, health/minor/guardian use, residency/transfers, lawful bases, erasure/retention/holds. JUR-05: automated/adverse UW/claims/fraud actions, evidence/notice deadlines, appeal and medical disclosure. JUR-06: binding authority/effective boundaries, signatures, cancellation/lapse/reinstatement grace/notice and auto-renewal consent. JUR-07: KYC/KYB/AML/sanctions/license checks and evidence deadlines. JUR-08: insurance advice/AI regulation, marketing and affiliate attribution, accessible legal obligations. JUR-09: health profiles, telematics retention, parametric evidence/trigger dispute rights and treaties/co-insurer reporting.

Each signed answer becomes an effective-dated JurisdictionRelease with provenance, validation tests and named approver. Unresolved regulated capability stays disabled while unrelated architecture/engineering continues. Also unresolved technical/vendor inputs: exact release lock, certified carrier protocols, ACORD licenses, IdP phone/recovery behavior and S3 storage support/license; these are not falsely described as country laws.

## 58. Final Architecture Review

[Review record](reviews.md) records every named specialist persona and all 15 mandated review passes, with critical/high/medium/improvement findings, design resolutions and evidence still needed. These are analytical persona passes conducted for this design, not independent licensed professional or deployed-system audits. Critical/high design findings are resolved in this baseline; external legal/actuarial validation and runtime readiness remain explicit launch gates.

Quality answers: multiple insurers coexist with isolated owned records; customer portfolio uses explicit grants; Party supports multiple roles without duplicate masters; old pricing/policies use pinned snapshots/runtime; payments/issuance/webhooks retry through durable keys/inbox/status reconciliation; multi-month workflows survive process restarts; carrier failures preserve unknown state; isolation is adversarially tested; audits/commission/ledger reconstruction have concrete owners/contracts; vendors configure without code under supported protocols; new products/countries/providers add versioned strategies/adapters; conditional service extraction has ADRs; full environment is container-designed and must pass T-COMPOSE before the startup claim is made; observability/restore/load have measurable acceptance gates. No insurer gains another insurer's private data merely by joining the platform.

The deliverable is an implementation design with reviewable contracts and deployment templates. It is not a certification that the unimplemented system is production-ready. Foundation must first prove the version tuple, Compose startup, tenant/RLS controls and transaction/workflow boundaries; subsequent slices prove domain correctness and jurisdiction authority.
