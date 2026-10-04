import { config, production } from "./config.js";
export function temporalOptions() {
  return {
    address: config("TEMPORAL_ADDRESS", "temporal:7233"),
    ...(production
      ? {
          tls: {
            serverRootCACertificate: Buffer.from(config("TEMPORAL_CA")),
            clientCertPair: {
              crt: Buffer.from(config("TEMPORAL_CLIENT_CERT")),
              key: Buffer.from(config("TEMPORAL_CLIENT_KEY")),
            },
          },
        }
      : {}),
  };
}
