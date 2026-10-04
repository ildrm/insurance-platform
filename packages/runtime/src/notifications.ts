import { randomUUID } from "node:crypto";
import type { Tx } from "./database.js";
const resources: Record<string, string> = {
  quote: "quote.quotes",
  renewal: "quote.quotes",
  underwriting: "quote.quotes",
  policy: "policy.policies",
  claim: "claims.claims",
  document: "claims.documents",
  complaint: "service.complaints",
  payment: "platform.operations",
  operation: "platform.operations",
};
const messages: Record<string, string> = {
  "quote.created": "Your quote is ready for review.",
  "underwriting.decided": "Your quote has an underwriting decision.",
  "policy.issued": "Your policy document is available.",
  "policy.active": "Your coverage period has started.",
  "policy.expired": "Your coverage period has ended.",
  "policy.endorsed": "Your policy address was updated.",
  "renewal.quoted": "Your renewal quote is ready for review.",
  "policy.cancellation-requested":
    "Your cancellation request is awaiting insurer review.",
  "policy.issuance-declined":
    "The insurer declined issuance. Payment reconciliation is in progress.",
  "payment.refunded": "Your payment refund was confirmed.",
  "payment.declined": "Your payment was declined.",
  "claim.notified": "Your claim was received.",
  "claim.decision-proposed":
    "Your claim assessment is awaiting independent approval.",
  "claim.declined":
    "Your claim has an independently reviewed decline decision.",
  "claim.decline-proposed":
    "A claim decline decision is awaiting independent review.",
  "claim.approved": "Your claim decision was approved.",
  "claim.paid": "Your claim payment was confirmed.",
  "document.clean": "Your evidence document passed scanning.",
  "document.rejected": "Your evidence document was rejected by scanning.",
  "complaint.created": "Your complaint was received.",
  "complaint.acknowledged": "Your complaint was acknowledged.",
  "complaint.investigating": "Your complaint is under investigation.",
  "complaint.resolved": "A complaint resolution is available for your review.",
  "complaint.escalated": "Your complaint appeal was received.",
  "complaint.closed": "Your complaint is closed.",
  "complaint.sla-breached":
    "Your complaint exceeded its operational service target.",
};
export async function notify(
  tx: Tx,
  event: { id: string; tenant_id: string; type: string; resource_id: string },
): Promise<void> {
  const message = messages[event.type],
    table = resources[event.type.split(".")[0]!];
  if (!message || !table) return;
  // Table identifiers come exclusively from the static domain map above.
  const recipient = (
    await tx.query<{ party_id: string }>(
      `SELECT party_id FROM ${table} WHERE id=$1 AND tenant_id=$2`,
      [event.resource_id, event.tenant_id],
    )
  ).rows[0];
  if (!recipient) return;
  await tx.query("SELECT set_config('app.party_id',$1,true)", [
    recipient.party_id,
  ]);
  await tx.query(
    "INSERT INTO service.notifications(id,tenant_id,party_id,event_id,type,resource_id,message) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id) DO NOTHING",
    [
      randomUUID(),
      event.tenant_id,
      recipient.party_id,
      event.id,
      event.type,
      event.resource_id,
      message,
    ],
  );
}
