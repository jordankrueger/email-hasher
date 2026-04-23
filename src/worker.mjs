// Runs in a Web Worker. The build step concatenates hash.mjs functions
// (hashEmail, hmacEmail) into the same Blob so no imports are needed here.

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
