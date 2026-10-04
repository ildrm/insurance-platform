import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const backup = process.argv[2];
assert.ok(
  backup && process.env.BACKUP_KEY_FILE,
  "Supply an encrypted backup and BACKUP_KEY_FILE",
);
const directory = await mkdtemp(join(tmpdir(), "insurance-recovery-test-"));
const target = "restore_corrupt_" + randomBytes(8).toString("hex");
function restore(path, key = process.env.BACKUP_KEY_FILE) {
  return spawnSync(process.execPath, ["scripts/restore.mjs", path, target], {
    encoding: "utf8",
    env: { ...process.env, BACKUP_KEY_FILE: key },
  });
}
try {
  const encrypted = await readFile(backup);
  assert.ok(encrypted.length > 33, "Backup must contain ciphertext");
  encrypted[16] ^= 1;
  const corrupt = join(directory, "corrupt.pg.aes");
  await writeFile(corrupt, encrypted, { mode: 0o600 });
  const rejected = restore(corrupt);
  assert.ifError(rejected.error);
  assert.notEqual(
    rejected.status,
    0,
    "Tampered ciphertext must fail authentication",
  );
  assert.match(rejected.stderr, /authenticate data/);
  const exists = spawnSync(
    "docker",
    [
      "compose",
      "-p",
      process.env.COMPOSE_PROJECT_NAME ?? "insurance-platform",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `SELECT count(*) FROM pg_database WHERE datname='${target}'`,
    ],
    { encoding: "utf8" },
  );
  assert.ifError(exists.error);
  assert.equal(exists.status, 0, "Database verification must succeed");
  assert.equal(
    exists.stdout.trim(),
    "0",
    "Authentication must finish before creating a database",
  );
  console.log("PASS tampered backup is rejected before database creation");

  const weakKey = join(directory, "weak-key");
  await writeFile(weakKey, "x", { mode: 0o600 });
  const weakRestore = restore(backup, weakKey);
  assert.ifError(weakRestore.error);
  assert.notEqual(weakRestore.status, 0);
  assert.match(weakRestore.stderr, /at least 32 random bytes/);
  const weakBackup = spawnSync(process.execPath, ["scripts/backup.mjs"], {
    encoding: "utf8",
    env: { ...process.env, BACKUP_KEY_FILE: weakKey },
  });
  assert.ifError(weakBackup.error);
  assert.notEqual(weakBackup.status, 0);
  assert.match(weakBackup.stderr, /at least 32 random bytes/);
  console.log("PASS backup and restore reject undersized recovery keys");
} finally {
  await rm(directory, { recursive: true, force: true });
}
