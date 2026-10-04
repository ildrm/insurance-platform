# Final analytical architecture reviews

These are specialist-perspective review passes performed for this design, not independent human audits, legal advice or an attestation that software was tested. Each critical/high design finding below is resolved in the referenced specification. Runtime evidence and jurisdiction approvals remain implementation/launch gates; their pending status is not disguised as a passed audit.

## Findings and cross-disciplinary resolutions

| Finding | Severity | Challenge/conflict | Resolution in final design |
|---|---|---|---|
| F-01 | Critical | Insurer tenant isolation conflicts with cross-insurer customer portfolio/canonical Party | Platform vault + opaque tenant aliases + per-resource customer grants; no blanket tenant membership query (26/28, ADR-009) |
| F-02 | Critical | Payment success callback and ledger async consumer could disagree about financial truth | Atomic final financial state+journal through owner ports; unknown provider attempt reconciled; extraction requires pending-ledger acknowledgment (18, ADR-017) |
| F-03 | High | Current policy status/terms used for old losses | Exact bitemporal coverage-at-loss, occurrence vs claims-made/report dates, immutable terms/rules/evidence (16/17) |
| F-04 | Critical | Separate claims/refunds/batch retries could exceed limits or duplicate payments | Shared cover bucket, capture/refund/in-flight locks, per-line payout keys and stable ordering (17/20/52) |
| F-05 | High | Product AST persistence alone pretends every insurance family is implemented | Typed line packs and approved strategies; life investment-unit accounting/health/cargo/parametric require separate evidence before activation (12/55) |
| F-06 | High | Ledger contains personal payload that cannot be erased lawfully | Minimal opaque references; Party vault/purpose retention/holds; restore deletion reapplication and processor propagation (27/39) |
| F-07 | High | Offline FNOL and rich uploads leak health information or accept hostile evidence | Minimal opt-in expiring drafts, no sensitive authenticated caches, quarantine/scan/content validation and optional capture (17/23/34) |
| F-08 | High | AI recommendations/risk/fraud scores become regulated or opaque consequential decisions | Purpose/evidence/model registry, reasoned deterministic rank, advice gate, human review and validated commands; no financial writes (24/25/53) |
| F-09 | High | Provider timeout treated as failure permits duplicate bind/capture/payout | Persist unknown outcome; status-query/statement/manual reconciliation before retry or compensation (23/31/52) |
| F-10 | High | Local Compose is presented as HA production readiness | Reference single-host topology, explicit HA/fencing/PITR target and measured launch gates (35/39) |
| F-11 | High | Replay of old pricing after dependency upgrade changes calculations | Pinned input/time/lookup/rule/engine artifact, independent vectors, immutable historical runtime (13/47) |
| F-12 | High | Renewal/endorsement destroys prior coverage or proves renewal by paid flag | New term/revision, explicit gap/effective dates, independent payment standing and consent/notice rules (16/42) |
| F-13 | High | Employer/provider/Party/analytics graph joins overexpose medical data | Purpose-specific grants, dedicated health/vault classes, employer enrollment-only view, deidentified marts (22/25/27/38) |
| F-14 | High | Unverified “latest” framework/standards versions silently become dependency lock | Authoritative research; stable tuple spike/peer tests/digest lock at implementation start; no fabricated pins (research/35) |
| F-15 | High | Independent restore loses effect keys and pays external-success operations again | Cross-store checkpoint/fencing; providers reconciled since watermark before writes resume; retain effect tombstones (39/52) |
| F-16 | High | Session keys/provisioning/ingress data links would cross audiences or deadlock boot | Distinct app secrets, migrate→IdP/Temporal→provision→apps order; separate signed-object network; explicit allowlisted egress (container templates) |
| F-17 | Medium | Analytics ratios mix gross/net/currencies/cohorts and claim referrals count as fraud | Precise denominators/valuation, undefined-zero basis, metric version and source reconciliation (38) |
| F-18 | Medium | One generic partner dashboard obscures duties under stressful tasks | Distinct UW/claims/finance/provider/corporate journeys and accessible progress/error patterns (33) |
| F-19 | Medium | Append-only journal header still allows later balanced postings | Restrict posting to journal creation transaction and deny runtime creation_tx override (data-invariants.sql) |

## Fifteen mandatory review passes

Each pass records severity-specific findings, medium implementation checks and an improvement. “Resolved” means addressed in the design; it does not mean independent domain/regulatory approval has already occurred.

| Review | Critical findings | High-risk omissions | Medium issues / evidence gate | Improvement / resolution |
|---|---|---|---|---|
| Insurance SME | F-01 boundary ambiguity resolved | F-03/F-05/F-12 line/time/history resolved | Obtain carrier contracts and product-pack semantics | Typed occurrence/claims-made/benefit/parametric strategy gates |
| Actuarial | F-04 aggregate limit contention resolved | F-11 repeatability; F-05 product breadth resolved | Independent rates/earning/IBNR/FX/tax vectors pending | Separate operational estimates from approved statutory reserves |
| Underwriting | No additional critical after F-01/F-04 | F-08 opaque decisions; F-09 authority/result ambiguity resolved | Rule validity/manual authority and adverse notices legal validation | Immutable override provenance and human approval hash |
| Claims | F-04 concurrent payable/cover limit resolved | F-03 historical cover and F-07 evidence resolved | Line-specific claim/appeal deadlines and payee checks | Item/payee/payment/recovery dimensions independent |
| Financial/ledger | F-02/F-04 atomic truth/caps resolved | F-15 restore replay resolved | JUR chart/tax/custody and F-19 SQL migration enforcement pending | Golden journals, per-book/currency reconstruction/reconciliation |
| Security | F-01 resource isolation resolved | F-09 webhook replay/F-16 trust boundaries resolved | Independent pen test/ASVS evidence pending | Runtime RLS nonowner roles and adversarial tenant matrix |
| Privacy | No additional critical after F-01 | F-06/F-07/F-13 minimized health/history resolved | DPIA/residency/retention/legal holds pending | Purpose lineage + deletion reapplication after restore |
| Architecture | F-02 consistency group resolved | F-05 fake generic breadth/F-10 HA claims resolved | Boundary enforcement and extraction evidence pending | ADR trigger/cutover rules, no event-driven everything |
| Database | F-04 lock/tenant key correctness resolved | F-03 bitemporal evidence/F-15 recovery resolved | RLS role tests, index plans/migrations and F-19 posted transaction gate pending | Typed SQL, owner scopes, deterministic locks |
| Integration | No additional critical after F-02 | F-09 unknown writes/F-14 version contract resolved | Certified real-sandbox carrier/PSP/FHIR/ACORD evidence pending | Capability registry, mocks and manual reconciliation runbooks |
| UX | No additional critical after F-01 | F-07 offline/stress risk resolved | F-18 role usability studies pending | Emergency-first minimal FNOL, honest partial comparison |
| Accessibility | No additional critical design defects identified | Stressful FNOL/complex comparison accessible alternatives specified | Manual keyboard/screen-reader/RTL/zoom evidence pending | Status text/icons, accessible authentication and dialog focus |
| SRE | No additional critical after F-02/F-04 | F-10/F-15/F-16 startup/recovery resolved | Business SLO/RPO/RTO approval + measured drills pending | Burn-rate alerts, multi-store checkpoint and fenced failover |
| QA | F-04 retry/race coverage resolved | F-11 old rules and F-14 compatibility resolved | Runtime suites/load/restore independently executed later | Source IDs→owner/API/workflow/test/control matrix |
| Compliance | No fabricated universal legal rule | F-05/F-06/F-08 regulated scope resolved by abstraction/gates | JUR-01..09 signed releases and notices/retention pending | Global invariants cannot be overridden by jurisdiction config |

## Every requested specialist persona

These persona-specific concerns inform the passes above. All 73 requested persona names are retained; participation here means an analytical lens, not a claim that 73 independent experts were consulted.

| Persona | Specific review focus and disposition |
|---|---|
| Chief Product Architect | Whole lifecycle ownership; modular monolith and vertical delivery slices |
| Insurance Product Manager | Offer equivalence, disclosure and product pack activation gates |
| Insurance Business Analyst | Complete source catalogue, roles and required legal inputs |
| Insurance Operations Specialist | Manual exceptions, human tasks, notices and reconciliation queues |
| Actuary | Earned premium/incurred basis, reserve methods and independent model verification |
| Pricing Actuary | Factor/rounding/discount/tax trace, effective rate versions and runtime replay |
| Underwriter | Authority ceilings, medical referral, validity and visible overrides |
| Claims Specialist | Historical cover, item decisions, reserves, partial pay and appeal |
| Policy Administration Specialist | Bind vs issue vs activation, endorsement gaps and linked renewals |
| Property & Casualty Insurance Specialist | Occurrence/claims-made, per-risk/occurrence/term limits, deductibles/franchises |
| Health Insurance Specialist | Enrollment, preauthorization, network tariff/coding and medical purpose grants |
| Life Insurance Specialist | Beneficiary entitlements, lapse/surrender and independent investment-linked valuation |
| Auto Insurance Specialist | Vehicle/driver versions, third-party claims, fleets and telematics consent |
| Commercial Insurance Specialist | Manual RFQ, complex assets, surveys, corporate approval and loss basis |
| Reinsurance Specialist | Treaty/facultative cessions/recoverables, gross/net metric basis and risk shares |
| Agent/Broker Distribution Specialist | Licensing/appointments, carrier restrictions, leads and commission provenance |
| Insurance Fraud Specialist | Evidence/disposition, referral vs confirmed fraud and human review |
| Enterprise Risk Manager | Risk register, dependency failures, residual launch scope and authority |
| Regulatory Compliance Specialist | Effective jurisdiction releases, deadlines, reporting and unresolved-law gates |
| Insurance Legal Specialist | Binding/cancellation/advice/custody rights and exact legal evidence |
| Finance Specialist | Funds flow, settlement holds, cash projections and legal entity ownership |
| Insurance Accounting Specialist | Balanced journals, recognition/taxes/reserves and reconcilable corrections |
| Payment Specialist | PSP token/mandate/status contracts, refund cap and unknown capture |
| Enterprise Architect | Trust/data-residency boundaries and target operating/deployment model |
| Solution Architect | Context ports, integrations and end-to-end process consistency |
| Domain-Driven Design Architect | Rich aggregates, bounded ownership and explicit context relationships |
| Software Architect | Dependency inversion, no generic CRUD/God services, extraction constraints |
| Next.js Architect | Thin BFF, private no-store, standalone build and role surfaces |
| NestJS Architect | Controllers only transport, application modules and scoped unit of work |
| API Architect | Public contracts, machine errors, pagination/ETag/idempotency and versioning |
| Integration Architect | Anti-corruption DTOs, capability registry and signed tenant-bound webhooks |
| Event-Driven Architecture Specialist | Meaningful facts, outbox/inbox, aggregate ordering and replay |
| Workflow Orchestration Engineer | Determinism, activity timeouts, human timers and worker replay upgrades |
| Database Architect | Owner schemas, composite keys, historical snapshots and controlled finance transactions |
| PostgreSQL Specialist | FORCE RLS/nonowner roles, pooled scopes, deferred journal constraints/locks |
| Search Architect | Projection authority, scoped reindex/filters and conditional OpenSearch |
| Data Architect | Canonical Party, golden record stewardship, lineage and classification |
| Analytics Engineer | Corrected facts, precise metric denominators and ledger reconciliation |
| DevOps Engineer | Frozen builds, digest promotion, image/contract migration compatibility |
| Platform Engineer | Container bootstrap/provision/profile contracts and scoped state credentials |
| Site Reliability Engineer | SLO/queue/unknown-outcome alerts, key recovery and actual restore drills |
| Performance Engineer | Carrier fan-out/bulkhead/pool/limit contention and realistic mixed load |
| Security Architect | Resource authorization/trust boundaries, supply chain and tenant defense depth |
| Application Security Engineer | Injection/XSS/CSRF/SSRF/smuggling/file attack and replay controls |
| IAM Architect | NIST risk levels, phishing-resistant staff step-up, recovery and federation |
| Privacy Engineer | Legal bases, health purpose segregation, erasure/holds and processor retention |
| Container Security Engineer | Non-root/read-only/cap-drop/secret mounts and vendor image gates |
| Penetration Tester | Malicious partner tenant, IDOR/export/search/job/socket and business-race cases |
| Payment Security/PCI Specialist | Hosted/tokenized payment, script/assessment scope and excluded raw card data |
| UX Researcher | Stressful FNOL, fair comparison and role-specific task usability |
| Service Designer | Emergency triage, human handoffs, recovery/appeal and SLA escalation |
| Product Designer | Transparent price/cover/evidence and durable operation feedback |
| UI/UX Designer | Responsive comparison, accessible forms/errors and role workbenches |
| Design System Engineer | Shared tokens/primitives with semantic status and focus behavior |
| Accessibility Specialist | WCAG2.2AA, keyboard/screen reader/zoom/dialog/chart/auth evidence |
| Content Designer | Plain-language notices/reason codes, consent and exact legal copy versions |
| Localization/i18n Specialist | RTL/LTR, legal terminology, local calendars/names/address schemas |
| PWA Engineer | Public-only caching, expiring opt-in drafts, reconnect keys and shared-device privacy |
| AI Architect | Gateway purpose/model/prompt/tool controls and no authoritative direct writes |
| Machine Learning Engineer | Calibrated task confidence, evaluation/fairness/drift and version registry |
| Recommendation Systems Engineer | Explained price/coverage/service weights, missing metrics and advice boundaries |
| Fraud ML Specialist | Purpose-approved feature evidence, false-positive monitoring and investigator disposition |
| OCR/Document Intelligence Engineer | Raw/normalized fields, source positions, confidence and retained human corrections |
| Healthcare Interoperability Specialist | Version/profile-negotiated FHIR adapters, coding/Provenance and consent |
| GIS/Geospatial Engineer | Provider service area/dispatch, conditional spatial index and minimized location |
| Telematics Specialist | Usage summary/consent/retention/versioned signal integrity instead of indefinite raw trips |
| QA Architect | Test pyramid, traceability, workflow/event faults and independent golden vectors |
| Test Automation Engineer | Containerized fixtures/E2E/tenant/a11y/migration and seeded role coverage |
| Contract Testing Engineer | Provider schema/error/status-query/timeout-after-success and replay certification |
| Performance Testing Engineer | Mobile/user/partner/queue budgets with burst/stress/soak and bounded saturation |
| Technical Writer | Exact 58-section order, diagrams/state/ADR contracts and honest evidence status |
| Program Manager | Dependency-aware vertical slices, staffing assumptions, launch gates and residual risks |
| Prompt Engineer | Versioned prompts, untrusted-document instructions, structured proposal schema and evidence |

## Final design gate disposition

No unresolved critical/high **design** finding remains in this package. No runtime security, actuarial correctness, legal compliance, load or restore gate is marked passed: these require implemented artifacts and independent evidence. Capability gates prevent activation until those inputs are signed/tested. This distinction prevents presenting a paper design as an operating or certified production system.
