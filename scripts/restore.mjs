import { readFile, open, mkdtemp, rm } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash, createDecipheriv } from "node:crypto";
import { spawn } from "node:child_process";
// Authenticate the entire stream before creating a database. Memory use is bounded.
const [path, target] = process.argv.slice(2);
if (
  !path ||
  !target ||
  !/^restore_[a-z0-9_]{1,40}$/.test(target) ||
  !process.env.BACKUP_KEY_FILE
)
  throw new Error(
    "Usage: BACKUP_KEY_FILE=... node scripts/restore.mjs backup.pg.aes restore_unique_name",
  );
const recoveryKey = await readFile(process.env.BACKUP_KEY_FILE);
if (recoveryKey.byteLength < 32)
  throw new Error("Recovery key must contain at least 32 random bytes.");
const key = createHash("sha256").update(recoveryKey).digest();
const file = await open(path, "r"),
  header = Buffer.alloc(16),
  tag = Buffer.alloc(16);
let size;
try {
  size = (await file.stat()).size;
  if (size < 33) throw new Error("Invalid backup");
  await file.read(header, 0, 16, 0);
  await file.read(tag, 0, 16, size - 16);
} finally {
  await file.close();
}
if (header.subarray(0, 4).toString() !== "IPB1")
  throw new Error("Invalid backup");
const directory = await mkdtemp(join(tmpdir(), "insurance-restore-")),
  plaintext = join(directory, "database.dump");
const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(4));
decipher.setAuthTag(tag);
const args = [
  "compose",
  "-p",
  process.env.COMPOSE_PROJECT_NAME ?? "insurance-platform",
  "exec",
  "-T",
  "postgres",
];
async function command(tail, input) {
  const child = spawn("docker", [...args, ...tail], {
    stdio: ["pipe", "inherit", "inherit"],
  });
  const exited = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Restore command failed")),
    );
  });
  if (input) {
    await Promise.all([pipeline(input, child.stdin), exited]);
  } else {
    child.stdin.end();
    await exited;
  }
}
try {
  await pipeline(
    createReadStream(path, { start: 16, end: size - 17 }),
    decipher,
    createWriteStream(plaintext, { mode: 0o600 }),
  );
  await command(["createdb", "-U", "postgres", target]);
  await command(
    ["pg_restore", "-U", "postgres", "--exit-on-error", "-d", target],
    createReadStream(plaintext),
  );
  console.log(
    "Authenticated backup restored into NEW database " + target + ".",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
