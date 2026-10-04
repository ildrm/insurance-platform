import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const password = (await readFile(".local/demo-password", "utf8")).trim(),
  base = process.env.API_ORIGIN ?? "http://127.0.0.1:3104/api";
type RecordData = Record<string, any>;
class Session {
  cookie = "";
  constructor(readonly email: string) {}
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    status = 200,
    version?: number,
    key = randomUUID(),
  ): Promise<any> {
    const res = await fetch(base + path, {
      method,
      signal: AbortSignal.timeout(30000),
      headers: {
        Origin: "http://127.0.0.1:3100",
        "Content-Type": "application/json",
        Cookie: this.cookie,
        "Idempotency-Key": key,
        ...(version ? { "If-Match": String(version) } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const cookie = res.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0]!;
    const data = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  async login() {
    await this.request(
      "/auth/login",
      "POST",
      { email: this.email + "@example.test", password },
      201,
    );
  }
}
const customer = new Session("customer"),
  other = new Session("other-customer"),
  admin = new Session("admin"),
  otherAdmin = new Session("other-admin");
for (const session of [customer, other, admin, otherAdmin])
  await session.login();
const policy = (await customer.request("/policies")).find(
  (p: RecordData) => p.status === "ACTIVE",
);
assert(
  policy,
  "Run the core integration suite to issue a customer policy first.",
);
const input = {
    policyId: policy.id,
    subject: "Claim communication review",
    description:
      "Please investigate the handling and communications associated with my policy.",
  },
  key = randomUUID();
const [created, replayed] = await Promise.all([
  customer.request("/complaints", "POST", input, 201, undefined, key),
  customer.request("/complaints", "POST", input, 201, undefined, key),
]);
assert.equal(created.id, replayed.id);
await other.request("/complaints/" + created.id, "GET", undefined, 404);
await otherAdmin.request("/complaints/" + created.id, "GET", undefined, 404);
await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  {
    status: "RESOLVED",
    reason: "Attempted invalid skip",
    resolution: "A reviewed resolution",
  },
  409,
  created.version,
);
await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  { status: "ACKNOWLEDGED", reason: "Receipt acknowledged" },
  428,
);
let current = await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  { status: "ACKNOWLEDGED", reason: "Receipt acknowledged" },
  201,
  created.version,
);
await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  { status: "INVESTIGATING", reason: "Assigned for investigation" },
  412,
  created.version,
);
current = await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  { status: "INVESTIGATING", reason: "Assigned for investigation" },
  201,
  current.version,
);
await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  { status: "RESOLVED", reason: "Investigation completed" },
  422,
  current.version,
);
current = await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  {
    status: "RESOLVED",
    reason: "Investigation completed",
    resolution:
      "The investigation findings and remedial actions were explained to the policyholder.",
  },
  201,
  current.version,
);
current = await customer.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  {
    status: "ESCALATED",
    reason: "I request an independent review of this resolution.",
  },
  201,
  current.version,
);
current = await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  { status: "INVESTIGATING", reason: "Appeal accepted for further review" },
  201,
  current.version,
);
current = await admin.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  {
    status: "RESOLVED",
    reason: "Appeal reviewed",
    resolution:
      "The second investigation addressed the additional concerns and documented the response.",
  },
  201,
  current.version,
);
await customer.request(
  "/complaints/" + created.id + "/transitions",
  "POST",
  { status: "CLOSED", reason: "I accept the explained resolution." },
  201,
  current.version,
);
const detail = await customer.request("/complaints/" + created.id);
assert.equal(detail.status, "CLOSED");
assert.equal(detail.timeline.length, 8);
assert.equal(
  detail.timeline.filter((h: RecordData) => h.status === "RESOLVED").length,
  2,
);
const report = await admin.request("/complaints/report");
assert.equal(report.deadlineType, "OPERATIONAL_SERVICE_TARGET");
assert(
  report.counts.some(
    (c: RecordData) => c.status === "CLOSED" && BigInt(c.count) > 0n,
  ),
);
await customer.request("/complaints/report", "GET", undefined, 403);
let notification: RecordData | undefined;
for (let i = 0; i < 40; i++) {
  notification = (await customer.request("/notifications")).find(
    (n: RecordData) =>
      n.type === "complaint.created" && n.resourceId === created.id,
  );
  if (notification) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert(
  notification,
  "The durable outbox must deliver the private notification",
);
assert(
  !(await other.request("/notifications")).some(
    (n: RecordData) => n.resourceId === created.id,
  ),
);
await other.request(
  "/notifications/" + notification.id + "/read",
  "POST",
  {},
  404,
);
const readKey = randomUUID(),
  first = await customer.request(
    "/notifications/" + notification.id + "/read",
    "POST",
    {},
    201,
    undefined,
    readKey,
  ),
  second = await customer.request(
    "/notifications/" + notification.id + "/read",
    "POST",
    {},
    201,
    undefined,
    readKey,
  );
assert.equal(first.readAt, second.readAt);
console.log(
  "PASS complaint deduplication, party/tenant isolation, required versions, investigation/resolution/appeal/closure history, operational reporting, durable private notifications and read receipt deduplication.",
);

const adjuster=new Session('adjuster'),approver=new Session('approver'),alias=new Session('alias-approver');
for(const session of [adjuster,approver,alias])await session.login();
const claim=await customer.request('/claims','POST',{policyId:policy.id,incidentAt:new Date(Date.now()-1000).toISOString(),description:'Minor accidental damage below the deductible threshold.',amountMinor:'5000',coverageCode:'PROPERTY'},201);
const proposed=await adjuster.request('/claims/'+claim.id+'/decline-proposals','POST',{reason:'The reported loss is below the selected coverage deductible.'},201,claim.version);
await alias.request('/claims/'+claim.id+'/approvals','POST',{reason:'Same person review attempt'},403,proposed.version);
const declined=await approver.request('/claims/'+claim.id+'/approvals','POST',{reason:'Independent review confirms the loss is below the contractual deductible.'},201,proposed.version);
assert.equal(declined.status,'DECLINED');assert.equal(declined.approvedMinor,'0');
const history=await customer.request('/claims/'+claim.id);assert.equal(history.decisions.length,2);
console.log('PASS independently approved claim declines preserve decision reasons and create no payment obligation.');
