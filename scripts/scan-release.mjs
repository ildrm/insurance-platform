import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// The database-only step receives no source, image archive, or Docker socket.
// Private image scans have networking disabled and cannot upload their contents.
const scanner =
  "aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa";
const cache = resolve(".local/trivy-cache");
const output = resolve("artifacts/release");
mkdirSync(cache, { recursive: true });
mkdirSync(output, { recursive: true });
function docker(args) {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error("Release scan command failed (exit " + result.status + ")");
}
docker(["pull", scanner]);
docker([
  "run",
  "--rm",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  "--mount",
  `type=bind,source=${cache},target=/root/.cache/trivy`,
  scanner,
  "image",
  "--disable-telemetry",
  "--no-progress",
  "--db-repository",
  "ghcr.io/aquasecurity/trivy-db:2",
  "--download-db-only",
]);
for (const app of [
  "backend",
  "customer-web",
  "partner-web",
  "admin-web",
  "developer-web",
]) {
  const archive = resolve(output, app + ".tar");
  docker([
    "image",
    "save",
    "--output",
    archive,
    `insurance-platform/${app}:0.1.0`,
  ]);
  docker([
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "768m",
    "--cpus",
    "2",
    "--tmpfs",
    "/tmp:rw,size=512m",
    "--mount",
    `type=bind,source=${cache},target=/root/.cache/trivy`,
    "--mount",
    `type=bind,source=${archive},target=/input/image.tar,readonly`,
    "--mount",
    `type=bind,source=${output},target=/output`,
    scanner,
    "image",
    "--disable-telemetry",
    "--offline-scan",
    "--skip-db-update",
    "--skip-java-db-update",
    "--scanners",
    "vuln",
    "--parallel",
    "1",
    "--input",
    "/input/image.tar",
    "--severity",
    "HIGH,CRITICAL",
    "--format",
    "json",
    "--output",
    `/output/${app}-vulnerabilities.json`,
    "--exit-code",
    "1",
  ]);
  console.log("PASS private offline image scan: " + app);
}
