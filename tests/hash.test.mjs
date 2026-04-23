import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashEmail, hmacEmail } from '../src/hash.mjs';

const EMAIL = 'alice@example.com';

test('hashEmail: SHA-256 lowercase matches OpenSSL', async () => {
  const hex = await hashEmail(EMAIL, { algorithm: 'SHA-256', case: 'lower' });
  assert.equal(hex, 'ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976');
});

test('hashEmail: SHA-1 lowercase matches OpenSSL', async () => {
  const hex = await hashEmail(EMAIL, { algorithm: 'SHA-1', case: 'lower' });
  assert.equal(hex, 'fc2398a73dd54d6237c4fdb58fd7d75347cf5af3');
});

test('hashEmail: SHA-384 lowercase matches OpenSSL', async () => {
  const hex = await hashEmail(EMAIL, { algorithm: 'SHA-384', case: 'lower' });
  assert.equal(hex, '77f37e55b7e57956ce06c73273937625b8f108a047cda5e5f141951f99ce8b87c4b14e1794515f6ad1d5d78617cd4320');
});

test('hashEmail: SHA-512 lowercase matches OpenSSL', async () => {
  const hex = await hashEmail(EMAIL, { algorithm: 'SHA-512', case: 'lower' });
  assert.equal(hex, '284475ccd5b97d7c67438ebead74e5e234be891dbc2cea85a3db97b00799e3ec7ce9a5cbd94dcf5f0ea332c5dbfbe3937ec0b020561ac465e18233e93c951941');
});

test('hashEmail: case normalization lowercases mixed input', async () => {
  const mixed = await hashEmail('Alice@Example.Com', { algorithm: 'SHA-256', case: 'lower' });
  const expected = await hashEmail('alice@example.com', { algorithm: 'SHA-256', case: 'lower' });
  assert.equal(mixed, expected);
});

test('hashEmail: whitespace trimming', async () => {
  const padded = await hashEmail('  alice@example.com  ', { algorithm: 'SHA-256', case: 'lower' });
  const bare = await hashEmail('alice@example.com', { algorithm: 'SHA-256', case: 'lower' });
  assert.equal(padded, bare);
});

test('hmacEmail: HMAC-SHA-256 with key matches OpenSSL', async () => {
  const hex = await hmacEmail(EMAIL, 'listswap', { case: 'lower' });
  assert.equal(hex, '2267672e7ec7f38ab5ac0fb916efc55eb935444b5e93bf7bd3c969e221e6b8c7');
});

test('hashEmail: rejects unsupported algorithm', async () => {
  await assert.rejects(() => hashEmail('x', { algorithm: 'MD5', case: 'lower' }), /unsupported/i);
});

test('hmacEmail: requires passphrase', async () => {
  await assert.rejects(() => hmacEmail('x', '', { case: 'lower' }), /passphrase/i);
});
