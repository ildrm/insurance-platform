import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(
  join(tmpdir(), "insurance-recovery-roundtrip-"),
);
const key = join(directory, "recovery-key");
const target = "restore_test_" + randomBytes(8).toString("hex");
const env = { ...process.env, BACKUP_KEY_FILE: key };
const project = process.env.COMPOSE_PROJECT_NAME ?? "insurance-platform";
let backup;
let created = false;
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", env });
  assert.ifError(result.error);
  assert.equal(result.status, 0, command + " failed: " + result.stderr);
  return result.stdout.trim();
}
function compose(...args) {
  return run("docker", [
    "compose",
    "-p",
    project,
    "exec",
    "-T",
    "postgres",
    ...args,
  ]);
}
function query(database, sql) {
  return compose(
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  );
}
try {
  await writeFile(key, randomBytes(32), { mode: 0o600 });
  const migrations = query(
    "insurance",
    "SELECT count(*) FROM public.schema_migrations",
  );
  const output = run(process.execPath, ["scripts/backup.mjs"]);
  backup = output.match(
    /Encrypted backup written: (\.local\/backups\/[0-9TZ.-]+\.pg\.aes)$/,
  )?.[1];
  assert.ok(backup, "Backup must report a local encrypted archive");
  run(process.execPath, ["scripts/restore.mjs", backup, target]);
  created = true;
  assert.equal(
    query(target, "SELECT count(*) FROM public.schema_migrations"),
    migrations,
  );
  const counts = JSON.parse(
    query(
      target,
      "SELECT json_build_object('policies',(SELECT count(*) FROM policy.policies),'complaints',(SELECT count(*) FROM service.complaints),'journals',(SELECT count(*) FROM ledger.journals))",
    ),
  );
  assert.ok(
    counts.policies > 0 && counts.journals > 0,
    "Restored sandbox must contain issued contracts and accounting evidence",
  );
  console.log(
    "PASS authenticated backup restored all " +
      migrations +
      " migrations and business records into a new database: " +
      JSON.stringify(counts),
  );
  console.log(run(process.execPath, ["tests/recovery.mjs", backup]));
} finally {
  if (created) compose("dropdb", "-U", "postgres", target);
  if (backup) await rm(backup, { force: true });
  await rm(directory, { recursive: true, force: true });
}
