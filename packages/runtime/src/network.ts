import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) return !blocked.check(ip, "ipv4");
  return (
    isIP(ip) === 6 && globalV6.check(ip, "ipv6") && !blocked.check(ip, "ipv6")
  );
}

// Resolve once, reject mixed public/private records, and pin that result through TLS.
// One deadline covers DNS, connection, headers and the complete response body.
export async function requestPublic(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body?: string,
  timeoutMs = 20000,
): Promise<{ status: number; body: Buffer }> {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Invalid public HTTPS destination");
  const signal = AbortSignal.timeout(timeoutMs);
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(new Error("DNS deadline exceeded"));
    signal.addEventListener("abort", abort, { once: true });
    lookup(url.hostname, { all: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
  if (
    !Array.isArray(addresses) ||
    !addresses.length ||
    addresses.some((a) => !publicAddress(a.address))
  )
    throw new Error("Nonpublic destination");
  const address = addresses[0]!;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        headers,
        signal,
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 65536) {
            req.destroy(new Error("Response exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 500,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
