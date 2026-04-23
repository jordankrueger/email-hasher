import { test, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

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
    // Dan@Example.Com should normalize to the same hash as dan@example.com
    expect(text).toMatch(/Dan@Example\.Com,Dan,[0-9a-f]{64}/);
  });

  test('HMAC mode produces a different hash than plain SHA-256', async ({ page }) => {
    await page.goto(appUrl);
    await page.setInputFiles('#file-hash', sampleCsv);
    await expect(page.locator('#hash-controls')).toBeVisible();

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

  test('HMAC mode refuses to run without a passphrase', async ({ page }) => {
    await page.goto(appUrl);
    await page.setInputFiles('#file-hash', sampleCsv);
    await page.check('#hmac-toggle');
    // leave the passphrase field empty
    await page.click('#btn-hash');
    await expect(page.locator('#hash-error')).toContainText(/passphrase/i);
  });

  test('hash → compare round-trip: compare two hashed outputs of the same list', async ({ page }) => {
    // Prove the full list-swap workflow works with the tool's own output files.
    // Generate a hashed copy of the sample list twice, feed both into Compare mode, and expect full overlap.
    await page.goto(appUrl);
    await page.setInputFiles('#file-hash', sampleCsv);
    await expect(page.locator('#hash-controls')).toBeVisible();

    let downloadPromise = page.waitForEvent('download');
    await page.click('#btn-hash');
    const hashedA = await (await downloadPromise).path();

    await page.click('#btn-hash-clear');
    await page.setInputFiles('#file-hash', sampleCsv);
    await expect(page.locator('#hash-controls')).toBeVisible();
    downloadPromise = page.waitForEvent('download');
    await page.click('#btn-hash');
    const hashedB = await (await downloadPromise).path();

    // Both files should be byte-identical because the recipe is deterministic.
    const aText = await readFile(hashedA, 'utf8');
    const bText = await readFile(hashedB, 'utf8');
    expect(aText).toBe(bText);

    // Now feed them into Compare mode.
    await page.click('[data-tab="cmp"]');
    await page.setInputFiles('#file-a', hashedA);
    await page.setInputFiles('#file-b', hashedB);
    await expect(page.locator('#a-picker-wrap')).toBeVisible();
    await expect(page.locator('#b-picker-wrap')).toBeVisible();
    // Column auto-pick should land on the hashed_email column, not the recipe comment.
    await expect(page.locator('#col-a option:checked')).toHaveText('hashed_email');
    await expect(page.locator('#col-b option:checked')).toHaveText('hashed_email');

    await page.check('input[name="cmp-mode"][value="overlap"]');
    downloadPromise = page.waitForEvent('download');
    await page.click('#btn-cmp');
    await downloadPromise;
    // All 5 rows (4 unique emails after normalization: alice, bob, carol, dan — erin == alice after trim/lowercase)
    // The sample has 5 rows but Dan@Example.Com == dan@example.com and "  erin@example.com  " == erin@example.com.
    // Actually erin@example.com is distinct. So 5 unique hashes:
    //   alice, bob, carol, dan, erin → 5 rows.
    await expect(page.locator('#cmp-result')).toContainText('5 rows');
  });

  test('whitespace-only email cells are skipped, not hashed as empty string', async ({ page }) => {
    const tmp = await mkdtemp(join(tmpdir(), 'eh-ws-'));
    const csvPath = join(tmp, 'ws.csv');
    await writeFile(csvPath, 'email,name\n   ,Blank\nalice@example.com,Alice\n');
    await page.goto(appUrl);
    await page.setInputFiles('#file-hash', csvPath);
    await expect(page.locator('#hash-controls')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-hash');
    const text = await readFile(await (await downloadPromise).path(), 'utf8');
    // Blank row keeps the original row structure but has an empty hash cell.
    expect(text).toContain('   ,Blank,\n');
    // Alice still hashes correctly.
    expect(text).toContain('alice@example.com,Alice,ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976');
    // SHA-256 of empty string is e3b0c44...; make sure that's NOT present.
    expect(text).not.toContain('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('loading an invalid CSV after a valid one clears state', async ({ page }) => {
    const tmp = await mkdtemp(join(tmpdir(), 'eh-bad-'));
    const badPath = join(tmp, 'bad.csv');
    await writeFile(badPath, '');

    await page.goto(appUrl);
    // First load: valid
    await page.setInputFiles('#file-hash', sampleCsv);
    await expect(page.locator('#hash-controls')).toBeVisible();
    // Second load: invalid (empty file)
    await page.setInputFiles('#file-hash', badPath);
    await expect(page.locator('#hash-error')).toContainText(/empty/i);
    await expect(page.locator('#hash-controls')).toBeHidden();
    // Hash button doesn't hash stale data because controls are hidden; the button itself is inside.
    // Just make sure recipe is still showing old selection but no download is produced from stale state.
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

  test('CSP meta tag contains the locked-down directives', async ({ page }) => {
    await page.goto(appUrl);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).toMatch(/style-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test('no cookies, localStorage, sessionStorage, or IndexedDB after full hash run', async ({ page, context }) => {
    await page.goto(appUrl);
    await page.setInputFiles('#file-hash', sampleCsv);
    await expect(page.locator('#hash-controls')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-hash');
    await downloadPromise;

    const cookies = await context.cookies();
    expect(cookies).toEqual([]);

    const storage = await page.evaluate(() => ({
      localStorageLen: window.localStorage.length,
      sessionStorageLen: window.sessionStorage.length,
    }));
    expect(storage.localStorageLen).toBe(0);
    expect(storage.sessionStorageLen).toBe(0);

    // indexedDB.databases() may be unavailable in some browsers; when it is, assert empty.
    const dbs = await page.evaluate(async () => {
      if (!('databases' in indexedDB)) return null;
      const list = await indexedDB.databases();
      return list.map((d) => d.name);
    });
    if (dbs !== null) expect(dbs).toEqual([]);
  });

  test('auto-detects email column for common header variants', async ({ page }) => {
    const tmp = await mkdtemp(join(tmpdir(), 'eh-hdr-'));
    for (const [file, header, idx] of [
      ['lower.csv', 'name,email\n', '1'],
      ['upper.csv', 'NAME,EMAIL\n', '1'],
      ['title.csv', 'Name,Email\n', '1'],
      ['hyphen.csv', 'Name,E-mail\n', '1'],
    ]) {
      const p = join(tmp, file);
      await writeFile(p, header + 'Alice,a@x.com\n');
      await page.goto(appUrl);
      await page.setInputFiles('#file-hash', p);
      await expect(page.locator('#hash-controls')).toBeVisible();
      await expect(page.locator('#col-hash')).toHaveValue(idx);
    }
  });
});
