import { requestPublic } from "./network.js";
export { publicAddress } from "./network.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { config, production } from "./config.js";
import type { Tx } from "./database.js";
import { one } from "./database.js";
import type {
  ProviderRequest,
  EffectProvider,
  ProviderEvidence,
} from "../../domain/src/provider.js";
import { decrypt } from "./crypto.js";
class HttpProvider implements EffectProvider {
  constructor(
    private readonly origin: string,
    private readonly credential: string,
    private readonly sandbox: boolean,
  ) {}
  async execute(
    key: string,
    input: ProviderRequest,
    allowCreate = true,
  ): Promise<ProviderEvidence> {
    const body = JSON.stringify(input),
      hash = createHash("sha256").update(body).digest("hex"),
      url = new URL(this.origin + "/effects/" + encodeURIComponent(key)),
      headers = { authorization: "Bearer " + this.credential };
    const call = async (method: string) => {
      if (this.sandbox) {
        const r = await fetch(url, {
          method,
          headers:
            method === "POST"
              ? {
                  ...headers,
                  "content-type": "application/json",
                  "Idempotency-Key": key,
                }
              : headers,
          ...(method === "POST" ? { body } : {}),
          signal: AbortSignal.timeout(20000),
          redirect: "error",
        });
        return { status: r.status, data: await r.json() };
      }
      const result = await requestPublic(
        url,
        method,
        method === "POST"
          ? {
              ...headers,
              "content-type": "application/json",
              "Idempotency-Key": key,
            }
          : headers,
        method === "POST" ? body : undefined,
      );
      return {
        status: result.status,
        data: JSON.parse(result.body.toString() || "{}"),
      };
    };
    let r = await call("GET");
    if (r.status === 404 && allowCreate) r = await call("POST");
    if (r.status !== 200)
      throw new Error("Provider pending/reconciliation required");
    const evidence = z
      .object({
        status: z.enum(["SUCCEEDED", "DECLINED"]),
        reference: z.string().min(1).max(300),
        amountMinor: z.string(),
        currency: z.string(),
        requestHash: z.string(),
        effectiveAt: z.iso.datetime({ offset: true }).optional(),
        expiresAt: z.iso.datetime({ offset: true }).optional(),
      })
      .parse(r.data);
    if (
      evidence.amountMinor !== input.amountMinor ||
      evidence.currency !== input.currency ||
      evidence.requestHash !== hash
    )
      throw new Error("Provider evidence mismatch");
    return evidence;
  }
}
export async function provider(
  tx: Tx,
  adapterId: string | undefined,
  kind: "CARRIER" | "PAYMENT",
): Promise<EffectProvider> {
  if (!adapterId) {
    if (production) throw new Error("Certified provider binding required");
    return new HttpProvider(
      config("PROVIDER_URL"),
      config("PROVIDER_SECRET"),
      true,
    );
  }
  const row = await one<{ endpoint: string; encrypted_credential: string }>(
    tx,
    "SELECT * FROM integrations.providers WHERE id=$1 AND kind=$2 AND status='APPROVED'",
    [adapterId, kind],
  );
  const url = new URL(row.endpoint);
  if (
    url.protocol !== "https:" ||
    !config("PROVIDER_ALLOWED_HOSTS").split(",").includes(url.hostname)
  )
    throw new Error("Provider hostname not approved");
  return new HttpProvider(
    row.endpoint,
    decrypt(row.encrypted_credential),
    false,
  );
}
