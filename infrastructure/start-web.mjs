const portals = new Set([
  "customer-web",
  "partner-web",
  "admin-web",
  "developer-web",
]);
if (!portals.has(process.env.WEB_APP)) throw new Error("Unknown portal");
await import(`../apps/${process.env.WEB_APP}/server.js`);
