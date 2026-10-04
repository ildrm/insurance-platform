import { Injectable } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { config } from "../../../packages/runtime/src/config.js";
import {
  scoped,
  approveByDifferentPerson,
  idempotent,
  one,
  event,
} from "../../../packages/runtime/src/database.js";
import {
  DomainError,
  requireRole,
  type Actor,
} from "../../../packages/domain/src/insurance.js";
import { encrypt } from "../../../packages/runtime/src/crypto.js";
export function adapterURL(endpoint: string) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443") ||
    !config("PROVIDER_ALLOWED_HOSTS", "adapter.example.invalid")
      .split(",")
      .includes(url.hostname)
  )
    throw new DomainError(
      "ADAPTER_DESTINATION",
      "Use an operator-approved HTTPS provider endpoint.",
      422,
    );
  return url;
}
@Injectable()
export class Adapters {
  async list(a: Actor) {
    requireRole(a, "ADMIN", "FINANCE_APPROVER");
    return scoped(
      a,
      "adapter.list",
      async (tx) =>
        (
          await tx.query(
            'SELECT id,kind,name,version,endpoint,status,certification_reference AS "certificationReference" FROM integrations.providers ORDER BY created_at DESC',
          )
        ).rows,
    );
  }
  async draft(a: Actor, body: unknown, key: string | undefined) {
    requireRole(a, "ADMIN");
    const b = z
      .object({
        kind: z.enum(["CARRIER", "PAYMENT"]),
        name: z.string().min(3).max(100),
        version: z.string().min(1).max(60),
        endpoint: z.url().max(2000),
        credential: z.string().min(16).max(4096),
        certificationReference: z.string().min(10).max(500),
      })
      .strict()
      .parse(body);
    adapterURL(b.endpoint);
    const encrypted = encrypt(b.credential);
    return scoped(a, "adapter.draft", (tx) =>
      idempotent(
        tx,
        a,
        "adapter.draft",
        key,
        {
          ...b,
          credential: createHash("sha256").update(b.credential).digest("hex"),
        },
        async () => {
          const id = randomUUID();
          await tx.query(
            "INSERT INTO integrations.providers(id,tenant_id,kind,name,version,endpoint,encrypted_credential,certification_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [
              id,
              a.tenantId,
              b.kind,
              b.name,
              b.version,
              b.endpoint.replace(/\/$/, ""),
              encrypted,
              b.certificationReference,
              a.id,
            ],
          );
          await event(tx, a.tenantId, "adapter.drafted", id);
          return { id, status: "DRAFT" };
        },
      ),
    );
  }
  async approve(a: Actor, id: string, key: string | undefined) {
    requireRole(a, "FINANCE_APPROVER");
    return scoped(a, "adapter.approve", (tx) =>
      idempotent(tx, a, "adapter.approve:" + id, key, {}, async () => {
        const row = await one<{ created_by: string }>(
          tx,
          "SELECT created_by FROM integrations.providers WHERE id=$1 AND status='DRAFT' FOR UPDATE",
          [id],
        );
        await approveByDifferentPerson(tx, row.created_by, a);
        await tx.query(
          "UPDATE integrations.providers SET status='APPROVED',approved_by=$2 WHERE id=$1",
          [id, a.id],
        );
        await event(tx, a.tenantId, "adapter.approved", id);
        return { id, status: "APPROVED" };
      }),
    );
  }
}
