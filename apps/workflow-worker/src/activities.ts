import { randomUUID } from "node:crypto";
import { provider } from "../../../packages/runtime/src/provider.js";
import {
  systemPool,
  scoped,
  one,
  journal,
  event,
  type Tx,
} from "../../../packages/runtime/src/database.js";
import {
  money,
  type Actor,
  type Posting,
} from "../../../packages/domain/src/insurance.js";
import type { ProviderRequest } from "../../../packages/domain/src/provider.js";
interface Context {
  id: string;
  tenant_id: string;
  party_id: string;
  actor_id: string;
  kind: string;
  resource_id: string;
}
interface Operation extends Context {
  status: string;
  stage: string;
  provider_reference: string | null;
}
interface Quote {
  id: string;
  tenant_id: string;
  party_id: string;
  snapshot: Record<string, unknown>;
  total_minor: string;
  currency: string;
}
const requestFor = (q: Quote): ProviderRequest => ({
  amountMinor: q.total_minor,
  currency: q.currency,
  subjectReference: q.party_id,
  resourceReference: q.id,
  productVersionId: q.snapshot.productVersionId as string,
  risk: q.snapshot.answers,
  ...(q.snapshot.renewalEffectiveAt
    ? { requestedEffectiveAt: q.snapshot.renewalEffectiveAt as string }
    : {}),
});
async function purchase(actor: Actor, id: string) {
  // Every externally confirmed step has a durable checkpoint and its own ledger effect.
  await scoped(
    actor,
    "payment.capture",
    async (tx) => {
      const op = await one<Operation>(
        tx,
        "SELECT * FROM platform.operations WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (op.status !== "PENDING" || op.stage !== "CREATED") return;
      const user = (
        await tx.query("SELECT role,disabled FROM identity.users WHERE id=$1", [
          actor.id,
        ])
      ).rows[0];
      const allowCreate = !!user && !user.disabled && user.role === "CUSTOMER";
      const q = await one<Quote>(
          tx,
          "SELECT * FROM quote.quotes WHERE id=$1 FOR UPDATE",
          [op.resource_id],
        ),
        adapter = await provider(
          tx,
          q.snapshot.paymentAdapterId as string | undefined,
          "PAYMENT",
        );
      const evidence = await adapter.execute(
        "payment:" + id,
        requestFor(q),
        allowCreate,
      );
      if (evidence.status === "DECLINED") {
        await tx.query(
          "UPDATE platform.operations SET status='FAILED',stage='PAYMENT_DECLINED',error_code='PAYMENT_DECLINED',updated_at=now() WHERE id=$1",
          [id],
        );
        await tx.query(
          "UPDATE quote.quotes SET status='DECLINED',version=version+1 WHERE id=$1",
          [q.id],
        );
        await event(tx, q.tenant_id, "payment.declined", id);
        return;
      }
      await journal(tx, q.tenant_id, "capture:" + q.id, q.currency, [
        { account: "psp_clearing", side: "DEBIT", amountMinor: q.total_minor },
        {
          account: "payment_suspense",
          side: "CREDIT",
          amountMinor: q.total_minor,
        },
      ]);
      await tx.query(
        "UPDATE platform.operations SET stage='PAYMENT_CAPTURED',provider_reference=$2,updated_at=now() WHERE id=$1",
        [id, evidence.reference],
      );
      await event(tx, q.tenant_id, "payment.captured", id);
    },
    systemPool,
  );
  await scoped(
    actor,
    "policy.issue",
    async (tx) => {
      const op = await one<Operation>(
        tx,
        "SELECT * FROM platform.operations WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (op.status !== "PENDING" || op.stage !== "PAYMENT_CAPTURED") return;
      const q = await one<Quote>(
          tx,
          "SELECT * FROM quote.quotes WHERE id=$1 FOR UPDATE",
          [op.resource_id],
        ),
        adapter = await provider(
          tx,
          q.snapshot.carrierAdapterId as string | undefined,
          "CARRIER",
        );
      const evidence = await adapter.execute("carrier:" + id, requestFor(q));
      if (evidence.status === "DECLINED") {
        await tx.query(
          "UPDATE platform.operations SET stage='REFUND_REQUIRED',error_code='CARRIER_DECLINED',updated_at=now() WHERE id=$1",
          [id],
        );
        await event(tx, q.tenant_id, "policy.issuance-declined", id);
        return;
      }
      if (!evidence.effectiveAt || !evidence.expiresAt)
        throw new Error("Carrier period evidence required");
      const effective = new Date(evidence.effectiveAt),
        expires = new Date(evidence.expiresAt);
      if (
        effective >= expires ||
        (q.snapshot.renewalEffectiveAt &&
          effective.toISOString() !==
            new Date(q.snapshot.renewalEffectiveAt as string).toISOString())
      )
        throw new Error("Carrier period mismatch");
      const policyId = randomUUID(),
        number = "CL-" + policyId.replaceAll("-", "").toUpperCase();
      await tx.query(
        "INSERT INTO policy.policies(id,tenant_id,party_id,quote_id,number,status,snapshot,premium_minor,currency,effective_at,expires_at,carrier_reference,renewed_from) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [
          policyId,
          q.tenant_id,
          q.party_id,
          q.id,
          number,
          effective > new Date() ? "ISSUED" : "ACTIVE",
          JSON.stringify(q.snapshot),
          q.total_minor,
          q.currency,
          effective,
          expires,
          evidence.reference,
          q.snapshot.renewedFrom ?? null,
        ],
      );
      await tx.query(
        "INSERT INTO policy.revisions(id,tenant_id,party_id,policy_id,revision,snapshot,reason,effective_at) VALUES($1,$2,$3,$4,1,$5,$6,$7)",
        [
          randomUUID(),
          q.tenant_id,
          q.party_id,
          policyId,
          JSON.stringify(q.snapshot),
          "Initial issuance",
          effective,
        ],
      );
      const fee = String(q.snapshot.feeMinor),
        postings: Posting[] = [
          {
            account: "payment_suspense",
            side: "DEBIT",
            amountMinor: q.total_minor,
          },
          {
            account: "insurer_payable",
            side: "CREDIT",
            amountMinor: (money(q.total_minor) - money(fee)).toString(),
          },
        ];
      if (money(fee) > 0n)
        postings.push({
          account: "platform_fee",
          side: "CREDIT",
          amountMinor: fee,
        });
      await journal(tx, q.tenant_id, "issue:" + q.id, q.currency, postings);
      await tx.query(
        "UPDATE platform.operations SET status='COMPLETED',stage='ISSUED',policy_id=$2,updated_at=now() WHERE id=$1",
        [id, policyId],
      );
      await event(tx, q.tenant_id, "policy.issued", policyId, { number });
    },
    systemPool,
  );
  await scoped(
    actor,
    "payment.compensate",
    async (tx) => {
      const op = await one<Operation>(
        tx,
        "SELECT * FROM platform.operations WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (op.status !== "PENDING" || op.stage !== "REFUND_REQUIRED") return;
      const q = await one<Quote>(
          tx,
          "SELECT * FROM quote.quotes WHERE id=$1 FOR UPDATE",
          [op.resource_id],
        ),
        adapter = await provider(
          tx,
          q.snapshot.paymentAdapterId as string | undefined,
          "PAYMENT",
        );
      const evidence = await adapter.execute("refund:" + id, {
        ...requestFor(q),
        resourceReference: op.provider_reference!,
      });
      if (evidence.status !== "SUCCEEDED")
        throw new Error("Refund requires operator reconciliation");
      await journal(tx, q.tenant_id, "refund:" + q.id, q.currency, [
        {
          account: "payment_suspense",
          side: "DEBIT",
          amountMinor: q.total_minor,
        },
        { account: "psp_clearing", side: "CREDIT", amountMinor: q.total_minor },
      ]);
      await tx.query(
        "UPDATE quote.quotes SET status='DECLINED',version=version+1 WHERE id=$1",
        [q.id],
      );
      await tx.query(
        "UPDATE platform.operations SET status='FAILED',stage='REFUNDED',provider_reference=$2,updated_at=now() WHERE id=$1",
        [id, evidence.reference],
      );
      await event(tx, q.tenant_id, "payment.refunded", id);
    },
    systemPool,
  );
}
async function payout(actor: Actor, id: string) {
  await scoped(
    actor,
    "workflow.payout",
    async (tx) => {
      const op = await one<Operation>(
        tx,
        "SELECT * FROM platform.operations WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (op.status !== "PENDING") return;
      const user = (
        await tx.query("SELECT role,disabled FROM identity.users WHERE id=$1", [
          actor.id,
        ])
      ).rows[0];
      const allowCreate = !!user && !user.disabled && user.role === "FINANCE";
      if (op.kind === "CLAIM_PAYOUT") {
        const c = await one<{
            tenant_id: string;
            approved_minor: string;
            currency: string;
            party_id: string;
            coverage_snapshot: Record<string, unknown>;
          }>(tx, "SELECT * FROM claims.claims WHERE id=$1 FOR UPDATE", [
            op.resource_id,
          ]),
          adapter = await provider(
            tx,
            c.coverage_snapshot.paymentAdapterId as string | undefined,
            "PAYMENT",
          );
        const e = await adapter.execute(
          "claim:" + id,
          {
            amountMinor: c.approved_minor,
            currency: c.currency,
            subjectReference: c.party_id,
            resourceReference: op.resource_id,
          },
          allowCreate,
        );
        if (e.status === "DECLINED") {
          await tx.query(
            "UPDATE claims.claims SET status='APPROVED',version=version+1 WHERE id=$1",
            [op.resource_id],
          );
          await failed(tx, op);
          return;
        }
        await journal(
          tx,
          c.tenant_id,
          "claim-payout:" + op.resource_id,
          c.currency,
          [
            {
              account: "claim_payable",
              side: "DEBIT",
              amountMinor: c.approved_minor,
            },
            {
              account: "psp_clearing",
              side: "CREDIT",
              amountMinor: c.approved_minor,
            },
          ],
        );
        await tx.query(
          "UPDATE claims.claims SET status='PAID',paid_minor=approved_minor,version=version+1 WHERE id=$1",
          [op.resource_id],
        );
        await completed(tx, op, e.reference);
        await event(tx, c.tenant_id, "claim.paid", op.resource_id);
      } else if (op.kind === "SETTLEMENT_PAYOUT") {
        const s = await one<{
            tenant_id: string;
            amount_minor: string;
            currency: string;
            payment_adapter_id: string | null;
          }>(tx, "SELECT * FROM settlement.batches WHERE id=$1 FOR UPDATE", [
            op.resource_id,
          ]),
          adapter = await provider(
            tx,
            s.payment_adapter_id ?? undefined,
            "PAYMENT",
          );
        const e = await adapter.execute(
          "settlement:" + id,
          {
            amountMinor: s.amount_minor,
            currency: s.currency,
            subjectReference: s.tenant_id,
            resourceReference: op.resource_id,
          },
          allowCreate,
        );
        if (e.status === "DECLINED") {
          await tx.query(
            "UPDATE settlement.batches SET status='APPROVED',version=version+1 WHERE id=$1",
            [op.resource_id],
          );
          await failed(tx, op);
          return;
        }
        await journal(
          tx,
          s.tenant_id,
          "settlement:" + op.resource_id,
          s.currency,
          [
            {
              account: "insurer_payable",
              side: "DEBIT",
              amountMinor: s.amount_minor,
            },
            {
              account: "psp_clearing",
              side: "CREDIT",
              amountMinor: s.amount_minor,
            },
          ],
        );
        await tx.query(
          "UPDATE settlement.batches SET status='PAID',version=version+1 WHERE id=$1",
          [op.resource_id],
        );
        await completed(tx, op, e.reference);
        await event(tx, s.tenant_id, "settlement.paid", op.resource_id);
      } else throw new Error("Unsupported workflow");
    },
    systemPool,
  );
}
async function failed(tx: Tx, op: Operation) {
  await tx.query(
    "UPDATE platform.operations SET status='FAILED',stage='PAYMENT_DECLINED',error_code='PAYMENT_DECLINED',updated_at=now() WHERE id=$1",
    [op.id],
  );
  await event(tx, op.tenant_id, "payout.declined", op.resource_id);
}
async function completed(tx: Tx, op: Operation, reference: string) {
  await tx.query(
    "UPDATE platform.operations SET status='COMPLETED',stage='PAID',provider_reference=$2,updated_at=now() WHERE id=$1",
    [op.id, reference],
  );
}
export async function processOperation(id: string): Promise<void> {
  const ctx = (
    await systemPool.query<Context>(
      "SELECT * FROM platform.operation_context($1)",
      [id],
    )
  ).rows[0];
  if (!ctx) throw new Error("Operation not found");
  const expected = ctx.kind === "PURCHASE" ? "CUSTOMER" : "FINANCE";
  const actor: Actor = {
    id: ctx.actor_id,
    tenantId: ctx.tenant_id,
    partyId: ctx.party_id,
    role: expected,
    name: "Workflow initiator",
    email: "workflow@internal",
  };
  if (ctx.kind === "PURCHASE") await purchase(actor, id);
  else await payout(actor, id);
}
