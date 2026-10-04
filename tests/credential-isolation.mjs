import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const code = `
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {pool,systemPool} from './dist/packages/runtime/src/database.js';
try {
  for (const file of readdirSync('/run/secrets')) {
    assert(!/worker.*database|migration|(?:app|worker)[-_]db[-_]password/.test(file), 'Privileged credential mounted in API');
  }
  for (const connection of [pool,systemPool]) {
    assert.equal((await connection.query('SELECT current_user AS role')).rows[0].role, 'insurance_app');
  }
  await assert.rejects(() => systemPool.query('SELECT * FROM platform.pending_operations()'), error => error.code === '42501');
  console.log('PASS API credential mounts and both connection pools cannot use worker or migration privileges.');
} finally {
  await pool.end(); await systemPool.end();
}
`;
const result = spawnSync(
  "docker",
  [
    "compose",
    "-p",
    process.env.COMPOSE_PROJECT_NAME ?? "insurance-platform",
    "exec",
    "-T",
    "api",
    "node",
    "--input-type=module",
    "-e",
    code,
  ],
  { encoding: "utf8" },
);
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr);
console.log(result.stdout.trim());
