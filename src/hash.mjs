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
