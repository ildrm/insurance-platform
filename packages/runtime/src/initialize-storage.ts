import {
  CreateBucketCommand,
  GetBucketVersioningCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { setTimeout as delay } from "node:timers/promises";

/** Never interpret authentication or transport failures as a missing bucket. */
export async function initializeStorage(
  client: Pick<S3Client, "send">,
  Bucket: string,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const options = {
        abortSignal: AbortSignal.timeout(
          Math.max(1, Math.min(8_000, deadline - Date.now())),
        ),
      };
      try {
        await client.send(new HeadBucketCommand({ Bucket }), options);
      } catch (error) {
        const response = error as { $metadata?: { httpStatusCode?: number } };
        if (response.$metadata?.httpStatusCode !== 404) throw error;
        await client.send(new CreateBucketCommand({ Bucket }), options);
      }
      await client.send(
        new PutBucketVersioningCommand({
          Bucket,
          VersioningConfiguration: { Status: "Enabled" },
        }),
        options,
      );
      const state = await client.send(
        new GetBucketVersioningCommand({ Bucket }),
        options,
      );
      if (state.Status !== "Enabled")
        throw new Error("Private document bucket versioning is not enabled");
      return;
    } catch (error) {
      const response = error as {
        name?: string;
        code?: string;
        $metadata?: { httpStatusCode?: number };
      };
      const transient =
        (response.$metadata?.httpStatusCode ?? 0) >= 500 ||
        ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(
          response.code ?? "",
        ) ||
        ["AbortError", "TimeoutError", "BucketAlreadyOwnedByYou"].includes(
          response.name ?? "",
        );
      if (!transient || Date.now() >= deadline) throw error;
      await delay(Math.min(2_000, deadline - Date.now()));
    }
  }
}
