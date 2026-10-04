# Lifecycle state machines

Generated from `tools/build_catalogues.py`; JSON contract is `catalogues/state-machines.json`.

Global transition contract: authenticated current actor/purpose/grant; correct owner tenant/organization/branch; aggregate version or financial lock; state guard; owner transaction appends immutable transition history, audit and outbox. Side effects outside the DB use durable intents and idempotent activities. Four-eyes approvals bind input hash/version/amount/payee. Every external timeout preserves uncertainty until verified. Timers are durable Temporal timers, with jurisdiction-specific business deadlines configured rather than fabricated. A terminal instance can only be superseded by a linked new instance where the domain permits it.

## Quote

Initial: `draft`. States: `accepted`, `collecting`, `draft`, `expired`, `manual-review`, `ready`, `rejected`, `withdrawn`.

Terminal: accepted, expired, withdrawn, rejected.

Quote represents one revision/purchase offer set. Indicative/firm/RFQ are offer types; accepted quote never mutates to a new offer.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| draft | request → collecting | Question schema/consent/eligible channel | Pin answers and fan-out attempts | quote.requested | Per-carrier deadline; no-response remains visible |
| collecting | offersArrive → ready | At least one validated offer | Persist immutable offer versions | quote.offer-ready | Expire each offer at carrier expiry |
| collecting | referRFQ → manual-review | No instant firm offer; authorized RFQ | Create carrier human task | quote.rfq-referred | Configured RFQ SLA escalation |
| manual-review | recordOffer → ready | Assigned authorized carrier reviewer | Pin manual firm/indicative offer | quote.offer-ready | Offer-specific expiry |
| ready | revise → draft | Not accepted; risk or cover change | Create new immutable revision; invalidate clearance | quote.revised | None |
| ready | accept → accepted | Firm unexpired offer; Party grant; version and unique acceptance; required consent | Store accepted revision and start issuance intent | quote.accepted | Issuance workflow SLA |
| ready | expire → expired | All purchasable offers expired by server time | Retain evidence; offer fresh quote | quote.expired | Durable expiry timer |
| collecting | declineAll → rejected | All carriers definitively decline; not unknown outcomes | Record reasons and appeal/help path | quote.rejected | None |
| draft | withdraw → withdrawn | Owner authorized | Stop unsent requests; retain history | quote.withdrawn | None |
| collecting | withdraw → withdrawn | Owner authorized; no accepted purchase | Cancel pending read tasks | quote.withdrawn | None |
| ready | withdraw → withdrawn | Owner authorized; not accepted | Withdraw current offer set | quote.withdrawn | None |

## Underwriting Case

Initial: `opened`. States: `accepted`, `awaiting-evidence`, `declined`, `evaluating`, `opened`, `pending-approval`, `referred`, `withdrawn`.

Terminal: accepted, declined, withdrawn.

Manual override is a new decision revision retaining prior output; material changes after terminal create a linked new case.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| opened | evaluate → evaluating | Complete required input version | Run pinned deterministic rules | underwriting.evaluation-started | Bounded rule execution |
| evaluating | autoAccept → accepted | STP rule accept; authority; legal basis | Store trace and validity interval | underwriting.decided | Clearance expiry on offer/risk change |
| evaluating | autoDecline → declined | Decline legally allowed; approved reason rules | Store explanation/notice/appeal reference | underwriting.decided | Notice deadline jurisdiction-configured |
| evaluating | refer → referred | Rule requires human judgment | Create skill/authority assignment | underwriting.referred | Task SLA escalation |
| referred | requestEvidence → awaiting-evidence | Assigned underwriter; necessary purpose | Create document/medical/inspection tasks | underwriting.evidence-requested | Reminder/escalation; no silent denial |
| awaiting-evidence | receiveEvidence → referred | Evidence scanned/verified | Append evidence version and provenance | underwriting.evidence-received | Task SLA |
| referred | proposeDecision → pending-approval | Within delegated authority; reason/evidence; override flagged | Hash decision version and required approvals | underwriting.decision-proposed | Approval SLA escalation |
| pending-approval | approveAccept → accepted | Independent approval where required; unchanged hash/authority | Commit accepted decision and evidence | underwriting.decided | Decision validity period |
| pending-approval | approveDecline → declined | Independent approval; lawful decline and notice | Commit decline; notification/appeal task | underwriting.decided | Notice SLA |
| pending-approval | return → referred | Approver rejects evidence/authority | Append review reason; keep prior decision | underwriting.review-returned | Reviewer SLA |
| opened | withdraw → withdrawn | Authorized requesting party | Close outstanding intake | underwriting.withdrawn | None |
| referred | withdraw → withdrawn | Allowed under insurer/jurisdiction rules | Retain evidence/history; stop tasks | underwriting.withdrawn | None |

## Policy

Initial: `draft`. States: `active`, `bound`, `cancelled`, `draft`, `expired`, `issued`, `lapsed`, `suspended`.

Terminal: expired.

Pending-payment/UW are issuance workflow states; payment standing is independent. Renewed is a new term/link. Cancellation may be reinstated only by a new authorized revision preserving gaps.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| draft | bind → bound | Accepted quote; valid UW; explicit carrier binding authority; payment or approved credit prerequisite | Record immutable binding evidence and interval | policy.bound | Issue SLA escalation; no blind rebind |
| bound | issue → issued | Verified carrier issue result; unique external issue key | Create policy version and document task | policy.issued | Document/render SLA |
| bound | expire → expired | Bound coverage interval ended even if issue evidence unresolved | Preserve binding and unissued-document exception; expire coverage projection | policy.expired | Escalate outstanding carrier documentation |
| issued | activate → active | Coverage start reached and contract conditions valid | Record activation projection | policy.activated | Expiry timer |
| issued | expire → expired | Term end reached before activation event processed | Preserve issue evidence; expire interval without inventing active history | policy.expired | Sweep missed activation separately |
| active | endorse → active | Approved proposal; version lock; financial journal prerequisite | Append new effective policy revision | policy.endorsed | None |
| active | suspend → suspended | Lawful cause/notice and authority | Append suspension effective interval | policy.suspended | Configured remedy/grace timer |
| active | lapse → lapsed | Arrears/condition and lawful notice/grace fulfilled | Append lapse revision; preserve prior coverage | policy.lapsed | Reinstatement window where allowed |
| suspended | reinstate → active | Condition cured; authority; no forbidden retroactive gap rewrite | Append reinstatement revision and dates | policy.reinstated | Term expiry |
| lapsed | reinstate → active | Product/JUR permits; UW/notice/payment rules met | Append revision with actual gap and financial effect | policy.reinstated | Term expiry |
| active | cancel → cancelled | Legal notice/consent/authority; versioned refund mapping | Append cancellation; create journaled refund obligation if due | policy.cancelled | Refund resolution SLA |
| bound | cancel → cancelled | Carrier confirms cancellation/release; permitted authority | Preserve binding; create refund/release obligation | policy.cancelled | Provider reconciliation SLA |
| issued | cancel → cancelled | Legal authority and notice/consent | Append cancellation and financial effects | policy.cancelled | Refund SLA |
| suspended | cancel → cancelled | Notice/authority conditions met | Append cancellation; settle owed obligations | policy.cancelled | Refund SLA |
| lapsed | cancel → cancelled | Product law permits administrative cancellation | Append decision and notice | policy.cancelled | None |
| cancelled | reinstate → active | Explicit lawful reinstatement within term; new UW/version/authority | Append new revision; preserve cancelled interval | policy.reinstated | Term expiry |
| active | expire → expired | Term end reached | Freeze term; independent renewal may already exist | policy.expired | Durable coverage timer |
| suspended | expire → expired | Term end reached | Retain suspension history | policy.expired | Durable coverage timer |
| lapsed | expire → expired | Term end reached | Retain lapse history | policy.expired | Durable coverage timer |
| cancelled | expire → expired | Original term end reached | Keep cancellation and renewal references | policy.expired | Durable coverage timer |

## Endorsement

Initial: `proposed`. States: `applied`, `pending-approval`, `pending-finance`, `proposed`, `rating`, `rejected`, `underwriting`, `withdrawn`.

Terminal: applied, rejected, withdrawn.

Financial adjustment and underwriting steps can run as separate substates; applied always appends policy revision, never edits prior cover.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| proposed | validate → rating | Allowed change/effective date; current policy version | Snapshot old/new proposed cover/risk | endorsement.validated | Processing SLA |
| rating | refer → underwriting | Change requires risk review | Open linked UW case with pinned inputs | endorsement.referred | UW task SLA |
| rating | calculate → pending-approval | Deterministic premium delta and tax/earning rule | Store additional-premium/refund calculation | endorsement.rated | Approval SLA |
| underwriting | accept → pending-approval | Valid accepted UW decision | Attach decision and rerate final delta | endorsement.cleared | Approval SLA |
| underwriting | decline → rejected | Lawful decision and explanation | Store rejection without changing policy | endorsement.rejected | Notice SLA |
| pending-approval | approve → pending-finance | Required independent approval; unchanged diff/hash | Create journaled charge/refund obligation | endorsement.approved | Collection/refund SLA |
| pending-finance | apply → applied | Payment/credit/refund-obligation condition per contract; policy version lock; carrier confirmation | Append policy revision and journal-linked delta | policy.endorsed | None |
| pending-finance | stalePolicy → proposed | Concurrent policy revision makes proposal stale | Invalidate approval and request new calculation | endorsement.rebased | No automatic financial replay |
| pending-approval | reject → rejected | Approver authorized | Retain proposed evidence and reason | endorsement.rejected | None |
| proposed | withdraw → withdrawn | Owner authorized; no applied change | Retain proposed revision | endorsement.withdrawn | None |

## Claim

Initial: `notified`. States: `approved`, `assessed`, `awaiting-evidence`, `closed`, `investigating`, `notified`, `paid`, `partially-paid`, `pending-approval`, `pending-payment`, `recovering`, `validating`, `withdrawn`.

Terminal: withdrawn.

Claim lifecycle is overall progress; coverage/assessment/fraud/payment/item/recovery dimensions persist independently. Closed may reopen; partial approvals and recoveries are not erased.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| notified | validate → validating | Minimal notice accepted; identity/claimant facts checked without blocking intake | Create coverage-at-loss task | claim.validation-started | Acknowledgment SLA |
| validating | requestEvidence → awaiting-evidence | Required evidence/purpose documented | Create progressive document/witness tasks | claim.evidence-requested | Reminder/escalation; legal notice never silently expires |
| validating | investigate → investigating | Coverage snapshot captured; sufficient initial facts | Assign adjuster/fraud/provider tasks | claim.investigation-started | Assessment SLA |
| awaiting-evidence | receiveEvidence → investigating | Relevant evidence released/verified | Append evidence and coverage revision | claim.evidence-received | Assessment SLA |
| investigating | assess → assessed | Coverage/peril/limits verified; evidence and fraud disposition recorded | Record item assessment and reserve revision | claim.assessed | Decision SLA |
| assessed | proposeDecision → pending-approval | Reason/evidence/authority; shared cover allocation lock | Hash item/payee decisions; reserve payable capacity | claim.decision-proposed | Approval SLA |
| pending-approval | approve → approved | Independent approver where required; hash/version unchanged | Record approved/partial/rejected items and journaled obligations | claim.decision-recorded | Payment SLA for payable items |
| pending-approval | return → investigating | Approver needs evidence or disputes allocation | Release proposed allocations only; retain history | claim.review-returned | Assessment SLA |
| approved | schedulePayment → pending-payment | Payable items and verified payees; current allocation | Create idempotent payout intents; lock in-flight capacity | claim.payment-requested | Provider resolution SLA |
| pending-payment | partialPay → partially-paid | Verified payout; ledger posted; total <= payable | Append payee/item allocation | claim.payment-allocated | Remaining payout SLA |
| partially-paid | scheduleRemainder → pending-payment | Remainder authorized; no overlapping uncertain attempt | Create remainder intent only | claim.payment-requested | Provider resolution SLA |
| pending-payment | finishPay → paid | All approved payable satisfied or lawful documented adjustment; journal proof | Record payment completion | claim.payment-completed | Recovery/closure SLA |
| approved | closeNoPay → closed | All items nonpayable; lawful reason/notice/appeal path | Record closure disposition | claim.closed | Appeal window jurisdiction-configured |
| paid | recover → recovering | Subrogation/salvage/treaty right and authority | Open linked recovery receivable/case | claim.recovery-opened | Recovery SLA; may outlive claim closure |
| paid | close → closed | No unresolved payable; recovery separately tracked | Close with evidence and customer notice | claim.closed | Appeal/reopen window per jurisdiction |
| recovering | close → closed | Approved recovery disposition or independent ongoing recovery case | Keep receivable separate; close claim work | claim.closed | Recovery case timer remains independent |
| closed | reopen → investigating | Authorized new evidence/appeal/reopen basis | Create decision revision; preserve prior paid allocations | claim.reopened | Reopened-case SLA |
| notified | withdraw → withdrawn | Valid claimant request; legal/reporting retention preserved | Close notice without deleting evidence | claim.withdrawn | None |
| investigating | withdraw → withdrawn | Allowed withdrawal; no undisclosed payable/outstanding dispute | Record disposition; preserve recovery/payment references | claim.withdrawn | None |

## Payment

Initial: `created`. States: `authorized`, `cancelled`, `confirmed`, `created`, `failed`, `pending`, `requires-action`, `unknown`.

Terminal: confirmed, failed, cancelled.

Capture intent state only. Refund, chargeback and payout are linked dimensions/aggregates; confirmed cannot regress to failed on old callback.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| created | submit → pending | Validated obligation/amount/currency/provider token; unique attempt | Persist attempt before external call | payment.submitted | Bounded provider call timeout |
| pending | requireAction → requires-action | Verified PSP challenge reference | Expose safe hosted challenge action | payment.action-required | Provider challenge expiry |
| requires-action | completeAction → pending | Provider challenge confirmed | Query/capture under same operation key | payment.action-completed | Provider resolution deadline |
| pending | authorize → authorized | Verified authorization; no capture yet | Store auth ref/expiry | payment.authorized | Capture/void deadline per PSP |
| authorized | capture → pending | Allowed capture amount and obligation lock | Submit stable capture key; retain auth evidence | payment.capture-requested | Provider call timeout |
| pending | timeout → unknown | External write may have succeeded | Preserve intent; enqueue query/statement reconcile | payment.outcome-unknown | Escalate unresolved outcome; never blind debit retry |
| unknown | querySucceeded → confirmed | Verified provider effect and balanced journal committed atomically | Store provider evidence/confirmed allocation | payment.confirmed | None |
| pending | confirm → confirmed | Signature/status proof and unique effect; journal atomic commit | Append capture journal and finalize obligation | payment.confirmed | None |
| unknown | queryFailed → failed | Provider definitively proves no effect | Record reason; release reserved allocation | payment.failed | New payment intent only if permitted |
| pending | fail → failed | Definitive decline/no capture | Record provider reason; release allocation | payment.failed | None |
| created | cancel → cancelled | No external attempt exists | Cancel unpaid intent | payment.cancelled | None |
| authorized | void → cancelled | Provider confirms void; no capture/unknown attempt | Record verified release | payment.cancelled | Void resolution SLA |

## Refund

Initial: `requested`. States: `cancelled`, `confirmed`, `pending-approval`, `rejected`, `requested`, `retryable`, `submitted`, `unknown`.

Terminal: confirmed, rejected, cancelled.

Refund cap includes confirmed plus reserved/in-flight refunds under capture lock; unknown cannot release reservation.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| requested | review → pending-approval | Original capture exists; lawful reason; refundable balance available | Reserve refund amount; bind payee/currency/key | refund.proposed | Approval SLA |
| pending-approval | approve → submitted | Independent approver where required; unchanged hash | Create refund payable journal and persist attempt | refund.submitted | Provider resolution timeout |
| pending-approval | reject → rejected | Authorized approver | Release proposal reservation; retain reason | refund.rejected | None |
| submitted | timeout → unknown | Provider result uncertain | Keep reservation; query/reconcile | refund.outcome-unknown | Reconciliation escalation |
| submitted | confirm → confirmed | Verified refund effect and journal; cap still valid | Post refund disbursement; link capture | refund.confirmed | None |
| unknown | confirm → confirmed | Provider status/statement proves effect | Post once; retain reconciliation evidence | refund.confirmed | None |
| unknown | proveFailure → retryable | Definitive no refund effect; same obligation remains | Keep payable; prepare safe new attempt | refund.retry-authorized | Retry backoff and SLA |
| submitted | proveFailure → retryable | Provider definitively rejects attempt | Record failed attempt; payable not erased | refund.retry-authorized | Retry backoff |
| retryable | resubmit → submitted | Same approved amount/payee; no unresolved attempt | Create stable next attempt per provider semantics | refund.resubmitted | Provider timeout |
| requested | cancel → cancelled | No approval/external effect | Release proposal; retain record | refund.cancelled | None |

## Settlement

Initial: `draft`. States: `approved`, `cancelled`, `completed`, `draft`, `partially-paid`, `paying`, `pending-approval`, `prepared`.

Terminal: completed, cancelled.

Batch state derives from line outcomes. Partial completion cannot repay successful lines; unknown payee/amount change invalidates approval.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| draft | prepare → prepared | Eligible journal-linked obligations; period/currency/book valid | Allocate immutable lines and holds | settlement.prepared | Review SLA |
| prepared | submitApproval → pending-approval | Reconciliation/statement/hash prepared | Create separate approver task | settlement.approval-requested | Approval SLA |
| pending-approval | approve → approved | Different actor; unchanged payee/amount/hash; authority | Bind approval to batch version | settlement.approved | Execution window |
| pending-approval | return → prepared | Approver disputes lines | Append correction/hold; invalidate approval | settlement.returned | Review SLA |
| approved | pay → paying | Funds/line allocations locked; verified accounts | Persist per-line payout attempts | settlement.payment-started | Per-provider resolution deadline |
| paying | someSucceed → partially-paid | Verified line effects and journals; unsettled remainder | Finalize successful lines only | settlement.partially-paid | Reconcile each unresolved line |
| partially-paid | retryRemainder → paying | Definitive failure or same-key safe query; unchanged approved lines | Submit only unpaid permitted attempts | settlement.payment-resumed | Provider timeout |
| paying | finish → completed | All lines terminal paid or documented hold/correction removed to separate batch; reconciled journals | Publish final statement and reconciliation evidence | settlement.completed | None |
| partially-paid | finish → completed | All remaining lines resolved; no unknown payouts | Record completion without duplicating lines | settlement.completed | None |
| prepared | changePayee → prepared | Authorized verified bank-change process | New version/hash; no approval reuse | settlement.revised | Fresh review SLA |
| approved | changePayee → prepared | No in-flight payout on changed lines; verified change | Invalidate approval; reprepare changed lines | settlement.revised | Fresh review SLA |
| draft | cancel → cancelled | No payout/committed approved obligations removed | Release preparation allocation | settlement.cancelled | None |
| prepared | cancel → cancelled | No submitted payouts; cancellation authorized | Release batch holds into originating obligations | settlement.cancelled | None |

## KYC

Initial: `pending`. States: `checking`, `expired`, `pending`, `rejected`, `review-required`, `revoked`, `verified`.

Terminal: rejected, expired, revoked.

Verified status expires or revokes; renewal is a new linked case/version. No outage equals verification success.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| pending | submitCheck → checking | Purpose/legal basis and required evidence | Call scoped KYC/KYB/AML provider; retain attempt | kyc.check-started | Provider deadline |
| checking | needsHuman → review-required | Ambiguous/sanction/document conflict | Assign compliant reviewer and reason | kyc.review-required | Compliance SLA |
| checking | verify → verified | All configured checks passed with provenance | Record validity/assurance and permitted capability | kyc.verified | Evidence/verification expiry timer |
| checking | fail → rejected | Definitive result; required human review completed | Record reason/notice/appeal | kyc.rejected | Appeal deadline |
| checking | unavailable → pending | No definitive outcome | Retain attempt; bounded retry/status query | kyc.check-deferred | Retry/escalation policy |
| review-required | approve → verified | Independent authorized reviewer; evidence adequate | Store human decision/expiry | kyc.verified | Expiry timer |
| review-required | reject → rejected | Authorized reviewer; lawful evidence and explanation | Store rejection and notice | kyc.rejected | Appeal window |
| verified | expire → expired | Validity date reached | Suspend dependent regulated capabilities | kyc.expired | Renewal requires new case |
| verified | revoke → revoked | Verified new risk/sanction/fraud finding; authority | Freeze impacted capabilities and notify | kyc.revoked | Review/notice SLA |

## Vendor Onboarding

Initial: `draft`. States: `active`, `awaiting-documents`, `checking`, `draft`, `pending-approval`, `pending-contract`, `rejected`, `suspended`, `withdrawn`.

Terminal: rejected, withdrawn.

Supports configurable participant types/capabilities; activation requires all applicable checks, not a universal insurer checklist.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| draft | submit → checking | Organization/beneficial-owner/license data consented | Start KYB/license/contract workflow | vendor.onboarding-requested | Onboarding SLA |
| checking | requestDocuments → awaiting-documents | Necessary evidence missing | Create classified document tasks | vendor.documents-requested | Reminder/escalation |
| awaiting-documents | receive → checking | Verified released evidence | Resume checks with provenance | vendor.evidence-received | Check deadline |
| checking | pass → pending-contract | Applicable KYB/KYC/AML/licenses valid | Prepare capability/channel/residency contract | vendor.checks-passed | Contract review SLA |
| checking | fail → rejected | Definitive lawful failure after required review | Record explanation and appeal | vendor.rejected | Appeal deadline |
| pending-contract | sign → pending-approval | Authorized representatives sign correct version | Retain signatures and contract digest | vendor.contract-signed | Approval SLA |
| pending-approval | activate → active | Independent authority; checks/contract/current licenses valid | Grant only contracted capabilities and appointments | vendor.activated | License/contract expiry timers |
| active | suspend → suspended | Expiry/compliance breach or authorized incident | Revoke capabilities; preserve obligations and evidence | vendor.suspended | Review/remedy SLA |
| suspended | reactivate → active | Reverified checks; approved remedial contract | Restore permitted grants; audit reason | vendor.reactivated | Renewal timers |
| draft | withdraw → withdrawn | Applicant authorized | Retain minimal lawful intake history | vendor.withdrawn | None |
| pending-contract | withdraw → withdrawn | No active obligations; authorized applicant | Close onboarding with provenance | vendor.withdrawn | None |

## Complaint

Initial: `received`. States: `acknowledged`, `appealed`, `closed`, `escalated`, `investigating`, `received`, `resolved`.

Terminal: closed.

Closure is conditional on lawful notice and appeal handling. New evidence after closure opens a linked new case rather than erasing disposition.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| received | acknowledge → acknowledged | Minimal complaint and contact available | Send receipt and durable legal deadline | complaint.acknowledged | JUR acknowledgment SLA |
| acknowledged | assign → investigating | Independent eligible handler; conflicts screened | Create evidence/tasks and SLA timer | complaint.investigation-started | Resolution deadline |
| investigating | resolve → resolved | Reasoned evidence and remediation authority | Record outcome, remedy/journal command if financial, notice | complaint.resolved | Appeal window |
| resolved | appeal → appealed | Within applicable right/window or allowed exception | Record appellant reason/evidence | complaint.appealed | Appeal acknowledgment deadline |
| appealed | escalate → escalated | Independent reviewer/regulator route | Create escalation task with case dossier | complaint.escalated | JUR escalation deadline |
| escalated | resolve → resolved | Authorized independent determination | Append new resolution; no overwrite | complaint.resolved | Appeal/closure rule |
| resolved | close → closed | Appeal period/right handled; remedy completed | Retain full history and final notice | complaint.closed | Retention clock |

## Assistance Request

Initial: `requested`. States: `assigned`, `awaiting-confirmation`, `cancelled`, `completed`, `dispatching`, `in-progress`, `requested`, `triaged`.

Terminal: completed, cancelled.

Safety triage can begin before coverage resolution where emergency contract allows; eligibility/accounting remain explicit.

Every unlisted transition or failed guard returns 409 and leaves state/effects unchanged; authorization failures deny before transition.

| From | Command → To | Guard | Side effect | Event | Timeout |
|---|---|---|---|---|---|
| requested | triage → triaged | Location/contact minimal; emergency/purpose consent appropriate | Record safety actions and service capability | assistance.triaged | Emergency-specific response SLA |
| triaged | dispatch → dispatching | Service-area/capability and contract eligibility or approved emergency authority | Send bounded provider offers | assistance.dispatch-started | Provider accept deadline |
| dispatching | accept → assigned | Atomic assignment/capacity lock; eligible provider; offer valid | Award one provider; retract competing offers | assistance.assigned | Arrival SLA |
| assigned | start → in-progress | Verified provider/party status | Publish minimal tracking/status | assistance.started | Completion SLA |
| assigned | noShow → dispatching | Deadline exceeded; no completed service; authority | Cancel prior assignment; release/reassign capacity | assistance.redispatched | New accept deadline |
| in-progress | complete → awaiting-confirmation | Provider completion evidence and safe outcome | Record work/invoice proposal | assistance.completion-proposed | Confirmation/escalation SLA |
| awaiting-confirmation | confirm → completed | Customer/operator verification or contractual evidence; authorized invoice | Create settlement obligation and review eligibility | assistance.completed | Provider invoice/payment SLA independent |
| requested | cancel → cancelled | Requester authorized; no committed service | Record cancellation reason | assistance.cancelled | None |
| dispatching | cancel → cancelled | Emergency-safe cancellation; no performed work | Withdraw offers; record reason | assistance.cancelled | None |
| assigned | cancel → cancelled | Provider notified; lawful incurred fee treatment | Release assignment and journal any fee obligation | assistance.cancelled | Fee/settlement workflow |
