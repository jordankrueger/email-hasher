# Email Hasher

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Pages deploy](https://github.com/jordankrueger/email-hasher/actions/workflows/pages.yml/badge.svg)](https://github.com/jordankrueger/email-hasher/actions/workflows/pages.yml)
[![Tests](https://github.com/jordankrueger/email-hasher/actions/workflows/test.yml/badge.svg)](https://github.com/jordankrueger/email-hasher/actions/workflows/test.yml)
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
- Entire app is a single HTML file. Audits welcome.

Full threat model in [SECURITY.md](SECURITY.md).

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

## Development

```
npm install
npm run test:unit     # Node unit tests
npm run build         # Regenerate index.html from src/
npm run test:e2e      # Playwright E2E against file://
```

The web app is built from small ES-module files in `src/` that are concatenated into a single `index.html` by `tools/build.mjs`. The build also computes the CSP `script-src` and `style-src` hashes so the served page runs under a locked-down policy with no `unsafe-inline`.

## Contributing / audit invitation

The web app is one HTML file, built from a handful of short modules. The build script is ~60 lines of Node. Audits, issues, and PRs welcome. For security issues, please see `SECURITY.md`.

## Credits

The original Python script was generated by ChatGPT in 2023. The web app was designed and implemented in 2026 with Claude Code assistance. Licensed under the [MIT License](LICENSE).
