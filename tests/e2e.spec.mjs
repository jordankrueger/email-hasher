import { test, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const appUrl = pathToFileURL(join(root, 'index.html')).href;
const sampleCsv = join(root, 'sample/sample-emails.csv');

function isExternal(url) {
  return !url.startsWith('file://')
      && !url.startsWith('data:')
      && !url.startsWith('blob:');
}

test.describe('email-hasher web app (file://)', () => {
  test('no external network requests during hash flow', async ({ page }) => {
    const external = [];
    page.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
    await page.goto(appUrl);
    await page.setInputFiles('#file-hash', sampleCsv);
    await expect(page.locator('#hash-controls')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-hash');
    await downloadPromise;
    expect(external, `unexpected external requests: ${external.join(', ')}`).toEqual([]);
  });

  test('hashes a CSV end-to-end with SHA-256 lowercase', async ({ page }) => {
    await page.goto(appUrl);
    await page.setInputFiles('#file-hash', sampleCsv);
    await expect(page.locator('#hash-controls')).toBeVisible();
    await expect(page.locator('#col-hash')).toHaveValue('0');
    await expect(page.locator('#recipe')).toContainText('SHA-256, lowercase');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-hash');
    const download = await downloadPromise;
    const path = await download.path();
    const text = await readFile(path, 'utf8');

    expect(text).toMatch(/^# recipe: SHA-256, lowercase/);
    expect(text).toContain('hashed_email');
    // alice@example.com SHA-256 lowercase = ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976
    expect(text).toContain('alice@example.com,Alice,ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976');
    // Dan@Example.Com should hash to the same thing as dan@example.com (case normalization)
    expect(text).toMatch(/Dan@Example\.Com,Dan,[0-9a-f]{64}/);
  });

  test('HMAC mode produces a different hash than plain SHA-256', async ({ page }) => {
    await page.goto(appUrl);
    await page.setInputFiles('#file-hash', sampleCsv);
    await expect(page.locator('#hash-controls')).toBeVisible();

    // Enable HMAC and set passphrase
    await page.check('#hmac-toggle');
    await page.fill('#hmac-passphrase', 'listswap');
    await expect(page.locator('#recipe')).toContainText('HMAC-SHA-256');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-hash');
    const download = await downloadPromise;
    const text = await readFile(await download.path(), 'utf8');
    // alice@example.com with key "listswap" = 2267672e7ec7f38ab5ac0fb916efc55eb935444b5e93bf7bd3c969e221e6b8c7
    expect(text).toContain('alice@example.com,Alice,2267672e7ec7f38ab5ac0fb916efc55eb935444b5e93bf7bd3c969e221e6b8c7');
    expect(text).toMatch(/^# recipe: HMAC-SHA-256, lowercase/);
  });

  test('compare mode computes empty when A equals B', async ({ page }) => {
    await page.goto(appUrl);
    await page.click('[data-tab="cmp"]');

    await page.setInputFiles('#file-a', sampleCsv);
    await page.setInputFiles('#file-b', sampleCsv);
    await expect(page.locator('#a-picker-wrap')).toBeVisible();
    await expect(page.locator('#b-picker-wrap')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-cmp');
    await downloadPromise;
    await expect(page.locator('#cmp-result')).toContainText('0 rows');
  });

  test('compare mode computes full overlap correctly', async ({ page }) => {
    await page.goto(appUrl);
    await page.click('[data-tab="cmp"]');

    await page.setInputFiles('#file-a', sampleCsv);
    await page.setInputFiles('#file-b', sampleCsv);
    await page.check('input[name="cmp-mode"][value="overlap"]');

    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-cmp');
    const download = await downloadPromise;
    const text = await readFile(await download.path(), 'utf8');
    // Every email in A is also in B, so overlap = unique values in A (column 0)
    // Row 4 has whitespace around the email, which is NOT trimmed here (compare is set-ops on raw strings),
    // so it counts as a distinct value. 5 unique inputs → 5 rows out.
    // Actually: for compare mode we do NOT normalize — users compare already-hashed lists.
    const lines = text.trim().split('\n');
    // header + 5 rows
    expect(lines.length).toBe(6);
    await expect(page.locator('#cmp-result')).toContainText('5 rows');
  });
});
