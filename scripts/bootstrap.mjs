import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
await mkdir(".local", { recursive: true, mode: 0o700 });
const secret = async (name) => {
  const path = ".local/" + name;
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    const value = randomBytes(32).toString("hex");
    await writeFile(path, value + "\n", { mode: 0o644 });
    return value;
  }
};
const admin = await secret("db-password"),
  app = await secret("app-db-password"),
  worker = await secret("worker-db-password"),
  s3 = await secret("s3-secret"),
  encryption = await secret("encryption-key"),
  provider = await secret("provider-secret"),
  nats = await secret("nats-token"),
  demo = await secret("demo-password");
for (const [name, value] of Object.entries({
  "database-url": `postgresql://insurance_app:${app}@postgres:5432/insurance`,
  "worker-database-url": `postgresql://insurance_worker:${worker}@postgres:5432/insurance`,
  "migration-database-url": `postgresql://postgres:${admin}@postgres:5432/insurance`,
  "s3-access-key": "insurance-local",
}))
  await writeFile(".local/" + name, value + "\n", { mode: 0o644 });
await writeFile(".local/temporal.env", `POSTGRES_PWD=${admin}\n`, {
  mode: 0o644,
});
await writeFile(
  ".local/storage.env",
  `AWS_ACCESS_KEY_ID=insurance-local\nAWS_SECRET_ACCESS_KEY=${s3}\nS3_BUCKET=insurance-private\n`,
  { mode: 0o644 },
);
await writeFile(
  ".local/nats.conf",
  `jetstream { store_dir: "/data" }\nauthorization { token: "${nats}" }\n`,
  { mode: 0o644 },
);
for (const name of [
  "db-password",
  "app-db-password",
  "worker-db-password",
  "demo-password",
  "database-url",
  "worker-database-url",
  "migration-database-url",
  "encryption-key",
  "s3-access-key",
  "s3-secret",
  "nats-token",
  "provider-secret",
  "nats.conf",
])
  await chmod(".local/" + name, 0o644);
console.log(
  "Local secrets created/reused. Password: .local/demo-password (never committed).",
);
