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
