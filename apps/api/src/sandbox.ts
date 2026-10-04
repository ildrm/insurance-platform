import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  scoped,
  one,
  idempotent,
} from "../../../packages/runtime/src/database.js";
import { config, production } from "../../../packages/runtime/src/config.js";
import {
  DomainError,
  requireRole,
  type Actor,
} from "../../../packages/domain/src/insurance.js";
@Injectable()
export class Sandbox {
  async fault(a: Actor, body: unknown, key: string | undefined) {
    requireRole(a, "ADMIN");
    if (production || config("PROVIDER_MODE", "sandbox") !== "sandbox")
      throw new DomainError(
        "SANDBOX_DISABLED",
        "Sandbox fault injection is unavailable.",
        404,
      );
    const input = z
      .object({
        resourceReference: z.uuid(),
        effect: z.enum(["payment", "carrier"]),
        mode: z.enum(["LOST_RESPONSE", "DECLINED"]),
      })
      .strict()
      .parse(body);
    return scoped(a, "sandbox.fault", (tx) =>
      idempotent(tx, a, "sandbox.fault", key, input, async () => {
        await one(tx, "SELECT id FROM quote.quotes WHERE id=$1", [
          input.resourceReference,
        ]);
        const r = await fetch(config("PROVIDER_URL") + "/test/fault", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + config("PROVIDER_SECRET"),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        if (!r.ok)
          throw new DomainError(
            "SANDBOX_PROVIDER_UNAVAILABLE",
            "Sandbox fault could not be configured.",
            503,
          );
        return { configured: true };
      }),
    );
  }
}
