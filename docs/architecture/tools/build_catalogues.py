"""Build deterministic source-clause traceability and design lifecycle catalogues.

No external dependencies. This is documentation tooling, not an application test suite.
"""
from pathlib import Path
import csv
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "catalogues"
OUT.mkdir(exist_ok=True)

OWNERS = {
    "identity": ("identity", "identity", "API-IDENTITY", "IdentitySession", "T-AUTHN", "6;26"),
    "tenant": ("tenant", "tenant", "API-TENANT", "ResourceGrant", "T-TENANT", "6;26;28"),
    "party": ("party", "party", "API-PARTY", "PartyStewardship", "T-PARTY", "10;26;28"),
    "customer": ("customer", "customer", "API-CUSTOMER", "CustomerService", "T-CRM", "8;22;33"),
    "vendor": ("vendor", "vendor", "API-VENDOR", "VendorOnboarding", "T-WORKFLOW", "21;23;31;42"),
    "product": ("product", "product", "API-PRODUCT", "ProductPublication", "T-PRODUCT", "12;28"),
    "pricing": ("pricing", "pricing", "API-PRICING", "RatingCalculation", "T-RATING", "13;18"),
    "risk": ("risk", "risk", "API-RISK", "RiskVerification", "T-RATING", "13;14;25"),
    "quote": ("quote", "quote", "API-QUOTE", "QuoteToPolicy", "T-QUOTE", "15;29;31;42"),
    "underwriting": ("underwriting", "underwriting", "API-UW", "UnderwritingCase", "T-UW", "14;31;42"),
    "policy": ("policy", "policy", "API-POLICY", "PolicyLifecycle", "T-HISTORY", "16;31;42"),
    "claims": ("claims", "claims", "API-CLAIM", "ClaimLifecycle", "T-CLAIM", "17;31;42"),
    "providers": ("providers", "providers", "API-PROVIDER", "AssistanceDispatch", "T-ASSIST", "21;31;42"),
    "billing": ("billing", "billing", "API-BILLING", "InstallmentCollection", "T-LEDGER", "18;31"),
    "payments": ("payments", "payments", "API-PAYMENT", "PaymentResolution", "T-PAYMENT", "18;29;31;42"),
    "ledger": ("ledger", "ledger", "API-LEDGER", "PostAndReconcile", "T-LEDGER", "18;28"),
    "commission": ("commission", "commission", "API-COMMISSION", "CommissionVesting", "T-COMMISSION", "19;18"),
    "settlement": ("settlement", "settlement", "API-SETTLEMENT", "SettlementPeriod", "T-SETTLEMENT", "20;31;42"),
    "distribution": ("distribution", "distribution", "API-DISTRIBUTION", "DistributionEnrollment", "T-IMPORT", "22;23"),
    "documents": ("documents", "documents", "API-DOCUMENT", "DocumentCollection", "T-DOC", "23;27;28"),
    "compliance": ("compliance", "compliance", "API-COMPLIANCE", "ComplianceReview", "T-COMPLIANCE", "27;53;57"),
    "fraud": ("fraud", "fraud", "API-FRAUD", "FraudInvestigation", "T-FRAUD", "25;27"),
    "notifications": ("notifications", "notifications", "API-NOTIFICATION", "NotificationDelivery", "T-NOTIFY", "33;37"),
    "integrations": ("integrations", "integrations", "API-INTEGRATION", "ProviderInvocation", "T-CONTRACT", "23;29;52"),
    "analytics": ("analytics", "ClickHouse marts", "API-ANALYTICS", "ProjectionReconciliation", "T-ANALYTICS", "38;49"),
    "ai": ("ai", "ai", "API-AI", "ValidatedProposal", "T-AI", "24;25;27"),
    "frontend": ("four Next applications", "no authoritative domain tables", "CTRL-FRONTEND", "RoleJourney", "T-A11Y", "32;33;34"),
    "security": ("authorization and security controls", "owned data policies; no generic security DB", "CTRL-SECURITY", "ThreatReview", "T-SECURITY", "6;26;51"),
    "privacy": ("compliance purpose and vault controls", "compliance/party/documents", "CTRL-PRIVACY", "PurposeRetention", "T-PRIVACY", "27;53"),
    "platform": ("container platform and workers", "infra state; owner DBs remain authoritative", "CTRL-PLATFORM", "DeploymentRecovery", "T-COMPOSE", "35;36;37;39;48"),
    "architecture": ("architecture governance", "design contracts; no runtime table", "CTRL-ARCH", "DesignReview", "T-DESIGN", "1;8;40;41;46;54;55;58"),
}

# Every source section has one accountable owner. Cross-cutting controls are applied
# by the matrix as well, rather than falsely implying only this owner is affected.
SECTION_OWNER = {
    1:"architecture",2:"platform",3:"architecture",4:"frontend",5:"tenant",6:"party",7:"identity",8:"security",
    9:"product",10:"product",11:"pricing",12:"underwriting",13:"quote",14:"quote",15:"policy",16:"policy",17:"policy",
    18:"claims",19:"claims",20:"providers",21:"providers",22:"payments",23:"ledger",24:"commission",25:"settlement",
    26:"distribution",27:"distribution",28:"distribution",29:"distribution",30:"integrations",31:"integrations",32:"integrations",
    33:"payments",34:"platform",35:"platform",36:"platform",37:"documents",38:"platform",39:"analytics",40:"fraud",
    41:"ai",42:"ai",43:"documents",44:"privacy",45:"security",46:"compliance",47:"platform",48:"platform",49:"platform",
    50:"platform",51:"platform",52:"architecture",53:"policy",54:"ledger",55:"frontend",56:"frontend",57:"frontend",
    58:"frontend",59:"frontend",60:"notifications",61:"customer",62:"compliance",63:"customer",64:"distribution",
    65:"claims",66:"risk",67:"policy",68:"architecture",69:"architecture",70:"architecture",71:"integrations",
    72:"platform",73:"platform",74:"architecture",75:"architecture",76:"architecture",77:"architecture",78:"architecture",
    79:"architecture",80:"privacy",81:"compliance",82:"platform",83:"platform",84:"architecture",85:"compliance",
    86:"architecture",87:"architecture",88:"architecture",89:"architecture",90:"architecture",91:"architecture",
    92:"architecture",93:"architecture",94:"architecture",95:"architecture",96:"compliance",97:"architecture",98:"architecture",
}

TESTS = [
("T-AUTHN","Identity","Passkey/password/TOTP/recovery/OIDC/SAML session flows; stolen/revoked token and factor reset cannot lower assurance"),
("T-AUTHZ","Security","Branch/assignment/authority/purpose/step-up and independent approval evaluated; delayed tasks and replay reauthorize"),
("T-TENANT","All protected owners","A-to-B ID substitutions fail across reads/writes/search/cache/export/SSE/jobs/webhooks; pooled sessions and composite FKs cannot leak"),
("T-PARTY","Party","One canonical human has driver/beneficiary/claimant roles; ambiguous matches cannot merge; aliases hide global identity; steward corrections retain lineage"),
("T-PRODUCT","Product","Published versions reject mutation; invalid effective dates/rule dependencies/terms missing approvals block publication; future pack adds typed strategy"),
("T-RATING","Actuary/Pricing","Independent deterministic vectors and property tests verify rounding/tax/discount/factor/FX boundaries and historical runtime reproduction"),
("T-QUOTE","Quote","Firm-only expiry/version acceptance, partial carrier timeout, RFQ revisions, honest non-equivalent comparisons, stable repeated acceptance"),
("T-UW","Underwriting","Accept/refer/decline rules and authority evidence preserved; changed risk invalidates clearance; no self-approved override"),
("T-HISTORY","Policy","Historical coverage/terms reproduced at loss instant, backdated endorsements/reinstatement gap/renewal preserve immutable old versions"),
("T-CLAIM","Claims","Concurrent claims cannot exceed shared cover limits; partial items/payees, reserve vs payable, claims-made dates, appeal/reopen/recovery do not duplicate payments"),
("T-PAYMENT","Payments","Timeout-after-capture, missing/out-of-order callback and provider statement converge on one effect; outstanding debit prevents unsafe duplicate attempt"),
("T-LEDGER","Accounting","Golden journals balance per book/currency; refunds/chargebacks/FX/reserves mapped correctly; immutable postings; rebuild balances and three-way reconciliation"),
("T-COMMISSION","Commission","Fixed/percentage/marginal vs whole-tier basis/version/vesting/clawback matches independent agreed vectors and statement journals"),
("T-SETTLEMENT","Settlement","Changed payee invalidates approvals; partial success pays each line once; holds/tax/withholding/reconciliation prevent premature completion"),
("T-ASSIST","Providers","Two simultaneous provider accepts award one assignment; booking capacity and reassign timeout safe; tracking consent/minimal disclosure"),
("T-IMPORT","Distribution","100k-row corporate/fleet import chunk/retry has row idempotency, clear invalid rows and no employee medical data for employer"),
("T-DOC","Documents","Actual MIME/size/decompression/polyglot/malware checks; quarantined file inaccessible; multipart checksum/retry, restricted OCR fields/human corrections"),
("T-FRAUD","Fraud","Signals/reasons/version preserved, reviewer/appeal path; opaque model score cannot deny claim or pay automatically"),
("T-AI","AI","Tenant/purpose retrieval, prompt-injection/advice/hallucination/retention/fairness eval; untrusted text cannot call privileged command without ordinary approval"),
("T-NOTIFY","Notifications","Transactional vs marketing consent, quiet hours/timezone, dedup/retry/fallback and delivery receipts; neutral push content"),
("T-CRM","Customer","Customer360 field grants, complaint/task/ticket timeline, verified reviews and consented campaigns do not expose another tenant or health dossier"),
("T-COMPLIANCE","Compliance","Jurisdiction bundle conflicts block publication; KYC/AML/complaint SLA/appeal, legal holds, filings and signed evidence verified"),
("T-CONTRACT","Integrations","Certified mock/real sandbox carrier/PSP/KYC/bank schema/error/status-query/idempotency/signature/rotation/SSRF fault tests"),
("T-EVENT","Platform","Crash at commit/publish/ack/inbox boundary duplicates delivery but not effect; missing/out-of-order aggregate versions, DLQ replay/rebuild correct"),
("T-WORKFLOW","Platform","Replay old and multi-month workflow histories; worker/engine restarts, lost starts/signals, human escalation and irreversible compensation safety"),
("T-RACE","Critical owners","Parallel acceptance/issue/decision/refund/payout/endorsement/renewal hit version/semantic key/cap locks; deadlock retries bounded"),
("T-ANALYTICS","Data/Actuary","Metric definitions/cohorts/currencies/valuation verified; correction/replay does not inflate facts; marts reconcile to financial owners"),
("T-AUDIT","Compliance","Sensitive reads/privileged writes and approvals recorded; operator cannot edit archive; signed hash chain detects tampering and restore gaps"),
("T-PRIVACY","Privacy","Data inventory/class/purpose/hold/erasure/export/processor retention tested; no raw restricted logs/cache/analytics; restore reapplies deletions"),
("T-SECURITY","Security","ASVS/API threat cases incl injection/XSS/CSRF/SSRF/smuggling/deserialization/bot/business abuse; independent penetration test"),
("T-A11Y","UX","WCAG2.2AA automated plus keyboard/screen-reader/zoom/manual FNOL/compare/forms/dialogs/charts, accessible authentication"),
("T-I18N","UX","RTL/LTR local names/addresses/currencies/calendars/legal templates; DST/leap-day boundaries don't change contractual instants"),
("T-BOUNDARY","Architecture","Import/SQL graph denies cycles, domain Nest/DB imports and cross-owner writes; controllers do not make insurance decisions"),
("T-SUPPLY","Platform","Frozen builds, secret/dependency/container/license scans, SBOM/signature/provenance, no Docker socket and non-root/read-only/SIGTERM"),
("T-COMPOSE","Platform","Clean checkout pinned images plus local secret bootstrap starts seeded four apps/API/workers/mocks; health/migrations/dev/test/prod profiles"),
("T-LOAD","SRE","Mixed realistic load/burst/stress/soak proves page/API/quote/queue budgets, fair tenant quotas, circuit/bulkhead/backpressure and capacity"),
("T-RESTORE","SRE","PITR/object/KMS/Temporal/broker restore with consistent checkpoint, external reconciliation/fencing, tenant isolation and journal reconstruction"),
("T-MIGRATION","Database","Expand/backfill/validate/contract compatibility, history retention, failed migrations and safe rollback/roll-forward with open workflows"),
("T-E2E","QA","Two-carrier quote-to-policy then endorsement/renewal/FNOL/partial claim/payout/settlement per role across frontends with synthetic data"),
("T-DESIGN","Architecture","All source clauses/sections/personas/output headings traced; diagrams/machines/ADRs/owners/API/test IDs consistent; no omitted major capability"),
]

APIS = [
("API-IDENTITY","identity","/customer/sessions; /partner/memberships","GET;POST;DELETE","session.manage;user.invite","IdP callback/session management and membership scope"),
("API-TENANT","tenant","/partner/organizations; /partner/appointments; /admin/grants","GET;POST;DELETE","organization.manage;grant.delegate","Scope and explicit grant/appointment revocation"),
("API-PARTY","party","/customer/party; /partner/party-roles; /admin/party-merge-reviews","GET;POST","party.read;party.review","Purpose-limited aliases; steward-reviewed correction/merge"),
("API-CUSTOMER","customer","/customer/tickets; /partner/customer-timelines; /customer/reviews","GET;POST","customer.support.read;review.create","CRM timeline and verified relationship review"),
("API-VENDOR","vendor","/admin/vendor-onboardings; /partner/vendor-contracts","GET;POST","vendor.onboard;vendor.activate","KYB/license/contract and onboarding human approvals"),
("API-PRODUCT","product","/public/products; /partner/product-versions; /partner/product-publications","GET;POST","product.read;product.publish","Immutable effective versions and separate publication approval"),
("API-PRICING","pricing","/partner/rating-versions; /partner/rating-simulations; /partner/rating-publications","GET;POST","pricing.simulate;pricing.publish","Exact versioned rating and actuarial publication approval"),
("API-RISK","risk","/partner/risk-snapshots; /integrations/telematics-summaries","GET;POST","risk.read;risk.verify","Purpose-approved signed risk and usage summaries"),
("API-QUOTE","quote","/customer/quote-requests; /customer/quotes/{id}/offers; /customer/quotes/{id}/acceptances","GET;POST","quote.create;quote.accept","Fan-out/RFQ/compare/firm acceptance with ETag and key"),
("API-UW","underwriting","/partner/underwriting-cases; /partner/underwriting-cases/{id}/decisions","GET;POST","underwriting.read;underwriting.decide","Assigned task/evidence/authority and four-eyes overrides"),
("API-POLICY","policy","/customer/policies; /partner/policy-issuances; /customer/endorsements; /customer/renewals","GET;POST","policy.read;policy.issue;policy.cancel","Bind/issue/immutable revision/cancel/renewal operation resources"),
("API-CLAIM","claims","/customer/fnol; /partner/claims; /partner/claims/{id}/decision-revisions; /customer/claim-appeals","GET;POST","claim.submit;claim.update;claim.approve","Coverage-at-loss/items/reserves/payees/appeals/recoveries"),
("API-PROVIDER","providers","/public/providers; /customer/assistance-requests; /partner/work-orders; /partner/bookings","GET;POST","assistance.request;work-order.manage","Networks/tariffs/dispatch/assignment and completion"),
("API-BILLING","billing","/customer/invoices; /partner/installment-schedules","GET;POST","billing.read;billing.schedule","Receivables and collections paired with ledger"),
("API-PAYMENT","payments","/customer/payment-intents; /partner/refunds; /partner/payout-intents","GET;POST","payment.create;refund.approve;payout.approve","Exact tokenized provider intents and uncertain outcome resolution"),
("API-LEDGER","ledger","/partner/journal-entries; /partner/balances; /partner/reconciliations","GET;POST","ledger.read;ledger.adjust;reconciliation.manage","Posting not generic CRUD; books/currencies/period approvals"),
("API-COMMISSION","commission","/partner/commission-agreements; /partner/commission-accruals","GET;POST","commission.read;commission.publish","Versioned basis/vesting/tier/clawback and journal linkage"),
("API-SETTLEMENT","settlement","/partner/settlements; /partner/settlements/{id}/approvals; /partner/settlement-statements","GET;POST","settlement.prepare;settlement.approve","Hash-bound approval, held lines and per-line reconciled payouts"),
("API-DISTRIBUTION","distribution","/partner/leads; /partner/enrollment-imports; /partner/affiliate-campaigns; /integrations/purchases","GET;POST","distribution.sell;corporate.enroll;campaign.manage","Appointment/consent, row-idempotent imports, embedded client scope"),
("API-DOCUMENT","documents","/customer/document-uploads; /customer/documents/{id}/download-grants; /partner/extraction-reviews","GET;POST","document.upload;document.read;extraction.review","Quarantine/scan/purpose, <=60s download grants and OCR evidence"),
("API-COMPLIANCE","compliance","/customer/consents; /customer/complaints; /admin/kyc-cases; /admin/jurisdiction-releases","GET;POST","consent.manage;complaint.resolve;compliance.publish","Consent/legal-basis/holds/notices/appeals/jurisdiction rules"),
("API-FRAUD","fraud","/partner/fraud-cases; /partner/fraud-cases/{id}/dispositions","GET;POST","fraud.investigate;fraud.review","Human findings and purpose-restricted evidence"),
("API-NOTIFICATION","notifications","/customer/notification-preferences; /partner/notification-deliveries","GET;POST","notification.preference;notification.read","Consent/channel/quiet-hour templates with fallback receipts"),
("API-INTEGRATION","integrations","/integrations/webhooks/{provider}; /partner/api-clients; /partner/webhook-subscriptions; /partner/integration-logs","GET;POST;DELETE","api-key.rotate;webhook.configure;integration.read","Tenant-bound signed callback, sandbox/SDK/usage and scoped logs"),
("API-ANALYTICS","analytics","/partner/metrics; /partner/metric-exports","GET;POST","analytics.read;analytics.export","Tenant-scoped governed metrics/valuation snapshots"),
("API-AI","ai","/customer/assistant-proposals; /partner/ai-reviews","GET;POST","ai.request;ai.review","Purpose-authorized evidence-backed proposals; no direct mutations"),
]

def write_csv(name, fields, rows):
    with (OUT / name).open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

owners = {}
for name, (component, db, api, workflow, test, sections) in OWNERS.items():
    owners[name] = dict(component=component, database_owner=db, api_contract=api, workflow=workflow, test=test, blueprint_sections=sections)
(OUT / "owners.json").write_text(json.dumps(owners, indent=2) + "\n")
write_csv("tests.csv", ["test_id","owner","acceptance","status"], [dict(test_id=i,owner=o,acceptance=a,status="planned; not executed") for i,o,a in TESTS])
api_rows = [dict(api_id=i,owner=o,resources="/api/v1"+p.replace("; /", "; /api/v1/"),methods=m,permission=pms,contract=c) for i,o,p,m,pms,c in APIS]
for name, owner in owners.items():
    if owner["api_contract"].startswith("CTRL-"):
        api_rows.append(dict(api_id=owner["api_contract"],owner=name,resources="N/A: design-control contract",methods="N/A",permission="applies to protected actions",contract=f"blueprint sections {owner['blueprint_sections']}"))
write_csv("apis.csv", ["api_id","owner","resources","methods","permission","contract"], api_rows)

requirements, traces, section_rows = [], [], []
section, ordinal = 0, 0
title = "Specialist team and mission preamble"
lines = (ROOT / "source/request.md").read_text().splitlines()
for line_no, line in enumerate(lines, 1):
    text = line.strip()
    if not text:
        continue
    match = re.match(r"# (\d+)\. (.*)", text)
    if match:
        section, title = int(match[1]), match[2]
        ordinal = 0
        section_rows.append(dict(source_section=section,title=title,owner=SECTION_OWNER[section],blueprint_sections=owners[SECTION_OWNER[section]]["blueprint_sections"]))
    ordinal += 1
    owner_name = SECTION_OWNER.get(section, "architecture")
    owner = owners[owner_name]
    req_id = f"REQ-{section:02d}-{ordinal:03d}"
    clause = re.sub(r"^(?:- |\d+\. |# \d+\. )", "", text)
    kind = "scope" if match else "source-clause"
    if section == 0 and text.startswith("- "):
        kind = "review-persona"
    requirements.append(dict(requirement_id=req_id,source_section=section,source_line=line_no,kind=kind,source_clause=clause,accountable_owner=owner_name,acceptance_test=owner["test"]))
    security = "AUTHZ;TENANT;PURPOSE;AUDIT"
    if owner_name in {"payments","billing","ledger","commission","settlement","policy","claims","quote","integrations"}:
        security += ";IDEMPOTENCY;CONCURRENCY;EVIDENCE"
    if owner_name in {"platform","architecture","frontend","security","privacy"}:
        security += ";SUPPLY-CHAIN;BOUNDARY-TESTS"
    traces.append(dict(requirement_id=req_id,domain=owner_name,component=owner["component"],api_contract=owner["api_contract"],database_owner=owner["database_owner"],workflow=owner["workflow"],test=owner["test"],security_controls=security,blueprint_sections=owner["blueprint_sections"],status="designed; implementation evidence pending"))
write_csv("requirements.csv",list(requirements[0]),requirements)
write_csv("traceability.csv",list(traces[0]),traces)
write_csv("sections.csv",list(section_rows[0]),section_rows)

EVENT_GROUPS = {
"identity": ("identity.subject-linked identity.session-revoked", "tenant;compliance"),
"tenant": ("tenant.grant-created tenant.grant-revoked tenant.appointment-changed", "identity;distribution;compliance"),
"party": ("party.linked party.corrected party.merge-reviewed", "customer;compliance"),
"vendor": ("vendor.onboarding-requested vendor.activated vendor.suspended", "distribution;integrations;compliance"),
"product": ("product.published product.withdrawn", "quote;pricing;distribution"),
"pricing": ("rating.published premium.calculated", "quote;underwriting;analytics"),
"risk": ("risk.snapshot-verified risk.telematics-summarized", "pricing;underwriting"),
"quote": ("quote.requested quote.offer-ready quote.revised quote.accepted quote.expired", "policy;underwriting;notifications;analytics"),
"underwriting": ("underwriting.referred underwriting.evidence-requested underwriting.decided", "quote;policy;notifications"),
"policy": ("policy.bound policy.issued policy.activated policy.endorsed policy.suspended policy.lapsed policy.cancelled policy.reinstated policy.expired policy.renewal-offered policy.renewed", "claims;billing;commission;documents;notifications;analytics"),
"claims": ("claim.notified claim.coverage-checked claim.reserve-changed claim.decision-recorded claim.payable-approved claim.payment-allocated claim.reopened claim.recovery-recorded claim.closed claim.parametric-trigger-verified", "fraud;providers;billing;payments;notifications;analytics"),
"providers": ("assistance.requested assistance.assigned assistance.completed provider.network-changed", "settlement;notifications;analytics"),
"billing": ("invoice.created installment.due installment.overdue", "payments;policy;notifications"),
"payments": ("payment.confirmed payment.outcome-unknown refund.confirmed chargeback.opened payout.confirmed", "policy;billing;settlement;notifications;analytics"),
"ledger": ("journal.posted reconciliation.exception-opened", "commission;settlement;analytics"),
"commission": ("commission.accrued commission.vested commission.clawed-back", "settlement;analytics"),
"settlement": ("settlement.prepared settlement.approved settlement.partially-paid settlement.completed", "payments;notifications;analytics"),
"distribution": ("enrollment.import-completed affiliate.conversion-verified campaign.published", "policy;commission;notifications;analytics"),
"documents": ("document.released document.rejected document.extraction-reviewed", "claims;underwriting;policy;compliance"),
"compliance": ("consent.changed kyc.review-required kyc.verified complaint.resolved jurisdiction.published", "identity;distribution;notifications;integrations"),
"fraud": ("fraud.signal-raised fraud.review-completed", "claims;underwriting;distribution"),
"notifications": ("notification.delivered notification.delivery-failed", "customer;compliance"),
"integrations": ("integration.outcome-unknown integration.reconciled webhook.delivery-failed", "policy;payments;quote;compliance"),
"ai": ("ai.proposal-created ai.proposal-reviewed", "customer;compliance"),
}
event_rows = []
for owner_name, (events, consumers) in EVENT_GROUPS.items():
    for event in events.split():
        event_rows.append(dict(event_type=event,schema_version=1,producer=owner_name,consumers=consumers,classification="Confidential metadata; restricted data by authorized reference only",payload="aggregate/resource version; outcome/reason code; immutable evidence reference",consistency="owner commit + outbox; consumer inbox + effect; no financial posting inferred automatically"))
write_csv("events.csv",list(event_rows[0]),event_rows)

# from | command | to | guard | effect | event | timeout
MACHINES = {}
def machine(name, initial, terminal, notes, data):
    transitions=[]
    for row in data.strip().splitlines():
        src,cmd,dst,guard,effect,event,timeout=row.split("|")
        transitions.append(dict(from_state=src,command=cmd,to_state=dst,guard=guard,side_effect=effect,event=event,timeout=timeout))
    states=sorted({initial} | {t[k] for t in transitions for k in ("from_state","to_state")})
    MACHINES[name]=dict(initial=initial,states=states,terminal_states=terminal.split(",") if terminal else [],notes=notes,invalid_transitions="Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.",transitions=transitions)

machine("Quote","draft","accepted,expired,withdrawn,rejected","Quote represents one revision/purchase offer set. Indicative/firm/RFQ are offer types; accepted quote never mutates to a new offer.","""
draft|request|collecting|Question schema/consent/eligible channel|Pin answers and fan-out attempts|quote.requested|Per-carrier deadline; no-response remains visible
collecting|offersArrive|ready|At least one validated offer|Persist immutable offer versions|quote.offer-ready|Expire each offer at carrier expiry
collecting|referRFQ|manual-review|No instant firm offer; authorized RFQ|Create carrier human task|quote.rfq-referred|Configured RFQ SLA escalation
manual-review|recordOffer|ready|Assigned authorized carrier reviewer|Pin manual firm/indicative offer|quote.offer-ready|Offer-specific expiry
ready|revise|draft|Not accepted; risk or cover change|Create new immutable revision; invalidate clearance|quote.revised|None
ready|accept|accepted|Firm unexpired offer; Party grant; version and unique acceptance; required consent|Store accepted revision and start issuance intent|quote.accepted|Issuance workflow SLA
ready|expire|expired|All purchasable offers expired by server time|Retain evidence; offer fresh quote|quote.expired|Durable expiry timer
collecting|declineAll|rejected|All carriers definitively decline; not unknown outcomes|Record reasons and appeal/help path|quote.rejected|None
draft|withdraw|withdrawn|Owner authorized|Stop unsent requests; retain history|quote.withdrawn|None
collecting|withdraw|withdrawn|Owner authorized; no accepted purchase|Cancel pending read tasks|quote.withdrawn|None
ready|withdraw|withdrawn|Owner authorized; not accepted|Withdraw current offer set|quote.withdrawn|None
""")
machine("Underwriting Case","opened","accepted,declined,withdrawn","Manual override is a new decision revision retaining prior output; material changes after terminal create a linked new case.","""
opened|evaluate|evaluating|Complete required input version|Run pinned deterministic rules|underwriting.evaluation-started|Bounded rule execution
evaluating|autoAccept|accepted|STP rule accept; authority; legal basis|Store trace and validity interval|underwriting.decided|Clearance expiry on offer/risk change
evaluating|autoDecline|declined|Decline legally allowed; approved reason rules|Store explanation/notice/appeal reference|underwriting.decided|Notice deadline jurisdiction-configured
evaluating|refer|referred|Rule requires human judgment|Create skill/authority assignment|underwriting.referred|Task SLA escalation
referred|requestEvidence|awaiting-evidence|Assigned underwriter; necessary purpose|Create document/medical/inspection tasks|underwriting.evidence-requested|Reminder/escalation; no silent denial
awaiting-evidence|receiveEvidence|referred|Evidence scanned/verified|Append evidence version and provenance|underwriting.evidence-received|Task SLA
referred|proposeDecision|pending-approval|Within delegated authority; reason/evidence; override flagged|Hash decision version and required approvals|underwriting.decision-proposed|Approval SLA escalation
pending-approval|approveAccept|accepted|Independent approval where required; unchanged hash/authority|Commit accepted decision and evidence|underwriting.decided|Decision validity period
pending-approval|approveDecline|declined|Independent approval; lawful decline and notice|Commit decline; notification/appeal task|underwriting.decided|Notice SLA
pending-approval|return|referred|Approver rejects evidence/authority|Append review reason; keep prior decision|underwriting.review-returned|Reviewer SLA
opened|withdraw|withdrawn|Authorized requesting party|Close outstanding intake|underwriting.withdrawn|None
referred|withdraw|withdrawn|Allowed under insurer/jurisdiction rules|Retain evidence/history; stop tasks|underwriting.withdrawn|None
""")
machine("Policy","draft","expired","Pending-payment/UW are issuance workflow states; payment standing is independent. Renewed is a new term/link. Cancellation may be reinstated only by a new authorized revision preserving gaps.","""
draft|bind|bound|Accepted quote; valid UW; explicit carrier binding authority; payment or approved credit prerequisite|Record immutable binding evidence and interval|policy.bound|Issue SLA escalation; no blind rebind
bound|issue|issued|Verified carrier issue result; unique external issue key|Create policy version and document task|policy.issued|Document/render SLA
bound|expire|expired|Bound coverage interval ended even if issue evidence unresolved|Preserve binding and unissued-document exception; expire coverage projection|policy.expired|Escalate outstanding carrier documentation
issued|activate|active|Coverage start reached and contract conditions valid|Record activation projection|policy.activated|Expiry timer
issued|expire|expired|Term end reached before activation event processed|Preserve issue evidence; expire interval without inventing active history|policy.expired|Sweep missed activation separately
active|endorse|active|Approved proposal; version lock; financial journal prerequisite|Append new effective policy revision|policy.endorsed|None
active|suspend|suspended|Lawful cause/notice and authority|Append suspension effective interval|policy.suspended|Configured remedy/grace timer
active|lapse|lapsed|Arrears/condition and lawful notice/grace fulfilled|Append lapse revision; preserve prior coverage|policy.lapsed|Reinstatement window where allowed
suspended|reinstate|active|Condition cured; authority; no forbidden retroactive gap rewrite|Append reinstatement revision and dates|policy.reinstated|Term expiry
lapsed|reinstate|active|Product/JUR permits; UW/notice/payment rules met|Append revision with actual gap and financial effect|policy.reinstated|Term expiry
active|cancel|cancelled|Legal notice/consent/authority; versioned refund mapping|Append cancellation; create journaled refund obligation if due|policy.cancelled|Refund resolution SLA
bound|cancel|cancelled|Carrier confirms cancellation/release; permitted authority|Preserve binding; create refund/release obligation|policy.cancelled|Provider reconciliation SLA
issued|cancel|cancelled|Legal authority and notice/consent|Append cancellation and financial effects|policy.cancelled|Refund SLA
suspended|cancel|cancelled|Notice/authority conditions met|Append cancellation; settle owed obligations|policy.cancelled|Refund SLA
lapsed|cancel|cancelled|Product law permits administrative cancellation|Append decision and notice|policy.cancelled|None
cancelled|reinstate|active|Explicit lawful reinstatement within term; new UW/version/authority|Append new revision; preserve cancelled interval|policy.reinstated|Term expiry
active|expire|expired|Term end reached|Freeze term; independent renewal may already exist|policy.expired|Durable coverage timer
suspended|expire|expired|Term end reached|Retain suspension history|policy.expired|Durable coverage timer
lapsed|expire|expired|Term end reached|Retain lapse history|policy.expired|Durable coverage timer
cancelled|expire|expired|Original term end reached|Keep cancellation and renewal references|policy.expired|Durable coverage timer
""")
machine("Endorsement","proposed","applied,rejected,withdrawn","Financial adjustment and underwriting steps can run as separate substates; applied always appends policy revision, never edits prior cover.","""
proposed|validate|rating|Allowed change/effective date; current policy version|Snapshot old/new proposed cover/risk|endorsement.validated|Processing SLA
rating|refer|underwriting|Change requires risk review|Open linked UW case with pinned inputs|endorsement.referred|UW task SLA
rating|calculate|pending-approval|Deterministic premium delta and tax/earning rule|Store additional-premium/refund calculation|endorsement.rated|Approval SLA
underwriting|accept|pending-approval|Valid accepted UW decision|Attach decision and rerate final delta|endorsement.cleared|Approval SLA
underwriting|decline|rejected|Lawful decision and explanation|Store rejection without changing policy|endorsement.rejected|Notice SLA
pending-approval|approve|pending-finance|Required independent approval; unchanged diff/hash|Create journaled charge/refund obligation|endorsement.approved|Collection/refund SLA
pending-finance|apply|applied|Payment/credit/refund-obligation condition per contract; policy version lock; carrier confirmation|Append policy revision and journal-linked delta|policy.endorsed|None
pending-finance|stalePolicy|proposed|Concurrent policy revision makes proposal stale|Invalidate approval and request new calculation|endorsement.rebased|No automatic financial replay
pending-approval|reject|rejected|Approver authorized|Retain proposed evidence and reason|endorsement.rejected|None
proposed|withdraw|withdrawn|Owner authorized; no applied change|Retain proposed revision|endorsement.withdrawn|None
""")
machine("Claim","notified","withdrawn","Claim lifecycle is overall progress; coverage/assessment/fraud/payment/item/recovery dimensions persist independently. Closed may reopen; partial approvals and recoveries are not erased.","""
notified|validate|validating|Minimal notice accepted; identity/claimant facts checked without blocking intake|Create coverage-at-loss task|claim.validation-started|Acknowledgment SLA
validating|requestEvidence|awaiting-evidence|Required evidence/purpose documented|Create progressive document/witness tasks|claim.evidence-requested|Reminder/escalation; legal notice never silently expires
validating|investigate|investigating|Coverage snapshot captured; sufficient initial facts|Assign adjuster/fraud/provider tasks|claim.investigation-started|Assessment SLA
awaiting-evidence|receiveEvidence|investigating|Relevant evidence released/verified|Append evidence and coverage revision|claim.evidence-received|Assessment SLA
investigating|assess|assessed|Coverage/peril/limits verified; evidence and fraud disposition recorded|Record item assessment and reserve revision|claim.assessed|Decision SLA
assessed|proposeDecision|pending-approval|Reason/evidence/authority; shared cover allocation lock|Hash item/payee decisions; reserve payable capacity|claim.decision-proposed|Approval SLA
pending-approval|approve|approved|Independent approver where required; hash/version unchanged|Record approved/partial/rejected items and journaled obligations|claim.decision-recorded|Payment SLA for payable items
pending-approval|return|investigating|Approver needs evidence or disputes allocation|Release proposed allocations only; retain history|claim.review-returned|Assessment SLA
approved|schedulePayment|pending-payment|Payable items and verified payees; current allocation|Create idempotent payout intents; lock in-flight capacity|claim.payment-requested|Provider resolution SLA
pending-payment|partialPay|partially-paid|Verified payout; ledger posted; total <= payable|Append payee/item allocation|claim.payment-allocated|Remaining payout SLA
partially-paid|scheduleRemainder|pending-payment|Remainder authorized; no overlapping uncertain attempt|Create remainder intent only|claim.payment-requested|Provider resolution SLA
pending-payment|finishPay|paid|All approved payable satisfied or lawful documented adjustment; journal proof|Record payment completion|claim.payment-completed|Recovery/closure SLA
approved|closeNoPay|closed|All items nonpayable; lawful reason/notice/appeal path|Record closure disposition|claim.closed|Appeal window jurisdiction-configured
paid|recover|recovering|Subrogation/salvage/treaty right and authority|Open linked recovery receivable/case|claim.recovery-opened|Recovery SLA; may outlive claim closure
paid|close|closed|No unresolved payable; recovery separately tracked|Close with evidence and customer notice|claim.closed|Appeal/reopen window per jurisdiction
recovering|close|closed|Approved recovery disposition or independent ongoing recovery case|Keep receivable separate; close claim work|claim.closed|Recovery case timer remains independent
closed|reopen|investigating|Authorized new evidence/appeal/reopen basis|Create decision revision; preserve prior paid allocations|claim.reopened|Reopened-case SLA
notified|withdraw|withdrawn|Valid claimant request; legal/reporting retention preserved|Close notice without deleting evidence|claim.withdrawn|None
investigating|withdraw|withdrawn|Allowed withdrawal; no undisclosed payable/outstanding dispute|Record disposition; preserve recovery/payment references|claim.withdrawn|None
""")
machine("Payment","created","confirmed,failed,cancelled","Capture intent state only. Refund, chargeback and payout are linked dimensions/aggregates; confirmed cannot regress to failed on old callback.","""
created|submit|pending|Validated obligation/amount/currency/provider token; unique attempt|Persist attempt before external call|payment.submitted|Bounded provider call timeout
pending|requireAction|requires-action|Verified PSP challenge reference|Expose safe hosted challenge action|payment.action-required|Provider challenge expiry
requires-action|completeAction|pending|Provider challenge confirmed|Query/capture under same operation key|payment.action-completed|Provider resolution deadline
pending|authorize|authorized|Verified authorization; no capture yet|Store auth ref/expiry|payment.authorized|Capture/void deadline per PSP
authorized|capture|pending|Allowed capture amount and obligation lock|Submit stable capture key; retain auth evidence|payment.capture-requested|Provider call timeout
pending|timeout|unknown|External write may have succeeded|Preserve intent; enqueue query/statement reconcile|payment.outcome-unknown|Escalate unresolved outcome; never blind debit retry
unknown|querySucceeded|confirmed|Verified provider effect and balanced journal committed atomically|Store provider evidence/confirmed allocation|payment.confirmed|None
pending|confirm|confirmed|Signature/status proof and unique effect; journal atomic commit|Append capture journal and finalize obligation|payment.confirmed|None
unknown|queryFailed|failed|Provider definitively proves no effect|Record reason; release reserved allocation|payment.failed|New payment intent only if permitted
pending|fail|failed|Definitive decline/no capture|Record provider reason; release allocation|payment.failed|None
created|cancel|cancelled|No external attempt exists|Cancel unpaid intent|payment.cancelled|None
authorized|void|cancelled|Provider confirms void; no capture/unknown attempt|Record verified release|payment.cancelled|Void resolution SLA
""")
machine("Refund","requested","confirmed,rejected,cancelled","Refund cap includes confirmed plus reserved/in-flight refunds under capture lock; unknown cannot release reservation.","""
requested|review|pending-approval|Original capture exists; lawful reason; refundable balance available|Reserve refund amount; bind payee/currency/key|refund.proposed|Approval SLA
pending-approval|approve|submitted|Independent approver where required; unchanged hash|Create refund payable journal and persist attempt|refund.submitted|Provider resolution timeout
pending-approval|reject|rejected|Authorized approver|Release proposal reservation; retain reason|refund.rejected|None
submitted|timeout|unknown|Provider result uncertain|Keep reservation; query/reconcile|refund.outcome-unknown|Reconciliation escalation
submitted|confirm|confirmed|Verified refund effect and journal; cap still valid|Post refund disbursement; link capture|refund.confirmed|None
unknown|confirm|confirmed|Provider status/statement proves effect|Post once; retain reconciliation evidence|refund.confirmed|None
unknown|proveFailure|retryable|Definitive no refund effect; same obligation remains|Keep payable; prepare safe new attempt|refund.retry-authorized|Retry backoff and SLA
submitted|proveFailure|retryable|Provider definitively rejects attempt|Record failed attempt; payable not erased|refund.retry-authorized|Retry backoff
retryable|resubmit|submitted|Same approved amount/payee; no unresolved attempt|Create stable next attempt per provider semantics|refund.resubmitted|Provider timeout
requested|cancel|cancelled|No approval/external effect|Release proposal; retain record|refund.cancelled|None
""")
machine("Settlement","draft","completed,cancelled","Batch state derives from line outcomes. Partial completion cannot repay successful lines; unknown payee/amount change invalidates approval.","""
draft|prepare|prepared|Eligible journal-linked obligations; period/currency/book valid|Allocate immutable lines and holds|settlement.prepared|Review SLA
prepared|submitApproval|pending-approval|Reconciliation/statement/hash prepared|Create separate approver task|settlement.approval-requested|Approval SLA
pending-approval|approve|approved|Different actor; unchanged payee/amount/hash; authority|Bind approval to batch version|settlement.approved|Execution window
pending-approval|return|prepared|Approver disputes lines|Append correction/hold; invalidate approval|settlement.returned|Review SLA
approved|pay|paying|Funds/line allocations locked; verified accounts|Persist per-line payout attempts|settlement.payment-started|Per-provider resolution deadline
paying|someSucceed|partially-paid|Verified line effects and journals; unsettled remainder|Finalize successful lines only|settlement.partially-paid|Reconcile each unresolved line
partially-paid|retryRemainder|paying|Definitive failure or same-key safe query; unchanged approved lines|Submit only unpaid permitted attempts|settlement.payment-resumed|Provider timeout
paying|finish|completed|All lines terminal paid or documented hold/correction removed to separate batch; reconciled journals|Publish final statement and reconciliation evidence|settlement.completed|None
partially-paid|finish|completed|All remaining lines resolved; no unknown payouts|Record completion without duplicating lines|settlement.completed|None
prepared|changePayee|prepared|Authorized verified bank-change process|New version/hash; no approval reuse|settlement.revised|Fresh review SLA
approved|changePayee|prepared|No in-flight payout on changed lines; verified change|Invalidate approval; reprepare changed lines|settlement.revised|Fresh review SLA
draft|cancel|cancelled|No payout/committed approved obligations removed|Release preparation allocation|settlement.cancelled|None
prepared|cancel|cancelled|No submitted payouts; cancellation authorized|Release batch holds into originating obligations|settlement.cancelled|None
""")
machine("KYC","pending","rejected,expired,revoked","Verified status expires or revokes; renewal is a new linked case/version. No outage equals verification success.","""
pending|submitCheck|checking|Purpose/legal basis and required evidence|Call scoped KYC/KYB/AML provider; retain attempt|kyc.check-started|Provider deadline
checking|needsHuman|review-required|Ambiguous/sanction/document conflict|Assign compliant reviewer and reason|kyc.review-required|Compliance SLA
checking|verify|verified|All configured checks passed with provenance|Record validity/assurance and permitted capability|kyc.verified|Evidence/verification expiry timer
checking|fail|rejected|Definitive result; required human review completed|Record reason/notice/appeal|kyc.rejected|Appeal deadline
checking|unavailable|pending|No definitive outcome|Retain attempt; bounded retry/status query|kyc.check-deferred|Retry/escalation policy
review-required|approve|verified|Independent authorized reviewer; evidence adequate|Store human decision/expiry|kyc.verified|Expiry timer
review-required|reject|rejected|Authorized reviewer; lawful evidence and explanation|Store rejection and notice|kyc.rejected|Appeal window
verified|expire|expired|Validity date reached|Suspend dependent regulated capabilities|kyc.expired|Renewal requires new case
verified|revoke|revoked|Verified new risk/sanction/fraud finding; authority|Freeze impacted capabilities and notify|kyc.revoked|Review/notice SLA
""")
machine("Vendor Onboarding","draft","rejected,withdrawn","Supports configurable participant types/capabilities; activation requires all applicable checks, not a universal insurer checklist.","""
draft|submit|checking|Organization/beneficial-owner/license data consented|Start KYB/license/contract workflow|vendor.onboarding-requested|Onboarding SLA
checking|requestDocuments|awaiting-documents|Necessary evidence missing|Create classified document tasks|vendor.documents-requested|Reminder/escalation
awaiting-documents|receive|checking|Verified released evidence|Resume checks with provenance|vendor.evidence-received|Check deadline
checking|pass|pending-contract|Applicable KYB/KYC/AML/licenses valid|Prepare capability/channel/residency contract|vendor.checks-passed|Contract review SLA
checking|fail|rejected|Definitive lawful failure after required review|Record explanation and appeal|vendor.rejected|Appeal deadline
pending-contract|sign|pending-approval|Authorized representatives sign correct version|Retain signatures and contract digest|vendor.contract-signed|Approval SLA
pending-approval|activate|active|Independent authority; checks/contract/current licenses valid|Grant only contracted capabilities and appointments|vendor.activated|License/contract expiry timers
active|suspend|suspended|Expiry/compliance breach or authorized incident|Revoke capabilities; preserve obligations and evidence|vendor.suspended|Review/remedy SLA
suspended|reactivate|active|Reverified checks; approved remedial contract|Restore permitted grants; audit reason|vendor.reactivated|Renewal timers
draft|withdraw|withdrawn|Applicant authorized|Retain minimal lawful intake history|vendor.withdrawn|None
pending-contract|withdraw|withdrawn|No active obligations; authorized applicant|Close onboarding with provenance|vendor.withdrawn|None
""")
machine("Complaint","received","closed","Closure is conditional on lawful notice and appeal handling. New evidence after closure opens a linked new case rather than erasing disposition.","""
received|acknowledge|acknowledged|Minimal complaint and contact available|Send receipt and durable legal deadline|complaint.acknowledged|JUR acknowledgment SLA
acknowledged|assign|investigating|Independent eligible handler; conflicts screened|Create evidence/tasks and SLA timer|complaint.investigation-started|Resolution deadline
investigating|resolve|resolved|Reasoned evidence and remediation authority|Record outcome, remedy/journal command if financial, notice|complaint.resolved|Appeal window
resolved|appeal|appealed|Within applicable right/window or allowed exception|Record appellant reason/evidence|complaint.appealed|Appeal acknowledgment deadline
appealed|escalate|escalated|Independent reviewer/regulator route|Create escalation task with case dossier|complaint.escalated|JUR escalation deadline
escalated|resolve|resolved|Authorized independent determination|Append new resolution; no overwrite|complaint.resolved|Appeal/closure rule
resolved|close|closed|Appeal period/right handled; remedy completed|Retain full history and final notice|complaint.closed|Retention clock
""")
machine("Assistance Request","requested","completed,cancelled","Safety triage can begin before coverage resolution where emergency contract allows; eligibility/accounting remain explicit.","""
requested|triage|triaged|Location/contact minimal; emergency/purpose consent appropriate|Record safety actions and service capability|assistance.triaged|Emergency-specific response SLA
triaged|dispatch|dispatching|Service-area/capability and contract eligibility or approved emergency authority|Send bounded provider offers|assistance.dispatch-started|Provider accept deadline
dispatching|accept|assigned|Atomic assignment/capacity lock; eligible provider; offer valid|Award one provider; retract competing offers|assistance.assigned|Arrival SLA
assigned|start|in-progress|Verified provider/party status|Publish minimal tracking/status|assistance.started|Completion SLA
assigned|noShow|dispatching|Deadline exceeded; no completed service; authority|Cancel prior assignment; release/reassign capacity|assistance.redispatched|New accept deadline
in-progress|complete|awaiting-confirmation|Provider completion evidence and safe outcome|Record work/invoice proposal|assistance.completion-proposed|Confirmation/escalation SLA
awaiting-confirmation|confirm|completed|Customer/operator verification or contractual evidence; authorized invoice|Create settlement obligation and review eligibility|assistance.completed|Provider invoice/payment SLA independent
requested|cancel|cancelled|Requester authorized; no committed service|Record cancellation reason|assistance.cancelled|None
dispatching|cancel|cancelled|Emergency-safe cancellation; no performed work|Withdraw offers; record reason|assistance.cancelled|None
assigned|cancel|cancelled|Provider notified; lawful incurred fee treatment|Release assignment and journal any fee obligation|assistance.cancelled|Fee/settlement workflow
""")
(OUT / "state-machines.json").write_text(json.dumps(MACHINES, indent=2) + "\n")

state_doc = ["# Lifecycle state machines", "", "Generated from `tools/build_catalogues.py`; JSON contract is `catalogues/state-machines.json`.", "", "Global transition contract: authenticated current actor/purpose/grant; correct owner tenant/organization/branch; aggregate version or financial lock; state guard; owner transaction appends immutable transition history, audit and outbox. Side effects outside the DB use durable intents and idempotent activities. Four-eyes approvals bind input hash/version/amount/payee. Every external timeout preserves uncertainty until verified. Timers are durable Temporal timers, with jurisdiction-specific business deadlines configured rather than fabricated. A terminal instance can only be superseded by a linked new instance where the domain permits it."]
for name, data in MACHINES.items():
    state_doc.extend(["",f"## {name}","",f"Initial: `{data['initial']}`. States: " + ", ".join(f"`{s}`" for s in data["states"]) + ".", "", "Terminal: " + (", ".join(data["terminal_states"]) or "none; explicit re-entry rules") + ".", "",data["notes"],"",data["invalid_transitions"],"", "| From | Command → To | Guard | Side effect | Event | Timeout |", "|---|---|---|---|---|---|"])
    for t in data["transitions"]:
        state_doc.append(f"| {t['from_state']} | {t['command']} → {t['to_state']} | {t['guard']} | {t['side_effect']} | {t['event']} | {t['timeout']} |")
(ROOT / "state-machines.md").write_text("\n".join(state_doc) + "\n")

# Catalogue lifecycle facts as well as core event examples; no machine transition
# emits an undocumented integration fact.
known = {e["event_type"] for e in event_rows}
machine_owner={"Quote":"quote","Underwriting Case":"underwriting","Policy":"policy","Endorsement":"policy","Claim":"claims","Payment":"payments","Refund":"payments","Settlement":"settlement","KYC":"compliance","Vendor Onboarding":"vendor","Complaint":"compliance","Assistance Request":"providers"}
for name,data in MACHINES.items():
    for t in data["transitions"]:
        if t["event"] not in known:
            known.add(t["event"])
            event_rows.append(dict(event_type=t["event"],schema_version=1,producer=machine_owner[name],consumers="notifications;compliance;analytics (purpose-authorized)",classification="Confidential metadata; sensitive evidence by authorized reference",payload="resource/version; transition reason; immutable evidence ref",consistency="owner commit + outbox; consumer inbox + effect"))
write_csv("events.csv",list(event_rows[0]),event_rows)
print(f"Built {len(requirements)} source clauses, {len(section_rows)} sections, {len(event_rows)} events, {len(MACHINES)} state machines, {sum(len(m['transitions']) for m in MACHINES.values())} transitions.")
