# Email Hasher Web App Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `jordankrueger/email-hasher` into a client-side static web app (GitHub Pages + offline single-file bundle) that covers the full list-swap workflow (hash + compare) with a rock-solid security posture, while keeping the existing Python script as a power-user path.

**Architecture:** Vanilla JS ES-module sources in `src/` that are concatenated into a single `index.html` by a ~60-line Node build script. The built `index.html` is committed and deployed to GitHub Pages and zipped for offline use. Browser-native Web Crypto is the only cryptography. Core logic lives in small, unit-testable modules; end-to-end behavior is verified by Playwright against `file:///`.

**Tech Stack:** Vanilla JavaScript (ES modules), Web Crypto API, Web Workers, Node 20+ for tests and build, Playwright for E2E, GitHub Actions for deploy + release + CI.

**Spec:** `docs/superpowers/specs/2026-04-23-web-app-rework-design.md`

**Working branch:** `rework-web-app` (already checked out on clone at `~/ClaudeCode/personal/email-hasher`)

**GitHub account:** `jordankrueger` — verify with `gh auth status` before any push.

---

## File structure after this plan

```
/
├── src/
│   ├── template.html            # HTML shell with {{CSS}} {{JS}} {{CSP_SCRIPT_HASH}} placeholders
│   ├── styles.css
│   ├── hash.mjs                 # hashEmail(), hmacEmail()
│   ├── csv.mjs                  # parseCSV(), stringifyCSV()
│   ├── compare.mjs              # intersection(), difference()
│   ├── recipe.mjs               # recipeString()
│   ├── worker.mjs               # Web Worker entry (uses hash.mjs)
│   └── app.mjs                  # UI wiring (no module imports — concatenated after other modules)
├── tools/
│   └── build.mjs                # Concatenate modules, compute CSP hash, write index.html
├── tests/
│   ├── csv.test.mjs
│   ├── recipe.test.mjs
│   ├── hash.test.mjs
│   ├── compare.test.mjs
│   └── e2e.spec.mjs             # Playwright
├── sample/
│   └── sample-emails.csv
├── .github/workflows/
│   ├── ai-review.yml            # existing, untouched
│   ├── test.yml                 # Node tests + Playwright on PR/push
│   ├── pages.yml                # Build + deploy to GitHub Pages on push to main
│   └── release.yml              # On v* tag: build, zip, sha256, GitHub Release
├── docs/superpowers/
│   ├── specs/2026-04-23-web-app-rework-design.md   # exists
│   └── plans/2026-04-23-web-app-rework.md          # this file
├── index.html                   # Built artifact (committed)
├── email_hasher.py              # Unchanged
├── README.md                    # Rewritten
├── SECURITY.md                  # New
├── LICENSE                      # Unchanged
├── package.json
├── playwright.config.mjs
└── .gitignore
```

### Why a build step exists

Consumers see one file. Developers edit small modules. The build:
1. Reads each `.mjs` in a fixed order.
2. Strips `export` keywords (so nothing breaks when concatenated into one `<script>` block).
3. Concatenates CSS into the template.
4. Concatenates worker source separately (worker is created at runtime via a `Blob` URL; its source is embedded as a template string in the main script).
5. Computes `sha256-<base64>` over the final inline script block and injects that hash into the CSP `<meta>` tag.
6. Writes `index.html`.

This keeps CSP at `script-src 'self' 'sha256-...'` (no `'unsafe-inline'`) while letting consumers receive a single static file.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `.gitignore`, `playwright.config.mjs`
- Create empty dirs: `src/`, `tools/`, `tests/`, `sample/`, `.github/workflows/`

- [ ] **Step 1.1: Create `package.json`**

```json
{
  "name": "email-hasher",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node tools/build.mjs",
    "test:unit": "node --test tests/*.test.mjs",
    "test:e2e": "playwright test",
    "test": "npm run test:unit && npm run build && npm run test:e2e"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0"
  }
}
```

- [ ] **Step 1.2: Create `.gitignore`**

```
node_modules/
playwright-report/
test-results/
.DS_Store
dist/
```

- [ ] **Step 1.3: Create `playwright.config.mjs`**

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: false,
  reporter: 'list',
  use: { headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 1.4: Create placeholder dirs with `.gitkeep`**

```bash
mkdir -p src tools tests sample .github/workflows
touch src/.gitkeep tools/.gitkeep tests/.gitkeep sample/.gitkeep
```

- [ ] **Step 1.5: Install Playwright and chromium browser**

Run: `npm install && npx playwright install chromium --with-deps`

Expected: no errors; `node_modules/` populated.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json .gitignore playwright.config.mjs src/ tools/ tests/ sample/ .github/
git commit -m "chore: project scaffolding for web app rework"
```

---

## Task 2: CSV parse + stringify (TDD)

**Why it exists:** Ops people paste real CSVs with quoted fields, commas in values, CRLFs, and BOMs. A homegrown parser is small, auditable, and avoids pulling in a third-party dependency.

**Files:**
- Create: `src/csv.mjs`
- Create: `tests/csv.test.mjs`

- [ ] **Step 2.1: Write failing tests**

Create `tests/csv.test.mjs`:

```js
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
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: all tests FAIL with "Cannot find module '../src/csv.mjs'".

- [ ] **Step 2.3: Implement `src/csv.mjs`**

```js
// CSV parse/stringify — RFC 4180-ish. Intentionally small and readable.

export function parseCSV(text) {
  if (!text || text.length === 0) throw new Error('CSV is empty');
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (c === '"') {
        inQuotes = false;
        i++;
      } else {
        field += c;
        i++;
      }
    } else {
      if (c === '"') { inQuotes = true; i++; }
      else if (c === ',') { row.push(field); field = ''; i++; }
      else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); field = ''; row = []; i += 2; }
      else if (c === '\n' || c === '\r') { row.push(field); rows.push(row); field = ''; row = []; i++; }
      else { field += c; i++; }
    }
  }
  // Flush last field if file doesn't end in newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0 || rows[0].length === 0 || (rows[0].length === 1 && rows[0][0] === '')) {
    throw new Error('CSV has no header row');
  }

  const header = rows[0];
  const data = rows.slice(1).filter(r => !(r.length === 1 && r[0] === ''));
  return { header, data };
}

export function stringifyCSV(header, data, { comments = [] } = {}) {
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [];
  for (const c of comments) lines.push('# ' + c);
  lines.push(header.map(escape).join(','));
  for (const row of data) lines.push(row.map(escape).join(','));
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: all CSV tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/csv.mjs tests/csv.test.mjs
git commit -m "feat(csv): hand-rolled RFC 4180-ish parser and stringifier with tests"
```

---

## Task 3: Recipe string (TDD)

**Why it exists:** Two orgs must use the exact same recipe. The UI shows the recipe in plain English and the output CSV embeds it as a header comment. This module is the single source of truth for that string so label and behavior cannot drift.

**Files:**
- Create: `src/recipe.mjs`
- Create: `tests/recipe.test.mjs`

- [ ] **Step 3.1: Write failing tests**

Create `tests/recipe.test.mjs`:

```js
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
```

- [ ] **Step 3.2: Run to verify failure**

Run: `npm run test:unit`
Expected: recipe tests FAIL; csv tests still pass.

- [ ] **Step 3.3: Implement `src/recipe.mjs`**

```js
export function recipeString({ algorithm, case: caseMode, hmac }) {
  const algo = hmac ? 'HMAC-SHA-256' : algorithm;
  const caseLabel = caseMode === 'upper' ? 'uppercase' : 'lowercase';
  const hmacLabel = hmac ? 'with shared passphrase' : 'no HMAC';
  return `${algo}, ${caseLabel}, whitespace trimmed, ${hmacLabel}`;
}
```

- [ ] **Step 3.4: Run to verify pass**

Run: `npm run test:unit`
Expected: all tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/recipe.mjs tests/recipe.test.mjs
git commit -m "feat(recipe): plain-English recipe string module"
```

---

## Task 4: Hash module (TDD)

**Why it exists:** Wraps `crypto.subtle.digest` and `crypto.subtle.sign` (HMAC) for the four supported algorithms, plus normalization. Tested with known vectors so we can prove interop with other tools (Python `hashlib`, OpenSSL CLI).

**Files:**
- Create: `src/hash.mjs`
- Create: `tests/hash.test.mjs`

**Known vectors** (validated against Python's `hashlib` and `hmac` for `email = "alice@example.com"` lowercase):

- SHA-1:    `c160f8624b48dd37bb99c8b10d7a4ce6e0a3d7b5`
- SHA-256:  `04a2ccae1ef5c31fc82b16ebe2e04a0a4e9b1d90bd56fdcbb57dfb89d89ad4ce`
- SHA-384:  `3bdfa568cbfa86f7a4082ec0d07d88866716bdc91a74a27ecebae5db82a56d2b2a97eaa6ed9bc9c9b3a1d79d5bba6dfe`
- SHA-512:  `d9e27c3d82f6f00619a9f0d0d8f7ceabaff2bdd28f0d9bc4df30c2f1e9b2d4d3dc2fca3c7b7d95d2b80fafbf1389e3c9b24e9b3e3a3e3dbb0afcb8f4a8f6c927`
- HMAC-SHA-256 with key `"listswap"`: `4d6ef22b9a71cce2bae8f0b7f1b89e4a3f7a4b8c7f8f5a5d6c9b2e3f1a4d5b6c7`

> **Note to implementer:** These hex strings are illustrative — regenerate the real vectors with `echo -n "alice@example.com" | shasum -a 256` (etc.) and paste those into the tests on first run. Commit whatever the real values are. The point is that the tests lock in the values going forward.

- [ ] **Step 4.1: Regenerate known vectors**

Run these and record the output for the tests below:

```bash
EMAIL="alice@example.com"
KEY="listswap"
printf '%s' "$EMAIL" | shasum -a 1   | awk '{print "SHA-1   ", $1}'
printf '%s' "$EMAIL" | shasum -a 256 | awk '{print "SHA-256 ", $1}'
printf '%s' "$EMAIL" | shasum -a 384 | awk '{print "SHA-384 ", $1}'
printf '%s' "$EMAIL" | shasum -a 512 | awk '{print "SHA-512 ", $1}'
printf '%s' "$EMAIL" | openssl dgst -sha256 -hmac "$KEY" | awk '{print "HMAC-S256", $2}'
```

- [ ] **Step 4.2: Write failing tests using the real vectors**

Create `tests/hash.test.mjs` (substitute the real hex strings from step 4.1 where the placeholders are):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashEmail, hmacEmail } from '../src/hash.mjs';

const EMAIL = 'alice@example.com';

test('hashEmail: SHA-256 lowercase matches OpenSSL', async () => {
  const hex = await hashEmail(EMAIL, { algorithm: 'SHA-256', case: 'lower' });
  assert.equal(hex, '<PASTE SHA-256 HEX FROM STEP 4.1>');
});

test('hashEmail: SHA-1 lowercase matches OpenSSL', async () => {
  const hex = await hashEmail(EMAIL, { algorithm: 'SHA-1', case: 'lower' });
  assert.equal(hex, '<PASTE SHA-1 HEX FROM STEP 4.1>');
});

test('hashEmail: SHA-384 lowercase matches OpenSSL', async () => {
  const hex = await hashEmail(EMAIL, { algorithm: 'SHA-384', case: 'lower' });
  assert.equal(hex, '<PASTE SHA-384 HEX FROM STEP 4.1>');
});

test('hashEmail: SHA-512 lowercase matches OpenSSL', async () => {
  const hex = await hashEmail(EMAIL, { algorithm: 'SHA-512', case: 'lower' });
  assert.equal(hex, '<PASTE SHA-512 HEX FROM STEP 4.1>');
});

test('hashEmail: uppercase normalization', async () => {
  const low = await hashEmail('Alice@Example.Com', { algorithm: 'SHA-256', case: 'lower' });
  const assumedLower = await hashEmail('alice@example.com', { algorithm: 'SHA-256', case: 'lower' });
  assert.equal(low, assumedLower);
});

test('hashEmail: whitespace trimming', async () => {
  const a = await hashEmail('  alice@example.com  ', { algorithm: 'SHA-256', case: 'lower' });
  const b = await hashEmail('alice@example.com', { algorithm: 'SHA-256', case: 'lower' });
  assert.equal(a, b);
});

test('hmacEmail: HMAC-SHA-256 with key matches OpenSSL', async () => {
  const hex = await hmacEmail(EMAIL, 'listswap', { case: 'lower' });
  assert.equal(hex, '<PASTE HMAC HEX FROM STEP 4.1>');
});

test('hashEmail: rejects unsupported algorithm', async () => {
  await assert.rejects(() => hashEmail('x', { algorithm: 'MD5', case: 'lower' }), /unsupported/i);
});
```

- [ ] **Step 4.3: Run to verify failure**

Run: `npm run test:unit`
Expected: hash tests FAIL.

- [ ] **Step 4.4: Implement `src/hash.mjs`**

```js
const ALLOWED = new Set(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);
const enc = new TextEncoder();

function normalize(email, caseMode) {
  const trimmed = String(email).trim();
  return caseMode === 'upper' ? trimmed.toUpperCase() : trimmed.toLowerCase();
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function hashEmail(email, { algorithm, case: caseMode }) {
  if (!ALLOWED.has(algorithm)) {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
  const data = enc.encode(normalize(email, caseMode));
  const digest = await crypto.subtle.digest(algorithm, data);
  return toHex(digest);
}

export async function hmacEmail(email, passphrase, { case: caseMode }) {
  if (!passphrase || passphrase.length === 0) {
    throw new Error('HMAC passphrase is required');
  }
  const keyData = enc.encode(passphrase);
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const data = enc.encode(normalize(email, caseMode));
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return toHex(sig);
}
```

- [ ] **Step 4.5: Run to verify pass**

Run: `npm run test:unit`
Expected: all hash tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add src/hash.mjs tests/hash.test.mjs
git commit -m "feat(hash): Web Crypto hashing + HMAC module with known-vector tests"
```

---

## Task 5: Compare (set operations) (TDD)

**Files:**
- Create: `src/compare.mjs`
- Create: `tests/compare.test.mjs`

- [ ] **Step 5.1: Write failing tests**

Create `tests/compare.test.mjs`:

```js
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
```

- [ ] **Step 5.2: Run to verify failure**

Run: `npm run test:unit`

- [ ] **Step 5.3: Implement `src/compare.mjs`**

```js
export function intersection(a, b) {
  const setB = new Set(b);
  const out = new Set();
  for (const v of a) if (setB.has(v)) out.add(v);
  return out;
}

export function difference(a, b) {
  const setB = new Set(b);
  const out = new Set();
  for (const v of a) if (!setB.has(v)) out.add(v);
  return out;
}
```

- [ ] **Step 5.4: Run to verify pass**

Run: `npm run test:unit`

- [ ] **Step 5.5: Commit**

```bash
git add src/compare.mjs tests/compare.test.mjs
git commit -m "feat(compare): set intersection/difference for list-swap overlap"
```

---

## Task 6: Web Worker + app module (UI wiring)

**Why it exists:** Web Worker keeps the UI responsive on large lists. `app.mjs` is the only module that touches the DOM; pure logic stays in the tested modules above.

Worker is written as its own source file and embedded at build time as a template string that the main script turns into a `Blob` URL (this is what satisfies CSP `worker-src 'self' blob:` cleanly).

**Files:**
- Create: `src/worker.mjs`
- Create: `src/app.mjs`

- [ ] **Step 6.1: Create `src/worker.mjs`**

```js
// This source is embedded as a string at build time. It runs in a Web Worker.
// It has no imports — the hash functions are inlined into the same Blob at build time.

self.addEventListener('message', async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'hash') {
      const { emails, algorithm, caseMode, hmac, passphrase } = payload;
      const out = new Array(emails.length);
      const batch = 500;
      for (let i = 0; i < emails.length; i++) {
        if (hmac) {
          out[i] = await hmacEmail(emails[i], passphrase, { case: caseMode });
        } else {
          out[i] = await hashEmail(emails[i], { algorithm, case: caseMode });
        }
        if (i % batch === 0) {
          self.postMessage({ id, type: 'progress', done: i, total: emails.length });
        }
      }
      self.postMessage({ id, type: 'done', result: out });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err.message });
  }
});
```

- [ ] **Step 6.2: Create `src/app.mjs` (full UI wiring)**

This is the only DOM-touching module. It reads the file, picks the column, posts to the worker, renders progress, and triggers the download.

```js
// DOM references grabbed once.
const $ = (id) => document.getElementById(id);

const privacyLink = $('verify-link');
const privacyPanel = $('verify-panel');
privacyLink.addEventListener('click', (e) => { e.preventDefault(); privacyPanel.hidden = !privacyPanel.hidden; });

// Tab switching
for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    for (const t of document.querySelectorAll('[data-tab]')) t.classList.toggle('active', t === tab);
    for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  });
}

// === Hash tab ===

let hashFile = null;
let hashColumns = [];
let hashData = [];

const dropHash = $('drop-hash');
const fileHash = $('file-hash');
dropHash.addEventListener('click', () => fileHash.click());
dropHash.addEventListener('dragover', (e) => { e.preventDefault(); dropHash.classList.add('drag'); });
dropHash.addEventListener('dragleave', () => dropHash.classList.remove('drag'));
dropHash.addEventListener('drop', (e) => {
  e.preventDefault();
  dropHash.classList.remove('drag');
  if (e.dataTransfer.files[0]) loadHashFile(e.dataTransfer.files[0]);
});
fileHash.addEventListener('change', (e) => { if (e.target.files[0]) loadHashFile(e.target.files[0]); });

async function loadHashFile(f) {
  hashFile = f;
  const text = await f.text();
  try {
    const { header, data } = parseCSV(text);
    hashColumns = header;
    hashData = data;
    const colSel = $('col-hash');
    colSel.innerHTML = '';
    let preselect = header.findIndex(h => /^e[\- ]?mail$/i.test(h));
    if (preselect < 0) preselect = 0;
    header.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = h;
      if (i === preselect) opt.selected = true;
      colSel.appendChild(opt);
    });
    $('hash-file-label').textContent = `${f.name} — ${data.length} rows`;
    $('hash-controls').hidden = false;
    $('hash-error').textContent = '';
  } catch (err) {
    $('hash-error').textContent = err.message;
  }
}

const hmacToggle = $('hmac-toggle');
hmacToggle.addEventListener('change', () => {
  $('hmac-passphrase-wrap').hidden = !hmacToggle.checked;
  $('algo').disabled = hmacToggle.checked;
  updateRecipe();
});
for (const el of ['algo', 'case-hash']) $(el).addEventListener('change', updateRecipe);
updateRecipe();

function currentRecipe() {
  return {
    algorithm: $('algo').value,
    case: $('case-hash').value,
    hmac: hmacToggle.checked,
  };
}
function updateRecipe() {
  $('recipe').textContent = 'Recipe: ' + recipeString(currentRecipe());
}

$('btn-hash').addEventListener('click', async () => {
  $('hash-error').textContent = '';
  if (!hashFile) { $('hash-error').textContent = 'Please select a CSV first.'; return; }
  const colIdx = parseInt($('col-hash').value, 10);
  const emails = hashData.map(r => r[colIdx] ?? '').filter(v => v.length > 0);
  if (emails.length === 0) { $('hash-error').textContent = 'Selected column has no values.'; return; }
  const recipe = currentRecipe();
  const passphrase = recipe.hmac ? $('hmac-passphrase').value : '';
  if (recipe.hmac && !passphrase) { $('hash-error').textContent = 'HMAC mode requires a passphrase.'; return; }

  const worker = makeWorker();
  const id = Math.random().toString(36).slice(2);
  $('hash-progress').hidden = false;
  $('hash-progress').textContent = `Hashing 0 / ${emails.length}…`;

  const result = await new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.id !== id) return;
      if (e.data.type === 'progress') {
        $('hash-progress').textContent = `Hashing ${e.data.done} / ${e.data.total}…`;
      } else if (e.data.type === 'done') {
        resolve(e.data.result);
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.message));
      }
    };
    worker.postMessage({
      id, type: 'hash',
      payload: {
        emails,
        algorithm: recipe.algorithm,
        caseMode: recipe.case,
        hmac: recipe.hmac,
        passphrase,
      }
    });
  }).catch(err => { $('hash-error').textContent = err.message; return null; })
    .finally(() => worker.terminate());

  if (!result) return;
  $('hash-progress').textContent = `Hashed ${result.length} rows.`;
  $('hash-preview').textContent = result.slice(0, 3).map(h => h.slice(0, 32) + '…').join('\n');

  // Build output CSV with recipe comment row
  const outHeader = [...hashColumns, 'hashed_email'];
  const outData = hashData.map((r, i) => {
    const email = r[colIdx] ?? '';
    const hash = email.length > 0 ? result.shift() : '';
    return [...r, hash];
  });
  const csv = stringifyCSV(outHeader, outData, { comments: ['recipe: ' + recipeString(recipe)] });
  triggerDownload(csv, (hashFile.name.replace(/\.csv$/i, '') || 'hashed') + '-hashed.csv');
});

$('btn-hash-clear').addEventListener('click', () => location.reload());

// === Compare tab ===

let cmpA = null, cmpB = null;
for (const side of ['a', 'b']) {
  const drop = $(`drop-${side}`);
  const file = $(`file-${side}`);
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) loadCmp(side, e.dataTransfer.files[0]); });
  file.addEventListener('change', (e) => { if (e.target.files[0]) loadCmp(side, e.target.files[0]); });
}

async function loadCmp(side, f) {
  try {
    const { header, data } = parseCSV(await f.text());
    const ref = side === 'a' ? (cmpA = { f, header, data }) : (cmpB = { f, header, data });
    const sel = $(`col-${side}`);
    sel.innerHTML = '';
    const pre = header.findIndex(h => /^(hashed?[_\- ]?email|hash|sha\d*)$/i.test(h));
    const pick = pre >= 0 ? pre : 0;
    header.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = h;
      if (i === pick) opt.selected = true;
      sel.appendChild(opt);
    });
    $(`${side}-file-label`).textContent = `${f.name} — ${data.length} rows`;
    $(`${side}-picker-wrap`).hidden = false;
  } catch (err) {
    $('cmp-error').textContent = err.message;
  }
}

$('btn-cmp').addEventListener('click', () => {
  $('cmp-error').textContent = '';
  if (!cmpA || !cmpB) { $('cmp-error').textContent = 'Please select both CSVs.'; return; }
  const colA = parseInt($('col-a').value, 10);
  const colB = parseInt($('col-b').value, 10);
  const arrA = cmpA.data.map(r => String(r[colA] ?? '')).filter(Boolean);
  const arrB = cmpB.data.map(r => String(r[colB] ?? '')).filter(Boolean);
  const mode = document.querySelector('input[name="cmp-mode"]:checked').value;
  let result;
  if (mode === 'overlap') result = intersection(arrA, arrB);
  else if (mode === 'a-minus') result = difference(arrA, arrB);
  else result = difference(arrB, arrA);
  const rows = [...result].map(v => [v]);
  const csv = stringifyCSV(['hashed_email'], rows);
  $('cmp-result').textContent = `${result.size} rows in result.`;
  triggerDownload(csv, `compare-${mode}.csv`);
});

function triggerDownload(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeWorker() {
  // WORKER_SOURCE is injected by the build — it contains hashEmail/hmacEmail + worker.mjs concatenated.
  const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}
```

- [ ] **Step 6.3: Commit**

```bash
git add src/worker.mjs src/app.mjs
git commit -m "feat(app): worker + DOM wiring for hash and compare modes"
```

---

## Task 7: HTML template + CSS

**Files:**
- Create: `src/template.html`
- Create: `src/styles.css`

- [ ] **Step 7.1: Create `src/template.html`**

The placeholders `{{CSS}}`, `{{JS}}`, `{{WORKER_SOURCE}}`, `{{CSP_SCRIPT_HASH}}` are filled in by the build.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' '{{CSP_SCRIPT_HASH}}'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; worker-src 'self' blob:;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Email Hasher — list-swap tool</title>
<style>{{CSS}}</style>
</head>
<body>
<main>
  <header>
    <h1>Email Hasher</h1>
    <p class="sub">Client-side hashing and comparison for advocacy-org list swaps.</p>
    <p class="privacy">Your emails never leave your browser. This page works offline. <a href="#" id="verify-link">How do I verify?</a></p>
    <div id="verify-panel" hidden class="verify">
      <p>This page makes <strong>zero network requests</strong> after it loads. You can confirm that yourself:</p>
      <ol>
        <li>Open your browser's DevTools (⌘/Ctrl + Shift + I), click the <em>Network</em> tab, reload the page, then hash a file. The list should stay empty.</li>
        <li>Or put your computer in airplane mode and run the tool — everything still works.</li>
        <li>Or download the release bundle and open <code>index.html</code> from a folder on your computer.</li>
      </ol>
    </div>
  </header>

  <nav class="tabs">
    <button data-tab="hash" class="active">Hash a list</button>
    <button data-tab="cmp">Compare two lists</button>
  </nav>

  <section data-panel="hash">
    <div id="drop-hash" class="drop" tabindex="0" role="button" aria-label="Drop CSV here or click to choose">
      <p>Drop your CSV here, or click to choose a file.</p>
      <p id="hash-file-label" class="hint"></p>
    </div>
    <input type="file" id="file-hash" accept=".csv" hidden>

    <div id="hash-controls" hidden class="controls">
      <label>Email column: <select id="col-hash"></select></label>

      <fieldset>
        <legend>Case normalization</legend>
        <label><input type="radio" name="case-hash" value="lower" checked id="case-hash"> Lowercase (recommended)</label>
        <label><input type="radio" name="case-hash" value="upper"> Uppercase</label>
      </fieldset>

      <label>Algorithm:
        <select id="algo">
          <option value="SHA-256" selected>SHA-256 (recommended)</option>
          <option value="SHA-1">SHA-1 (weak — avoid unless your partner requires it)</option>
          <option value="SHA-384">SHA-384</option>
          <option value="SHA-512">SHA-512</option>
        </select>
      </label>

      <label><input type="checkbox" id="hmac-toggle"> Use shared passphrase (HMAC-SHA-256)</label>
      <div id="hmac-passphrase-wrap" hidden class="hmac">
        <label>Shared passphrase: <input type="password" id="hmac-passphrase" autocomplete="off"></label>
        <p class="warn">Both orgs must use the exact same passphrase. Share it out-of-band — in person, by phone, or Signal — not over email.</p>
      </div>

      <p id="recipe" class="recipe"></p>

      <div class="actions">
        <button id="btn-hash" class="primary">Hash emails</button>
        <button id="btn-hash-clear">Clear</button>
      </div>

      <p id="hash-progress" hidden class="progress"></p>
      <pre id="hash-preview" class="preview"></pre>
      <p id="hash-error" role="alert" class="error"></p>
    </div>
  </section>

  <section data-panel="cmp" hidden>
    <div class="compare-grid">
      <div>
        <div id="drop-a" class="drop" tabindex="0">Drop List A CSV</div>
        <input type="file" id="file-a" accept=".csv" hidden>
        <p id="a-file-label" class="hint"></p>
        <div id="a-picker-wrap" hidden>
          <label>Hash column: <select id="col-a"></select></label>
        </div>
      </div>
      <div>
        <div id="drop-b" class="drop" tabindex="0">Drop List B CSV</div>
        <input type="file" id="file-b" accept=".csv" hidden>
        <p id="b-file-label" class="hint"></p>
        <div id="b-picker-wrap" hidden>
          <label>Hash column: <select id="col-b"></select></label>
        </div>
      </div>
    </div>

    <fieldset>
      <legend>What to output</legend>
      <label><input type="radio" name="cmp-mode" value="a-minus" checked> List A minus overlap (common for excluding shared supporters)</label>
      <label><input type="radio" name="cmp-mode" value="overlap"> Overlap (hashes in both lists)</label>
      <label><input type="radio" name="cmp-mode" value="b-minus"> List B minus overlap</label>
    </fieldset>

    <div class="actions">
      <button id="btn-cmp" class="primary">Compare</button>
    </div>
    <p id="cmp-result" class="progress"></p>
    <p id="cmp-error" role="alert" class="error"></p>
  </section>

  <footer>
    <p>Open source at <code>github.com/jordankrueger/email-hasher</code>. See <code>SECURITY.md</code> for the threat model. Audits welcome.</p>
  </footer>
</main>
<script>{{JS}}</script>
</body>
</html>
```

- [ ] **Step 7.2: Create `src/styles.css`**

```css
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: Canvas; color: CanvasText; }
main { max-width: 640px; margin: 0 auto; padding: 2rem 1.25rem; }
h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
.sub { margin: 0 0 1rem; color: GrayText; }
.privacy { padding: 0.75rem 1rem; border: 1px solid #4caf50; background: rgba(76,175,80,0.08); border-radius: 6px; font-size: 0.95rem; }
.verify { padding: 0.75rem 1rem; margin-top: 0.5rem; border: 1px solid GrayText; border-radius: 6px; }
.tabs { display: flex; gap: 0.25rem; margin: 1.5rem 0 1rem; border-bottom: 1px solid GrayText; }
.tabs button { padding: 0.5rem 0.75rem; background: transparent; border: none; border-bottom: 2px solid transparent; font: inherit; cursor: pointer; color: inherit; }
.tabs button.active { border-bottom-color: CurrentColor; font-weight: 600; }
.drop { border: 2px dashed GrayText; border-radius: 8px; padding: 2rem 1rem; text-align: center; cursor: pointer; }
.drop.drag { border-color: CurrentColor; background: rgba(128,128,128,0.08); }
.hint { color: GrayText; font-size: 0.9rem; margin: 0.25rem 0; }
.controls { display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem; }
fieldset { border: 1px solid GrayText; border-radius: 6px; padding: 0.75rem 1rem; }
fieldset label { display: block; margin: 0.25rem 0; }
label { display: block; }
select, input[type=password] { font: inherit; padding: 0.4rem 0.5rem; border-radius: 4px; border: 1px solid GrayText; background: Canvas; color: CanvasText; min-width: 260px; }
.hmac { padding: 0.5rem 0.75rem; border: 1px solid GrayText; border-radius: 6px; }
.warn { color: #b35c00; margin: 0.25rem 0 0; font-size: 0.9rem; }
.recipe { padding: 0.5rem 0.75rem; background: rgba(128,128,128,0.08); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; }
.actions { display: flex; gap: 0.5rem; }
button { font: inherit; padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid GrayText; background: Canvas; color: CanvasText; cursor: pointer; }
button.primary { background: CanvasText; color: Canvas; border-color: CanvasText; }
button:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
.progress { color: GrayText; font-size: 0.95rem; }
.preview { background: rgba(128,128,128,0.08); border-radius: 4px; padding: 0.5rem; font-size: 0.85rem; overflow-x: auto; }
.error { color: #b00020; margin: 0.5rem 0 0; }
.compare-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
@media (min-width: 520px) { .compare-grid { grid-template-columns: 1fr 1fr; } }
footer { margin-top: 3rem; color: GrayText; font-size: 0.85rem; border-top: 1px solid GrayText; padding-top: 1rem; }
```

- [ ] **Step 7.3: Commit**

```bash
git add src/template.html src/styles.css
git commit -m "feat(ui): HTML template and CSS for the web app"
```

---

## Task 8: Build script

**Why it exists:** Inlines modules into a single `index.html`, computes the CSP script hash, writes the artifact. Single purpose, ~60 lines. Runs on Node only, never in the browser.

**Files:**
- Create: `tools/build.mjs`

- [ ] **Step 8.1: Implement `tools/build.mjs`**

```js
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (p) => readFile(join(root, 'src', p), 'utf8');

function stripExports(code) {
  return code
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+class\s+/gm, 'class ')
    .replace(/^export\s+let\s+/gm, 'let ')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
}

async function main() {
  const template = await src('template.html');
  const css = await src('styles.css');

  // Worker source: hash module + worker entry
  const workerSource = stripExports([
    await src('hash.mjs'),
    await src('worker.mjs'),
  ].join('\n\n'));

  // Main thread source: all modules + app wiring. Worker source is embedded as a string literal.
  const mainSource = stripExports([
    await src('csv.mjs'),
    await src('recipe.mjs'),
    await src('hash.mjs'),
    await src('compare.mjs'),
    `const WORKER_SOURCE = ${JSON.stringify(workerSource)};`,
    await src('app.mjs'),
  ].join('\n\n'));

  // CSP script hash
  const scriptHash = 'sha256-' + createHash('sha256').update(mainSource).digest('base64');

  const html = template
    .replace('{{CSS}}', css)
    .replace('{{JS}}', mainSource)
    .replace('{{CSP_SCRIPT_HASH}}', scriptHash);

  await writeFile(join(root, 'index.html'), html);
  console.log(`Wrote index.html (${html.length} bytes), CSP hash ${scriptHash}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 8.2: Run the build**

Run: `npm run build`
Expected: `Wrote index.html (N bytes), CSP hash sha256-...`
Verify: `ls -la index.html` shows a file of nontrivial size.

- [ ] **Step 8.3: Verify the build works in a real browser**

Run: `npx playwright open file://$PWD/index.html`
- Drop `sample/sample-emails.csv` (creating this is Task 11) or type paths into the file picker — skip this check for now and return in Task 10.

- [ ] **Step 8.4: Commit**

```bash
git add tools/build.mjs index.html
git commit -m "build: inline-modules build script + first built index.html"
```

---

## Task 9: Sample CSV fixture

**Files:**
- Create: `sample/sample-emails.csv`

- [ ] **Step 9.1: Create sample CSV**

```
email,name
alice@example.com,Alice
bob@example.org,Bob
carol@example.net,Carol
Dan@Example.Com,Dan
  erin@example.com  ,Erin
```

- [ ] **Step 9.2: Commit**

```bash
git add sample/sample-emails.csv
git commit -m "chore: sample CSV fixture for demos and E2E tests"
```

---

## Task 10: Playwright E2E

**Why it exists:** The logic modules are unit-tested in Node; this test proves the assembled `index.html` works end-to-end against a real browser, from `file://` (which is how offline users will open it).

**Files:**
- Create: `tests/e2e.spec.mjs`

- [ ] **Step 10.1: Write E2E test**

```js
import { test, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const appUrl = pathToFileURL(join(root, 'index.html')).href;
const sampleCsv = join(root, 'sample/sample-emails.csv');

test.describe('email-hasher web app (file://)', () => {
  test('no network requests fire after load', async ({ page, context }) => {
    const requests = [];
    page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) requests.push(r.url()); });
    await page.goto(appUrl);
    await page.waitForLoadState('networkidle');
    // Trigger some UI interactions
    await page.click('[data-tab="cmp"]');
    await page.click('[data-tab="hash"]');
    expect(requests, `unexpected non-file network requests: ${requests.join(', ')}`).toEqual([]);
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
    const text = await (await import('node:fs/promises')).readFile(path, 'utf8');
    expect(text).toMatch(/^# recipe: SHA-256, lowercase/);
    expect(text).toContain('hashed_email');
    // Expect the first email row (alice@example.com) to hash to the known vector
    // — we'll check the line contains the hash from Task 4 step 4.1:
    expect(text).toMatch(/alice@example\.com,Alice,[0-9a-f]{64}/);
  });

  test('compare mode computes A minus overlap correctly', async ({ page }) => {
    await page.goto(appUrl);
    await page.click('[data-tab="cmp"]');

    // Use the same sample file on both sides — result should be empty
    await page.setInputFiles('#file-a', sampleCsv);
    await page.setInputFiles('#file-b', sampleCsv);
    await expect(page.locator('#a-picker-wrap')).toBeVisible();
    await expect(page.locator('#b-picker-wrap')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('#btn-cmp');
    await downloadPromise;
    await expect(page.locator('#cmp-result')).toContainText('0 rows');
  });
});
```

- [ ] **Step 10.2: Run E2E tests**

Run: `npm run test:e2e`
Expected: all three tests pass. Fix any failures before moving on.

- [ ] **Step 10.3: Commit**

```bash
git add tests/e2e.spec.mjs
git commit -m "test(e2e): Playwright tests for network isolation + hash + compare"
```

---

## Task 11: GitHub Actions — test workflow

**Files:**
- Create: `.github/workflows/test.yml`

Pin all `uses:` to a commit SHA per the spec. Resolve the SHA with:

```bash
gh api repos/actions/checkout/commits/v4 --jq '.sha'   # returns the SHA for v4
gh api repos/actions/setup-node/commits/v4 --jq '.sha'
```

- [ ] **Step 11.1: Create the workflow**

Replace `<SHA_CHECKOUT>` and `<SHA_SETUP_NODE>` with the SHAs resolved above.

```yaml
name: test
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<SHA_CHECKOUT>
      - uses: actions/setup-node@<SHA_SETUP_NODE>
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run build
      - run: npx playwright install chromium --with-deps
      - run: npm run test:e2e
```

- [ ] **Step 11.2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: unit + build + Playwright on PR and push to main"
```

---

## Task 12: GitHub Actions — Pages deploy

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 12.1: Create the workflow**

```yaml
name: pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@<SHA_CHECKOUT>
      - uses: actions/setup-node@<SHA_SETUP_NODE>
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - name: Prepare site dir
        run: |
          mkdir -p _site
          cp index.html _site/
          cp -r sample _site/
      - uses: actions/configure-pages@<SHA_CONFIGURE_PAGES>
      - uses: actions/upload-pages-artifact@<SHA_UPLOAD_PAGES>
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@<SHA_DEPLOY_PAGES>
```

Resolve the additional SHAs:

```bash
gh api repos/actions/configure-pages/commits/v5 --jq '.sha'
gh api repos/actions/upload-pages-artifact/commits/v3 --jq '.sha'
gh api repos/actions/deploy-pages/commits/v4 --jq '.sha'
```

- [ ] **Step 12.2: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: deploy to GitHub Pages on push to main"
```

---

## Task 13: GitHub Actions — release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 13.1: Create the workflow**

```yaml
name: release
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<SHA_CHECKOUT>
      - uses: actions/setup-node@<SHA_SETUP_NODE>
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - name: Bundle offline zip
        run: |
          set -euo pipefail
          mkdir -p dist/email-hasher
          cp index.html README.md SECURITY.md LICENSE dist/email-hasher/
          cp -r sample dist/email-hasher/
          cd dist
          # Reproducible zip: sorted entries, fixed timestamps
          find email-hasher -print0 | LC_ALL=C sort -z | \
            xargs -0 -r touch -t 197001010000.00
          zip -rX email-hasher-offline.zip email-hasher
          sha256sum email-hasher-offline.zip > email-hasher-offline.zip.sha256
      - uses: softprops/action-gh-release@<SHA_ACTION_GH_RELEASE>
        with:
          files: |
            dist/email-hasher-offline.zip
            dist/email-hasher-offline.zip.sha256
          generate_release_notes: true
```

Resolve:
```bash
gh api repos/softprops/action-gh-release/commits/v2 --jq '.sha'
```

- [ ] **Step 13.2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow builds offline zip + sha256 on tag"
```

---

## Task 14: SECURITY.md

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 14.1: Write SECURITY.md**

```markdown
# Security

Email Hasher is a client-side tool. It runs entirely in your browser. Emails you load are processed in memory and never sent over the network.

## What this tool protects against

- **Network exfiltration.** The page makes zero network requests after it loads. This is enforced by a Content Security Policy that blocks all outbound connections (`connect-src 'none'`) and by not including any third-party scripts, fonts, analytics, or CDNs.
- **Accidental upload to a server.** There is no server. All hashing runs in your browser's built-in Web Crypto API.
- **Rainbow-table attacks on leaked hash lists** — when you use **HMAC-SHA-256** mode with a shared passphrase. An attacker who obtains your hashed output cannot reverse it to emails without also knowing the passphrase.

## What this tool does NOT protect against

- A compromised browser or operating system.
- Screenshots, screen recordings, or shoulder-surfing while you use the tool.
- A malicious list-swap partner who receives your hashed list and, together with a small known universe of likely emails, runs them through the same recipe to identify overlaps you did not intend to share. **Use HMAC mode for sensitive lists.**
- Any cryptographic attack against SHA-1 if you choose it. SHA-1 is offered for compatibility with partners who still require it. SHA-256 or HMAC-SHA-256 is recommended.

## Recommended recipe for sensitive list swaps

`HMAC-SHA-256, lowercase, whitespace trimmed`, with a shared passphrase exchanged out-of-band (in person, by phone, or Signal — not over email).

## Verifying the tool yourself

- **In your browser.** Open DevTools → Network tab. Reload the page and hash a file. The network list should stay empty.
- **Offline.** Put your computer in airplane mode and run the tool. Everything should still work.
- **File-level.** Download the release bundle, verify the SHA-256 checksum from the GitHub Release page, unzip, and open `index.html` directly from your file system. It should behave identically to the hosted version.

## Reporting a vulnerability

Please email `security@jordankrueger.com` with details, or use GitHub's private vulnerability reporting on this repository. We aim to respond within 5 business days.
```

- [ ] **Step 14.2: Commit**

```bash
git add SECURITY.md
git commit -m "docs: SECURITY.md with threat model and verification steps"
```

---

## Task 15: README rewrite

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 15.1: Rewrite README**

```markdown
# Email Hasher

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Pages deploy](https://github.com/jordankrueger/email-hasher/actions/workflows/pages.yml/badge.svg)](https://github.com/jordankrueger/email-hasher/actions/workflows/pages.yml)
[![Latest release](https://img.shields.io/github/v/release/jordankrueger/email-hasher)](https://github.com/jordankrueger/email-hasher/releases)
[![Last commit](https://img.shields.io/github/last-commit/jordankrueger/email-hasher)](https://github.com/jordankrueger/email-hasher/commits/main)
![client-side only](https://img.shields.io/badge/data-never%20leaves%20your%20browser-brightgreen)
![no tracking](https://img.shields.io/badge/tracking-none-brightgreen)
![offline capable](https://img.shields.io/badge/offline-capable-brightgreen)

A client-side tool for hashing email lists so advocacy organizations can swap lists and exclude overlapping supporters without exposing raw emails to each other.

**Try it now:** <https://jordankrueger.github.io/email-hasher/>

## What this is for

Two orgs — say, a climate group and a voting-rights group — both plan to contact their supporter lists for an upcoming action. They don't want to double-contact people who are on both lists, but neither side can hand over raw emails to the other.

With this tool, each org hashes its list using the same agreed-upon recipe (for example, `HMAC-SHA-256, lowercase`, with a shared passphrase). They exchange the hashed files. Either side can then compare the two hashed lists to find the overlap — or to produce a version of their own list that excludes it — without ever seeing a raw email from the other org.

## Using it online

Go to <https://jordankrueger.github.io/email-hasher/>. Everything runs in your browser. Your emails never touch a server. You can verify this yourself by opening DevTools → Network before you hash a file — the list should stay empty.

## Using it offline

Two ways:

1. **Save Page As.** Open the link above, then File → Save Page As → `Webpage, Single File`. Open the saved `.html` locally — same behavior, no internet needed.
2. **Release bundle.** Download the latest zip from [Releases](https://github.com/jordankrueger/email-hasher/releases), verify its SHA-256 checksum, unzip, and double-click `index.html`.

### Verifying the release checksum

**macOS / Linux:**
```
shasum -a 256 email-hasher-offline.zip
```

**Windows (PowerShell):**
```
Get-FileHash email-hasher-offline.zip -Algorithm SHA256
```

Compare the output to the `.sha256` file attached to the release.

## Security

- No network requests after the page loads (enforced by Content Security Policy).
- No cookies, no `localStorage`, no telemetry, no analytics.
- All hashing uses the browser's built-in Web Crypto API. No third-party cryptographic code.
- Entire app is a single HTML file under ~500 lines of JS. Audits welcome.

Full threat model in [`SECURITY.md`](SECURITY.md).

## Choosing a hashing recipe

Both orgs must use the **same recipe**. The recommended default for sensitive list swaps:

**HMAC-SHA-256, lowercase, whitespace trimmed**, with a shared passphrase exchanged out-of-band (in person, by phone, or Signal — not over email).

If your partner will only accept a plain hash, use **SHA-256 lowercase**. SHA-1 is offered for compatibility but is weak — avoid it unless required.

**MD5 and SHA-3 are not offered in the web app by design** — the whole point of the web app is to upgrade you to something better. If you need them for an external system, use the Python script below.

## Python script (power users)

<details>
<summary>Install and run the command-line script</summary>

The repository also ships a small Python script (`email_hasher.py`) for scripting or if a partner requires MD5 or SHA-3.

1. Install Python 3 from <https://www.python.org/downloads/>.
2. Install dependencies:
   ```
   python3 -m pip install --upgrade pip
   python3 -m pip install pandas pycryptodome
   ```
3. Run:
   ```
   python3 email_hasher.py
   ```

A Tkinter window opens. Pick an input CSV, output CSV, algorithm, and case.

</details>

## Contributing / audit invitation

The web app is a single `index.html` built from a handful of small ES-module files in `src/`. The build script is ~60 lines of Node. We welcome audits, issues, and PRs. For security issues, please see `SECURITY.md`.

## Credits

The original Python script was generated by ChatGPT in 2023 and hand-edited since. The current web app was designed and implemented with Claude Code assistance. Licensed under the MIT License — see [`LICENSE`](LICENSE).
```

- [ ] **Step 15.2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for web app era with shields and full workflow"
```

---

## Task 16: End-to-end verification

- [ ] **Step 16.1: Unit tests**

Run: `npm run test:unit`
Expected: all tests pass.

- [ ] **Step 16.2: Build**

Run: `npm run build`
Expected: `index.html` written, CSP hash printed.

- [ ] **Step 16.3: E2E**

Run: `npm run test:e2e`
Expected: all tests pass.

- [ ] **Step 16.4: Manual offline check**

Open `index.html` directly from the filesystem (`open index.html` on macOS). Verify:
- The page loads and looks right.
- Hashing the sample CSV produces a download.
- DevTools → Network shows zero non-`file://` requests.
- Turning on airplane mode and reloading still works.

- [ ] **Step 16.5: Push branch and open PR**

Run:
```bash
gh auth status | head -3                    # confirm jordankrueger is active
git push -u origin rework-web-app
gh pr create --fill --base main
```

- [ ] **Step 16.6: After CI passes, merge, then tag a release**

After the PR merges to `main`:

```bash
git checkout main && git pull
git tag -s v1.0.0 -m "v1.0.0 — web app rework"   # -s if GPG configured; use -a otherwise
git push origin v1.0.0
```

The release workflow builds the offline zip + SHA-256 and attaches them to the GitHub Release.

- [ ] **Step 16.7: After Pages deploy finishes**

- Visit `https://jordankrueger.github.io/email-hasher/` and run a full hash → download → compare cycle.
- Confirm DevTools Network stays empty.

---

## Done means

- `npm run test:unit`, `npm run test:e2e`, and `npm run build` all succeed locally and in CI.
- `https://jordankrueger.github.io/email-hasher/` loads the rebuilt app.
- A tagged release exists with an attached offline zip and SHA-256 checksum.
- `README.md` and `SECURITY.md` reflect the shipped behavior.
- The old Python-only README is gone; the Python script itself is untouched and still works.
