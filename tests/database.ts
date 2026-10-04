import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, scoped, journal } from "../packages/runtime/src/database.js";
import type { Actor } from "../packages/domain/src/insurance.js";
const user = (
  await pool.query(
    "SELECT * FROM identity.users WHERE email='finance@example.test'",
  )
).rows[0];
const actor: Actor = {
  id: user.id,
  tenantId: user.tenant_id,
  partyId: user.party_id,
  role: user.role,
  name: user.name,
  email: user.email,
};
const role = (
  await pool.query(
    "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
  )
).rows[0];
assert.equal(role.rolsuper, false);
assert.equal(role.rolbypassrls, false);
assert.equal(
  (await pool.query("SELECT * FROM policy.policies")).rowCount,
  0,
  "Unscoped pool sees no portfolio",
);
const reference = "database-test:" + randomUUID();
await scoped(actor, "test.journal", (tx) =>
  journal(tx, actor.tenantId, reference, "USD", [
    { account: "test_asset", side: "DEBIT", amountMinor: "1" },
    { account: "test_liability", side: "CREDIT", amountMinor: "1" },
  ]),
);
await assert.rejects(() =>
  scoped(actor, "test.immutable", (tx) =>
    tx.query("UPDATE ledger.postings SET amount_minor=amount_minor+1"),
  ),
);
await assert.rejects(() =>
  scoped(actor, "test.audit.immutable", (tx) =>
    tx.query("UPDATE compliance.audit SET action='tampered'"),
  ),
);
await assert.rejects(() =>
  scoped(actor, "test.unbalanced", async (tx) => {
    const id = randomUUID();
    await tx.query(
      "INSERT INTO ledger.journals(id,tenant_id,reference,currency) VALUES($1,$2,$3,$4)",
      [id, actor.tenantId, "unbalanced:" + id, "USD"],
    );
    await tx.query(
      "INSERT INTO ledger.postings(id,tenant_id,journal_id,account,side,amount_minor) VALUES($1,$2,$3,'bad','DEBIT',1)",
      [randomUUID(), actor.tenantId, id],
    );
  }),
);
await assert.rejects(() =>
  scoped(actor, "test.lateposting", async (tx) => {
    const j = (
      await tx.query("SELECT id FROM ledger.journals WHERE reference=$1", [
        reference,
      ])
    ).rows[0];
    for (const side of ["DEBIT", "CREDIT"])
      await tx.query(
        "INSERT INTO ledger.postings(id,tenant_id,journal_id,account,side,amount_minor) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), actor.tenantId, j.id, "tampered", side, "1"],
      );
  }),
);
await assert.rejects(() =>
  scoped(actor, "test.creatoroverride", (tx) =>
    tx.query(
      "INSERT INTO ledger.journals(id,tenant_id,reference,currency,creation_tx) VALUES($1,$2,$3,$4,pg_current_xact_id())",
      [randomUUID(), actor.tenantId, "override", "USD"],
    ),
  ),
);
console.log(
  "PASS database role restrictions, forced RLS, immutable history, deferred balance and journal closure.",
);
await assert.rejects(
  () =>
    scoped(actor, "test.cross-tenant-version", async (tx) => {
      const other = (
        await tx.query(
          "SELECT id FROM product.products WHERE tenant_id<>$1 LIMIT 1",
          [actor.tenantId],
        )
      ).rows[0];
      assert(other);
      await tx.query(
        "INSERT INTO product.versions(id,product_id,tenant_id,revision,currency,base_premium_minor,coverages,terms,status,created_by) VALUES($1,$2,$3,2147483647,'USD',1,'[]','Integrity regression','DRAFT',$4)",
        [randomUUID(), other.id, actor.tenantId, actor.id],
      );
    }),
  (error: unknown) =>
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23503",
);
await assert.rejects(
  () =>
    scoped(actor, "test.claim-owner-mismatch", async (tx) => {
      const claim = (await tx.query("SELECT id FROM claims.claims LIMIT 1"))
        .rows[0];
      assert(claim);
      await tx.query("UPDATE claims.claims SET party_id=$2 WHERE id=$1", [
        claim.id,
        actor.partyId,
      ]);
    }),
  (error: unknown) =>
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23503",
);
await assert.rejects(() =>
  scoped(actor, "test.decision.immutable", (tx) =>
    tx.query("UPDATE claims.decisions SET reason='tampered'"),
  ),
);
await assert.rejects(() =>
  scoped(actor, "test.notification.immutable", (tx) =>
    tx.query("UPDATE service.notifications SET message='tampered'"),
  ),
);
console.log(
  "PASS tenant/party relationship constraints, immutable decisions, and notification field permissions.",
);
await pool.end();
