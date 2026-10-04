import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rate,
  money,
  assertBalanced,
  claimPayable,
  fourEyes,
  transition,
  roundRatio,
} from "../packages/domain/src/insurance.js";
import { rateConfigured, sandboxRules } from "../packages/domain/src/rating.js";
import { publicAddress } from "../packages/runtime/src/network.js";
import { initializeStorage } from "../packages/runtime/src/initialize-storage.js";
import { validateDatabaseURL } from "../packages/runtime/src/config.js";
import {
  assertFreshSignatures,
  checkScanner,
} from "../packages/runtime/src/scanner.js";
import { createServer } from "node:net";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketVersioningCommand,
} from "@aws-sdk/client-s3";
import {
  passwordHash,
  verifyPassword,
  totp,
} from "../packages/runtime/src/crypto.js";
test("money is exact above JS safe integer and rejects imprecise input", () => {
  assert.equal(money("999999999999999999"), 999999999999999999n);
  for (const value of ["1.2", "-1", "NaN", "1e3"])
    assert.throws(() => money(value));
  assert.equal(roundRatio(125n, 1n, 10n), 13n);
});
test("rating is reproducible and refers applicants over70", () => {
  const input = {
    basePremiumMinor: "18000",
    age: 35,
    assetValueMinor: "2500000",
    coverages: [
      {
        code: "P",
        name: "Property",
        limitMinor: "10000000",
        deductibleMinor: "10000",
        premiumMinor: "0",
      },
    ],
  };
  assert.equal(rate(input).totalMinor, "19940");
  assert.deepEqual(rate(input), rate(input));
  assert.equal(rate({ ...input, age: 71 }).referred, true);
  assert.equal(rate({ ...input, age: 20 }).totalMinor, "24800");
});
test("journals balance exactly and reject a one-unit discrepancy", () => {
  for (let i = 1n; i < 100n; i++) {
    assertBalanced([
      { account: "a", side: "DEBIT", amountMinor: i.toString() },
      { account: "b", side: "CREDIT", amountMinor: i.toString() },
    ]);
    assert.throws(() =>
      assertBalanced([
        { account: "a", side: "DEBIT", amountMinor: i.toString() },
        { account: "b", side: "CREDIT", amountMinor: (i + 1n).toString() },
      ]),
    );
  }
});
test("claims apply deductible and shared remaining policy limit", () => {
  assert.equal(claimPayable("50000", "100000", "10000", "70000"), "30000");
  assert.equal(claimPayable("5000", "100000", "10000", "0"), "0");
  assert.throws(() => fourEyes("same", "same"));
  assert.throws(() => transition("PAID", ["APPROVED"], "PAYMENT_PENDING"));
});
test("versioned jurisdiction rating configuration is reproducible and validates factor partitions", () => {
  const input = {
    basePremiumMinor: "18000",
    age: 35,
    assetValueMinor: "2500000",
    coverages: [],
  };
  assert.equal(rateConfigured(input, sandboxRules).totalMinor, "19940");
  assert.equal(
    rateConfigured(input, { ...sandboxRules, taxBps: 0, feeMinor: "0" })
      .totalMinor,
    "18000",
  );
  assert.throws(() =>
    rateConfigured(input, {
      ...sandboxRules,
      ageFactors: [...sandboxRules.ageFactors, ...sandboxRules.ageFactors],
    }),
  );
  assert.throws(() =>
    rateConfigured(input, sandboxRules, new Date("2110-01-01")),
  );
});
test("rating rejects amounts that overflow the monetary boundary", () => {
  assert.throws(() =>
    rateConfigured(
      {
        basePremiumMinor: "999999999999999999",
        age: 20,
        assetValueMinor: "1",
        coverages: [],
      },
      sandboxRules,
    ),
  );
});
test("outbound destinations reject private, mapped, documentation and special-use addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.100.100.200",
    "198.18.0.1",
    "192.0.2.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "garbage",
  ])
    assert.equal(publicAddress(address), false, address);
  for (const address of [
    "8.8.8.8",
    "1.1.1.1",
    "192.5.5.241",
    "2606:4700:4700::1111",
  ])
    assert.equal(publicAddress(address), true, address);
});
test("password verification is asynchronous and TOTP matches the published test vector", async () => {
  const hash = passwordHash("test-only-password");
  assert.equal(await verifyPassword("test-only-password", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000), "287082");
});
test("bucket initialization distinguishes missing storage from denied access and transport failures", async () => {
  for (const error of [
    { $metadata: { httpStatusCode: 403 } },
    { code: "ECONNREFUSED" },
  ]) {
    let creates = 0;
    const client = {
      send: async (command: unknown) => {
        if (command instanceof CreateBucketCommand) creates++;
        throw error;
      },
    } as unknown as Pick<S3Client, "send">;
    await assert.rejects(() => initializeStorage(client, "private", 0));
    assert.equal(creates, 0);
  }
  const calls: string[] = [];
  const client = {
    send: async (command: unknown) => {
      calls.push((command as object).constructor.name);
      if (command instanceof HeadBucketCommand)
        throw { $metadata: { httpStatusCode: 404 } };
      if (command instanceof GetBucketVersioningCommand)
        return { Status: "Enabled" };
      return {};
    },
  } as unknown as Pick<S3Client, "send">;
  await initializeStorage(client, "private");
  assert.deepEqual(calls, [
    "HeadBucketCommand",
    "CreateBucketCommand",
    "PutBucketVersioningCommand",
    "GetBucketVersioningCommand",
  ]);
});
test("production database URLs require certificate and hostname verification for runtime and operator jobs", () => {
  for (const mode of ["disable", "allow", "prefer", "require", "verify-ca"]) {
    assert.throws(() =>
      validateDatabaseURL(
        "postgresql://db.example.test/app?sslmode=" + mode,
        "Database",
        true,
      ),
    );
  }
  const verified = "postgresql://db.example.test/app?sslmode=verify-full";
  assert.equal(validateDatabaseURL(verified, "Database", true), verified);
  assert.throws(() =>
    validateDatabaseURL(
      "https://db.example.test/app?sslmode=verify-full",
      "Database",
      true,
    ),
  );
});
test("production scanner freshness rejects stale, malformed, future or unbounded signature ages", () => {
  const now = Date.parse("2026-10-04T13:00:00Z");
  assert.doesNotThrow(() =>
    assertFreshSignatures(
      "ClamAV 1.5.4/28140/Sun Oct 4 12:00:00 2026",
      72,
      now,
    ),
  );
  for (const value of [
    "PONG",
    "ClamAV 1.5.4/28137/Mon Sep 28 06:24:12 2026",
    "ClamAV 1.5.4/28140/Mon Oct 5 13:00:00 2026",
    "ClamAV 1.5.4/28140/invalid date",
  ])
    assert.throws(() => assertFreshSignatures(value, 72, now));
  for (const age of [0, -1, 169, Infinity, NaN, 1.5])
    assert.throws(() =>
      assertFreshSignatures(
        "ClamAV 1.5.4/28140/Sun Oct 4 12:00:00 2026",
        age,
        now,
      ),
    );
});
test("scanner probe accepts framed responses and bounds malformed or stalled connections", async () => {
  for (const response of ["PONG\0", "PONG unexpected\0", null]) {
    const server = createServer((socket) => {
      socket.on("error", () => {});
      socket.once("data", () => {
        if (response !== null) socket.end(response);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
      const probe = checkScanner({
        host: "127.0.0.1",
        port: address.port,
        timeoutMs: 100,
      });
      if (response === "PONG\0") await probe;
      else await assert.rejects(probe);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
});
