import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  config,
  production,
  operatorDatabaseURL,
} from "../../../packages/runtime/src/config.js";
import { passwordHash, encrypt } from "../../../packages/runtime/src/crypto.js";
// Run as a restricted one-shot operator job with MIGRATION_DATABASE_URL_FILE.
const email = z.email().parse(config("PROVISION_EMAIL")),
  name = z.string().min(2).max(100).parse(config("PROVISION_NAME")),
  role = z
    .enum([
      "CUSTOMER",
      "UNDERWRITER",
      "ADJUSTER",
      "FINANCE",
      "FINANCE_APPROVER",
      "ADMIN",
      "DEVELOPER",
    ])
    .parse(config("PROVISION_ROLE")),
  tenant = z.uuid().parse(config("PROVISION_TENANT_ID")),
  password = z.string().min(16).max(128).parse(config("PROVISION_PASSWORD"));
const totp = process.env.PROVISION_TOTP_SECRET_FILE
  ? config("PROVISION_TOTP_SECRET")
  : undefined;
if (production && role !== "CUSTOMER" && !totp)
  throw new Error("Production staff require externally provisioned TOTP.");
if (totp && !/^[A-Z2-7]{32,64}$/.test(totp))
  throw new Error("Invalid TOTP secret");
const db = new Pool({
    connectionString: operatorDatabaseURL(),
    connectionTimeoutMillis: 10000,
  }),
  tx = await db.connect();
try {
  await tx.query("BEGIN");
  const party = process.env.PROVISION_PARTY_ID
      ? z.uuid().parse(process.env.PROVISION_PARTY_ID)
      : randomUUID(),
    id = randomUUID();
  if (process.env.PROVISION_PARTY_ID) {
    const existing = await tx.query(
      "SELECT id FROM party.parties WHERE id=$1 AND kind='PERSON'",
      [party],
    );
    if (!existing.rowCount) throw new Error("Canonical person does not exist");
  } else
    await tx.query("INSERT INTO party.parties VALUES($1,'PERSON',$2)", [
      party,
      name,
    ]);
  await tx.query(
    "INSERT INTO identity.users(id,tenant_id,party_id,email,name,role,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      tenant,
      party,
      email,
      name,
      role,
      passwordHash(password),
      totp ? encrypt(totp) : null,
    ],
  );
  await tx.query("COMMIT");
  console.log("Provisioned user " + id);
} catch (e) {
  await tx.query("ROLLBACK");
  throw e;
} finally {
  tx.release();
  await db.end();
  const { pool, systemPool } =
    await import("../../../packages/runtime/src/database.js");
  await pool.end();
  await systemPool.end();
}
