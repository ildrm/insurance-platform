import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { config } from "./config.js";
import {
  DomainError,
  type Actor,
  type Posting,
  assertBalanced,
  fourEyes,
} from "../../domain/src/insurance.js";
export const pool = new Pool({
  connectionString: config("DATABASE_URL"),
  max: 12,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  connectionTimeoutMillis: 10000,
  idle_in_transaction_session_timeout: 120000,
});
export const systemPool = new Pool({
  connectionString: config("WORKER_DATABASE_URL", config("DATABASE_URL")),
  max: 4,
  statement_timeout: 15000,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  idle_in_transaction_session_timeout: 120000,
});
// Idle socket failures must be observed so the pool can replace them after recovery.
for (const [name, source] of [
  ["api", pool],
  ["worker", systemPool],
] as const)
  source.on("error", (error) =>
    console.error(
      JSON.stringify({
        component: "database-pool",
        pool: name,
        error: error.name,
        code: "code" in error ? error.code : undefined,
      }),
    ),
  );
export type Tx = PoolClient;
export async function scoped<T>(
  actor: Actor,
  action: string,
  fn: (tx: Tx) => Promise<T>,
  sourcePool = pool,
): Promise<T> {
  const tx = await sourcePool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query(
      "SELECT set_config('app.tenant_id',$1,true),set_config('app.party_id',$2,true),set_config('app.role',$3,true),set_config('app.audit_resource','',true)",
      [actor.tenantId, actor.partyId, actor.role],
    );
    const value = await fn(tx);
    await tx.query(
      `INSERT INTO compliance.audit(id,tenant_id,actor_id,action,resource_id) VALUES($1,nullif(current_setting('app.tenant_id',true),'')::uuid,$2,$3,nullif(current_setting('app.audit_resource',true),'')::uuid)`,
      [randomUUID(), actor.id, action],
    );
    await tx.query("COMMIT");
    return value;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
export async function one<T extends QueryResultRow>(
  tx: Tx,
  sql: string,
  values: unknown[],
): Promise<T> {
  const result = await tx.query<T>(sql, values);
  if (!result.rows[0])
    throw new DomainError("NOT_FOUND", "Resource not found.", 404);
  return result.rows[0];
}
export async function approveByDifferentPerson(
  tx: Tx,
  proposerId: string,
  actor: Actor,
): Promise<void> {
  const proposer = await one<{ party_id: string }>(
    tx,
    "SELECT party_id FROM identity.users WHERE id=$1 AND tenant_id=$2",
    [proposerId, actor.tenantId],
  );
  fourEyes(proposer.party_id, actor.partyId);
}
export async function journal(
  tx: Tx,
  tenantId: string,
  reference: string,
  currency: string,
  postings: Posting[],
): Promise<void> {
  assertBalanced(postings);
  const id = randomUUID();
  const inserted = await tx.query(
    "INSERT INTO ledger.journals(id,tenant_id,reference,currency) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,reference) DO NOTHING RETURNING id",
    [id, tenantId, reference, currency],
  );
  if (!inserted.rowCount) {
    const saved = await tx.query<{
      account: string;
      side: string;
      amountMinor: string;
      currency: string;
    }>(
      `SELECT p.account,p.side,p.amount_minor::text AS "amountMinor",j.currency FROM ledger.postings p JOIN ledger.journals j ON j.id=p.journal_id WHERE j.tenant_id=$1 AND j.reference=$2`,
      [tenantId, reference],
    );
    const canonical = (
      values: { account: string; side: string; amountMinor: string }[],
    ) =>
      JSON.stringify(
        values
          .map((p) => [p.account, p.side, p.amountMinor])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      );
    if (
      saved.rows.some((p) => p.currency !== currency) ||
      canonical(saved.rows) !== canonical(postings)
    )
      throw new DomainError(
        "JOURNAL_CONFLICT",
        "Journal reference was used with different postings.",
      );
    return;
  }
  for (const p of postings)
    await tx.query(
      "INSERT INTO ledger.postings(id,tenant_id,journal_id,account,side,amount_minor) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), tenantId, id, p.account, p.side, p.amountMinor],
    );
}
export async function event(
  tx: Tx,
  tenantId: string,
  type: string,
  resourceId: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await tx.query(
    "SELECT set_config('app.tenant_id',$1,true),set_config('app.audit_resource',$2,true)",
    [tenantId, resourceId],
  );
  await tx.query(
    "INSERT INTO platform.outbox(id,tenant_id,type,resource_id,payload) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), tenantId, type, resourceId, JSON.stringify(payload)],
  );
}
export async function idempotent<T>(
  tx: Tx,
  actor: Actor,
  route: string,
  key: string | undefined,
  body: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key))
    throw new DomainError(
      "IDEMPOTENCY_REQUIRED",
      "A valid Idempotency-Key is required.",
      422,
    );
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  await tx.query(
    "INSERT INTO platform.idempotency(tenant_id,actor_id,route,key,payload_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    [actor.tenantId, actor.id, route, key, hash],
  );
  const row = await one<{ payload_hash: string; response: T | null }>(
    tx,
    "SELECT payload_hash,response FROM platform.idempotency WHERE tenant_id=$1 AND actor_id=$2 AND route=$3 AND key=$4 FOR UPDATE",
    [actor.tenantId, actor.id, route, key],
  );
  if (row.payload_hash !== hash)
    throw new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "This key was used for a different request.",
    );
  if (row.response !== null) return row.response;
  const response = await fn();
  await tx.query(
    "UPDATE platform.idempotency SET response=$5 WHERE tenant_id=$1 AND actor_id=$2 AND route=$3 AND key=$4",
    [actor.tenantId, actor.id, route, key, JSON.stringify(response)],
  );
  return response;
}
