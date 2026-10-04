import test from 'node:test';
import assert from 'node:assert/strict';
import { currencyDigits, parseMoney, formatMoney } from './money.ts';

test('amount input and display follow zero, two, three and four currency decimals', () => {
  for (const [currency, digits, input, minor, output] of [
    ['JPY', 0, '1234', '1234', '1,234 JPY'],
    ['USD', 2, '1234.56', '123456', '1,234.56 USD'],
    ['KWD', 3, '1234.567', '1234567', '1,234.567 KWD'],
    ['CLF', 4, '12.3456', '123456', '12.3456 CLF'],
  ] as const) {
    assert.equal(currencyDigits(currency), digits);
    assert.equal(parseMoney(input, currency), minor);
    assert.equal(formatMoney(minor, currency), output);
  }
});
test('amounts above JavaScript integer precision survive input and display exactly', () => {
  const amount = '9007199254740993';
  assert.equal(parseMoney('90071992547409.93', 'USD'), amount);
  assert.equal(formatMoney(amount, 'USD'), '90,071,992,547,409.93 USD');
  assert.equal(formatMoney('-1234567', 'KWD'), '−1,234.567 KWD');
});
test('unrepresentable precision is rejected rather than rounded', () => {
  assert.throws(() => parseMoney('1.01', 'JPY'), /cannot be represented exactly/);
  assert.throws(() => parseMoney('0.001', 'USD'), /cannot be represented exactly/);
  assert.throws(() => parseMoney('0.0001', 'KWD'), /cannot be represented exactly/);
  assert.equal(parseMoney('1.0000', 'USD'), '100');
  assert.equal(parseMoney('0001.50', 'USD'), '150');
});
test('input refuses ambiguous grouping, negatives, scientific notation and absent currency', () => {
  for (const value of ['1,000.00', '1,50', '-1', '1e6', 'NaN', '']) assert.throws(() => parseMoney(value, 'USD'));
  assert.throws(() => parseMoney('1', undefined), /currency/);
  assert.throws(() => parseMoney('10000000000000000', 'USD'), /too large/);
  assert.equal(formatMoney(undefined, 'USD'), '—');
});
