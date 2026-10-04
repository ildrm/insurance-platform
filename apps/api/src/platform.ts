import { Injectable } from "@nestjs/common";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import {
  scoped,
  idempotent,
  one,
} from "../../../packages/runtime/src/database.js";
import {
  requireRole,
  DomainError,
  type Actor,
} from "../../../packages/domain/src/insurance.js";
import { encrypt } from "../../../packages/runtime/src/crypto.js";
import { config } from "../../../packages/runtime/src/config.js";
export function webhookURL(value: string): URL {
  const u = new URL(value),
    allowed = config("WEBHOOK_ALLOWED_HOSTS", "hooks.example.invalid").split(
      ",",
    );
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !allowed.includes(u.hostname)
  )
    throw new DomainError(
      "WEBHOOK_DESTINATION",
      "Use an HTTPS hostname approved by your platform operator.",
      422,
    );
  return u;
}
@Injectable()
export class PlatformService {
  async overview(a: Actor) {
    requireRole(a, "ADMIN");
    return scoped(a, "admin.overview", async (tx) => {
      const counts = (
        await tx.query(
          "SELECT (SELECT count(*) FROM policy.policies)::int policies,(SELECT count(*) FROM claims.claims WHERE status!='PAID')::int claims,(SELECT count(*) FROM quote.quotes WHERE status='REFERRED')::int referrals,(SELECT count(*) FROM platform.operations WHERE status='PENDING')::int pending",
        )
      ).rows[0];
      return {
        ...counts,
        deploymentMode: config("DEPLOYMENT_MODE", "sandbox"),
      };
    });
  }
  async tenants(a: Actor) {
    requireRole(a, "ADMIN");
    return scoped(
      a,
      "tenant.read",
      async (tx) =>
        (
          await tx.query(
            "SELECT id,name,kind FROM tenant.organizations WHERE id=$1",
            [a.tenantId],
          )
        ).rows,
    );
  }
  async audit(a: Actor) {
    requireRole(a, "ADMIN");
    return scoped(
      a,
      "audit.read",
      async (tx) =>
        (
          await tx.query(
            'SELECT id,actor_id AS "actorId",action,resource_id AS "resourceId",created_at AS "createdAt" FROM compliance.audit ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  async products(a: Actor) {
    requireRole(a, "ADMIN", "FINANCE_APPROVER");
    return scoped(
      a,
      "product.admin.list",
      async (tx) =>
        (
          await tx.query(
            'SELECT p.id,p.name,p.category,v.id AS "versionId",v.revision AS version,v.status,v.currency,v.base_premium_minor::text AS "basePremiumMinor",v.created_at AS "createdAt",v.jurisdiction,v.terms,v.rating_rules AS "ratingRules",v.certification_reference AS "certificationReference",v.carrier_adapter_id AS "carrierAdapterId",v.payment_adapter_id AS "paymentAdapterId" FROM product.products p JOIN product.versions v ON p.id=v.product_id WHERE p.tenant_id=$1 ORDER BY v.created_at DESC',
            [a.tenantId],
          )
        ).rows,
    );
  }
  async keys(a: Actor) {
    requireRole(a, "DEVELOPER");
    return scoped(
      a,
      "key.list",
      async (tx) =>
        (
          await tx.query(
            'SELECT id,name,prefix,created_at AS "createdAt",revoked_at AS "revokedAt" FROM integrations.api_keys WHERE owner_id=$1 ORDER BY created_at DESC',
            [a.id],
          )
        ).rows,
    );
  }
  async createKey(a: Actor, body: unknown, key: string | undefined) {
    requireRole(a, "DEVELOPER");
    const input = z
      .object({ name: z.string().min(3).max(100) })
      .strict()
      .parse(body);
    // Response in the idempotency store is encrypted; retries can recover it without plaintext at rest.
    const result = await scoped(a, "key.create", (tx) =>
      idempotent(tx, a, "key.create", key, input, async () => {
        const id = randomUUID(),
          secret = "ipk_" + randomBytes(32).toString("base64url");
        await tx.query(
          "INSERT INTO integrations.api_keys(id,tenant_id,owner_id,name,prefix,secret_hash) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id,
            a.tenantId,
            a.id,
            input.name,
            secret.slice(0, 12),
            createHash("sha256").update(secret).digest("hex"),
          ],
        );
        return { id, encrypted: encrypt(secret) };
      }),
    );
    const { decrypt } = await import("../../../packages/runtime/src/crypto.js");
    return { id: result.id, secret: decrypt(result.encrypted) };
  }
  async revokeKey(a: Actor, id: string) {
    requireRole(a, "DEVELOPER");
    return scoped(a, "key.revoke", async (tx) => {
      await one(
        tx,
        "UPDATE integrations.api_keys SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND owner_id=$2 RETURNING id",
        [id, a.id],
      );
      return { id, status: "REVOKED" };
    });
  }
  async webhooks(a: Actor) {
    requireRole(a, "DEVELOPER");
    return scoped(
      a,
      "webhook.list",
      async (tx) =>
        (
          await tx.query(
            'SELECT id,url,active,created_at AS "createdAt" FROM integrations.webhooks WHERE owner_id=$1',
            [a.id],
          )
        ).rows,
    );
  }
  async createWebhook(a: Actor, body: unknown, key: string | undefined) {
    requireRole(a, "DEVELOPER");
    const input = z
      .object({ url: z.url().max(2000) })
      .strict()
      .parse(body);
    webhookURL(input.url);
    const r = await scoped(a, "webhook.create", (tx) =>
      idempotent(tx, a, "webhook.create", key, input, async () => {
        const id = randomUUID(),
          secret = encrypt(randomBytes(32).toString("hex"));
        await tx.query(
          "INSERT INTO integrations.webhooks(id,tenant_id,owner_id,url,signing_secret) VALUES($1,$2,$3,$4,$5)",
          [id, a.tenantId, a.id, input.url, secret],
        );
        return { id, encrypted: secret, status: "REGISTERED" };
      }),
    );
    const { decrypt } = await import("../../../packages/runtime/src/crypto.js");
    return { id: r.id, status: r.status, signingSecret: decrypt(r.encrypted) };
  }
  async logs(a: Actor) {
    requireRole(a, "DEVELOPER");
    return scoped(
      a,
      "delivery.list",
      async (tx) =>
        (
          await tx.query(
            'SELECT d.id,d.event_id AS "eventId",d.status,d.attempts,d.last_http_status AS "httpStatus",d.next_attempt_at AS "nextAttemptAt" FROM integrations.deliveries d JOIN integrations.webhooks w ON w.id=d.subscription_id WHERE w.owner_id=$1 ORDER BY d.next_attempt_at DESC LIMIT 100',
            [a.id],
          )
        ).rows,
    );
  }
}
