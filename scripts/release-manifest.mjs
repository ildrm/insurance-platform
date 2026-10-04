import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

function command(program, args) {
  const result = spawnSync(program, args, { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, program + " failed: " + result.stderr);
  return result.stdout;
}
async function artifact(path) {
  const info = await lstat(path);
  assert.ok(info.isFile(), "Release evidence must be a regular file: " + path);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { path, bytes: info.size, sha256: hash.digest("hex") };
}
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const template =
  '{"id":{{json .Id}},"tags":{{json .RepoTags}},"repoDigests":{{json .RepoDigests}},"architecture":{{json .Architecture}},"os":{{json .Os}},"created":{{json .Created}},"layers":{{json .RootFS.Layers}}}';
const images = [];
for (const app of [
  "backend",
  "customer-web",
  "partner-web",
  "admin-web",
  "developer-web",
]) {
  const reference = `insurance-platform/${app}:${version}`;
  const image = JSON.parse(
    command("docker", ["image", "inspect", reference, "--format", template]),
  );
  const scanPath = `artifacts/release/${app}-vulnerabilities.json`;
  const report = JSON.parse(await readFile(scanPath, "utf8"));
  const archivePath = `artifacts/release/${app}.tar`;
  const archiveManifest = JSON.parse(
    command("tar", ["-xOf", archivePath, "manifest.json"]),
  );
  const archiveImage = archiveManifest.find((entry) =>
    entry.RepoTags?.includes(reference),
  );
  assert.ok(
    archiveImage,
    "Archive must contain the tagged release image: " + app,
  );
  const config = command("tar", ["-xOf", archivePath, archiveImage.Config]);
  const configDigest =
    "sha256:" + createHash("sha256").update(config).digest("hex");
  assert.equal(
    report.Metadata?.ImageID,
    configDigest,
    "Scan must describe the exported image configuration: " + app,
  );
  assert.deepEqual(
    report.Metadata?.DiffIDs,
    image.layers,
    "Exported layers must match the current image: " + app,
  );
  assert.equal(
    new Date(report.Metadata?.ImageConfig?.created).toISOString(),
    new Date(image.created).toISOString(),
    "Exported configuration must match the current image: " + app,
  );
  const findings = (report.Results ?? []).flatMap(
    (result) => result.Vulnerabilities ?? [],
  );
  const highCritical = findings.filter((finding) =>
    ["HIGH", "CRITICAL"].includes(finding.Severity),
  );
  assert.equal(
    highCritical.length,
    0,
    "Release has unresolved HIGH/CRITICAL findings: " + app,
  );
  images.push({
    reference,
    ...image,
    configurationDigest: configDigest,
    archive: await artifact(archivePath),
    vulnerabilityReport: await artifact(scanPath),
    highCriticalFindings: highCritical.length,
  });
}
const paths = command("git", [
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
  "--",
  "apps",
  "packages",
  "infrastructure",
  "scripts",
  "tests",
  ".github",
  ".dockerignore",
  ".gitignore",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.backend.json",
  "compose.yaml",
  "compose.production.yaml",
  "docs/releases",
])
  .split("\0")
  .filter(Boolean);
const sources = [];
for (const path of [...new Set(paths)].sort())
  sources.push(await artifact(path));
const evidence = [];
for (const path of [
  "artifacts/release/production-dependencies.cdx.json",
  "artifacts/release/npm-audit.json",
  "artifacts/release/verification.json",
])
  evidence.push(await artifact(path));
const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  baselineCommit: command("git", ["rev-parse", "HEAD"]).trim(),
  sourceState:
    "uncommitted workspace; SHA-256 inventory below is authoritative",
  verificationScope:
    "Local Linux ARM64 Docker sandbox; CI configured but not remotely executed; live-provider and jurisdiction certification excluded",
  images,
  evidence,
  sources,
};
await writeFile(
  "artifacts/release/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Release manifest written for " +
    images.length +
    " scanned images and " +
    sources.length +
    " source files.",
);
