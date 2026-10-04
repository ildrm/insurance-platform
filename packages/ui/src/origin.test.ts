import test from 'node:test';
import assert from 'node:assert/strict';
import { validWriteOrigin } from './origin.ts';

test('configured public HTTPS origin works through an internal HTTP ingress connection', () => {
  const headers = new Headers({ host: 'cover.example.test', origin: 'https://cover.example.test', 'x-forwarded-proto': 'https' });
  assert.equal(validWriteOrigin(headers, 'https://cover.example.test'), true);
  headers.set('x-forwarded-proto', 'http');
  assert.equal(validWriteOrigin(headers, 'https://cover.example.test'), true);
});
test('direct HTTP listeners reject spoofed forwarded protocol and host', () => {
  const headers = new Headers({ host: '127.0.0.1:3100', origin: 'https://127.0.0.1:3100', 'x-forwarded-proto': 'https' });
  assert.equal(validWriteOrigin(headers), false);
  headers.set('origin', 'http://127.0.0.1:3100');
  assert.equal(validWriteOrigin(headers), true);
  headers.set('host', 'untrusted.example');
  headers.set('origin', 'https://cover.example.test');
  headers.set('x-forwarded-host', 'cover.example.test');
  assert.equal(validWriteOrigin(headers, 'https://cover.example.test'), false);
});
test('strict public origin rejects changed scheme, opaque origins and origin paths', () => {
  for (const origin of ['http://cover.example.test', 'null', 'https://cover.example.test/path', 'https://other.example']) {
    assert.equal(validWriteOrigin(new Headers({ host: 'cover.example.test', origin }), 'https://cover.example.test'), false);
  }
  assert.equal(validWriteOrigin(new Headers({ host: 'cover.example.test:443', origin: 'https://cover.example.test' }), 'https://cover.example.test'), true);
});
test('same-origin fetch metadata fallback still validates the configured host', () => {
  assert.equal(validWriteOrigin(new Headers({ host: 'cover.example.test', 'sec-fetch-site': 'same-origin' }), 'https://cover.example.test'), true);
  assert.equal(validWriteOrigin(new Headers({ host: 'wrong.example', 'sec-fetch-site': 'same-origin' }), 'https://cover.example.test'), false);
  assert.equal(validWriteOrigin(new Headers({ host: 'cover.example.test', 'sec-fetch-site': 'cross-site' }), 'https://cover.example.test'), false);
  assert.equal(validWriteOrigin(new Headers({ host: 'cover.example.test', origin: 'https://cover.example.test' }), 'https://cover.example.test/path'), false);
});
