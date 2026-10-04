// Construct a minimal runtime from the pinned official Node image. Keep the
// actual Debian package metadata and licences so scanners can audit its libraries.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  chownSync,
} from "node:fs";
import { dirname } from "node:path";
import { rootCertificates } from "node:tls";

const root = "/runtime";
function copy(path) {
  mkdirSync(root + dirname(path), { recursive: true });
  cpSync(path, root + path, { recursive: true, dereference: true });
}
const packages = new Set(["base-files", "gcc-12-base"]);
const libraries = new Set();
function inspect(path) {
  const result = execFileSync("ldd", [path], { encoding: "utf8" });
  if (result.includes("not found"))
    throw new Error("Unresolved runtime dependency: " + path);
  for (const match of result.matchAll(/(?:=>\s*)?(\/[^\s(]+)/g))
    libraries.add(match[1]);
}
inspect("/usr/local/bin/node");
// libc supplies resolver/NSS libraries loaded dynamically by Node and sharp.
for (const path of execFileSync("dpkg-query", ["-L", "libc6"], {
  encoding: "utf8",
}).split("\n")) {
  if (/\.so(?:\.[\d.]+)?$/.test(path) && existsSync(path)) libraries.add(path);
}
for (const path of [...libraries]) inspect(path);
for (const path of libraries) {
  copy(path);
  let ownership;
  try {
    ownership = execFileSync("dpkg-query", ["-S", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    ownership = execFileSync(
      "dpkg-query",
      ["-S", path.replace(/^\/lib\//, "/usr/lib/")],
      { encoding: "utf8" },
    );
  }
  const owner = ownership.split(": ")[0].split(":")[0];
  packages.add(owner);
}
copy("/usr/local/bin/node");
for (const path of ["/etc/os-release", "/etc/debian_version"]) copy(path);
mkdirSync(root + "/etc/ssl/certs", { recursive: true });
writeFileSync(
  root + "/etc/ssl/certs/ca-certificates.crt",
  rootCertificates.join("\n") + "\n",
);
for (const name of packages) {
  const path = "/usr/share/doc/" + name;
  if (existsSync(path)) copy(path);
}
mkdirSync(root + "/var/lib/dpkg", { recursive: true });
const status =
  readFileSync("/var/lib/dpkg/status", "utf8")
    .split("\n\n")
    .filter((block) => packages.has(block.match(/^Package: (.+)$/m)?.[1]))
    .join("\n\n") + "\n";
writeFileSync(root + "/var/lib/dpkg/status", status);
writeFileSync(
  root + "/etc/passwd",
  "nonroot:x:65532:65532:Runtime:/home/nonroot:/sbin/nologin\n",
);
writeFileSync(root + "/etc/group", "nonroot:x:65532:\n");
writeFileSync(
  root + "/etc/nsswitch.conf",
  "hosts: files dns\npasswd: files\ngroup: files\n",
);
mkdirSync(root + "/home/nonroot", { recursive: true });
chownSync(root + "/home/nonroot", 65532, 65532);
mkdirSync(root + "/tmp", { recursive: true });
chmodSync(root + "/tmp", 0o1777);
console.log("Minimal runtime packages: " + [...packages].sort().join(", "));
