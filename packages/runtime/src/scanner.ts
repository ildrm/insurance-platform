import { createConnection } from "node:net";

export function assertFreshSignatures(
  version: string,
  maxAgeHours: number,
  now = Date.now(),
): void {
  if (!Number.isInteger(maxAgeHours) || maxAgeHours < 1 || maxAgeHours > 168)
    throw new Error("Scanner signature age must be between 1 and 168 hours.");
  const match =
    /^ClamAV [^/\r\n\0]+\/\d+\/([A-Za-z]{3} [A-Za-z]{3} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4})$/.exec(
      version,
    );
  // Managed scanners must use UTC because VERSION returns a timezone-free date.
  const updatedAt = match ? Date.parse(match[1] + " UTC") : NaN;
  if (!Number.isFinite(updatedAt) || updatedAt > now + 3600000)
    throw new Error("Scanner signature date is invalid.");
  if (now - updatedAt > maxAgeHours * 3600000)
    throw new Error("Scanner signatures are stale.");
}

export function checkScanner(options: {
  host: string;
  port?: number;
  maxAgeHours?: number;
  timeoutMs?: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let response = "";
    const socket = createConnection({
      host: options.host,
      port: options.port ?? 3310,
    });
    const deadline = setTimeout(
      () => finish(new Error("Scanner readiness timeout")),
      options.timeoutMs ?? 1500,
    );
    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    }
    function validate() {
      try {
        const value = response.replace(/\0$/, "").trim();
        if (options.maxAgeHours !== undefined)
          assertFreshSignatures(value, options.maxAgeHours);
        else if (value !== "PONG") throw new Error("Invalid scanner response");
        finish();
      } catch (error) {
        finish(
          error instanceof Error ? error : new Error("Scanner unavailable"),
        );
      }
    }
    socket.once("error", finish);
    socket.once("connect", () =>
      socket.write(
        options.maxAgeHours === undefined ? "zPING\0" : "zVERSION\0",
      ),
    );
    socket.on("data", (bytes) => {
      response += bytes.toString();
      if (response.length > 512)
        finish(new Error("Oversized scanner response"));
      else if (response.includes("\0")) validate();
    });
    socket.once("end", validate);
    socket.once("close", () => finish(new Error("Scanner unavailable")));
  });
}
