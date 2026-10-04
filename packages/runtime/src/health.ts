import { createServer } from "node:http";
import { config } from "./config.js";
export function health(check: () => Promise<unknown>) {
  const s = createServer(async (req, res) => {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      if (req.url !== "/health/ready") {
        res.writeHead(404).end();
        return;
      }
      await Promise.race([
        check(),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Readiness check timed out")),
            2000,
          );
        }),
      ]);
      res
        .writeHead(200, { "content-type": "application/json" })
        .end('{"status":"ready"}');
    } catch {
      res.writeHead(503).end('{"status":"unavailable"}');
    } finally {
      if (deadline) clearTimeout(deadline);
    }
  });
  s.listen(Number(config("PORT", "3000")), "0.0.0.0");
  return s;
}
