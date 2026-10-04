import { notify } from "../../../packages/runtime/src/notifications.js";
import { temporalOptions } from "../../../packages/runtime/src/temporal.js";
import { connect, JSONCodec, StorageType } from "nats";
import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import { randomUUID } from "node:crypto";
import {
  systemPool,
  scoped,
  event,
} from "../../../packages/runtime/src/database.js";
import {
  config,
  validateEnvironment,
} from "../../../packages/runtime/src/config.js";
import { health } from "../../../packages/runtime/src/health.js";
import type { Actor } from "../../../packages/domain/src/insurance.js";
validateEnvironment();
const nc = await connect({
  servers: config("NATS_URL", "nats://nats:4222"),
  token: config("NATS_TOKEN"),
});
const js = nc.jetstream(),
  manager = await nc.jetstreamManager();
try {
  await manager.streams.info("INSURANCE");
} catch {
  await manager.streams.add({
    name: "INSURANCE",
    subjects: ["insurance.>"],
    storage: StorageType.File,
    duplicate_window: 120000000000,
  });
}
const temporal = new Client({
  connection: await Connection.connect(temporalOptions()),
  namespace: config("TEMPORAL_NAMESPACE", "default"),
});
const codec = JSONCodec();
let stopping = false,
  lastSuccess = Date.now(),
  lastOutboxSuccess = Date.now();
const healthServer = health(async () => {
  await systemPool.query("SELECT 1");
  await nc.flush();
  if (
    nc.isClosed() ||
    Date.now() - lastSuccess > 60000 ||
    Date.now() - lastOutboxSuccess > 60000
  )
    throw new Error("dispatcher unavailable");
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    healthServer.close();
  });
while (!stopping) {
  try {
    const tx = await systemPool.connect();
    try {
      await tx.query("BEGIN");
      const rows = (
        await tx.query<{
          id: string;
          tenant_id: string;
          type: string;
          resource_id: string;
          created_at: Date;
        }>(
          "SELECT * FROM platform.outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 30 FOR UPDATE SKIP LOCKED",
        )
      ).rows;
      for (const e of rows) {
        const payload = {
          id: e.id,
          type: e.type,
          resourceId: e.resource_id,
          occurredAt: e.created_at,
        };
        await js.publish("insurance." + e.type, codec.encode(payload), {
          msgID: e.id,
        });
        // Inbox + durable delivery intents are committed atomically. Events contain references, never raw claim data.
        const inserted = await tx.query(
          "INSERT INTO platform.inbox(consumer,event_id) VALUES('webhooks',$1) ON CONFLICT DO NOTHING RETURNING event_id",
          [e.id],
        );
        if (inserted.rowCount) {
          await tx.query(
            "SELECT set_config('app.tenant_id',$1,true),set_config('app.role','ADMIN',true)",
            [e.tenant_id],
          );
          const hooks = (
            await tx.query<{ id: string }>(
              "SELECT id FROM integrations.webhooks WHERE active=true",
            )
          ).rows;
          for (const h of hooks)
            await tx.query(
              "INSERT INTO integrations.deliveries(id,tenant_id,subscription_id,event_id,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
              [randomUUID(), e.tenant_id, h.id, e.id, JSON.stringify(payload)],
            );
        }
        await notify(tx, e);
        await tx.query(
          "UPDATE platform.outbox SET published_at=now() WHERE id=$1",
          [e.id],
        );
      }
      await tx.query("COMMIT");
      lastOutboxSuccess = Date.now();
    } catch (e) {
      await tx.query("ROLLBACK");
      throw e;
    } finally {
      tx.release();
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        component: "outbox",
        code:
          e && typeof e === "object" && "code" in e
            ? String(e.code)
            : undefined,
        error: e instanceof Error ? e.name : "unknown",
      }),
    );
  }
  try {
    for (const op of (
      await systemPool.query<{ id: string }>(
        "SELECT * FROM platform.pending_operations()",
      )
    ).rows) {
      try {
        await temporal.workflow.start("insuranceOperation", {
          taskQueue: "insurance",
          workflowId: "insurance-" + op.id,
          args: [op.id],
        });
      } catch (e) {
        if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
      }
      await systemPool.query("SELECT platform.mark_workflow_started($1)", [
        op.id,
      ]);
    }
    for (const tenant of (
      await systemPool.query<{ id: string }>(
        "SELECT * FROM platform.lifecycle_tenants()",
      )
    ).rows) {
      const actor: Actor = {
        id: "00000000-0000-4000-8000-000000000000",
        tenantId: tenant.id,
        partyId: "00000000-0000-4000-8000-000000000000",
        role: "ADMIN",
        name: "Lifecycle worker",
        email: "system@internal",
      };
      await scoped(
        actor,
        "policy.lifecycle",
        async (tx) => {
          const changed = (
            await tx.query<{ id: string; status: string }>(
              "UPDATE policy.policies SET status=CASE WHEN expires_at<=now() THEN 'EXPIRED' ELSE 'ACTIVE' END,version=version+1 WHERE (status='ISSUED' AND effective_at<=now()) OR (status IN('ACTIVE','CANCELLATION_REQUESTED') AND expires_at<=now()) RETURNING id,status",
            )
          ).rows;
          for (const p of changed)
            await event(
              tx,
              tenant.id,
              "policy." + p.status.toLowerCase(),
              p.id,
            );
        },
        systemPool,
      );
    }
    for (const tenant of (
      await systemPool.query<{ id: string }>(
        "SELECT * FROM platform.complaint_tenants()",
      )
    ).rows) {
      const actor: Actor = {
        id: "00000000-0000-4000-8000-000000000000",
        tenantId: tenant.id,
        partyId: "00000000-0000-4000-8000-000000000000",
        role: "ADMIN",
        name: "Service target worker",
        email: "system@internal",
      };
      await scoped(
        actor,
        "complaint.service-target",
        async (tx) => {
          const cases = (
            await tx.query<{ id: string }>(
              "UPDATE service.complaints SET overdue_notified_at=now() WHERE due_at<=now() AND overdue_notified_at IS NULL AND status NOT IN('RESOLVED','CLOSED') RETURNING id",
            )
          ).rows;
          for (const c of cases)
            await event(tx, tenant.id, "complaint.sla-breached", c.id);
        },
        systemPool,
      );
    }
    lastSuccess = Date.now();
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        component: "dispatcher",
        error: e instanceof Error ? e.name : "unknown",
      }),
    );
  }
  await new Promise((r) => setTimeout(r, 1000));
}
await nc.drain();
await temporal.connection.close();
await systemPool.end();
