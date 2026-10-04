# Requirement and acceptance catalogues

- [requirements.csv](requirements.csv): every nonblank source clause, including scope parents, field names, lifecycle stages and each requested review persona. IDs `REQ-section-ordinal` preserve source order and source line; initial source is immutable. They are clause IDs, not inflated counts of independent features.
- [sections.csv](sections.csv): all 98 source sections with accountable owner and blueprint implementation sections.
- [traceability.csv](traceability.csv): one row per clause maps domain, component, API/design-control contract, database owner, workflow, acceptance test and security controls.
- [owners.json](owners.json): accountable owner and interface registry. Cross-cutting platform/design clauses use explicit design-control contracts rather than invented REST endpoints or tables.
- [apis.csv](apis.csv): resource groups, audience routes, methods, permissions and behavioral contracts. Detailed executable OpenAPI generation is Foundation work.
- [events.csv](events.csv): meaningful facts and lifecycle event schema/classification/producer/consumer contract. Actual schema bodies become versioned JSON Schemas in Foundation.
- [tests.csv](tests.csv): planned acceptance suites with concrete failure/invariant cases, not claims of test execution.
- [state-machines.json](state-machines.json): exact transitions/guards/effects/events/timers/terminal/invalid behavior for 12 lifecycles; rendered in [state-machines.md](../state-machines.md).

Rebuild with `rtk proxy python3 docs/architecture/tools/build_catalogues.py`; validate with `rtk proxy python3 docs/architecture/tools/validate.py`. The source-clause inventory preserves even list labels and governance instructions. Normative behavior is reconstructed in the blueprint and lifecycle tables; implementation stories refine clause acceptance into executable tests without deleting source obligations.

## Cross-cutting controls applied beyond the primary owner

| Domain group | Mandatory suites | Controls |
|---|---|---|
| Every protected domain | T-TENANT, T-AUTHZ, T-AUDIT, T-PRIVACY, T-BOUNDARY | Current grants, tenant+resource scope, purpose/classification, immutable audit, owner SQL |
| Quote/UW/policy/claims/providers | T-RACE, T-HISTORY, T-WORKFLOW, T-CONTRACT | Version locks, legal authority, evidence/rule snapshot, durable human tasks and status reconciliation |
| Billing/payments/ledger/commission/settlement | T-LEDGER, T-RACE, T-PAYMENT, T-SETTLEMENT | Exact money, book/currency balance, financial atomic group, effect keys, duty separation, payout caps |
| Integrations/documents/AI/fraud | T-CONTRACT, T-DOC, T-AI, T-SECURITY | Signature, SSRF/egress, quarantine, human-reviewed proposals, provenance |
| All four frontends | T-A11Y, T-I18N, T-E2E, T-PRIVACY | Task journeys, keyboard/screen reader/RTL, no shared private cache, no authoritative domain logic |
| All infrastructure/worker deploys | T-COMPOSE, T-SUPPLY, T-LOAD, T-RESTORE, T-MIGRATION, T-EVENT | Exact pins, graceful stop, capacity, key/state recovery, replay/owned migrations |

Primary traceability is not a claim that only one suite tests a clause or only one bounded context participates. An insurer's quote and claim remain protected by all cross-cutting tenant/privacy rules even when their source section's accountable owner is quote/claims.
