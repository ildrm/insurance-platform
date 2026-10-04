import { production } from "../../../packages/runtime/src/config.js";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  scoped,
  approveByDifferentPerson,
  one,
  event,
  idempotent,
  journal,
} from "../../../packages/runtime/src/database.js";
import {
  DomainError,
  requireRole,
  transition,
  claimPayable,
  money,
  type Actor,
  type Coverage,
} from "../../../packages/domain/src/insurance.js";
import { amount, checkVersion, type PolicyRow } from "./products-policies.js";
export interface ClaimRow {
  id: string;
  tenant_id: string;
  party_id: string;
  policy_id: string;
  status: string;
  version: number;
  incident_at: Date;
  description: string;
  requested_minor: string;
  approved_minor: string;
  paid_minor: string;
  currency: string;
  proposed_by: string | null;
  approved_by: string | null;
  reason: string | null;
  coverage_snapshot: Record<string, unknown>;
  created_at: Date;
}
export const claimView = (c: ClaimRow) => ({
  id: c.id,
  policyId: c.policy_id,
  status: c.status,
  version: c.version,
  incidentAt: c.incident_at,
  description: c.description,
  requestedMinor: c.requested_minor,
  approvedMinor: c.approved_minor,
  paidMinor: c.paid_minor,
  currency: c.currency,
  reason: c.reason,
  createdAt: c.created_at,
});
interface SettlementRow {
  id: string;
  tenant_id: string;
  status: string;
  amount_minor: string;
  currency: string;
  proposed_by: string;
  approved_by: string | null;
  version: number;
  created_at: Date;
}
const settlementView = (s: SettlementRow) => ({
  id: s.id,
  status: s.status,
  amountMinor: s.amount_minor,
  currency: s.currency,
  version: s.version,
  createdAt: s.created_at,
});
@Injectable()
export class ClaimsFinance {
  async list(actor: Actor) {
    requireRole(
      actor,
      "CUSTOMER",
      "ADJUSTER",
      "FINANCE",
      "FINANCE_APPROVER",
      "ADMIN",
    );
    return scoped(actor, "claim.list", async (tx) =>
      (
        await tx.query<ClaimRow>(
          "SELECT * FROM claims.claims ORDER BY created_at DESC LIMIT 100",
        )
      ).rows.map(claimView),
    );
  }
  async detail(actor: Actor, id: string) {
    requireRole(
      actor,
      "CUSTOMER",
      "ADJUSTER",
      "FINANCE",
      "FINANCE_APPROVER",
      "ADMIN",
    );
    return scoped(actor, "claim.read", async (tx) => {
      const c = await one<ClaimRow>(
        tx,
        "SELECT * FROM claims.claims WHERE id=$1",
        [id],
      );
      const documents = (
        await tx.query(
          'SELECT id,filename,mime,status,created_at AS "createdAt" FROM claims.documents WHERE claim_id=$1 ORDER BY created_at',
          [id],
        )
      ).rows;
      const decisions = (
        await tx.query(
          'SELECT decision,reason,amount_minor::text AS "amountMinor",created_at AS "createdAt" FROM claims.decisions WHERE claim_id=$1 ORDER BY created_at',
          [id],
        )
      ).rows;
      return { ...claimView(c), documents, decisions };
    });
  }
  async submit(actor: Actor, body: unknown, key: string | undefined) {
    requireRole(actor, "CUSTOMER");
    const input = z
      .object({
        policyId: z.uuid(),
        incidentAt: z.iso.datetime({ offset: true }),
        description: z.string().min(10).max(5000),
        amountMinor: amount,
        coverageCode: z.string().min(1).max(40).optional(),
      })
      .strict()
      .parse(body);
    return scoped(actor, "claim.submit", (tx) =>
      idempotent(tx, actor, "claim.submit", key, input, async () => {
        const p = await one<PolicyRow>(
          tx,
          "SELECT * FROM policy.policies WHERE id=$1",
          [input.policyId],
        );
        const at = new Date(input.incidentAt);
        if (at > new Date() || at < p.effective_at || at >= p.expires_at)
          throw new DomainError(
            "OUTSIDE_COVERAGE",
            "Incident must be within the insured coverage period.",
            422,
          );
        const revision = await one<{ snapshot: Record<string, unknown> }>(
          tx,
          "SELECT snapshot FROM policy.revisions WHERE policy_id=$1 AND effective_at<=$2 ORDER BY revision DESC LIMIT 1",
          [p.id, at],
        );
        const covers = revision.snapshot.coverages as Coverage[];
        const code =
          input.coverageCode ??
          (covers.length === 1 ? covers[0]!.code : undefined);
        if (!code || !covers.some((c) => c.code === code))
          throw new DomainError(
            "COVERAGE_REQUIRED",
            "Select the coverage involved in this incident.",
            422,
          );
        const claimSnapshot = {
          ...revision.snapshot,
          selectedCoverageCode: code,
        };
        const id = randomUUID();
        const c = await one<ClaimRow>(
          tx,
          "INSERT INTO claims.claims(id,tenant_id,party_id,policy_id,status,incident_at,description,requested_minor,currency,coverage_snapshot) VALUES($1,$2,$3,$4,'OPEN',$5,$6,$7,$8,$9) RETURNING *",
          [
            id,
            p.tenant_id,
            actor.partyId,
            p.id,
            at,
            input.description,
            input.amountMinor,
            p.currency,
            JSON.stringify(claimSnapshot),
          ],
        );
        await event(tx, p.tenant_id, "claim.notified", id);
        return claimView(c);
      }),
    );
  }
  async decision(
    actor: Actor,
    id: string,
    body: unknown,
    key: string | undefined,
    expected: string | undefined,
  ) {
    requireRole(actor, "ADJUSTER");
    const input = z
      .object({ amountMinor: amount, reason: z.string().min(5).max(1000) })
      .strict()
      .parse(body);
    return scoped(actor, "claim.propose", (tx) =>
      idempotent(tx, actor, `claim.decision:${id}`, key, input, async () => {
        const c = await one<ClaimRow>(
          tx,
          "SELECT * FROM claims.claims WHERE id=$1 FOR UPDATE",
          [id],
        );
        checkVersion(c.version, expected);
        transition(c.status, ["OPEN"], "PENDING_APPROVAL");
        const cov = (c.coverage_snapshot.coverages as Coverage[]).find(
          (v) => v.code === c.coverage_snapshot.selectedCoverageCode,
        );
        if (!cov)
          throw new DomainError(
            "COVERAGE_MISSING",
            "Historical coverage is unavailable.",
          );
        await tx.query(
          "INSERT INTO claims.allocations(tenant_id,policy_id,coverage_code) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [c.tenant_id, c.policy_id, cov.code],
        );
        const allocation = await one<{ committed_minor: string }>(
          tx,
          "SELECT committed_minor::text FROM claims.allocations WHERE tenant_id=$1 AND policy_id=$2 AND coverage_code=$3 FOR UPDATE",
          [c.tenant_id, c.policy_id, cov.code],
        );
        const maximum = claimPayable(
          c.requested_minor,
          cov.limitMinor,
          cov.deductibleMinor,
          allocation.committed_minor,
        );
        if (money(input.amountMinor) > money(maximum))
          throw new DomainError(
            "COVERAGE_LIMIT",
            "Proposed amount exceeds available cover after deductible/committed claims.",
            422,
          );
        await tx.query(
          "UPDATE claims.allocations SET committed_minor=committed_minor+$3 WHERE tenant_id=$1 AND policy_id=$2 AND coverage_code=$4",
          [c.tenant_id, c.policy_id, input.amountMinor, cov.code],
        );
        const result = await one<ClaimRow>(
          tx,
          "UPDATE claims.claims SET status='PENDING_APPROVAL',approved_minor=$2,proposed_by=$3,reason=$4,version=version+1 WHERE id=$1 RETURNING *",
          [id, input.amountMinor, actor.id, input.reason],
        );
        await tx.query(
          "INSERT INTO claims.decisions(id,tenant_id,party_id,claim_id,actor_id,decision,reason,amount_minor) VALUES($1,$2,$3,$4,$5,'PROPOSE',$6,$7)",
          [
            randomUUID(),
            c.tenant_id,
            c.party_id,
            id,
            actor.id,
            input.reason,
            input.amountMinor,
          ],
        );
        await event(tx, c.tenant_id, "claim.decision-proposed", id);
        return claimView(result);
      }),
    );
  }
  async decline(
    actor: Actor,
    id: string,
    body: unknown,
    key: string | undefined,
    expected: string | undefined,
  ) {
    requireRole(actor, "ADJUSTER");
    const input = z
      .object({ reason: z.string().trim().min(10).max(2000) })
      .strict()
      .parse(body);
    return scoped(actor, "claim.decline-propose", (tx) =>
      idempotent(tx, actor, "claim.decline:" + id, key, input, async () => {
        const c = await one<ClaimRow>(
          tx,
          "SELECT * FROM claims.claims WHERE id=$1 FOR UPDATE",
          [id],
        );
        checkVersion(c.version, expected);
        transition(c.status, ["OPEN"], "PENDING_DECLINE");
        const updated = await one<ClaimRow>(
          tx,
          "UPDATE claims.claims SET status='PENDING_DECLINE',proposed_by=$2,reason=$3,version=version+1 WHERE id=$1 RETURNING *",
          [id, actor.id, input.reason],
        );
        await tx.query(
          "INSERT INTO claims.decisions(id,tenant_id,party_id,claim_id,actor_id,decision,reason,amount_minor) VALUES($1,$2,$3,$4,$5,'DECLINE_PROPOSE',$6,0)",
          [randomUUID(), c.tenant_id, c.party_id, id, actor.id, input.reason],
        );
        await event(tx, c.tenant_id, "claim.decline-proposed", id);
        return claimView(updated);
      }),
    );
  }
  async approve(
    actor: Actor,
    id: string,
    body: unknown,
    key: string | undefined,
    expected: string | undefined,
  ) {
    requireRole(actor, "FINANCE_APPROVER");
    const input = z
      .object({ reason: z.string().min(3).max(1000) })
      .strict()
      .parse(body);
    return scoped(actor, "claim.approve", (tx) =>
      idempotent(tx, actor, `claim.approve:${id}`, key, input, async () => {
        const c = await one<ClaimRow>(
          tx,
          "SELECT * FROM claims.claims WHERE id=$1 FOR UPDATE",
          [id],
        );
        checkVersion(c.version, expected);
        transition(
          c.status,
          ["PENDING_APPROVAL", "PENDING_DECLINE"],
          "APPROVED",
        );
        await approveByDifferentPerson(tx, c.proposed_by!, actor);
        if (c.status === "PENDING_DECLINE") {
          const declined = await one<ClaimRow>(
            tx,
            "UPDATE claims.claims SET status='DECLINED',approved_by=$2,version=version+1 WHERE id=$1 RETURNING *",
            [id, actor.id],
          );
          await tx.query(
            "INSERT INTO claims.decisions(id,tenant_id,party_id,claim_id,actor_id,decision,reason,amount_minor) VALUES($1,$2,$3,$4,$5,'DECLINE_APPROVE',$6,0)",
            [randomUUID(), c.tenant_id, c.party_id, id, actor.id, input.reason],
          );
          await event(tx, c.tenant_id, "claim.declined", id);
          return claimView(declined);
        }
        await journal(tx, c.tenant_id, `claim-obligation:${id}`, c.currency, [
          {
            account: "claim_expense",
            side: "DEBIT",
            amountMinor: c.approved_minor,
          },
          {
            account: "claim_payable",
            side: "CREDIT",
            amountMinor: c.approved_minor,
          },
        ]);
        const r = await one<ClaimRow>(
          tx,
          "UPDATE claims.claims SET status='APPROVED',approved_by=$2,version=version+1 WHERE id=$1 RETURNING *",
          [id, actor.id],
        );
        await tx.query(
          "INSERT INTO claims.decisions(id,tenant_id,party_id,claim_id,actor_id,decision,reason,amount_minor) VALUES($1,$2,$3,$4,$5,'APPROVE',$6,$7)",
          [
            randomUUID(),
            c.tenant_id,
            c.party_id,
            id,
            actor.id,
            input.reason,
            c.approved_minor,
          ],
        );
        await event(tx, c.tenant_id, "claim.approved", id);
        return claimView(r);
      }),
    );
  }
  async payout(actor: Actor, id: string, key: string | undefined) {
    requireRole(actor, "FINANCE");
    return scoped(actor, "claim.payout", (tx) =>
      idempotent(tx, actor, `claim.payout:${id}`, key, {}, async () => {
        const c = await one<ClaimRow>(
          tx,
          "SELECT * FROM claims.claims WHERE id=$1 FOR UPDATE",
          [id],
        );
        transition(c.status, ["APPROVED"], "PAYMENT_PENDING");
        const op = randomUUID();
        await tx.query(
          "UPDATE claims.claims SET status='PAYMENT_PENDING',version=version+1 WHERE id=$1",
          [id],
        );
        await tx.query(
          "INSERT INTO platform.operations(id,tenant_id,party_id,actor_id,kind,resource_id) VALUES($1,$2,$3,$4,'CLAIM_PAYOUT',$5)",
          [op, c.tenant_id, c.party_id, actor.id, id],
        );
        await event(tx, c.tenant_id, "operation.requested", op);
        return { operationId: op, status: "PENDING" };
      }),
    );
  }
  async ledger(actor: Actor) {
    requireRole(actor, "FINANCE", "FINANCE_APPROVER", "ADMIN");
    return scoped(actor, "ledger.read", async (tx) => {
      const entries = (
        await tx.query(
          "SELECT j.id,j.reference,j.currency,j.created_at AS \"createdAt\",json_agg(json_build_object('account',p.account,'side',p.side,'amountMinor',p.amount_minor::text)) postings FROM ledger.journals j JOIN ledger.postings p ON p.journal_id=j.id GROUP BY j.id ORDER BY j.created_at DESC LIMIT 100",
        )
      ).rows;
      const balances = (
        await tx.query(
          "SELECT p.account,j.currency,sum(CASE WHEN p.side='DEBIT' THEN p.amount_minor ELSE -p.amount_minor END)::text AS \"balanceMinor\" FROM ledger.postings p JOIN ledger.journals j ON j.id=p.journal_id GROUP BY p.account,j.currency ORDER BY p.account",
        )
      ).rows;
      return { entries, balances };
    });
  }
  async settlements(actor: Actor) {
    requireRole(actor, "FINANCE", "FINANCE_APPROVER", "ADMIN");
    return scoped(actor, "settlement.list", async (tx) =>
      (
        await tx.query<SettlementRow>(
          "SELECT * FROM settlement.batches ORDER BY created_at DESC LIMIT 100",
        )
      ).rows.map(settlementView),
    );
  }
  async prepareSettlement(
    actor: Actor,
    body: unknown,
    key: string | undefined,
  ) {
    requireRole(actor, "FINANCE");
    const input = z
      .object({
        reason: z.string().min(3).max(500),
        paymentAdapterId: z.uuid().optional(),
      })
      .strict()
      .parse(body);
    return scoped(actor, "settlement.prepare", (tx) =>
      idempotent(tx, actor, "settlement.prepare", key, input, async () => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `settlement:${actor.tenantId}`,
        ]);
        const unpaid = await tx.query(
          "SELECT id FROM settlement.batches WHERE status!='PAID'",
        );
        if (unpaid.rowCount)
          throw new DomainError(
            "SETTLEMENT_EXISTS",
            "Resolve the existing settlement before preparing another.",
          );
        const balance = (
          await tx.query<{ amount: string; currency: string }>(
            "SELECT j.currency,sum(CASE p.side WHEN 'CREDIT' THEN p.amount_minor ELSE -p.amount_minor END)::text amount FROM ledger.postings p JOIN ledger.journals j ON p.journal_id=j.id WHERE p.account='insurer_payable' GROUP BY j.currency HAVING sum(CASE p.side WHEN 'CREDIT' THEN p.amount_minor ELSE -p.amount_minor END)>0 ORDER BY j.currency LIMIT 1",
          )
        ).rows[0];
        if (!balance)
          throw new DomainError(
            "NO_SETTLEMENT_BALANCE",
            "No insurer payable is ready for settlement.",
          );
        let adapter = input.paymentAdapterId;
        if (adapter)
          await one(
            tx,
            "SELECT id FROM integrations.providers WHERE id=$1 AND kind='PAYMENT' AND status='APPROVED'",
            [adapter],
          );
        if (production && !adapter) {
          const providers = (
            await tx.query<{ id: string }>(
              "SELECT id FROM integrations.providers WHERE kind='PAYMENT' AND status='APPROVED'",
            )
          ).rows;
          if (providers.length !== 1)
            throw new DomainError(
              "PAYMENT_ADAPTER_REQUIRED",
              "Select an approved payment adapter for this settlement.",
              422,
            );
          adapter = providers[0]!.id;
        }
        const r = await one<SettlementRow>(
          tx,
          "INSERT INTO settlement.batches(id,tenant_id,status,amount_minor,currency,proposed_by,reason,payment_adapter_id) VALUES($1,$2,'PREPARED',$3,$4,$5,$6,$7) RETURNING *",
          [
            randomUUID(),
            actor.tenantId,
            balance.amount,
            balance.currency,
            actor.id,
            input.reason,
            adapter ?? null,
          ],
        );
        await event(tx, actor.tenantId, "settlement.prepared", r.id);
        return settlementView(r);
      }),
    );
  }
  async approveSettlement(actor: Actor, id: string, key: string | undefined) {
    requireRole(actor, "FINANCE_APPROVER");
    return scoped(actor, "settlement.approve", (tx) =>
      idempotent(tx, actor, `settlement.approve:${id}`, key, {}, async () => {
        const s = await one<SettlementRow>(
          tx,
          "SELECT * FROM settlement.batches WHERE id=$1 FOR UPDATE",
          [id],
        );
        transition(s.status, ["PREPARED"], "APPROVED");
        await approveByDifferentPerson(tx, s.proposed_by, actor);
        const r = await one<SettlementRow>(
          tx,
          "UPDATE settlement.batches SET status='APPROVED',approved_by=$2,version=version+1 WHERE id=$1 RETURNING *",
          [id, actor.id],
        );
        await event(tx, actor.tenantId, "settlement.approved", id);
        return settlementView(r);
      }),
    );
  }
  async paySettlement(actor: Actor, id: string, key: string | undefined) {
    requireRole(actor, "FINANCE");
    return scoped(actor, "settlement.payout", (tx) =>
      idempotent(tx, actor, `settlement.payout:${id}`, key, {}, async () => {
        const s = await one<SettlementRow>(
          tx,
          "SELECT * FROM settlement.batches WHERE id=$1 FOR UPDATE",
          [id],
        );
        transition(s.status, ["APPROVED"], "PAYMENT_PENDING");
        const op = randomUUID();
        await tx.query(
          "UPDATE settlement.batches SET status='PAYMENT_PENDING',version=version+1 WHERE id=$1",
          [id],
        );
        await tx.query(
          "INSERT INTO platform.operations(id,tenant_id,party_id,actor_id,kind,resource_id) VALUES($1,$2,$3,$4,'SETTLEMENT_PAYOUT',$5)",
          [op, actor.tenantId, actor.partyId, actor.id, id],
        );
        await event(tx, actor.tenantId, "operation.requested", op);
        return { operationId: op, status: "PENDING" };
      }),
    );
  }
}
