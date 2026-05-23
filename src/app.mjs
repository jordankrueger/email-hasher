// DOM wiring for the web app. This module is concatenated last by the build
// and runs in the main thread. Pure logic lives in the other modules.

const $ = (id) => document.getElementById(id);
const radioValue = (name) => {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
};

// === Privacy verification panel ===
$('verify-link').addEventListener('click', (e) => {
  e.preventDefault();
  const p = $('verify-panel');
  p.hidden = !p.hidden;
});

// === Tabs ===
for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    for (const t of document.querySelectorAll('[data-tab]')) t.classList.toggle('active', t === tab);
    for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  });
}

// === Hash tab state ===
let hashFile = null;
let hashColumns = [];
let hashData = [];

function resetHashTab() {
  hashFile = null;
  hashColumns = [];
  hashData = [];
  $('col-hash').innerHTML = '';
  $('hash-file-label').textContent = '';
  $('hash-controls').hidden = true;
}

const dropHash = $('drop-hash');
const fileHash = $('file-hash');
dropHash.addEventListener('click', () => fileHash.click());
dropHash.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileHash.click(); } });
dropHash.addEventListener('dragover', (e) => { e.preventDefault(); dropHash.classList.add('drag'); });
dropHash.addEventListener('dragleave', () => dropHash.classList.remove('drag'));
dropHash.addEventListener('drop', (e) => {
  e.preventDefault();
  dropHash.classList.remove('drag');
  if (e.dataTransfer.files[0]) loadHashFile(e.dataTransfer.files[0]);
});
fileHash.addEventListener('change', (e) => { if (e.target.files[0]) loadHashFile(e.target.files[0]); });

async function loadHashFile(f) {
  const text = await f.text();
  try {
    const { header, data } = parseCSV(text);
    // Only assign state after parsing succeeds, so a failed load doesn't
    // leave stale data + new filename behind.
    hashFile = f;
    hashColumns = header;
    hashData = data;
    const colSel = $('col-hash');
    colSel.innerHTML = '';
    let preselect = header.findIndex((h) => /^e[\- ]?mail$/i.test(h));
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
    // On failure, wipe all hash-tab state so the Hash button can't act on stale data.
    resetHashTab();
    $('hash-error').textContent = err.message;
  }
}

// === Recipe summary ===
const hmacToggle = $('hmac-toggle');
hmacToggle.addEventListener('change', () => {
  $('hmac-passphrase-wrap').hidden = !hmacToggle.checked;
  $('algo').disabled = hmacToggle.checked;
  updateRecipe();
});
$('algo').addEventListener('change', updateRecipe);
for (const r of document.querySelectorAll('input[name="case-hash"]')) r.addEventListener('change', updateRecipe);
updateRecipe();

function currentRecipe() {
  return {
    algorithm: $('algo').value,
    case: radioValue('case-hash') || 'lower',
    hmac: hmacToggle.checked,
  };
}
function updateRecipe() {
  $('recipe').textContent = 'Recipe: ' + recipeString(currentRecipe());
}

// === Hash button ===
$('btn-hash').addEventListener('click', async () => {
  $('hash-error').textContent = '';
  if (!hashFile) { $('hash-error').textContent = 'Please select a CSV first.'; return; }
  const colIdx = parseInt($('col-hash').value, 10);
  // Filter on the trimmed value: whitespace-only cells must not be hashed
  // (they would normalize to "" and produce a deterministic hash that
  // could create spurious overlap with other empty cells).
  const emails = hashData.map((r) => String(r[colIdx] ?? '')).filter((v) => v.trim().length > 0);
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
      id,
      type: 'hash',
      payload: {
        emails,
        algorithm: recipe.algorithm,
        caseMode: recipe.case,
        hmac: recipe.hmac,
        passphrase,
      },
    });
  }).catch((err) => { $('hash-error').textContent = err.message; return null; })
    .finally(() => worker.terminate());

  if (!result) return;
  $('hash-progress').textContent = `Hashed ${result.length} rows.`;
  $('hash-preview').textContent = result.slice(0, 3).map((h) => h.slice(0, 32) + '…').join('\n');

  const outHeader = [...hashColumns, 'hashed_email'];
  const queue = result.slice();
  const outData = hashData.map((r) => {
    const email = String(r[colIdx] ?? '');
    const hash = email.trim().length > 0 ? queue.shift() : '';
    return [...r, hash];
  });
  const csv = stringifyCSV(outHeader, outData, { comments: ['recipe: ' + recipeString(recipe)] });
  triggerDownload(csv, (hashFile.name.replace(/\.csv$/i, '') || 'hashed') + '-hashed.csv');
});

$('btn-hash-clear').addEventListener('click', () => location.reload());

// === Compare tab ===
let cmpA = null;
let cmpB = null;
for (const side of ['a', 'b']) {
  const drop = $(`drop-${side}`);
  const file = $(`file-${side}`);
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) loadCmp(side, e.dataTransfer.files[0]);
  });
  file.addEventListener('change', (e) => { if (e.target.files[0]) loadCmp(side, e.target.files[0]); });
}

// Hex hash lengths we expose in the web app (SHA-1 / SHA-256 / SHA-384 / SHA-512).
const HASH_LENGTHS = new Set([40, 64, 96, 128]);

// Return up to 20 non-empty trimmed string samples from a values array.
function sampleValues(values) {
  return values.slice(0, 20).map((v) => String(v).trim()).filter(Boolean);
}

function columnLooksHashed(values) {
  // Look at up to 20 non-empty samples. Require them all to be
  // hex strings of a consistent, hash-appropriate length.
  const sample = sampleValues(values);
  if (sample.length === 0) return false;
  const len = sample[0].length;
  if (!HASH_LENGTHS.has(len)) return false;
  return sample.every((v) => v.length === len && /^[0-9a-fA-F]+$/.test(v));
}

function columnLooksLikeRawEmails(values) {
  // If any of the first 20 non-empty values contains '@', treat the column as raw emails.
  return sampleValues(values).some((v) => v.includes('@'));
}

function cmpSideValues(ref, colIdx) {
  return ref.data.map((r) => String(r[colIdx] ?? ''));
}

function refreshCmpColumnWarning(side) {
  const ref = side === 'a' ? cmpA : cmpB;
  const wrap = $(`${side}-picker-wrap`);
  const warn = $(`${side}-col-warn`);
  if (!ref || wrap.hidden) { warn.textContent = ''; warn.hidden = true; return; }
  const colIdx = parseInt($(`col-${side}`).value, 10);
  // Sample only the first 20 rows — columnLooks* functions check at most 20 values.
  const values = ref.data.slice(0, 20).map((r) => String(r[colIdx] ?? ''));
  if (columnLooksLikeRawEmails(values)) {
    warn.textContent = 'This column contains raw email addresses. Compare expects already-hashed values. Please go to the Hash tab, hash this list first, then come back and upload the hashed file here.';
    warn.hidden = false;
  } else if (!columnLooksHashed(values)) {
    warn.textContent = "This column doesn't look like hex hash values. Make sure you're uploading the hashed output (from the Hash tab), and that you picked the hashed_email column.";
    warn.hidden = false;
  } else {
    warn.textContent = '';
    warn.hidden = true;
  }
}

async function loadCmp(side, f) {
  try {
    const { header, data } = parseCSV(await f.text());
    if (side === 'a') cmpA = { f, header, data };
    else cmpB = { f, header, data };
    const sel = $(`col-${side}`);
    sel.innerHTML = '';
    // Prefer a column named `hashed_email` / `hash` / `sha256`. If none matches,
    // pick the first column whose values look like hashes. Otherwise fall back to 0
    // and let the warning layer tell the user the file looks wrong.
    let pick = header.findIndex((h) => /^(hashed?[_\- ]?email|hash|sha\d*)$/i.test(h));
    if (pick < 0) {
      pick = header.findIndex((_, i) => columnLooksHashed(data.map((r) => r[i] ?? '')));
    }
    if (pick < 0) pick = 0;
    header.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = h;
      if (i === pick) opt.selected = true;
      sel.appendChild(opt);
    });
    $(`${side}-file-label`).textContent = `${f.name} — ${data.length} rows`;
    $(`${side}-picker-wrap`).hidden = false;
    $('cmp-error').textContent = '';
    refreshCmpColumnWarning(side);
  } catch (err) {
    if (side === 'a') cmpA = null; else cmpB = null;
    $(`${side}-picker-wrap`).hidden = true;
    $(`${side}-file-label`).textContent = '';
    $('cmp-error').textContent = err.message;
  }
}

for (const side of ['a', 'b']) {
  $(`col-${side}`).addEventListener('change', () => refreshCmpColumnWarning(side));
}

$('btn-cmp').addEventListener('click', () => {
  $('cmp-error').textContent = '';
  if (!cmpA || !cmpB) { $('cmp-error').textContent = 'Please select both CSVs.'; return; }
  const colA = parseInt($('col-a').value, 10);
  const colB = parseInt($('col-b').value, 10);
  const rawA = cmpSideValues(cmpA, colA);
  const rawB = cmpSideValues(cmpB, colB);

  // Refuse to operate on raw emails. Comparing raw emails byte-for-byte gives
  // misleading overlap (missing differently-cased or whitespace-padded duplicates)
  // AND defeats the whole privacy purpose of the tool.
  if (columnLooksLikeRawEmails(rawA) || columnLooksLikeRawEmails(rawB)) {
    $('cmp-error').textContent = 'Refusing to compare: at least one of the selected columns contains raw email addresses. Compare is for files that have already been hashed by the Hash tab. Hash your lists first, then upload the hashed files here.';
    return;
  }

  const arrA = rawA.filter(Boolean);
  const arrB = rawB.filter(Boolean);
  const mode = radioValue('cmp-mode');
  let result;
  if (mode === 'overlap') result = intersection(arrA, arrB);
  else if (mode === 'a-minus') result = difference(arrA, arrB);
  else result = difference(arrB, arrA);
  const rows = [...result].map((v) => [v]);
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
  // WORKER_SOURCE is injected as a string constant by the build step.
  const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  // Worker copies the source on construction; revoking the URL immediately
  // frees the Blob and avoids leaking one URL per hash run.
  URL.revokeObjectURL(url);
  return worker;
}
