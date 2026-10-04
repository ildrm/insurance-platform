import { Injectable } from "@nestjs/common";
import {
  ratingRules,
  rateConfigured,
  sandboxRules,
} from "../../../packages/domain/src/rating.js";
import { production } from "../../../packages/runtime/src/config.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  pool,
  scoped,
  approveByDifferentPerson,
  one,
  idempotent,
  event,
} from "../../../packages/runtime/src/database.js";
import {
  type Actor,
  type Coverage,
  DomainError,
  requireRole,
  transition,
} from "../../../packages/domain/src/insurance.js";
export const amount = z.string().regex(/^[1-9]\d{0,17}$/);
const quoteInput = z
  .object({
    productId: z.uuid(),
    age: z.number().int().min(18).max(100),
    assetValueMinor: amount,
    coverageCodes: z
      .array(z.string().min(1).max(40))
      .min(1)
      .max(10)
      .refine(
        (codes) => new Set(codes).size === codes.length,
        "Coverage codes must be unique.",
      ),
  })
  .strict();
interface ProductRow {
  id: string;
  tenant_id: string;
  name: string;
  category: string;
  description: string;
  insurer_name: string;
  version_id: string;
  base_premium_minor: string;
  currency: string;
  coverages: Coverage[];
  jurisdiction: string;
  terms: string;
  rating_rules: unknown;
  certification_reference: string | null;
  carrier_adapter_id: string | null;
  payment_adapter_id: string | null;
}
export interface QuoteRow {
  id: string;
  tenant_id: string;
  party_id: string;
  product_id: string;
  status: string;
  version: number;
  snapshot: Record<string, unknown>;
  total_minor: string;
  currency: string;
  expires_at: Date;
}
export interface PolicyRow {
  id: string;
  tenant_id: string;
  party_id: string;
  number: string;
  status: string;
  version: number;
  snapshot: Record<string, unknown>;
  premium_minor: string;
  currency: string;
  effective_at: Date;
  expires_at: Date;
}
const productSql =
  "SELECT p.*,o.name insurer_name,v.id version_id,v.base_premium_minor::text,v.currency,v.coverages,v.jurisdiction,v.terms,v.rating_rules,v.certification_reference,v.carrier_adapter_id,v.payment_adapter_id FROM product.products p JOIN product.versions v ON v.product_id=p.id JOIN tenant.organizations o ON o.id=p.tenant_id";
export const quoteView = (q: QuoteRow) => ({
  id: q.id,
  status: q.status,
  version: q.version,
  productName: q.snapshot.productName,
  insurerName: q.snapshot.insurerName,
  totalMinor: q.total_minor,
  currency: q.currency,
  breakdown: q.snapshot.breakdown,
  coverages: q.snapshot.coverages,
  terms: q.snapshot.terms,
  answers: q.snapshot.answers,
  productVersionId: q.snapshot.productVersionId,
  jurisdiction: q.snapshot.jurisdiction,
  expiresAt: q.expires_at,
  sandbox: q.snapshot.sandbox === true,
});
export const policyView = (p: PolicyRow) => ({
  id: p.id,
  number: p.number,
  status: p.status,
  version: p.version,
  productName: p.snapshot.productName,
  insurerName: p.snapshot.insurerName,
  premiumMinor: p.premium_minor,
  currency: p.currency,
  effectiveAt: p.effective_at,
  expiresAt: p.expires_at,
  sandbox: p.snapshot.sandbox ?? true,
});
export function checkVersion(
  version: number,
  expected: string | undefined,
): void {
  if (!expected)
    throw new DomainError(
      "VERSION_REQUIRED",
      "If-Match with the current version is required.",
      428,
    );
  if (
    !/^(?:[1-9]\d*|"[1-9]\d*")$/.test(expected) ||
    Number(expected.replaceAll('"', "")) !== version
  )
    throw new DomainError(
      "VERSION_CONFLICT",
      "This record changed. Refresh before continuing.",
      412,
    );
}
@Injectable()
export class ProductsPolicies {
  async products() {
    const r = await pool.query<ProductRow>(
      `${productSql} WHERE v.status='PUBLISHED' AND v.revision=(SELECT max(v2.revision) FROM product.versions v2 WHERE v2.product_id=p.id AND v2.status='PUBLISHED') ORDER BY p.name`,
    );
    return r.rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      insurerName: p.insurer_name,
      versionId: p.version_id,
      basePremiumMinor: p.base_premium_minor,
      currency: p.currency,
      coverages: p.coverages,
      jurisdiction: p.jurisdiction,
      sandbox: p.jurisdiction === "SANDBOX",
    }));
  }
  async quotes(actor: Actor) {
    requireRole(actor, "CUSTOMER", "UNDERWRITER", "ADMIN");
    return scoped(actor, "quote.list", async (tx) =>
      (
        await tx.query<QuoteRow>(
          "SELECT * FROM quote.quotes ORDER BY created_at DESC LIMIT 100",
        )
      ).rows.map(quoteView),
    );
  }
  async quote(actor: Actor, body: unknown, key: string | undefined) {
    requireRole(actor, "CUSTOMER");
    const input = quoteInput.parse(body);
    return scoped(actor, "quote.create", (tx) =>
      idempotent(tx, actor, "quote.create", key, input, async () => {
        const p = await one<ProductRow>(
          tx,
          `${productSql} WHERE p.id=$1 AND v.status='PUBLISHED' ORDER BY v.revision DESC LIMIT 1`,
          [input.productId],
        );
        if (
          production &&
          (p.jurisdiction === "SANDBOX" ||
            !p.rating_rules ||
            !p.certification_reference ||
            !p.carrier_adapter_id ||
            !p.payment_adapter_id)
        )
          throw new DomainError(
            "PRODUCT_NOT_CERTIFIED",
            "An approved live product, rating configuration and certified adapters are required.",
            503,
          );
        const chosen = p.coverages.filter((c) =>
          input.coverageCodes.includes(c.code),
        );
        if (
          chosen.length !== new Set(input.coverageCodes).size ||
          chosen.length === 0
        )
          throw new DomainError(
            "INVALID_COVERAGE",
            "Choose valid product coverages.",
            422,
          );
        const rating = rateConfigured(
            {
              ...input,
              basePremiumMinor: p.base_premium_minor,
              coverages: chosen,
            },
            p.rating_rules ?? sandboxRules,
          ),
          id = randomUUID();
        const snapshot = {
          ...rating,
          answers: input,
          productName: p.name,
          insurerName: p.insurer_name,
          productVersionId: p.version_id,
          carrierAdapterId: p.carrier_adapter_id,
          paymentAdapterId: p.payment_adapter_id,
          certificationReference: p.certification_reference,
          coverages: chosen,
          terms: p.terms,
          jurisdiction: p.jurisdiction,
          sandbox: p.jurisdiction === "SANDBOX",
        };
        const q = await one<QuoteRow>(
          tx,
          "INSERT INTO quote.quotes(id,tenant_id,party_id,product_id,product_version_id,status,snapshot,total_minor,currency,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '24 hours') RETURNING *",
          [
            id,
            p.tenant_id,
            actor.partyId,
            p.id,
            p.version_id,
            rating.referred ? "REFERRED" : "READY",
            JSON.stringify(snapshot),
            rating.totalMinor,
            p.currency,
          ],
        );
        await event(tx, p.tenant_id, "quote.created", id);
        return quoteView(q);
      }),
    );
  }
  async underwriting(actor: Actor) {
    requireRole(actor, "UNDERWRITER", "ADMIN");
    return scoped(actor, "underwriting.list", async (tx) =>
      (
        await tx.query<QuoteRow>(
          "SELECT * FROM quote.quotes WHERE status='REFERRED' ORDER BY created_at LIMIT 100",
        )
      ).rows.map(quoteView),
    );
  }
  async decide(
    actor: Actor,
    id: string,
    body: unknown,
    key: string | undefined,
    version: string | undefined,
  ) {
    requireRole(actor, "UNDERWRITER");
    const input = z
      .object({
        decision: z.enum(["ACCEPT", "DECLINE"]),
        reason: z.string().min(5).max(1000),
      })
      .strict()
      .parse(body);
    return scoped(actor, "underwriting.decide", (tx) =>
      idempotent(tx, actor, `uw:${id}`, key, input, async () => {
        const q = await one<QuoteRow>(
          tx,
          "SELECT * FROM quote.quotes WHERE id=$1 FOR UPDATE",
          [id],
        );
        checkVersion(q.version, version);
        transition(
          q.status,
          ["REFERRED"],
          input.decision === "ACCEPT" ? "READY" : "DECLINED",
        );
        const r = await one<QuoteRow>(
          tx,
          "UPDATE quote.quotes SET status=$2,underwriter_id=$3,underwriting_reason=$4,version=version+1 WHERE id=$1 RETURNING *",
          [
            id,
            input.decision === "ACCEPT" ? "READY" : "DECLINED",
            actor.id,
            input.reason,
          ],
        );
        await event(tx, q.tenant_id, "underwriting.decided", id, {
          decision: input.decision,
        });
        return quoteView(r);
      }),
    );
  }
  async purchase(
    actor: Actor,
    id: string,
    key: string | undefined,
    version: string | undefined,
  ) {
    requireRole(actor, "CUSTOMER");
    return scoped(actor, "policy.purchase", (tx) =>
      idempotent(tx, actor, `purchase:${id}`, key, {}, async () => {
        const q = await one<QuoteRow>(
          tx,
          "SELECT * FROM quote.quotes WHERE id=$1 FOR UPDATE",
          [id],
        );
        checkVersion(q.version, version);
        transition(q.status, ["READY"], "ACCEPTED");
        if (q.snapshot.renewedFrom) {
          await tx.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["renewal:" + q.snapshot.renewedFrom],
          );
          const existing = await tx.query(
            "SELECT id FROM quote.quotes WHERE id<>$1 AND snapshot->>'renewedFrom'=$2 AND status='ACCEPTED'",
            [id, q.snapshot.renewedFrom],
          );
          if (existing.rowCount)
            throw new DomainError(
              "RENEWAL_EXISTS",
              "A renewal is already being issued for this term.",
            );
        }
        if (q.expires_at.getTime() <= Date.now())
          throw new DomainError(
            "QUOTE_EXPIRED",
            "This quote expired. Request a new quote.",
          );
        await tx.query(
          "UPDATE quote.quotes SET status='ACCEPTED',version=version+1 WHERE id=$1",
          [id],
        );
        if (production && q.snapshot.sandbox)
          throw new DomainError(
            "SANDBOX_CONTRACT",
            "Sandbox coverage cannot be purchased in production.",
            403,
          );
        const op = randomUUID();
        await tx.query(
          "INSERT INTO platform.operations(id,tenant_id,party_id,actor_id,kind,resource_id) VALUES($1,$2,$3,$4,'PURCHASE',$5)",
          [op, q.tenant_id, actor.partyId, actor.id, id],
        );
        await event(tx, q.tenant_id, "operation.requested", op);
        return { operationId: op, status: "PENDING" };
      }),
    );
  }
  async operations(actor: Actor, id: string) {
    requireRole(actor, "CUSTOMER", "FINANCE", "FINANCE_APPROVER", "ADMIN");
    return scoped(actor, "operation.read", async (tx) => {
      const r = await one<{
        id: string;
        status: string;
        stage: string;
        policy_id: string | null;
        error_code: string | null;
      }>(tx, "SELECT * FROM platform.operations WHERE id=$1", [id]);
      return {
        operationId: r.id,
        status: r.status,
        stage: r.stage,
        policyId: r.policy_id,
        errorCode: r.error_code,
      };
    });
  }
  async policies(actor: Actor) {
    requireRole(
      actor,
      "CUSTOMER",
      "UNDERWRITER",
      "ADJUSTER",
      "FINANCE",
      "FINANCE_APPROVER",
      "ADMIN",
    );
    return scoped(actor, "policy.list", async (tx) =>
      (
        await tx.query<PolicyRow>(
          "SELECT * FROM policy.policies ORDER BY created_at DESC LIMIT 100",
        )
      ).rows.map(policyView),
    );
  }
  async endorse(
    actor: Actor,
    id: string,
    body: unknown,
    key: string | undefined,
    version: string | undefined,
  ) {
    requireRole(actor, "CUSTOMER");
    const input = z
      .object({
        address: z.string().min(5).max(500),
        reason: z.string().min(3).max(500),
      })
      .strict()
      .parse(body);
    return scoped(actor, "policy.endorse", (tx) =>
      idempotent(tx, actor, `endorse:${id}`, key, input, async () => {
        const p = await one<PolicyRow>(
          tx,
          "SELECT * FROM policy.policies WHERE id=$1 FOR UPDATE",
          [id],
        );
        checkVersion(p.version, version);
        transition(p.status, ["ACTIVE"], "ACTIVE");
        const snapshot = { ...p.snapshot, address: input.address };
        await tx.query(
          "INSERT INTO policy.revisions(id,tenant_id,party_id,policy_id,revision,snapshot,reason,effective_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())",
          [
            randomUUID(),
            p.tenant_id,
            p.party_id,
            p.id,
            p.version + 1,
            JSON.stringify(snapshot),
            input.reason,
          ],
        );
        const result = await one<PolicyRow>(
          tx,
          "UPDATE policy.policies SET snapshot=$2,version=version+1 WHERE id=$1 RETURNING *",
          [id, JSON.stringify(snapshot)],
        );
        await event(tx, p.tenant_id, "policy.endorsed", id);
        return policyView(result);
      }),
    );
  }
  async renew(actor: Actor, id: string, key: string | undefined) {
    requireRole(actor, "CUSTOMER");
    return scoped(actor, "policy.renewal-quote", (tx) =>
      idempotent(tx, actor, `renew:${id}`, key, {}, async () => {
        const p = await one<PolicyRow>(
          tx,
          "SELECT * FROM policy.policies WHERE id=$1 FOR UPDATE",
          [id],
        );
        transition(p.status, ["ACTIVE", "EXPIRED"], "ACTIVE");
        const answers = quoteInput.parse(p.snapshot.answers);
        const product = await one<ProductRow>(
          tx,
          `${productSql} WHERE p.id=$1 AND v.status='PUBLISHED' ORDER BY v.revision DESC LIMIT 1`,
          [answers.productId],
        );
        if (product.currency !== p.currency)
          throw new DomainError(
            "RENEWAL_CURRENCY_REQUIRES_REQUOTE",
            "The product currency changed. Request a new quote with risk values in the new currency.",
            409,
          );
        const chosen = product.coverages.filter((c) =>
          answers.coverageCodes.includes(c.code),
        );
        if (chosen.length !== answers.coverageCodes.length)
          throw new DomainError(
            "RENEWAL_COVERAGE_CHANGED",
            "The new product version removed a selected coverage. Request a new quote with updated coverages.",
            422,
          );
        if (
          production &&
          (product.jurisdiction === "SANDBOX" ||
            !product.rating_rules ||
            !product.certification_reference ||
            !product.carrier_adapter_id ||
            !product.payment_adapter_id)
        )
          throw new DomainError(
            "PRODUCT_NOT_CERTIFIED",
            "Certified renewal rating is required.",
            503,
          );
        const rating = rateConfigured(
          {
            ...answers,
            basePremiumMinor: product.base_premium_minor,
            coverages: chosen,
          },
          product.rating_rules ?? sandboxRules,
        );
        const qid = randomUUID();
        const snapshot = {
          ...rating,
          answers,
          productName: product.name,
          insurerName: product.insurer_name,
          jurisdiction: product.jurisdiction,
          sandbox: product.jurisdiction === "SANDBOX",
          ...(p.snapshot.address ? { address: p.snapshot.address } : {}),
          productVersionId: product.version_id,
          carrierAdapterId: product.carrier_adapter_id,
          paymentAdapterId: product.payment_adapter_id,
          certificationReference: product.certification_reference,
          terms: product.terms,
          coverages: chosen,
          renewedFrom: id,
          renewalEffectiveAt: new Date(
            Math.max(Date.now(), p.expires_at.getTime()),
          ).toISOString(),
        };
        const q = await one<QuoteRow>(
          tx,
          "INSERT INTO quote.quotes(id,tenant_id,party_id,product_id,product_version_id,status,snapshot,total_minor,currency,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '24 hours') RETURNING *",
          [
            qid,
            p.tenant_id,
            p.party_id,
            answers.productId,
            product.version_id,
            rating.referred ? "REFERRED" : "READY",
            JSON.stringify(snapshot),
            rating.totalMinor,
            product.currency,
          ],
        );
        await event(tx, p.tenant_id, "renewal.quoted", qid);
        return quoteView(q);
      }),
    );
  }
  async cancel(
    actor: Actor,
    id: string,
    body: unknown,
    key: string | undefined,
  ) {
    requireRole(actor, "CUSTOMER");
    const input = z
      .object({ reason: z.string().min(5).max(500) })
      .strict()
      .parse(body);
    return scoped(actor, "policy.cancel-request", (tx) =>
      idempotent(tx, actor, `cancel:${id}`, key, input, async () => {
        const p = await one<PolicyRow>(
          tx,
          "SELECT * FROM policy.policies WHERE id=$1 FOR UPDATE",
          [id],
        );
        transition(p.status, ["ACTIVE"], "CANCELLATION_REQUESTED");
        await tx.query(
          "UPDATE policy.policies SET status='CANCELLATION_REQUESTED',version=version+1 WHERE id=$1",
          [id],
        );
        await event(tx, p.tenant_id, "policy.cancellation-requested", id, {
          reason: input.reason,
        });
        return {
          id,
          status: "CANCELLATION_REQUESTED",
          message:
            "Cancellation requires insurer review. Coverage and financial adjustments remain unchanged until confirmed.",
        };
      }),
    );
  }
  async document(actor: Actor, id: string) {
    requireRole(
      actor,
      "CUSTOMER",
      "UNDERWRITER",
      "ADJUSTER",
      "FINANCE_APPROVER",
      "ADMIN",
    );
    return scoped(actor, "policy.document.read", async (tx) => {
      const p = await one<PolicyRow>(
        tx,
        "SELECT * FROM policy.policies WHERE id=$1",
        [id],
      );
      const revisions = (
        await tx.query<{
          revision: number;
          snapshot: Record<string, unknown>;
          effective_at: Date;
        }>(
          "SELECT revision,snapshot,effective_at FROM policy.revisions WHERE policy_id=$1 ORDER BY revision",
          [id],
        )
      ).rows;
      return {
        number: p.number,
        policy: policyView(p),
        contract: p.snapshot,
        revisions,
        disclosure: p.snapshot.sandbox
          ? "SANDBOX ONLY — NOT A LEGALLY BOUND INSURANCE CONTRACT"
          : "Issued contract snapshot",
      };
    });
  }
  async publishDraft(actor: Actor, body: unknown, key: string | undefined) {
    requireRole(actor, "ADMIN");
    const input = z
      .object({
        name: z.string().min(3).max(120),
        category: z.string().min(2).max(50),
        description: z.string().min(10).max(2000),
        currency: z.string().regex(/^[A-Z]{3}$/),
        basePremiumMinor: amount,
        coverages: z
          .array(
            z.object({
              code: z.string().min(1).max(40),
              name: z.string().min(1).max(120),
              limitMinor: amount,
              deductibleMinor: z.string().regex(/^(0|[1-9]\d{0,17})$/),
              premiumMinor: z
                .string()
                .regex(/^\d{1,18}$/)
                .optional(),
            }),
          )
          .min(1)
          .max(10),
        jurisdiction: z.string().min(2).max(20).default("SANDBOX"),
        terms: z.string().min(20).max(50000).optional(),
        ratingRules: ratingRules.optional(),
        certificationReference: z.string().min(10).max(500).optional(),
        carrierAdapterId: z.uuid().optional(),
        paymentAdapterId: z.uuid().optional(),
      })
      .strict()
      .parse(body);
    if (
      new Set(input.coverages.map((c) => c.code)).size !==
        input.coverages.length ||
      input.coverages.some(
        (c) => BigInt(c.deductibleMinor) > BigInt(c.limitMinor),
      )
    )
      throw new DomainError(
        "INVALID_COVERAGE",
        "Coverage codes must be unique and deductibles cannot exceed limits.",
        422,
      );
    return scoped(actor, "product.draft", (tx) =>
      idempotent(tx, actor, "product.draft", key, input, async () => {
        if (
          input.jurisdiction !== "SANDBOX" &&
          (!input.terms ||
            !input.ratingRules ||
            !input.certificationReference ||
            !input.carrierAdapterId ||
            !input.paymentAdapterId)
        )
          throw new DomainError(
            "CERTIFICATION_REQUIRED",
            "Live drafts require explicit terms, effective rating rules, certification reference and both adapters.",
            422,
          );
        if (input.jurisdiction !== "SANDBOX") {
          for (const [adapter, kind] of [
            [input.carrierAdapterId, "CARRIER"],
            [input.paymentAdapterId, "PAYMENT"],
          ])
            await one(
              tx,
              "SELECT id FROM integrations.providers WHERE id=$1 AND kind=$2 AND status='APPROVED'",
              [adapter, kind],
            );
        }
        const id = randomUUID(),
          versionId = randomUUID();
        await tx.query(
          "INSERT INTO product.products(id,tenant_id,name,category,description) VALUES($1,$2,$3,$4,$5)",
          [id, actor.tenantId, input.name, input.category, input.description],
        );
        await tx.query(
          "INSERT INTO product.versions(id,product_id,tenant_id,revision,currency,base_premium_minor,coverages,terms,status,created_by,jurisdiction,rating_rules,certification_reference,carrier_adapter_id,payment_adapter_id) VALUES($1,$2,$3,1,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12,$13)",
          [
            versionId,
            id,
            actor.tenantId,
            input.currency,
            input.basePremiumMinor,
            JSON.stringify(input.coverages),
            input.terms ??
              "Sandbox draft: regulator/carrier approval required before live distribution.",
            actor.id,
            input.jurisdiction,
            JSON.stringify(input.ratingRules ?? sandboxRules),
            input.certificationReference ?? null,
            input.carrierAdapterId ?? null,
            input.paymentAdapterId ?? null,
          ],
        );
        return { id, versionId, status: "DRAFT" };
      }),
    );
  }
  async publish(actor: Actor, id: string, key: string | undefined) {
    requireRole(actor, "FINANCE_APPROVER");
    return scoped(actor, "product.publish", (tx) =>
      idempotent(tx, actor, `product.publish:${id}`, key, {}, async () => {
        const row = await one<{ created_by: string; tenant_id: string }>(
          tx,
          "SELECT * FROM product.versions WHERE id=$1 AND status='DRAFT' AND tenant_id=$2 FOR UPDATE",
          [id, actor.tenantId],
        );
        await approveByDifferentPerson(tx, row.created_by, actor);
        await tx.query(
          "UPDATE product.versions SET status='PUBLISHED',approved_by=$2 WHERE id=$1",
          [id, actor.id],
        );
        await event(tx, row.tenant_id, "product.published", id);
        return { id, status: "PUBLISHED" };
      }),
    );
  }
}
