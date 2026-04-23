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

## Cryptographic surface

The web app ships **zero third-party cryptographic code**. All hashing uses the browser's built-in [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) (`crypto.subtle.digest` and `crypto.subtle.sign`). Supported algorithms:

- SHA-256 (default)
- SHA-1 (offered for compatibility; not recommended)
- SHA-384
- SHA-512
- HMAC-SHA-256 (with a shared passphrase)

MD5 and SHA-3 are intentionally not offered in the web app. If a partner requires them, use the Python script (`email_hasher.py`) in this repository.

## Verifying the tool yourself

- **In your browser.** Open DevTools → Network tab. Reload the page and hash a file. The network list should stay empty.
- **Offline.** Put your computer in airplane mode and run the tool. Everything should still work.
- **File-level.** Download the release bundle, verify the SHA-256 checksum from the GitHub Release page, unzip, and open `index.html` directly from your file system. It should behave identically to the hosted version.
- **Code review.** The entire web app is a single `index.html` built from a handful of small ES-module files in `src/`. The build script (`tools/build.mjs`) is ~60 lines of Node. Both are intended to be auditable in under an hour.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting on this repository (Security tab → Report a vulnerability), or email the maintainer privately.
