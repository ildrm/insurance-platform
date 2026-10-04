import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  config,
  operatorDatabaseURL,
} from "../../../packages/runtime/src/config.js";
// One-shot operator job. Runtime API users cannot create or impersonate insurers.
const name = z
  .string()
  .trim()
  .min(3)
  .max(150)
  .parse(config("PROVISION_TENANT_NAME"));
const id = process.env.PROVISION_TENANT_ID
  ? z.uuid().parse(process.env.PROVISION_TENANT_ID)
  : randomUUID();
const db = new Pool({
  connectionString: operatorDatabaseURL(),
  connectionTimeoutMillis: 10000,
});
try {
  await db.query(
    "INSERT INTO tenant.organizations(id,name,kind) VALUES($1,$2,'INSURER')",
    [id, name],
  );
  console.log(JSON.stringify({ tenantId: id, name, kind: "INSURER" }));
} finally {
  await db.end();
}
