import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DomainError,
  requireRole,
  type Actor,
} from "../../../packages/domain/src/insurance.js";
import {
  scoped,
  one,
  idempotent,
  event,
  type Tx,
} from "../../../packages/runtime/src/database.js";
import { config } from "../../../packages/runtime/src/config.js";
import { checkVersion } from "./products-policies.js";

const statuses = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "RESOLVED",
  "ESCALATED",
  "CLOSED",
]);
interface Complaint {
  id: string;
  tenant_id: string;
  party_id: string;
  policy_id: string;
  subject: string;
  description: string;
  status: z.infer<typeof statuses>;
  version: number;
  resolution: string | null;
  due_at: Date;
  created_at: Date;
  updated_at: Date;
}
const view = (c: Complaint) => ({
  id: c.id,
  policyId: c.policy_id,
  subject: c.subject,
  description: c.description,
  status: c.status,
  version: c.version,
  resolution: c.resolution,
  dueAt: c.due_at,
  overdue:
    !["RESOLVED", "CLOSED"].includes(c.status) &&
    c.due_at.getTime() < Date.now(),
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});
function serviceHours() {
  return z.coerce
    .number()
    .int()
    .min(1)
    .max(8760)
    .parse(config("COMPLAINT_SERVICE_HOURS", "72"));
}
async function history(
  tx: Tx,
  c: Complaint,
  actor: Actor,
  reason: string,
  resolution?: string,
) {
  await tx.query(
    "INSERT INTO service.complaint_history(id,tenant_id,party_id,complaint_id,status,actor_id,reason,resolution) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      randomUUID(),
      c.tenant_id,
      c.party_id,
      c.id,
      c.status,
      actor.id,
      reason,
      resolution ?? null,
    ],
  );
}
@Injectable()
export class ServiceCases {
  async list(actor: Actor) {
    requireRole(actor, "CUSTOMER", "ADMIN");
    return scoped(actor, "complaint.list", async (tx) =>
      (
        await tx.query<Complaint>(
          "SELECT * FROM service.complaints ORDER BY created_at DESC LIMIT 100",
        )
      ).rows.map(view),
    );
  }
  async detail(actor: Actor, id: string) {
    requireRole(actor, "CUSTOMER", "ADMIN");
    return scoped(actor, "complaint.read", async (tx) => {
      const c = await one<Complaint>(
        tx,
        "SELECT * FROM service.complaints WHERE id=$1",
        [id],
      );
      const timeline = (
        await tx.query(
          'SELECT status,reason,resolution,created_at AS "createdAt" FROM service.complaint_history WHERE complaint_id=$1 ORDER BY created_at,id',
          [id],
        )
      ).rows;
      return { ...view(c), timeline };
    });
  }
  async create(actor: Actor, body: unknown, key: string | undefined) {
    requireRole(actor, "CUSTOMER");
    const input = z
      .object({
        policyId: z.uuid(),
        subject: z.string().trim().min(5).max(150),
        description: z.string().trim().min(10).max(5000),
      })
      .strict()
      .parse(body);
    return scoped(actor, "complaint.create", (tx) =>
      idempotent(tx, actor, "complaint.create", key, input, async () => {
        const policy = await one<{
          id: string;
          tenant_id: string;
          party_id: string;
        }>(
          tx,
          "SELECT id,tenant_id,party_id FROM policy.policies WHERE id=$1",
          [input.policyId],
        );
        const c = await one<Complaint>(
          tx,
          "INSERT INTO service.complaints(id,tenant_id,party_id,policy_id,subject,description,due_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 hour') RETURNING *",
          [
            randomUUID(),
            policy.tenant_id,
            actor.partyId,
            policy.id,
            input.subject,
            input.description,
            serviceHours(),
          ],
        );
        await history(tx, c, actor, "Complaint submitted");
        await event(tx, c.tenant_id, "complaint.created", c.id);
        return view(c);
      }),
    );
  }
  async transition(
    actor: Actor,
    id: string,
    body: unknown,
    key: string | undefined,
    version: string | undefined,
  ) {
    requireRole(actor, "CUSTOMER", "ADMIN");
    const input = z
      .object({
        status: statuses,
        reason: z.string().trim().min(5).max(2000),
        resolution: z.string().trim().min(10).max(5000).optional(),
      })
      .strict()
      .parse(body);
    return scoped(actor, "complaint.transition", (tx) =>
      idempotent(
        tx,
        actor,
        "complaint.transition:" + id,
        key,
        input,
        async () => {
          const c = await one<Complaint>(
            tx,
            "SELECT * FROM service.complaints WHERE id=$1 FOR UPDATE",
            [id],
          );
          checkVersion(c.version, version);
          const transitions: Partial<
            Record<Complaint["status"], Complaint["status"][]>
          > =
            actor.role === "CUSTOMER"
              ? { RESOLVED: ["ESCALATED", "CLOSED"] }
              : {
                  OPEN: ["ACKNOWLEDGED"],
                  ACKNOWLEDGED: ["INVESTIGATING"],
                  INVESTIGATING: ["RESOLVED"],
                  ESCALATED: ["INVESTIGATING"],
                };
          if (!transitions[c.status]?.includes(input.status))
            throw new DomainError(
              "INVALID_TRANSITION",
              "This complaint action is unavailable for your role and its current state.",
            );
          if (input.status === "RESOLVED" && !input.resolution)
            throw new DomainError(
              "RESOLUTION_REQUIRED",
              "Provide a reviewed resolution.",
              422,
            );
          if (input.resolution && input.status !== "RESOLVED")
            throw new DomainError(
              "INVALID_RESOLUTION",
              "A resolution is supplied only when resolving a complaint.",
              422,
            );
          const updated = await one<Complaint>(
            tx,
            "UPDATE service.complaints SET status=$2,resolution=coalesce($3,resolution),version=version+1,updated_at=now(),due_at=CASE WHEN $2='ESCALATED' THEN now()+$4*interval '1 hour' ELSE due_at END,overdue_notified_at=CASE WHEN $2='ESCALATED' THEN NULL ELSE overdue_notified_at END WHERE id=$1 RETURNING *",
            [id, input.status, input.resolution ?? null, serviceHours()],
          );
          await history(tx, updated, actor, input.reason, input.resolution);
          await event(
            tx,
            c.tenant_id,
            "complaint." + input.status.toLowerCase(),
            id,
          );
          return view(updated);
        },
      ),
    );
  }
  async report(actor: Actor) {
    requireRole(actor, "ADMIN");
    return scoped(actor, "complaint.report", async (tx) => ({
      counts: (
        await tx.query(
          "SELECT status,count(*)::text AS count FROM service.complaints GROUP BY status ORDER BY status",
        )
      ).rows,
      ...(await one<{
        overdueCount: string;
        averageResolutionHours: string | null;
      }>(
        tx,
        "SELECT count(*) FILTER(WHERE status NOT IN('RESOLVED','CLOSED') AND due_at<now())::text AS \"overdueCount\",(SELECT round(avg(extract(epoch FROM (r.resolved_at-c.created_at))/3600),2)::text FROM service.complaints c JOIN (SELECT complaint_id,max(created_at) resolved_at FROM service.complaint_history WHERE status='RESOLVED' GROUP BY complaint_id) r ON r.complaint_id=c.id WHERE c.status IN('RESOLVED','CLOSED')) AS \"averageResolutionHours\" FROM service.complaints",
        [],
      )),
      serviceTargetHours: serviceHours(),
      deadlineType: "OPERATIONAL_SERVICE_TARGET",
    }));
  }
  async notifications(actor: Actor) {
    return scoped(
      actor,
      "notification.list",
      async (tx) =>
        (
          await tx.query(
            'SELECT id,type,resource_id AS "resourceId",message,read_at AS "readAt",created_at AS "createdAt" FROM service.notifications ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  async readNotification(actor: Actor, id: string, key: string | undefined) {
    return scoped(actor, "notification.read", (tx) =>
      idempotent(tx, actor, "notification.read:" + id, key, {}, async () =>
        one(
          tx,
          'UPDATE service.notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 RETURNING id,read_at AS "readAt"',
          [id],
        ),
      ),
    );
  }
}
