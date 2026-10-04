import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { systemPool } from "../../../packages/runtime/src/database.js";
import { config, production } from "../../../packages/runtime/src/config.js";
if (production) throw new Error("Sandbox provider cannot start in production.");
const secret = Buffer.from(config("PROVIDER_SECRET"));
createServer(async (req, res) => {
  try {
    if (req.url === "/health/ready") {
      await systemPool.query("SELECT 1");
      res.writeHead(200).end("ready");
      return;
    }
    const actual = Buffer.from(
      req.headers.authorization?.replace(/^Bearer /, "") ?? "",
    );
    if (actual.length !== secret.length || !timingSafeEqual(actual, secret)) {
      res.writeHead(401).end();
      return;
    }
    if (req.url === "/test/fault" && req.method === "POST") {
      const parts: Buffer[] = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 4096) {
          res.writeHead(413).end();
          return;
        }
        parts.push(Buffer.from(c));
      }
      const b = JSON.parse(Buffer.concat(parts).toString());
      if (
        !/^[0-9a-f-]{36}$/.test(b.resourceReference) ||
        !["payment", "carrier"].includes(b.effect) ||
        !["LOST_RESPONSE", "DECLINED"].includes(b.mode)
      ) {
        res.writeHead(422).end();
        return;
      }
      await systemPool.query(
        "INSERT INTO integrations.sandbox_faults(resource_reference,effect,mode) VALUES($1,$2,$3) ON CONFLICT(resource_reference,effect) DO UPDATE SET mode=$3,remaining=1",
        [b.resourceReference, b.effect, b.mode],
      );
      res.writeHead(200).end("{}");
      return;
    }
    if (!req.url?.startsWith("/effects/")) {
      res.writeHead(404).end();
      return;
    }
    const key = decodeURIComponent(req.url.slice(9));
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(key)) {
      res.writeHead(400).end();
      return;
    }
    if (req.method === "GET") {
      const r = await systemPool.query(
        "SELECT response FROM integrations.provider_effects WHERE key=$1",
        [key],
      );
      res
        .writeHead(r.rowCount ? 200 : 404, {
          "content-type": "application/json",
        })
        .end(JSON.stringify(r.rows[0]?.response ?? {}));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 16384) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(c);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString()),
      hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    if (!/^\d+$/.test(body.amountMinor) || !/^USD$/.test(body.currency)) {
      res.writeHead(422).end();
      return;
    }
    const tx = await systemPool.connect();
    let lost = false;
    let saved;
    try {
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        key,
      ]);
      saved = (
        await tx.query(
          "SELECT * FROM integrations.provider_effects WHERE key=$1",
          [key],
        )
      ).rows[0];
      if (!saved) {
        const fault = /^[0-9a-f-]{36}$/.test(body.resourceReference)
          ? (
              await tx.query(
                "SELECT * FROM integrations.sandbox_faults WHERE resource_reference=$1 AND effect=$2 AND remaining>0 FOR UPDATE",
                [body.resourceReference, key.split(":")[0]],
              )
            ).rows[0]
          : undefined;
        if (fault)
          await tx.query(
            "UPDATE integrations.sandbox_faults SET remaining=remaining-1 WHERE resource_reference=$1 AND effect=$2",
            [body.resourceReference, key.split(":")[0]],
          );
        const effective = body.requestedEffectiveAt
            ? new Date(body.requestedEffectiveAt)
            : new Date(),
          expires = new Date(effective);
        expires.setUTCFullYear(expires.getUTCFullYear() + 1);
        const period = key.startsWith("carrier:")
          ? {
              effectiveAt: effective.toISOString(),
              expiresAt: expires.toISOString(),
            }
          : {};
        const result = {
          ...period,
          status: fault?.mode === "DECLINED" ? "DECLINED" : "SUCCEEDED",
          reference: "sandbox_" + randomUUID(),
          amountMinor: body.amountMinor,
          currency: body.currency,
          requestHash: hash,
        };
        await tx.query(
          "INSERT INTO integrations.provider_effects(key,payload_hash,response) VALUES($1,$2,$3)",
          [key, hash, JSON.stringify(result)],
        );
        saved = { payload_hash: hash, response: result };
        lost = fault?.mode === "LOST_RESPONSE";
      }
      await tx.query("COMMIT");
    } catch (e) {
      await tx.query("ROLLBACK");
      throw e;
    } finally {
      tx.release();
    }
    if (saved.payload_hash !== hash) {
      res.writeHead(409).end();
      return;
    }
    if (lost) {
      res.destroy();
      return;
    }
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(saved.response));
  } catch {
    res.writeHead(500).end();
  }
}).listen(Number(config("PORT", "3000")), "0.0.0.0");
