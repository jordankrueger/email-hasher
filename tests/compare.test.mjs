import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersection, difference } from '../src/compare.mjs';

test('intersection: basic', () => {
  assert.deepEqual([...intersection(['a', 'b', 'c'], ['b', 'c', 'd'])], ['b', 'c']);
});

test('difference: basic', () => {
  assert.deepEqual([...difference(['a', 'b', 'c'], ['b', 'c', 'd'])], ['a']);
});

test('intersection: handles duplicates in inputs', () => {
  assert.deepEqual([...intersection(['a', 'a', 'b'], ['b', 'b'])], ['b']);
});

test('difference: empty result when A is subset of B', () => {
  assert.deepEqual([...difference(['a', 'b'], ['a', 'b', 'c'])], []);
});

test('intersection: empty when no overlap', () => {
  assert.deepEqual([...intersection(['x'], ['y'])], []);
});
