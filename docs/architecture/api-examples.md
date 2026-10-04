# API contract examples

Design examples; complete executable OpenAPI contracts are Foundation deliverables. Audience routes do not replace resource authorization. Tenant/organization scope is resolved from identity and current grants; body tenant fields are rejected.

## Quote acceptance

```http
POST /api/v1/customer/quotes/019.../acceptances
Idempotency-Key: 8d3f...
If-Match: "7"
Content-Type: application/json

{"offer_revision_id":"019...","consent_receipt_id":"019..."}
```

```json
{
  "operation_id": "019...",
  "status": "pending-underwriting",
  "resource_version": "8",
  "status_url": "/api/v1/customer/operations/019..."
}
```

Returns 202 while workflow waits, 201 only for the accepted resource creation where no downstream completion is implied. Repeated identical key yields the same operation under current authorization; changed input gives 409. Firm/unexpired/UW/appointment/Party predicates run server-side. Caller must display asynchronous issuance status separately from quote acceptance.

## Claim decision

```http
POST /api/v1/partner/claims/019.../decision-revisions
If-Match: "14"
Idempotency-Key: d78e...
```

```json
{
  "items": [{"claim_item_id":"019...","decision":"partial-approval","amount_minor":"75000","currency":"USD"}],
  "reason_code": "COVER_LIMIT",
  "evidence_ids": ["019..."],
  "approval_bundle_id": "019..."
}
```

Approval authority, assignment, exact policy-at-loss version, aggregate-limit allocation and separation of duties are owner invariants. Evidence belongs to authorized claim. Amounts are integer strings, never client-computed unverified premiums. No `status: paid` generic PATCH endpoint.

## Machine error

```json
{
  "type": "urn:insurance:error:quote-expired",
  "title": "This offer has expired",
  "status": 409,
  "code": "QUOTE_EXPIRED",
  "detail": "Request a new offer before accepting.",
  "instance": "/api/v1/customer/operations/019...",
  "request_id": "req_opaque",
  "field_errors": [],
  "retryable": false
}
```

## Domain event

```json
{
  "id":"019...",
  "type":"policy.issued",
  "schema_version":1,
  "occurred_at":"2026-10-04T08:00:00Z",
  "recorded_at":"2026-10-04T08:00:01Z",
  "tenant_id":"019...",
  "organization_id":"019...",
  "aggregate_type":"Policy",
  "aggregate_id":"019...",
  "aggregate_version":3,
  "correlation_id":"019...",
  "causation_id":"019...",
  "traceparent":"00-opaque",
  "producer":"policy",
  "classification":"Confidential",
  "payload":{"policy_version_id":"019...","issuance_evidence_id":"019..."}
}
```

Example opaque IDs/trace values are illustrative, not UUID/trace conformance fixtures. Production schema validates actual UUID/time/trace formats. No raw Party/health/card data is in the event. Consumers reauthorize evidence resolution.

## Upload and streaming contracts

`POST /customer/document-uploads` returns a ≤5-minute signed quarantine upload grant after scope/type/size approval. Multipart part finalization checks count, byte digest and actual MIME. Status is quarantined until scanning succeeds; clean download grant ≤60 seconds after fresh authorization. Object key/tenant cannot be caller-selected. Claim creation does not require upload completion.

`GET /customer/operations/{id}/events` uses same-origin SSE, authenticated cookies or short-lived audience-bound credential, operation ownership, per-tenant quotas and a scoped event cursor. Revalidate on reconnect and permission revocation; disconnect revoked clients. SSE payload contains minimal progress, never raw NATS event/evidence. GET/status polling remains accessible fallback.

## Provider uncertainty

An adapter timeout after a write yields `{kind:"unknown-outcome", attempt_id, provider_operation_key}` internally. The API returns pending operation with reconciliation state; it never tells the customer definitively that payment failed unless the provider outcome is known. Status polling, signed callback and statement reconciliation converge on the same effect key. A new card attempt is blocked while the prior debit outcome could still succeed, unless explicit compensating duplicate-refund rules and customer consent are implemented.
