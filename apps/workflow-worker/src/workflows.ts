import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities.js";
const { processOperation } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  scheduleToCloseTimeout: "30 days",
  retry: { initialInterval: "2 seconds", maximumInterval: "1 minute" },
});
export async function insuranceOperation(operationId: string): Promise<void> {
  await processOperation(operationId);
}
