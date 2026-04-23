# Email Hasher — Web App Rework Design

**Date:** 2026-04-23
**Status:** Approved for implementation
**Author:** Jordan Krueger (with Claude Code)

## Context

`email-hasher` is a single-file Python/Tkinter script that hashes a CSV column of email addresses using the user's choice of algorithm (MD5 / SHA-1 / SHA-256 / SHA-512 / SHA-3-256 / SHA-3-512) with a case-normalization toggle. The README walks the user through installing Python, pip-installing `pandas` and `pycryptodome`, and running the script from Terminal.

The repository's intended audience is operations staff at progressive nonprofit advocacy organizations who perform periodic **list swaps**: two orgs want to coordinate outreach to their supporter lists without double-contacting shared supporters, so each side hashes its list with a shared recipe, exchanges the hashed files, and computes the overlap. Raw emails never change hands.

The current tool has three problems for that audience:
1. It requires a Python install and a Terminal — a hard barrier for non-technical ops people.
2. It stops at hashing. The comparison step (intersect / subtract the two hashed lists) is left to the user, which is where privacy mistakes and re-uploads of raw data happen.
3. The README references a Mac app download that does not exist and was written by ChatGPT without a verify pass.

## Goals

- Make the tool usable without any install: a one-click link for online use, and a downloadable single-file HTML artifact for fully-offline use.
- Cover the full list-swap workflow (hash + compare) in one place so raw emails never leave the device at any step.
- Produce a security posture that could withstand a government-level audit: no network exfiltration, no persistence, no third-party cryptographic code, reproducible releases.
- Update the README to accurately describe the tool's purpose, current state, and security guarantees — including useful shields.

## Non-goals

- No framework, bundler, or transpile step for the web app.
- No backend. The project remains a static site plus a Python script.
- No MD5 or SHA-3 in the web app (Python script retains them for legacy / power-user needs).
- No fancy visual design. The look should read as "security tool," not "SaaS landing page."
- No additional platforms (no Electron, no native app, no Mac app).

## Architecture

A single static web app delivered two ways:

1. **Hosted** at `https://jordankrueger.github.io/email-hasher/` via GitHub Pages, auto-deployed from `main` by a GitHub Actions workflow.
2. **Offline** as a release artifact: a zipped bundle with a SHA-256 checksum, produced by a release workflow on tag push. Users can also "Save Page As" from the hosted site to get the same file.

The artifact is a **single `index.html`** with inline CSS and inline vanilla JavaScript. No build step, no `node_modules`, no external requests. This is the audit-friendliness lever: one file, short enough for a technical colleague to read cover-to-cover in under an hour.

The existing `email_hasher.py` stays unchanged. It becomes the documented power-user path for people who need MD5, SHA-3, or to script the tool.

### Components

- `index.html` — the entire web app. Contains:
  - Inline `<style>` block.
  - Inline `<script type="module">` block with:
    - CSV parse + write (hand-rolled; see edge cases below).
    - Hash worker (Web Worker created from a Blob URL in-page) that calls `crypto.subtle.digest` or `crypto.subtle.sign` (HMAC).
    - Two "views" toggled by a tab strip: Hash and Compare.
  - A `<meta http-equiv="Content-Security-Policy">` tag locking the page down.
- `email_hasher.py` — unchanged.
- `README.md` — rewritten (see README section below).
- `SECURITY.md` — new; threat model and disclosure process.
- `.github/workflows/pages.yml` — new; deploy to GitHub Pages.
- `.github/workflows/release.yml` — new; on `v*` tag push, build a zip of the offline bundle, compute SHA-256, attach both to a GitHub Release.
- `.github/workflows/ai-review.yml` — unchanged.
- `sample/sample-emails.csv` — new; a small fake list for first-run demo and tests.
- `docs/superpowers/specs/` — this spec and any future specs.

### Data flow

All data flow is in-memory and in-browser. No IPC, no storage, no network.

**Hash mode:**
CSV file (from a file input or drag-and-drop) → `FileReader.readAsText` → parsed into rows → for each row, the selected column is extracted, trimmed, case-normalized, and passed to the hash worker → worker returns a hex digest → new rows are written to an output string → `Blob` + `URL.createObjectURL` → download link → `URL.revokeObjectURL` after click.

**Compare mode:**
Two CSV files → parsed → column picked on each → each is loaded into a `Set<string>` → set intersection / difference → written to output CSV → downloaded the same way.

### Error handling

Errors surface inline in the UI, not as alerts or console-only messages. Expected failure modes:
- File is not a CSV (wrong MIME type or unparseable) — show "This doesn't look like a CSV. Please select a `.csv` file."
- CSV has no header row — show "Couldn't find column headers. Make sure the first row of your CSV is a header."
- Selected column is empty for some rows — the user is shown a count of empty rows and asked whether to skip them (default) or hash the empty string.
- File is very large — rows are processed in chunks; a progress indicator shows `N / total` rather than spinning forever.
- Web Crypto unavailable (very old browser, non-HTTPS context) — show "This browser does not expose the required cryptography APIs. Please use a modern browser over HTTPS, or download the release bundle."

No error message is logged to `console` because `console.log` on emails would leak PII to browser extensions and devtools history.

### Testing

Because there is no framework, tests live in a sibling `index.test.html` that uses a tiny inline test harness (or a single `test.html` that imports the same functions via a small refactor that exposes them on `window` when a query string flag is set). Tests cover:

- Hash vectors: known `(email, algorithm, case, hmac_key)` → expected digest, validated against a second reference (a short Python one-liner included in the test file as a comment).
- CSV parse edge cases: quoted fields, embedded commas, CRLF vs LF, UTF-8 BOM, empty rows, trailing newline.
- Column detection: `email` / `Email` / `EMAIL` / `e-mail` variants.
- Set operations in compare mode on small fixtures.
- Recipe summary string matches the actual hashing behavior (prevents silent drift between UI label and crypto call).

Tests are runnable by opening `test.html` in a browser. A GitHub Actions job runs them headlessly in Chromium via a short Playwright script.

## Security posture

### 1. Cryptographic surface

Only `window.crypto.subtle` is used. The web app ships **zero third-party cryptographic code**. Algorithm choices exposed in the UI:

- SHA-256 (default, recommended)
- SHA-1 (with a visible "weak — avoid unless partner requires" warning)
- SHA-384
- SHA-512
- HMAC-SHA-256 (toggled via a checkbox; requires the user to enter a shared passphrase)

MD5 and SHA-3 are intentionally unavailable in the web app. The UI explains this and links to the Python script for those cases.

### 2. Network isolation

A `<meta http-equiv="Content-Security-Policy">` tag enforces:

```
default-src 'none';
script-src 'self';
style-src 'self';
connect-src 'none';
img-src 'self' data:;
form-action 'none';
base-uri 'none';
frame-ancestors 'none';
```

Inline styles and scripts are permitted via SHA-256 hashes in the CSP (not `'unsafe-inline'`). No external fonts, CDNs, analytics, telemetry, or favicons from third parties.

A visible "How do I verify?" link in the UI opens a panel with instructions to:
- Open DevTools → Network tab and confirm zero requests after page load.
- Run the page in airplane mode.
- Read the source (`View Source` or the repo).

### 3. Persistence isolation

No `localStorage`, no `sessionStorage`, no `IndexedDB`, no cookies, no service workers. Output blobs are generated via `URL.createObjectURL()` and revoked immediately after the download triggers. File inputs are cleared on an explicit "Clear" button and on page unload.

### 4. Dynamic code isolation

No `eval`, no `new Function`, no `innerHTML` with any user-derived string. All user-derived text goes through `textContent`. CSP blocks these anyway; this is defense-in-depth.

### 5. Rainbow-table resistance

HMAC-SHA-256 mode accepts a shared passphrase and hashes the email keyed on the passphrase. An attacker who later obtains the hashed list cannot rainbow-table it without knowing the passphrase. The UI explicitly warns: "Both orgs must use the exact same passphrase. Share it out-of-band — in person, by phone, or Signal — not over email."

### 6. Deterministic, visible recipe

The UI shows a live "Recipe:" string (e.g., "SHA-256, lowercase, whitespace trimmed, no HMAC"). The output CSV embeds the recipe as a header comment row (`# recipe: SHA-256, lowercase, whitespace trimmed, no HMAC`) so both sides of a swap can verify they used the same recipe after the fact.

### 7. Supply-chain hardening

- All GitHub Actions `uses:` entries are pinned to commit SHAs, not floating tags.
- `release.yml` produces a reproducible zip bundle (sorted file list, `SOURCE_DATE_EPOCH` set from the tag) and a SHA-256 checksum file, both attached to the GitHub Release.
- The AI code review workflow is retained.
- Dependabot is enabled on the Actions manifest.

### 8. SECURITY.md

A dedicated `SECURITY.md` covers:
- What the tool protects against (network exfiltration, accidental upload, rainbow tables when HMAC is used).
- What it explicitly does NOT protect against (compromised browser or OS, screenshots and shoulder-surfing, a malicious list-swap partner, and emails re-derivable from a small known universe when HMAC is not used).
- A disclosure email address and a pointer to private vulnerability reporting on GitHub.

### 9. Audit invitation

The README explicitly invites review, states the line-count goal (target under 500 lines of JS in `index.html`), and links to `SECURITY.md`.

## User experience

Two modes in a single page, toggled by a tab strip.

### Hash mode (default)

Single column of fields, top to bottom:

1. **Privacy banner** (sticky, muted, always visible): "Your emails never leave your browser. This page works offline. [How do I verify?]" The link opens a verification panel.
2. **Drop zone + Choose CSV button** — drag-and-drop or click. Accepts `.csv`.
3. **Column picker** — auto-detects `email`/`Email`/`EMAIL`/`e-mail`. If not found, a dropdown of all detected columns.
4. **Case** — radio: Lowercase (default, recommended) / Uppercase.
5. **Algorithm** — dropdown: SHA-256 / SHA-1 (with weak marker) / SHA-384 / SHA-512.
6. **HMAC toggle** — checkbox "Use shared passphrase (HMAC-SHA-256)". Reveals a password field with the out-of-band sharing warning. When enabled, it disables the algorithm dropdown because HMAC-SHA-256 is used.
7. **Recipe summary** — live plain-English string.
8. **Hash button** — spawns the Web Worker, streams rows, shows progress.
9. **Result** — row count, first three hashes as preview, Download button.
10. **Clear button** — wipes all state.

### Compare mode

Same privacy banner. Two drop zones side by side (List A, List B). Column picker on each. Radio for output:
- Overlap (hashes in both lists)
- A minus overlap (default — the common list-swap use case)
- B minus overlap

Button → result count + Download button.

### Styling and accessibility

Plain, readable, high-contrast. System font stack. ~600px centered column. Works on mobile. No logo art. Proper form labels, visible focus rings, keyboard-navigable, color never the only signal, screen-reader-friendly error messages.

## README structure

1. **Shields row** — license (MIT), GitHub Pages deploy status, latest release, last commit, plus custom static shields.io badges: "client-side only", "no tracking", "offline-capable".
2. **One-sentence pitch** — "A client-side tool for hashing email lists so advocacy organizations can swap lists and exclude overlapping supporters without exposing raw emails to each other."
3. **Try it now** — prominent link to the GitHub Pages URL.
4. **What this is for** — 3–4 sentences on the list-swap workflow with a concrete example.
5. **Using it online** — single paragraph.
6. **Using it offline** — two routes: "Save Page As" from the live site, or download the release zip, verify the SHA-256, unzip, double-click `index.html`. Verification commands for macOS (`shasum -a 256`) and Windows (`certutil -hashfile ... SHA256`).
7. **Security** — bullet summary and a link to `SECURITY.md`.
8. **Choosing a hashing recipe** — what both orgs must agree on; recommends SHA-256 lowercase + HMAC for sensitive lists; notes that MD5 is unsupported in the web app by design and directs legacy needs to the Python script.
9. **Python script** — collapsed `<details>` block with refreshed install instructions.
10. **Contributing and audit invitation** — "Under ~500 lines of JS in one HTML file. Audits welcome."
11. **Credits** — AI attribution kept and clarified (ChatGPT starting point, later hand-edited); license.

## File layout after this work

```
/
├── index.html
├── test.html
├── email_hasher.py
├── README.md
├── SECURITY.md
├── LICENSE
├── .github/
│   └── workflows/
│       ├── ai-review.yml        (existing)
│       ├── pages.yml            (new)
│       ├── release.yml          (new)
│       └── test.yml             (new — headless Playwright run of test.html)
├── sample/
│   └── sample-emails.csv
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-23-web-app-rework-design.md
```

## Risks and open questions

- **CSP `'unsafe-inline'` temptation.** Inline scripts and styles require precomputing their SHA-256 for CSP. A small build-time step (a shell script, not a bundler) should compute those hashes and inject them; alternatively, the release workflow regenerates `index.html` with the correct CSP. The "no build step" promise applies to consumers, not to the release pipeline — the released `index.html` is still a single static file.
- **Large files in memory.** The browser will hold the full CSV in memory during processing. For the expected audience (advocacy-org supporter lists in the tens to low-hundreds of thousands), this is fine. Documented in the README; out of scope to stream from disk.
- **Web Workers and inline CSP.** Creating a Web Worker from a Blob URL is compatible with the proposed CSP but requires `worker-src blob:` in the CSP. The CSP above should include `worker-src 'self' blob:`.
- **Browser compatibility.** Web Crypto is available everywhere modern (Chrome, Edge, Safari, Firefox, iOS Safari, Android Chrome). It is not available on very old browsers; the UI detects this and advises an upgrade.

## Done means

- The GitHub Pages site loads, runs the hash + compare flows end-to-end, and shows zero network requests in DevTools.
- The offline bundle downloads, unzips, and runs identically from `file://`.
- `SECURITY.md` reflects the delivered behavior.
- The README is rewritten and the Mac-app reference is gone.
- Release tag produces a zip plus SHA-256 checksum in the GitHub Release.
- Tests pass in CI.
