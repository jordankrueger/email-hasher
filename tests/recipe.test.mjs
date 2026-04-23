import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipeString } from '../src/recipe.mjs';

test('recipeString: SHA-256 lowercase no HMAC', () => {
  assert.equal(
    recipeString({ algorithm: 'SHA-256', case: 'lower', hmac: false }),
    'SHA-256, lowercase, whitespace trimmed, no HMAC'
  );
});

test('recipeString: HMAC hides algorithm selection', () => {
  assert.equal(
    recipeString({ algorithm: 'SHA-256', case: 'lower', hmac: true }),
    'HMAC-SHA-256, lowercase, whitespace trimmed, with shared passphrase'
  );
});

test('recipeString: uppercase SHA-1', () => {
  assert.equal(
    recipeString({ algorithm: 'SHA-1', case: 'upper', hmac: false }),
    'SHA-1, uppercase, whitespace trimmed, no HMAC'
  );
});
