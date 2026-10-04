import {
  randomBytes,
  createHash,
  scryptSync,
  scrypt,
  timingSafeEqual,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { config } from "./config.js";
export function passwordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const master = () =>
  createHash("sha256").update(config("ENCRYPTION_KEY")).digest();
export function encrypt(value: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", master(), iv);
  return [
    iv.toString("hex"),
    Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString(
      "hex",
    ),
    cipher.getAuthTag().toString("hex"),
  ].join(":");
}
export function decrypt(value: string): string {
  const [iv, body, tag] = value.split(":");
  if (!iv || !body || !tag) throw new Error("Invalid encrypted value");
  const d = createDecipheriv("aes-256-gcm", master(), Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    d.update(Buffer.from(body, "hex")),
    d.final(),
  ]).toString("utf8");
}
export function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, "")) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Invalid TOTP secret");
    bits += n.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
      (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
    ),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const offset = h[h.length - 1]! & 15;
  return ((h.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
