import { readFileSync } from "node:fs";
const fileValues = new Map<string, string>();
export function config(name: string, fallback?: string): string {
  const file = process.env[`${name}_FILE`];
  const value = file
    ? (fileValues.get(file) ?? readFileSync(file, "utf8").trim())
    : (process.env[name] ?? fallback);
  if (file && value) fileValues.set(file, value);
  if (!value) throw new Error(`Required configuration ${name} is missing.`);
  return value;
}
export const production = process.env.DEPLOYMENT_MODE === "production";
export function validateDatabaseURL(
  value: string,
  name: string,
  requireTLS = production,
): string {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error(name + " must be a PostgreSQL connection URL.");
  }
  if (requireTLS && url.searchParams.get("sslmode") !== "verify-full") {
    throw new Error(name + " must require sslmode=verify-full in production.");
  }
  return value;
}
export const operatorDatabaseURL = () =>
  validateDatabaseURL(
    config("MIGRATION_DATABASE_URL"),
    "MIGRATION_DATABASE_URL",
  );
export function validateEnvironment(): void {
  if (production && config("PROVIDER_MODE", "sandbox") !== "live")
    throw new Error(
      "Production requires certified live carrier/payment adapters; sandbox is disabled.",
    );
  if (production && process.env.SEED_DEMO === "true")
    throw new Error("Demo seed is forbidden in production.");
  if (
    production &&
    !config("ALLOWED_ORIGINS")
      .split(",")
      .every((o) => {
        const u = new URL(o);
        return u.protocol === "https:" && u.origin === o;
      })
  )
    throw new Error("Production browser origins must use HTTPS.");
  if (production) {
    for (const key of ["S3_ENDPOINT"])
      if (!config(key).startsWith("https://"))
        throw new Error(key + " must use HTTPS in production.");
    if (!config("NATS_URL").startsWith("tls://"))
      throw new Error("Production NATS must use TLS.");
    for (const name of ["DATABASE_URL", "WORKER_DATABASE_URL"]) {
      validateDatabaseURL(config(name), name);
    }
    if (Buffer.byteLength(config("ENCRYPTION_KEY")) < 32)
      throw new Error("Encryption key must contain at least 32 random bytes.");
  }
}
