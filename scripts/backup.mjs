import { spawn } from "node:child_process";
import { createCipheriv, randomBytes, createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
// Store the key separately from backups (secret manager/offline recovery key).
if (!process.env.BACKUP_KEY_FILE)
  throw new Error(
    "Set BACKUP_KEY_FILE to an externally stored random recovery key.",
  );
const recoveryKey = await readFile(process.env.BACKUP_KEY_FILE);
if (recoveryKey.byteLength < 32)
  throw new Error("Recovery key must contain at least 32 random bytes.");
const key = createHash("sha256").update(recoveryKey).digest(),
  iv = randomBytes(12),
  cipher = createCipheriv("aes-256-gcm", key, iv);
await mkdir(".local/backups", { recursive: true, mode: 0o700 });
const path =
  ".local/backups/" + new Date().toISOString().replaceAll(":", "-") + ".pg.aes";
const out = createWriteStream(path, { mode: 0o600 });
out.write(Buffer.concat([Buffer.from("IPB1"), iv]));
const child = spawn(
  "docker",
  [
    "compose",
    "-p",
    process.env.COMPOSE_PROJECT_NAME ?? "insurance-platform",
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "insurance",
    "-Fc",
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);
const exited = new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0 ? resolve(undefined) : reject(new Error("pg_dump failed")),
  );
});
try {
  await Promise.all([pipeline(child.stdout, cipher, out), exited]);
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, cipher.getAuthTag());
  console.log("Encrypted backup written: " + path);
} catch (e) {
  child.kill("SIGTERM");
  const { unlink } = await import("node:fs/promises");
  await unlink(path).catch(() => {});
  throw e;
}
