import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, stringifyCSV } from '../src/csv.mjs';

test('parseCSV: simple CSV with header', () => {
  const rows = parseCSV('email,name\na@x.com,Alice\nb@y.com,Bob\n');
  assert.deepEqual(rows.header, ['email', 'name']);
  assert.deepEqual(rows.data, [['a@x.com', 'Alice'], ['b@y.com', 'Bob']]);
});

test('parseCSV: quoted fields with commas', () => {
  const rows = parseCSV('email,note\na@x.com,"hello, world"\n');
  assert.deepEqual(rows.data, [['a@x.com', 'hello, world']]);
});

test('parseCSV: escaped quotes inside quoted fields', () => {
  const rows = parseCSV('a,b\n"she said ""hi""",2\n');
  assert.deepEqual(rows.data, [['she said "hi"', '2']]);
});

test('parseCSV: CRLF line endings', () => {
  const rows = parseCSV('email\r\na@x.com\r\nb@y.com\r\n');
  assert.deepEqual(rows.data, [['a@x.com'], ['b@y.com']]);
});

test('parseCSV: UTF-8 BOM is stripped', () => {
  const rows = parseCSV('﻿email\na@x.com\n');
  assert.deepEqual(rows.header, ['email']);
});

test('parseCSV: trailing newline produces no empty row', () => {
  const rows = parseCSV('email\na@x.com\n');
  assert.equal(rows.data.length, 1);
});

test('parseCSV: empty input throws', () => {
  assert.throws(() => parseCSV(''), /empty/i);
});

test('parseCSV: no header row throws', () => {
  assert.throws(() => parseCSV('\n'), /header/i);
});

test('stringifyCSV: quotes values containing commas', () => {
  const out = stringifyCSV(['email', 'note'], [['a@x.com', 'hi, there']]);
  assert.equal(out, 'email,note\na@x.com,"hi, there"\n');
});

test('stringifyCSV: escapes quotes in values', () => {
  const out = stringifyCSV(['a'], [['"wow"']]);
  assert.equal(out, 'a\n"""wow"""\n');
});

test('stringifyCSV: supports optional leading comment lines', () => {
  const out = stringifyCSV(['email'], [['a@x.com']], { comments: ['recipe: SHA-256'] });
  assert.equal(out, '# recipe: SHA-256\nemail\na@x.com\n');
});

test('parseCSV: skips leading # comment lines before header', () => {
  const rows = parseCSV('# recipe: SHA-256, lowercase, whitespace trimmed, no HMAC\nemail,name\na@x.com,Alice\n');
  assert.deepEqual(rows.header, ['email', 'name']);
  assert.deepEqual(rows.data, [['a@x.com', 'Alice']]);
});

test('parseCSV: skips multiple leading comment lines', () => {
  const rows = parseCSV('# recipe: SHA-256\n# generated: 2026-04-23\nemail\na@x.com\n');
  assert.deepEqual(rows.header, ['email']);
  assert.deepEqual(rows.data, [['a@x.com']]);
});

test('parseCSV: does not skip # in the middle of the file', () => {
  // Once past the leading comments, a # is just a normal field character.
  const rows = parseCSV('email,note\na@x.com,#hashtag\n');
  assert.deepEqual(rows.data, [['a@x.com', '#hashtag']]);
});

test('parseCSV: round-trips stringifyCSV output with comments', () => {
  const original = stringifyCSV(['email'], [['a@x.com'], ['b@y.com']], { comments: ['recipe: SHA-256, lowercase, whitespace trimmed, no HMAC'] });
  const { header, data } = parseCSV(original);
  assert.deepEqual(header, ['email']);
  assert.deepEqual(data, [['a@x.com'], ['b@y.com']]);
});

test('parseCSV: mid-field quote is treated as literal, not field-opening', () => {
  // Only quotes at the start of a field open a quoted region (RFC 4180).
  const rows = parseCSV('a,b\nabc"def,2\n');
  assert.deepEqual(rows.data, [['abc"def', '2']]);
});
