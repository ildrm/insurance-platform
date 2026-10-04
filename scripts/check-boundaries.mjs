import { readdir, readFile } from "node:fs/promises";
async function walk(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(async (e) =>
        e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
      ),
    )
  ).flat();
}
for (const file of await walk("packages/domain/src")) {
  const source = await readFile(file, "utf8");
  if (/from ['"](?:@nestjs|pg|next|react|\.\.\/\.\.\/runtime)/.test(source))
    throw new Error("Domain boundary violation: " + file);
}
for (const file of await walk("packages/ui/src")) {
  if (!file.endsWith(".tsx")) continue;
  const source = await readFile(file, "utf8");
  if (
    /localStorage\.(?:setItem|getItem)\(['"](?:token|session|password)/.test(
      source,
    )
  )
    throw new Error("Browser credential storage: " + file);
}
console.log("Domain and browser security boundaries passed.");
