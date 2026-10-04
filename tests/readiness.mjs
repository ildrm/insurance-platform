import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const project = process.env.COMPOSE_PROJECT_NAME ?? "insurance-platform";
function compose(...args) {
  const result = spawnSync("docker", ["compose", "-p", project, ...args], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function status(service) {
  return Number(
    compose(
      "exec",
      "-T",
      service,
      "node",
      "-e",
      "fetch('http://127.0.0.1:3000/health/ready',{signal:AbortSignal.timeout(4000)}).then(r=>console.log(r.status)).catch(()=>process.exit(1))",
    ),
  );
}
async function waitReady(service, recoveryMs) {
  const deadline = Date.now() + recoveryMs;
  while (Date.now() < deadline) {
    if (status(service) === 200) return;
    await delay(2000);
  }
  throw new Error(service + " did not recover");
}
for (const [dependency, service, recoveryMs] of [
  ["nats", "worker", 120000],
  // Signature engines take several minutes to load on small Docker hosts.
  ["clamav", "integration-worker", 600000],
]) {
  assert.equal(
    status(service),
    200,
    "Worker is ready before failure injection",
  );
  try {
    compose("stop", dependency);
    assert.equal(
      status(service),
      503,
      service + " must report dependency failure",
    );
    console.log("PASS readiness detects " + dependency + " outage");
  } finally {
    compose("start", dependency);
  }
  await waitReady(service, recoveryMs);
  console.log("PASS readiness recovers after " + dependency + " restart");
}
