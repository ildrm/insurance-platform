import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  config,
  production,
  operatorDatabaseURL,
} from "../../../packages/runtime/src/config.js";
import { passwordHash } from "../../../packages/runtime/src/crypto.js";
import { S3Client } from "@aws-sdk/client-s3";
import { initializeStorage } from "../../../packages/runtime/src/initialize-storage.js";
if (production && process.env.SEED_DEMO === "true") {
  throw new Error("Demo seed is forbidden in production");
}
const db = new Pool({
  connectionString: operatorDatabaseURL(),
  connectionTimeoutMillis: 10000,
});
const tx = await db.connect();
try {
  await tx.query(
    "SELECT pg_advisory_lock(hashtextextended('insurance-migrations',0))",
  );
  for (const [name, secret] of [
    ["insurance_app", "APP_DB_PASSWORD"],
    ["insurance_worker", "WORKER_DB_PASSWORD"],
  ] as const) {
    const exists = await tx.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
      name,
    ]);
    const escaped = config(secret).replaceAll("'", "''");
    await tx.query(
      `${exists.rowCount ? "ALTER" : "CREATE"} ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${escaped}'`,
    );
  }
  await tx.query(
    "CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const file of (await readdir("infrastructure/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("infrastructure/migrations/" + file, "utf8"),
      hash = createHash("sha256").update(sql).digest("hex"),
      r = await tx.query(
        "SELECT checksum FROM public.schema_migrations WHERE name=$1",
        [file],
      );
    if (r.rowCount) {
      if (r.rows[0].checksum !== hash)
        throw new Error("Applied migration changed: " + file);
      continue;
    }
    await tx.query("BEGIN");
    try {
      await tx.query(sql);
      await tx.query(
        "INSERT INTO public.schema_migrations(name,checksum) VALUES($1,$2)",
        [file, hash],
      );
      await tx.query("COMMIT");
      console.log("Applied " + file);
    } catch (e) {
      await tx.query("ROLLBACK");
      throw e;
    }
  }
  await tx.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
  if (process.env.SEED_DEMO === "true") {
    await tx.query("BEGIN");
    const tenant1 = "10000000-0000-4000-8000-000000000001",
      tenant2 = "10000000-0000-4000-8000-000000000002";
    await tx.query(
      "INSERT INTO tenant.organizations VALUES($1,'Northstar Assurance','INSURER'),($2,'Meridian Mutual','INSURER') ON CONFLICT DO NOTHING",
      [tenant1, tenant2],
    );
    const ids: Record<string, string> = {};
    for (const role of [
      "CUSTOMER",
      "UNDERWRITER",
      "ADJUSTER",
      "FINANCE",
      "FINANCE_APPROVER",
      "ADMIN",
      "DEVELOPER",
      "OTHER_CUSTOMER",
      "OTHER_ADJUSTER",
      "OTHER_ADMIN",
      "OTHER_FINANCE_APPROVER",
    ]) {
      const name =
          role === "FINANCE_APPROVER"
            ? "approver"
            : role.toLowerCase().replaceAll("_", "-"),
        email = name + "@example.test";
      let row = (
        await tx.query("SELECT id FROM identity.users WHERE email=$1", [email])
      ).rows[0];
      if (!row) {
        const party = randomUUID(),
          id = randomUUID();
        await tx.query("INSERT INTO party.parties VALUES($1,'PERSON',$2)", [
          party,
          name,
        ]);
        await tx.query(
          "INSERT INTO identity.users(id,tenant_id,party_id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            role.startsWith("OTHER_") ? tenant2 : tenant1,
            party,
            email,
            name,
            role.replace("OTHER_", ""),
            passwordHash(config("DEMO_PASSWORD")),
          ],
        );
        row = { id };
      }
      ids[role] = row.id;
    }
    await tx.query(
      "INSERT INTO identity.users(id,tenant_id,party_id,email,name,role,password_hash) SELECT $1,tenant_id,party_id,'alias-approver@example.test','Same-person approval test account','FINANCE_APPROVER',$2 FROM identity.users WHERE id=$3 ON CONFLICT(email) DO NOTHING",
      [randomUUID(), passwordHash(config("DEMO_PASSWORD")), ids.ADJUSTER],
    );
    const products = [
      {
        id: "20000000-0000-4000-8000-000000000001",
        tenant: tenant1,
        name: "Home Essentials",
        category: "Home",
        premium: "18000",
        desc: "Protection for your home and belongings with clear, reviewed coverage.",
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        tenant: tenant2,
        name: "Motor Complete",
        category: "Motor",
        premium: "24000",
        desc: "Vehicle damage cover built around your everyday journeys.",
      },
    ];
    for (const p of products) {
      await tx.query(
        "INSERT INTO product.products VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [p.id, p.tenant, p.name, p.category, p.desc],
      );
      const exists = await tx.query(
        "SELECT 1 FROM product.versions WHERE product_id=$1",
        [p.id],
      );
      if (!exists.rowCount)
        await tx.query(
          "INSERT INTO product.versions(id,product_id,tenant_id,revision,currency,base_premium_minor,coverages,terms,status,created_by,approved_by) VALUES($1,$2,$3,1,'USD',$4,$5,$6,'PUBLISHED',$7,$8)",
          [
            randomUUID(),
            p.id,
            p.tenant,
            p.premium,
            JSON.stringify([
              {
                code: "PROPERTY",
                name: "Accidental property damage",
                limitMinor: "10000000",
                deductibleMinor: "10000",
                premiumMinor: "0",
              },
            ]),
            "Sandbox contract. Accidental property damage only; exclusions apply. No legally binding cover or real funds.",
            ids[p.tenant === tenant1 ? "ADMIN" : "OTHER_ADMIN"],
            ids[
              p.tenant === tenant1
                ? "FINANCE_APPROVER"
                : "OTHER_FINANCE_APPROVER"
            ],
          ],
        );
    }
    await tx.query("COMMIT");
    console.log("Local sandbox accounts and catalogue ready.");
  }
} finally {
  await tx.query(
    "SELECT pg_advisory_unlock(hashtextextended('insurance-migrations',0))",
  );
  tx.release();
  await db.end();
}
const s3 = new S3Client({
    region: config("S3_REGION", "us-east-1"),
    endpoint: config("S3_ENDPOINT"),
    forcePathStyle: true,
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 8000 },
    credentials: {
      accessKeyId: config("S3_ACCESS_KEY"),
      secretAccessKey: config("S3_SECRET_KEY"),
    },
  }),
  Bucket = config("S3_BUCKET", "insurance-private");
try {
  await initializeStorage(s3, Bucket);
} finally {
  s3.destroy();
}
// Auth module imports runtime pools; close them before the migration job exits.
const { pool, systemPool } =
  await import("../../../packages/runtime/src/database.js");
await pool.end();
await systemPool.end();
