import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const base = process.env.API_ORIGIN ?? "http://127.0.0.1:3104/api";
const password = (await readFile(".local/demo-password", "utf8")).trim();
async function session(name: string) {
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:3100",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: name + "@example.test", password }),
  });
  assert.equal(login.status, 201, "Sandbox test login failed");
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  return async (
    path: string,
    body?: unknown,
    status = 200,
    version?: number,
  ): Promise<Record<string, any>> => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "http://127.0.0.1:3100",
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
        ...(version ? { "If-Match": String(version) } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, status, path + ": " + JSON.stringify(result));
    return result;
  };
}
const admin = await session("admin"),
  approver = await session("approver"),
  customer = await session("customer");
const product = await admin(
  "/admin/products",
  {
    name: "Renewal currency regression " + randomUUID().slice(0, 8),
    category: "Home",
    description:
      "Isolated sandbox fixture for historical monetary unit preservation.",
    currency: "USD",
    basePremiumMinor: "10000",
    coverages: [
      {
        code: "PROPERTY",
        name: "Property",
        limitMinor: "1000000",
        deductibleMinor: "10000",
      },
    ],
  },
  201,
);
await approver(
  "/admin/products/" + product.versionId + "/publications",
  {},
  201,
);
const quote = await customer(
  "/quotes",
  {
    productId: product.id,
    age: 35,
    assetValueMinor: "2500000",
    coverageCodes: ["PROPERTY"],
  },
  201,
);
const purchase = await customer(
  "/quotes/" + quote.id + "/purchase",
  {},
  201,
  quote.version,
);
let operation = await customer("/operations/" + purchase.operationId);
const deadline = Date.now() + 60000;
while (operation.status === "PENDING" && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  operation = await customer("/operations/" + purchase.operationId);
}
assert.equal(operation.status, "COMPLETED");
const renewal = await customer(
  "/policies/" + operation.policyId + "/renewals",
  {},
  201,
);
assert.equal(renewal.currency, "USD");
assert.match(product.versionId, /^[a-f\d-]{36}$/i);
// The operator fixture simulates a separately approved future product version;
// runtime credentials cannot mutate the original published version.
execFileSync(
  "docker",
  [
    "compose",
    "-p",
    process.env.COMPOSE_PROJECT_NAME ?? "insurance-platform",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "postgres",
    "-d",
    "insurance",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `INSERT INTO product.versions(id,product_id,tenant_id,revision,currency,base_premium_minor,coverages,terms,status,created_by,approved_by,jurisdiction,rating_rules) SELECT gen_random_uuid(),product_id,tenant_id,revision+1,'KWD',base_premium_minor,coverages,terms,status,created_by,approved_by,jurisdiction,rating_rules FROM product.versions WHERE id='${product.versionId}'`,
  ],
  { stdio: "pipe" },
);
const rejected = await customer(
  "/policies/" + operation.policyId + "/renewals",
  {},
  409,
);
assert.equal(rejected.error.code, "RENEWAL_CURRENCY_REQUIRES_REQUOTE");
const document = await customer(
  "/policies/" + operation.policyId + "/document",
);
assert.equal(document.policy.currency, "USD");
console.log(
  "PASS renewal preserves historical risk currency and rejects implicit FX when the published product currency changes.",
);
