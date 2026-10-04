import { temporalOptions } from "../../../packages/runtime/src/temporal.js";
import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import * as activities from "./activities.js";
import {
  config,
  validateEnvironment,
} from "../../../packages/runtime/src/config.js";
import { systemPool } from "../../../packages/runtime/src/database.js";
import { health } from "../../../packages/runtime/src/health.js";
validateEnvironment();
const connection = await NativeConnection.connect(temporalOptions());
const worker = await Worker.create({
  connection,
  namespace: config("TEMPORAL_NAMESPACE", "default"),
  taskQueue: "insurance",
  workflowsPath: fileURLToPath(new URL("./workflows.js", import.meta.url)),
  activities,
  maxConcurrentActivityTaskExecutions: 10,
});
const healthServer = health(async () => {
  await systemPool.query("SELECT 1");
  if (worker.getState() !== "RUNNING") throw new Error("worker unavailable");
});
process.on("SIGTERM", () => {
  healthServer.close();
  worker.shutdown();
});
process.on("SIGINT", () => {
  healthServer.close();
  worker.shutdown();
});
await worker.run();
await connection.close();
await systemPool.end();
