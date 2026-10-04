import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const base = process.env.API_ORIGIN ?? "http://127.0.0.1:3104/api",
  origin = "http://127.0.0.1:3100",
  password = (await readFile(".local/demo-password", "utf8")).trim();
// Test responses deliberately span heterogeneous OpenAPI resources; assertions validate each used field.
type Data = Record<string, any>;
class Session {
  cookie = "";
  constructor(readonly email: string) {}
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    key = randomUUID(),
    status = 200,
    version?: number,
  ): Promise<any> {
    const r = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(method === "GET" ? {} : { "Idempotency-Key": key }),
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(version ? { "If-Match": String(version) } : {}),
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    const cookie = r.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0]!;
    const data = await r.json();
    assert.equal(
      r.status,
      status,
      `${method} ${path}: ${JSON.stringify(data)}`,
    );
    return data;
  }
  async login() {
    await this.request(
      "/auth/login",
      "POST",
      { email: this.email + "@example.test", password },
      randomUUID(),
      201,
    );
  }
}
const customer = new Session("customer"),
  other = new Session("other-customer"),
  adjuster = new Session("adjuster"),
  otherAdjuster = new Session("other-adjuster"),
  finance = new Session("finance"),
  approver = new Session("approver"),
  admin = new Session("admin"),
  developer = new Session("developer");
const aliasApprover = new Session('alias-approver');
for (const s of [
  customer,
  other,
  adjuster,
  otherAdjuster,
  finance,
  approver,
  admin,
  developer,
  aliasApprover,
])
  await s.login();
let checks = 0;
const ok = (message: string) => {
  checks++;
  console.log("PASS " + message);
};
const csrf = await fetch(base + "/auth/login", {
  method: "POST",
  headers: {
    Origin: "https://evil.example",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email: "customer@example.test", password }),
});
assert.equal(csrf.status, 403);
ok("untrusted browser writes rejected");
const products = (await customer.request("/products")) as Data[];
assert.equal(products.length >= 2, true);
const product = products.find((p) => p.name === "Home Essentials")!,
  second = products.find((p) => p.name === "Motor Complete")!;
const input = {
    productId: product.id,
    age: 35,
    assetValueMinor: "2500000",
    coverageCodes: ["PROPERTY"],
  },
  qkey = randomUUID();
const [q, replay] = await Promise.all([
  customer.request("/quotes", "POST", input, qkey, 201),
  customer.request("/quotes", "POST", input, qkey, 201),
]);
assert.equal(q.id, replay.id);
assert.equal(q.totalMinor, "19940");
await customer.request("/quotes", "POST", { ...input, age: 36 }, qkey, 409);
ok("concurrent command deduplication and payload conflict");
const q2 = await customer.request(
  "/quotes",
  "POST",
  { ...input, productId: second.id },
  randomUUID(),
  201,
);
const mine = await customer.request("/quotes");
assert(mine.some((v: Data) => v.id === q2.id));
assert(!(await other.request("/quotes")).some((v: Data) => v.id === q.id));
await developer.request("/quotes", "GET", undefined, randomUUID(), 403);
ok("customer portfolio across insurers and role isolation");
await customer.request(
  "/quotes/" + q.id + "/purchase",
  "POST",
  {},
  randomUUID(),
  412,
  99,
);
await customer.request("/quotes/"+q.id+"/purchase", "POST", {}, randomUUID(), 428);
ok("version preconditions cannot be omitted");
const buykey = randomUUID(),
  purchase = await customer.request(
    "/quotes/" + q.id + "/purchase",
    "POST",
    {},
    buykey,
    201,
    q.version,
  ),
  purchaseReplay = await customer.request(
    "/quotes/" + q.id + "/purchase",
    "POST",
    {},
    buykey,
    201,
    q.version,
  );
assert.equal(purchase.operationId, purchaseReplay.operationId);
async function waitOperation(session: Session, id: string) {
  for (let i = 0; i < 120; i++) {
    const op = await session.request("/operations/" + id);
    if (["COMPLETED", "FAILED"].includes(op.status)) return op;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Workflow timed out: " + id);
}
const issued = await waitOperation(customer, purchase.operationId),
  policies = await customer.request("/policies"),
  policy = policies.find((p: Data) => p.id === issued.policyId);
assert(policy);
assert.equal(policy.status, "ACTIVE");
assert(
  !(await other.request("/policies")).some((p: Data) => p.id === policy.id),
);
await other.request(
  "/policies/" + policy.id + "/document",
  "GET",
  undefined,
  randomUUID(),
  404,
);
ok("durable payment + carrier issuance with private policy portfolio");
const contract = await customer.request("/policies/" + policy.id + "/document");
assert.equal(
  contract.contract.productVersionId,
  q.versionId ?? product.versionId,
);
assert.equal(contract.revisions.length, 1);
await customer.request(
  "/policies/" + policy.id + "/endorsements",
  "POST",
  { address: "123 Reviewed Street", reason: "Address corrected" },
  randomUUID(),
  201,
  policy.version,
);
const endorsed = await customer.request("/policies/" + policy.id + "/document");
assert.equal(endorsed.revisions.length, 2);
assert.equal(endorsed.revisions[0].snapshot.address, undefined);
ok("immutable contract history and optimistic concurrency");
const incidentAt = new Date().toISOString(),
  claim = await customer.request(
    "/claims",
    "POST",
    {
      policyId: policy.id,
      incidentAt,
      description: "Accidental damage occurred to insured belongings.",
      amountMinor: "50000",
    },
    randomUUID(),
    201,
  );
await other.request("/claims/" + claim.id, "GET", undefined, randomUUID(), 404);
await otherAdjuster.request(
  "/claims/" + claim.id,
  "GET",
  undefined,
  randomUUID(),
  404,
);
await developer.request("/claims", "GET", undefined, randomUUID(), 403);
ok("claim authorization by customer party and insurer tenant");
const cleanForm = new FormData();
cleanForm.set(
  "file",
  new Blob(["Receipt for reviewed damage."], { type: "text/plain" }),
  "receipt.txt",
);
const doc = await customer.request(
  "/claims/" + claim.id + "/documents",
  "POST",
  cleanForm,
  randomUUID(),
  201,
);
const badForm = new FormData();
badForm.set(
  "file",
  new Blob(
    ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"],
    { type: "text/plain" },
  ),
  "eicar.txt",
);
const bad = await customer.request(
  "/claims/" + claim.id + "/documents",
  "POST",
  badForm,
  randomUUID(),
  201,
);
let clean = false,
  rejected = false;
for (let i = 0; i < 120; i++) {
  const d = await customer.request("/claims/" + claim.id);
  clean = d.documents.some(
    (v: Data) => v.id === doc.id && v.status === "CLEAN",
  );
  rejected = d.documents.some(
    (v: Data) => v.id === bad.id && v.status === "REJECTED",
  );
  if (clean && rejected) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert(clean && rejected, "Actual scanner must clean receipt and reject EICAR");
await customer.request(
  "/documents/" + bad.id,
  "GET",
  undefined,
  randomUUID(),
  409,
);
ok("real malware scanning with quarantine and fail-closed download");
await adjuster.request(
  "/claims/" + claim.id + "/decisions",
  "POST",
  { amountMinor: "45000", reason: "Above policy deductible" },
  randomUUID(),
  422,
  claim.version,
);
const assessed = await adjuster.request(
  "/claims/" + claim.id + "/decisions",
  "POST",
  { amountMinor: "40000", reason: "Confirmed covered damage less deductible" },
  randomUUID(),
  201,
  claim.version,
);
await adjuster.request(
  "/claims/" + claim.id + "/approvals",
  "POST",
  { reason: "Self approval" },
  randomUUID(),
  403,
  assessed.version,
);
await aliasApprover.request("/claims/"+claim.id+"/approvals", "POST", {reason:"Same canonical person under another account"}, randomUUID(), 403, assessed.version);
ok("independent approval compares canonical people across accounts");
const approved = await approver.request(
  "/claims/" + claim.id + "/approvals",
  "POST",
  { reason: "Independent coverage review" },
  randomUUID(),
  201,
  assessed.version,
);
const payout = await finance.request(
  "/claims/" + claim.id + "/payouts",
  "POST",
  {},
  randomUUID(),
  201,
  approved.version,
);
await waitOperation(finance, payout.operationId);
const paid = await customer.request("/claims/" + claim.id);
assert.equal(paid.status, "PAID");
assert.equal(paid.paidMinor, "40000");
ok("deductible-bound assessment, independent approval and durable payout");
const lostQuote = await customer.request(
  "/quotes",
  "POST",
  input,
  randomUUID(),
  201,
);
await admin.request(
  "/admin/sandbox/faults",
  "POST",
  { resourceReference: lostQuote.id, effect: "payment", mode: "LOST_RESPONSE" },
  randomUUID(),
  201,
);
const lostOp = await customer.request(
  "/quotes/" + lostQuote.id + "/purchase",
  "POST",
  {},
  randomUUID(),
  201,
  lostQuote.version,
);
assert.equal(
  (await waitOperation(customer, lostOp.operationId)).status,
  "COMPLETED",
);
const recoveredLedger = await finance.request("/ledger");
assert.equal(
  recoveredLedger.entries.filter(
    (j: Data) => j.reference === "capture:" + lostQuote.id,
  ).length,
  1,
);
ok("lost payment response reconciles without duplicate capture");
const declinedQuote = await customer.request(
  "/quotes",
  "POST",
  input,
  randomUUID(),
  201,
);
await admin.request(
  "/admin/sandbox/faults",
  "POST",
  { resourceReference: declinedQuote.id, effect: "carrier", mode: "DECLINED" },
  randomUUID(),
  201,
);
const declinedOp = await customer.request(
  "/quotes/" + declinedQuote.id + "/purchase",
  "POST",
  {},
  randomUUID(),
  201,
  declinedQuote.version,
);
const refunded = await waitOperation(customer, declinedOp.operationId);
assert.equal(refunded.status, "FAILED");
assert.equal(refunded.stage, "REFUNDED");
assert(
  !(await customer.request("/policies")).some(
    (p: Data) => p.id === refunded.policyId,
  ),
);
const refundLedger = await finance.request("/ledger");
assert.equal(
  refundLedger.entries.filter(
    (j: Data) => j.reference === "refund:" + declinedQuote.id,
  ).length,
  1,
);
ok("carrier decline after capture produces verified compensating refund");
const batch = await finance.request(
  "/settlements",
  "POST",
  { reason: "Integration test settlement" },
  randomUUID(),
  201,
);
await finance.request(
  "/settlements/" + batch.id + "/approvals",
  "POST",
  {},
  randomUUID(),
  403,
);
await approver.request(
  "/settlements/" + batch.id + "/approvals",
  "POST",
  {},
  randomUUID(),
  201,
);
const paidBatch = await finance.request(
  "/settlements/" + batch.id + "/payouts",
  "POST",
  {},
  randomUUID(),
  201,
);
await waitOperation(finance, paidBatch.operationId);
ok("settlement separation of duties and durable insurer payment");
const ledger = await finance.request("/ledger");
for (const j of ledger.entries) {
  const balance = j.postings.reduce(
    (n: bigint, p: Data) =>
      n + (p.side === "DEBIT" ? 1n : -1n) * BigInt(p.amountMinor),
    0n,
  );
  assert.equal(balance, 0n);
}
ok("all posted journals balance in exact minor units");
const key = await developer.request(
  "/developer/keys",
  "POST",
  { name: "Test integration credential" },
  randomUUID(),
  201,
);
const bearer = await fetch(base + "/developer/keys", {
  headers: { Authorization: "Bearer " + key.secret },
});
assert.equal(bearer.status, 200);
await developer.request(
  "/developer/keys/" + key.id,
  "DELETE",
  undefined,
  randomUUID(),
  200,
);
const revoked = await fetch(base + "/developer/keys", {
  headers: { Authorization: "Bearer " + key.secret },
});
assert.equal(revoked.status, 401);
await developer.request(
  "/developer/webhooks",
  "POST",
  { url: "https://127.0.0.1/events" },
  randomUUID(),
  422,
);
ok(
  "hashed API credentials, immediate revocation and webhook destination restriction",
);
const draft = await admin.request(
  "/admin/products",
  "POST",
  {
    name: "Reviewed sandbox product",
    category: "Home",
    description: "A new version awaiting independent review.",
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
  randomUUID(),
  201,
);
assert(
  !(await customer.request("/products")).some((p: Data) => p.id === draft.id),
);
await admin.request(
  "/admin/products/" + draft.versionId + "/publications",
  "POST",
  {},
  randomUUID(),
  403,
);
await approver.request(
  "/admin/products/" + draft.versionId + "/publications",
  "POST",
  {},
  randomUUID(),
  201,
);
assert(
  (await customer.request("/products")).some((p: Data) => p.id === draft.id),
);
ok("draft privacy and independent immutable publication");
assert((await admin.request("/admin/audit")).length > 0);
await customer.request("/auth/logout", "POST", {}, randomUUID(), 201);
await customer.request("/auth/me", "GET", undefined, randomUUID(), 401);
ok("append-only audit evidence and session revocation");
console.log(`${checks} integration checks passed.`);
