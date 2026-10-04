import { requestPublic } from "../../../packages/runtime/src/network.js";
import { createConnection } from "node:net";
import { createHmac, createHash } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { storage, bucket } from "../../../packages/runtime/src/storage.js";
import {
  systemPool,
  scoped,
  one,
  event,
} from "../../../packages/runtime/src/database.js";
import {
  config,
  production,
  validateEnvironment,
} from "../../../packages/runtime/src/config.js";
import { health } from "../../../packages/runtime/src/health.js";
import { webhookURL } from "../../api/src/platform.js";
import { decrypt } from "../../../packages/runtime/src/crypto.js";
import { checkScanner } from "../../../packages/runtime/src/scanner.js";
import type { Actor } from "../../../packages/domain/src/insurance.js";
validateEnvironment();
const systemActor = (
  tenantId: string,
  partyId = "00000000-0000-4000-8000-000000000000",
): Actor => ({
  id: "00000000-0000-4000-8000-000000000000",
  tenantId,
  partyId,
  role: "ADMIN",
  name: "Integration worker",
  email: "system@internal",
});
async function scan(bytes: Buffer): Promise<boolean> {
  await scannerReady();
  return new Promise((resolve, reject) => {
    const socket = createConnection({
        host: config("CLAMAV_HOST", "clamav"),
        port: 3310,
      }),
      chunks: Buffer[] = [];
    socket.setTimeout(45000);
    socket.on("timeout", () => socket.destroy(new Error("Scanner timeout")));
    socket.on("error", reject);
    socket.on("data", (d) => chunks.push(Buffer.from(d)));
    socket.on("end", () => {
      const result = Buffer.concat(chunks).toString();
      if (result.includes("FOUND")) resolve(false);
      else if (result.includes("stream: OK")) resolve(true);
      else reject(new Error("Scan failed"));
    });
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let at = 0; at < bytes.length; at += 65536) {
        const part = bytes.subarray(at, at + 65536),
          length = Buffer.alloc(4);
        length.writeUInt32BE(part.length);
        socket.write(length);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
function scannerReady(): Promise<void> {
  return checkScanner({
    host: config("CLAMAV_HOST", "clamav"),
    ...(production
      ? { maxAgeHours: Number(config("CLAMAV_MAX_SIGNATURE_AGE_HOURS", "72")) }
      : {}),
  });
}
async function deliver(
  url: string,
  payload: unknown,
  secret: string,
  eventId: string,
): Promise<number> {
  const u = webhookURL(url),
    body = JSON.stringify(payload),
    timestamp = Math.floor(Date.now() / 1000).toString(),
    signature = createHmac("sha256", secret)
      .update(timestamp + "." + body)
      .digest("hex");
  const response = await requestPublic(
    u,
    "POST",
    {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
      "X-Insurance-Event-ID": eventId,
      "X-Insurance-Timestamp": timestamp,
      "X-Insurance-Signature": "v1=" + signature,
    },
    body,
    10000,
  );
  return response.status;
}

let stopping = false,
  lastSuccess = Date.now();
const healthServer = health(async () => {
  await Promise.all([
    systemPool.query("SELECT 1"),
    scannerReady(),
    storage.send(new HeadBucketCommand({ Bucket: bucket }), {
      abortSignal: AbortSignal.timeout(1500),
    }),
  ]);
  if (Date.now() - lastSuccess > 120000)
    throw new Error("integrations unavailable");
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    healthServer.close();
  });
while (!stopping) {
  try {
    for (const d of (
      await systemPool.query<{
        id: string;
        tenant_id: string;
        party_id: string;
      }>("SELECT * FROM platform.pending_documents()")
    ).rows) {
      try {
        await scoped(
          systemActor(d.tenant_id, d.party_id),
          "document.scan",
          async (tx) => {
            const row = await one<{
              status: string;
              object_key: string;
              sha256: string;
              mime: string;
              object_version: string | null;
            }>(
              tx,
              "SELECT * FROM claims.documents WHERE id=$1 FOR UPDATE SKIP LOCKED",
              [d.id],
            );
            if (row.status !== "QUARANTINED") return;
            const object = await storage.send(
              new GetObjectCommand({
                Bucket: bucket,
                Key: row.object_key,
                ...(row.object_version
                  ? { VersionId: row.object_version }
                  : {}),
              }),
            );
            if (!object.Body || (object.ContentLength ?? 0) > 10 * 1024 * 1024)
              throw new Error("Missing or oversized quarantined document");
            const bytes = Buffer.from(await object.Body.transformToByteArray());
            if (createHash("sha256").update(bytes).digest("hex") !== row.sha256)
              throw new Error("Document hash mismatch");
            const clean = await scan(bytes);
            let objectKey = row.object_key,
              objectVersion = row.object_version;
            if (clean) {
              objectKey = row.object_key.replace(/^quarantine\//, "clean/");
              const saved = await storage.send(
                new PutObjectCommand({
                  Bucket: bucket,
                  Key: objectKey,
                  Body: bytes,
                  ContentType: row.mime,
                  Metadata: { sha256: row.sha256 },
                }),
              );
              objectVersion = saved.VersionId ?? null;
            }
            await tx.query(
              "UPDATE claims.documents SET status=$2,object_key=$3,object_version=$4 WHERE id=$1",
              [d.id, clean ? "CLEAN" : "REJECTED", objectKey, objectVersion],
            );
            await event(
              tx,
              d.tenant_id,
              clean ? "document.clean" : "document.rejected",
              d.id,
            );
          },
          systemPool,
        );
      } catch (e) {
        console.error(
          JSON.stringify({
            component: "scanner",
            documentId: d.id,
            error: e instanceof Error ? e.name : "unknown",
          }),
        );
      }
      lastSuccess = Date.now();
    }
    lastSuccess = Date.now();
    for (const t of (
      await systemPool.query<{ id: string }>(
        "SELECT * FROM platform.delivery_tenants()",
      )
    ).rows) {
      await scoped(
        systemActor(t.id),
        "webhook.dispatch",
        async (tx) => {
          const deliveries = (
            await tx.query<{
              id: string;
              event_id: string;
              payload: unknown;
              attempts: number;
              url: string;
              signing_secret: string;
            }>(
              "SELECT d.*,w.url,w.signing_secret FROM integrations.deliveries d JOIN integrations.webhooks w ON w.id=d.subscription_id WHERE d.status='PENDING' AND d.next_attempt_at<=now() AND w.active=true ORDER BY d.next_attempt_at LIMIT 10 FOR UPDATE OF d SKIP LOCKED",
            )
          ).rows;
          for (const d of deliveries) {
            let status = 0;
            try {
              status = await deliver(
                d.url,
                d.payload,
                decrypt(d.signing_secret),
                d.event_id,
              );
            } catch {}
            const ok = status >= 200 && status < 300,
              attempts = d.attempts + 1;
            await tx.query(
              "UPDATE integrations.deliveries SET attempts=$2,last_http_status=$3,status=$4,next_attempt_at=now()+$5*interval '1 second' WHERE id=$1",
              [
                d.id,
                attempts,
                status || null,
                ok ? "DELIVERED" : attempts >= 10 ? "DEAD" : "PENDING",
                Math.min(3600, 2 ** attempts),
              ],
            );
          }
        },
        systemPool,
      );
    }
    lastSuccess = Date.now();
  } catch (e) {
    console.error(
      JSON.stringify({
        component: "integrations",
        error: e instanceof Error ? e.name : "unknown",
      }),
    );
  }
  await new Promise((r) => setTimeout(r, 1000));
}
await systemPool.end();
storage.destroy();
